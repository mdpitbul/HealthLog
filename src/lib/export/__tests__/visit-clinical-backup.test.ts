import { describe, expect, it, vi } from "vitest";
import { encryptToBytes, decryptFromBytes } from "@/lib/ai/coach/bytes-codec";
import { buildVisitsBackupSection, restoreVisitsData } from "../visits-backup";
import {
  buildDocumentsBackupSlice,
  restoreDocuments,
} from "../documents-backup";
import { encounterBackupSchema } from "../visits-backup-schema";
import { documentBackupSchema } from "../documents-backup-schema";
process.env.ENCRYPTION_KEY ??=
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const at = new Date("2024-03-01T12:00:00.000Z");
const clinical = JSON.stringify({
  doctor: "Example clinician",
  specialty: "",
  clinic: "",
  complaints: "Example complaint",
  diagnoses: "Unconfirmed finding?",
  treatment: "[unclear]",
  followUp: "",
  dateOnly: true,
});
function delegates(rows: unknown[] = []) {
  return {
    findMany: vi.fn().mockResolvedValue(rows),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    createMany: vi.fn(),
    create: vi.fn(),
  };
}
function db() {
  return {
    practitioner: delegates(),
    encounter: delegates(),
    encounterDocumentLink: delegates(),
    encounterLabLink: delegates(),
    encounterConditionLink: delegates(),
    measurementReminder: delegates(),
    inboundDocument: delegates(),
    labResult: delegates(),
    illnessEpisode: delegates(),
  };
}
describe("clinical visit backup round trips", () => {
  it.each([false, true])(
    "retains clinical text through export, schema and restore (disaster recovery=%s)",
    async (dr) => {
      const source = db();
      source.encounter.findMany.mockResolvedValue([
        {
          id: "visit-1",
          occurredAt: at,
          status: "DONE",
          kind: "OTHER",
          practitionerId: null,
          reminderId: null,
          reasonEncrypted: null,
          outcomeEncrypted: null,
          bodySiteEncrypted: null,
          clinicalEncrypted: encryptToBytes(clinical),
          laterality: null,
          createdAt: at,
          updatedAt: at,
          deletedAt: null,
        },
      ]);
      const section = await buildVisitsBackupSection(
        source as unknown as Parameters<typeof buildVisitsBackupSection>[0],
        "owner-1",
        { purpose: dr ? "disaster-recovery" : "portable-export" },
      );
      const visits = JSON.parse(JSON.stringify(section));
      visits.encounters = visits.encounters.map((entry: unknown) =>
        encounterBackupSchema.parse(entry),
      );
      const restored = db();
      await restoreVisitsData(
        restored as unknown as Parameters<typeof restoreVisitsData>[0],
        "owner-2",
        visits,
        [],
      );
      const row = restored.encounter.createMany.mock.calls[0][0].data[0];
      expect(row.userId).toBe("owner-2");
      expect(decryptFromBytes(row.clinicalEncrypted)).toBe(clinical);
      expect(
        dr
          ? visits.encounters[0].clinicalEncrypted
          : visits.encounters[0].clinical,
      ).toBeTruthy();
      if (dr) expect(visits.encounters[0].clinical).toBeUndefined();
    },
  );
  it("retains the encrypted draft and confirmation pointer through a document recovery", async () => {
    const draft = JSON.stringify({
      version: "test-version",
      extraction: { date: null },
      savedEncounterId: "visit-1",
    });
    const source = db();
    source.inboundDocument.findMany.mockResolvedValue([
      {
        id: "doc-1",
        kind: "OTHER",
        title: null,
        filename: "example.pdf",
        mimeType: "application/pdf",
        byteSize: 13,
        status: "STORED",
        reportDate: null,
        documentDate: at,
        contentEncrypted: encryptToBytes(
          Buffer.from("synthetic pdf").toString("base64"),
        ),
        contentCodec: "base64v1",
        contentSha256: null,
        providerType: null,
        errorReason: null,
        summaryEncrypted: null,
        visitDraftEncrypted: encryptToBytes(draft),
        summaryGeneratedAt: null,
        summaryState: "READY",
        lastIndexAttemptAt: null,
        lastIndexOutcome: null,
        sourceSystem: null,
        sourceId: null,
        sourceInstance: null,
        aiReadDeferred: false,
        extractionIncomplete: false,
        createdAt: at,
        updatedAt: at,
      },
    ]);
    const section = await buildDocumentsBackupSlice(
      source as unknown as Parameters<typeof buildDocumentsBackupSlice>[0],
      "owner-1",
      true,
      false,
    );
    const documents = JSON.parse(JSON.stringify(section.documents)).map(
      (entry: unknown) => documentBackupSchema.parse(entry),
    );
    const restored = db();
    const ctx = {
      tx: restored,
      ownerId: "owner-2",
      payload: { documents },
      streamed: {
        forEachDocumentContent: async (
          fn: (content: string, index: number) => Promise<void>,
        ) => {
          await fn(documents[0].contentEncrypted, 0);
        },
      },
    };
    await restoreDocuments(
      ctx as unknown as Parameters<typeof restoreDocuments>[0],
    );
    expect(
      decryptFromBytes(
        restored.inboundDocument.create.mock.calls[0][0].data
          .visitDraftEncrypted,
      ),
    ).toBe(draft);
  });
});
