import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
process.env.ENCRYPTION_KEY ??=
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  gate: vi.fn(),
  transaction: vi.fn(),
  audit: vi.fn(),
  read: vi.fn(),
}));
vi.mock("@/lib/api-handler", () => ({
  apiHandler: (fn: unknown) => fn,
  requireAuth: mocks.auth,
}));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/modules/gate", () => ({ requireModuleEnabled: mocks.gate }));
vi.mock("@/lib/auth/audit", () => ({ auditLog: mocks.audit }));
vi.mock("@/lib/documents/visit-draft", () => ({ readVisitDraft: mocks.read }));
import { POST } from "../route";
import { clinicalDetails } from "@/lib/encounters/visit-notes";
import { encryptToBytes, decryptFromBytes } from "@/lib/ai/coach/bytes-codec";
const clinical = {
  doctor: "Test clinician",
  specialty: "",
  clinic: "Test clinic",
  complaints: "Test complaint",
  diagnoses: "Provisional diagnosis?",
  treatment: "Original prescription [unclear]",
  followUp: "Review in one week",
};
const version = "02ac822d-cf23-43ec-86a6-62d6228d681a";
function payload(extra = {}) {
  return {
    version,
    date: "2024-02-29",
    clinical,
    encounterId: null,
    expectedUpdatedAt: null,
    ...extra,
  };
}
function call(body = payload()) {
  return POST(
    new NextRequest(
      "http://localhost/api/documents/inbound/doc-1/visit-draft/confirm",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    ),
    { params: Promise.resolve({ id: "doc-1" }) },
  );
}
function txMock() {
  return {
    $queryRaw: vi.fn(),
    inboundDocument: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ visitDraftEncrypted: new Uint8Array() }),
      update: vi.fn(),
    },
    encounter: {
      create: vi.fn().mockResolvedValue({ id: "visit-1" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn().mockResolvedValue({ id: "visit-1" }),
    },
    encounterDocumentLink: { upsert: vi.fn() },
  };
}
let tx: ReturnType<typeof txMock>;
beforeEach(() => {
  vi.clearAllMocks();
  tx = txMock();
  mocks.auth.mockResolvedValue({
    user: { id: "owner-1", timezone: "Pacific/Kiritimati" },
  });
  mocks.gate.mockResolvedValue({ enabled: true });
  mocks.read.mockReturnValue({
    version,
    extraction: {
      date: "2024-02-29",
      clinical,
      uncertainties: [],
      evidence: [],
    },
  });
  mocks.transaction.mockImplementation(
    async (fn: (value: typeof tx) => unknown) => fn(tx),
  );
});
describe("confirm visit draft", () => {
  it("atomically creates an encrypted visit and its source link in the owner's record", async () => {
    expect((await call()).status).toBe(200);
    expect(tx.inboundDocument.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "doc-1", userId: "owner-1", deletedAt: null },
      }),
    );
    const data = tx.encounter.create.mock.calls[0][0].data;
    expect(data.userId).toBe("owner-1");
    expect(JSON.parse(decryptFromBytes(data.clinicalEncrypted))).toEqual({
      ...clinicalDetails(clinical),
      dateOnly: true,
    });
    expect(decryptFromBytes(data.reasonEncrypted)).toBe(clinical.complaints);
    expect(decryptFromBytes(data.outcomeEncrypted)).toBe(
      `${clinical.treatment}\n\n${clinical.followUp}`,
    );
    // Noon on the stated day in the record's zone, not the server zone.
    expect(data.occurredAt.toISOString()).toBe("2024-02-28T22:00:00.000Z");
    expect(tx.encounterDocumentLink.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: {
          userId: "owner-1",
          documentId: "doc-1",
          encounterId: "visit-1",
        },
      }),
    );
    expect(tx.inboundDocument.update).toHaveBeenCalledOnce();
  });
  it("returns the already saved visit on replay without creating or modifying it", async () => {
    mocks.read.mockReturnValue({ version, savedEncounterId: "visit-1" });
    expect((await call()).status).toBe(200);
    expect(tx.encounter.create).not.toHaveBeenCalled();
    expect(tx.encounter.updateMany).not.toHaveBeenCalled();
  });
  it("refuses a stale draft", async () => {
    expect(
      (await call(payload({ version: "69591d0e-c191-4e9d-8765-0d12a7e3ac62" })))
        .status,
    ).toBe(409);
    expect(tx.encounter.create).not.toHaveBeenCalled();
  });
  it("refuses a document outside the owner scope", async () => {
    tx.inboundDocument.findFirst.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    expect(tx.encounter.create).not.toHaveBeenCalled();
  });
  it("adds reviewed notes without losing manual visit notes or other fields", async () => {
    tx.encounter.findFirst.mockResolvedValue({
      id: "existing-1",
      reasonEncrypted: encryptToBytes("Manual reason"),
      outcomeEncrypted: encryptToBytes("Manual outcome"),
      clinicalEncrypted: null,
    });
    expect(
      (
        await call(
          payload({
            encounterId: "existing-1",
            expectedUpdatedAt: "2024-03-01T00:00:00.000Z",
          }),
        )
      ).status,
    ).toBe(200);
    const write = tx.encounter.updateMany.mock.calls[0][0];
    expect(Object.keys(write.data).sort()).toEqual([
      "clinicalEncrypted",
      "outcomeEncrypted",
      "reasonEncrypted",
    ]);
    expect(decryptFromBytes(write.data.reasonEncrypted)).toBe(
      `Manual reason\n\n${clinical.complaints}`,
    );
    expect(decryptFromBytes(write.data.outcomeEncrypted)).toContain(
      "Manual outcome\n\n",
    );
    expect(write.where).toEqual({
      id: "existing-1",
      userId: "owner-1",
      deletedAt: null,
      updatedAt: new Date("2024-03-01T00:00:00.000Z"),
    });
    expect(tx.encounter.create).not.toHaveBeenCalled();
  });
  it("refuses an existing visit changed since review, without attaching the document", async () => {
    tx.encounter.updateMany.mockResolvedValue({ count: 0 });
    expect(
      (
        await call(
          payload({
            encounterId: "existing-1",
            expectedUpdatedAt: "2024-03-01T00:00:00.000Z",
          }),
        )
      ).status,
    ).toBe(409);
    expect(tx.encounterDocumentLink.upsert).not.toHaveBeenCalled();
    expect(tx.inboundDocument.update).not.toHaveBeenCalled();
  });
  it("does not write without a real visit date", async () => {
    expect((await call(payload({ date: "2024-02-30" }))).status).toBe(422);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

it("allows a new visit after the previously confirmed visit was deleted", async () => {
  mocks.read.mockReturnValue({ version, savedEncounterId: "deleted-visit" });
  tx.encounter.findFirst.mockResolvedValue(null);
  const response = await call();
  expect(response.status).toBe(200);
  expect(tx.encounter.create).toHaveBeenCalledOnce();
  expect(tx.inboundDocument.update).toHaveBeenCalledOnce();
});
