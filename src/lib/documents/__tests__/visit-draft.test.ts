import { beforeEach, describe, expect, it, vi } from "vitest";
process.env.ENCRYPTION_KEY ??=
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const m = vi.hoisted(() => ({
  raster: vi.fn(),
  transaction: vi.fn(),
  settle: vi.fn(),
  refund: vi.fn(),
  decrypt: vi.fn(),
  annotate: vi.fn(),
}));
vi.mock("@/lib/logging/context", async (original) => ({
  ...(await original<typeof import("@/lib/logging/context")>()),
  annotate: m.annotate,
}));
vi.mock("@/lib/documents/rasterize-pdf", () => ({ rasterizePdf: m.raster }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: m.transaction } }));
vi.mock("@/lib/documents/store", () => ({ decryptDocumentContent: m.decrypt }));
vi.mock("@/lib/documents/ai-runs/store", () => ({
  settleAiRunBudget: m.settle,
}));
vi.mock("@/lib/documents/ai-route-support", () => ({
  refundDocumentAiSlot: m.refund,
}));
import { executeVisitDraft, readVisitDraft } from "../visit-draft";
import { encryptToBytes } from "@/lib/ai/coach/bytes-codec";
const clinical = {
  doctor: "",
  specialty: "",
  clinic: "",
  complaints: "",
  diagnoses: "Suspected infection?",
  treatment: "[unclear] 2 drops",
  followUp: "",
};
const extraction = {
  date: null,
  clinical,
  uncertainties: ["Medicine name illegible"],
  evidence: [{ page: 1, quote: "2 drops" }],
};
function setup() {
  const generateCompletion = vi.fn().mockResolvedValue({
    content: JSON.stringify(extraction),
    model: "test-model",
    tokensUsed: 321,
    providerType: "openai",
  });
  const args = {
    userId: "owner-1",
    document: {
      id: "doc-1",
      kind: "OTHER",
      contentEncrypted: new Uint8Array(),
      contentCodec: "binary2",
      mimeType: "application/pdf",
      status: "STORED",
      aiReadDeferred: false,
    },
    pick: {
      entry: { providerType: "user-byok", instance: { generateCompletion } },
      providerType: "openai",
      pdfSupported: false,
    },
    budget: { reserved: 8000, owner: "user", dateKey: "2024-03-01" },
  } as unknown as Parameters<typeof executeVisitDraft>[0];
  return { args, generateCompletion };
}
let tx: {
  $queryRaw: ReturnType<typeof vi.fn>;
  inboundDocument: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};
beforeEach(() => {
  vi.clearAllMocks();
  m.decrypt.mockReturnValue(Buffer.from("%PDF-1.7\n"));
  m.raster.mockResolvedValue({
    ok: true,
    images: [{ mediaType: "image/jpeg", dataBase64: "cGFnZQ==" }],
    pageCount: 1,
  });
  tx = {
    $queryRaw: vi.fn(),
    inboundDocument: {
      findFirst: vi.fn().mockResolvedValue({ visitDraftEncrypted: null }),
      update: vi.fn(),
    },
  };
  m.transaction.mockImplementation((fn: (value: typeof tx) => unknown) =>
    fn(tx),
  );
});
describe("visit draft reads the original", () => {
  it("uses high resolution and stores a draft, retaining uncertainty and unknown date", async () => {
    const { args, generateCompletion } = setup();
    expect(await executeVisitDraft(args)).toEqual({
      ok: true,
      data: { documentId: "doc-1", draftReady: true },
    });
    expect(m.raster).toHaveBeenCalledWith(expect.any(Buffer), 4, {
      highResolution: true,
    });
    expect(generateCompletion).toHaveBeenCalledOnce();
    const draft = readVisitDraft(
      tx.inboundDocument.update.mock.calls[0][0].data.visitDraftEncrypted,
    );
    expect(draft?.extraction).toEqual(extraction);
    expect(m.settle).toHaveBeenCalledWith(
      "owner-1",
      args.budget,
      321,
      "user-byok",
    );
  });
  it("reports a page cap instead of pretending to have read the entire PDF", async () => {
    m.raster.mockResolvedValue({
      ok: true,
      images: [{ mediaType: "image/jpeg", dataBase64: "cGFnZQ==" }],
      pageCount: 7,
    });
    await executeVisitDraft(setup().args);
    const draft = readVisitDraft(
      tx.inboundDocument.update.mock.calls[0][0].data.visitDraftEncrypted,
    );
    expect(draft).toMatchObject({ pagesRead: 1, pageCount: 7 });
  });
  it("does not substitute a corrupt text layer when rendering fails", async () => {
    m.raster.mockResolvedValue({ ok: false, reason: "render-failed" });
    const { args, generateCompletion } = setup();
    expect((await executeVisitDraft(args)).ok).toBe(false);
    expect(generateCompletion).not.toHaveBeenCalled();
    expect(tx.inboundDocument.update).not.toHaveBeenCalled();
    expect(m.refund).toHaveBeenCalledWith("owner-1");
    expect(m.settle).toHaveBeenCalledWith("owner-1", args.budget, 0, null);
  });
  it("does not replace a draft with invalid model output", async () => {
    const { args, generateCompletion } = setup();
    generateCompletion.mockResolvedValue({
      content: "not json",
      tokensUsed: 17,
    });
    expect((await executeVisitDraft(args)).ok).toBe(false);
    expect(tx.inboundDocument.update).not.toHaveBeenCalled();
  });
  it("does not overwrite a draft that was confirmed while the model was reading", async () => {
    tx.inboundDocument.findFirst.mockResolvedValue({
      visitDraftEncrypted: encryptToBytes(
        JSON.stringify({ extraction, savedEncounterId: "visit-1" }),
      ),
    });
    expect((await executeVisitDraft(setup().args)).ok).toBe(false);
    expect(tx.inboundDocument.update).not.toHaveBeenCalled();
  });
});

describe("visit read timeouts and retry", () => {
  it("gives the provider three minutes rather than the generic minute", async () => {
    const { args, generateCompletion } = setup();
    await executeVisitDraft(args);
    expect(generateCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutMs: 180_000 }),
    );
  });
  it("reports a timeout distinctly, keeps the previous draft, and allows retry", async () => {
    const { args, generateCompletion } = setup();
    const timeout = new Error("private provider detail must not be logged");
    timeout.name = "TimeoutError";
    generateCompletion.mockRejectedValueOnce(timeout);
    const result = await executeVisitDraft(args);
    expect(result).toMatchObject({
      ok: false,
      status: 504,
      errorCode: "aiRuns.timedOut",
    });
    expect(tx.inboundDocument.update).not.toHaveBeenCalled();
    expect(m.annotate).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({ stage: "provider", reason: "timeout" }),
      }),
    );
    expect(JSON.stringify(m.annotate.mock.calls)).not.toContain(
      timeout.message,
    );
    expect((await executeVisitDraft(args)).ok).toBe(true);
    expect(tx.inboundDocument.update).toHaveBeenCalledOnce();
  });
  it("distinguishes invalid output from a provider timeout without logging it", async () => {
    const { args, generateCompletion } = setup();
    generateCompletion.mockResolvedValue({
      content: "private invalid model output",
      tokensUsed: 12,
    });
    expect(await executeVisitDraft(args)).toMatchObject({
      ok: false,
      status: 422,
      errorCode: "documents.inbound.extractFailed",
    });
    expect(m.annotate).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({
          stage: "parse",
          reason: "read_failed",
        }),
      }),
    );
    expect(JSON.stringify(m.annotate.mock.calls)).not.toContain(
      "private invalid model output",
    );
  });
});
