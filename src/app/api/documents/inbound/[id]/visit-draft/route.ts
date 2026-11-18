import { VISIT_DRAFT_MAX_TOKENS } from "@/lib/documents/visit-draft-config";
import type { NextRequest } from "next/server";
import { apiHandler, requireAuth } from "@/lib/api-handler";
import { apiError, apiSuccess } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { requireModuleEnabled } from "@/lib/modules/gate";
import { requireAiCapability } from "@/lib/ai/capabilities/gate";
import { requireDocumentVisionProvider } from "@/lib/documents/provider-order";
import {
  checkDocumentAiRateLimit,
  documentAiRateLimited,
  loadOwnedDocument,
  refundDocumentAiSlot,
} from "@/lib/documents/ai-route-support";
import {
  buildDateKey,
  reserveBudget,
  resolveCostOwner,
  resolveDailyCap,
} from "@/lib/ai/coach/budget";
import { findLiveDocumentRun, startAiRun } from "@/lib/documents/ai-runs/start";
import { acceptedRunResponse } from "@/lib/documents/ai-runs/http";
import { readVisitDraft } from "@/lib/documents/visit-draft";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export const GET = apiHandler(
  async (_request: NextRequest, { params }: Context) => {
    const { user } = await requireAuth();
    const gate = await requireModuleEnabled(user.id, "inboundDocuments");
    if (!gate.enabled) return gate.response;
    const { id } = await params;
    const doc = await prisma.inboundDocument.findFirst({
      where: { id, userId: user.id, deletedAt: null },
      select: { visitDraftEncrypted: true },
    });
    if (!doc) return apiError("Document not found", 404);
    const runId = await findLiveDocumentRun(
      user.id,
      id,
      "DOCUMENT_VISIT_DRAFT",
    );
    return apiSuccess({
      draft: readVisitDraft(doc.visitDraftEncrypted),
      runId,
    });
  },
);
export const POST = apiHandler(
  async (_request: NextRequest, { params }: Context) => {
    const { user } = await requireAuth();
    const gate = await requireModuleEnabled(user.id, "inboundDocuments");
    if (!gate.enabled) return gate.response;
    await requireAiCapability("documentAi", { pickDecides: true });
    const { id } = await params;
    const doc = await loadOwnedDocument(user.id, id);
    if (!doc) return apiError("Document not found", 404);
    const existing = await prisma.inboundDocument.findUniqueOrThrow({
      where: { id },
      select: { visitDraftEncrypted: true },
    });
    if (readVisitDraft(existing.visitDraftEncrypted)?.savedEncounterId)
      return apiError(
        "This draft has already been saved. Edit the linked visit.",
        409,
      );
    const live = await findLiveDocumentRun(user.id, id, "DOCUMENT_VISIT_DRAFT");
    if (live) return acceptedRunResponse(live);
    const pick = await requireDocumentVisionProvider(user.id);
    const limit = await checkDocumentAiRateLimit(user.id);
    if (!limit.allowed) return documentAiRateLimited(limit);
    const dateKey = await buildDateKey(user.id);
    const reservation = await reserveBudget(
      user.id,
      VISIT_DRAFT_MAX_TOKENS,
      dateKey,
      resolveDailyCap([{ providerType: pick.entry.providerType }]),
      resolveCostOwner([{ providerType: pick.entry.providerType }]),
      "coach",
    );
    if (!reservation.allowed) {
      await refundDocumentAiSlot(user.id);
      return apiError("Daily AI budget reached", 429);
    }
    return startAiRun({
      userId: user.id,
      documentId: id,
      kind: "DOCUMENT_VISIT_DRAFT",
      params: {
        mode: "vision",
        budget: {
          reserved: reservation.reserved,
          owner: reservation.owner,
          dateKey,
        },
      },
      refundSlot: () => refundDocumentAiSlot(user.id),
    });
  },
);
