import { readClinical } from "@/lib/encounters/clinical";
import { decryptFromBytes } from "@/lib/ai/coach/bytes-codec";
import {
  clinicalDetails,
  visitNotes,
  appendVisitNote,
  VISIT_REASON_MAX,
  VISIT_OUTCOME_MAX,
} from "@/lib/encounters/visit-notes";
import type { NextRequest } from "next/server";
import { apiHandler, requireAuth } from "@/lib/api-handler";
import { apiError, apiSuccess } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/api/body";
import { encryptToBytes } from "@/lib/ai/coach/bytes-codec";
import { prisma } from "@/lib/db";
import { requireModuleEnabled } from "@/lib/modules/gate";
import { readVisitDraft } from "@/lib/documents/visit-draft";
import { confirmVisitDraftSchema } from "@/lib/validations/visit-extraction";
import { zonedWallClockToUtc } from "@/lib/tz/wall-clock";
import { auditLog } from "@/lib/auth/audit";
export const dynamic = "force-dynamic";
export const POST = apiHandler(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const { user } = await requireAuth();
    const gate = await requireModuleEnabled(user.id, "inboundDocuments");
    if (!gate.enabled) return gate.response;
    const { id } = await params;
    const parsed = await parseJsonBody(request, confirmVisitDraftSchema, {
      maxBytes: 256 * 1024,
      errorCode: "encounter.invalid",
      action: "documents.visit.confirm.invalid",
    });
    if (!parsed.ok) return parsed.error;
    const entry = parsed.data;
    const result = await prisma.$transaction(async (tx) => {
      // Serialize saves against extraction, deletion and another confirmation.
      await tx.$queryRaw`SELECT id FROM inbound_documents WHERE id = ${id} AND user_id = ${user.id} FOR UPDATE`;
      const doc = await tx.inboundDocument.findFirst({
        where: { id, userId: user.id, deletedAt: null },
        select: { visitDraftEncrypted: true },
      });
      if (!doc) return { error: "Document not found", status: 404 } as const;
      const draft = readVisitDraft(doc.visitDraftEncrypted);
      if (!draft || draft.version !== entry.version)
        return {
          error: "The draft changed. Reopen it before saving.",
          status: 409,
        } as const;
      if (draft.savedEncounterId) {
        const saved = await tx.encounter.findFirst({
          where: {
            id: draft.savedEncounterId,
            userId: user.id,
            deletedAt: null,
          },
        });
        if (saved) return { encounterId: saved.id };
      }
      const incoming = visitNotes(entry.reason, entry.outcome, entry.clinical);
      const details = clinicalDetails(entry.clinical);
      const clinicalEncrypted = encryptToBytes(
        JSON.stringify(
          entry.encounterId ? details : { ...details, dateOnly: true },
        ),
      );
      let encounterId: string;
      if (entry.encounterId) {
        const current = await tx.encounter.findFirst({
          where: { id: entry.encounterId, userId: user.id, deletedAt: null },
        });
        if (!current) return { error: "Visit not found", status: 404 } as const;
        const prior = visitNotes(
          current.reasonEncrypted
            ? decryptFromBytes(current.reasonEncrypted)
            : null,
          current.outcomeEncrypted
            ? decryptFromBytes(current.outcomeEncrypted)
            : null,
          readClinical(current.clinicalEncrypted),
        );
        const reason = appendVisitNote(prior.reason, incoming.reason);
        const outcome = appendVisitNote(prior.outcome, incoming.outcome);
        if (
          (reason?.length ?? 0) > VISIT_REASON_MAX ||
          (outcome?.length ?? 0) > VISIT_OUTCOME_MAX
        )
          return {
            error:
              "Combined visit notes are too long. Edit the existing visit before adding more notes.",
            status: 422,
          } as const;
        const count = await tx.encounter.updateMany({
          where: {
            id: entry.encounterId,
            userId: user.id,
            deletedAt: null,
            updatedAt: entry.expectedUpdatedAt
              ? new Date(entry.expectedUpdatedAt)
              : new Date(0),
          },
          data: {
            clinicalEncrypted,
            reasonEncrypted: reason ? encryptToBytes(reason) : null,
            outcomeEncrypted: outcome ? encryptToBytes(outcome) : null,
          },
        });
        if (count.count !== 1)
          return {
            error:
              "The visit changed or is unavailable. Select it again before saving.",
            status: 409,
          } as const;
        encounterId = entry.encounterId;
      } else {
        const visit = await tx.encounter.create({
          data: {
            userId: user.id,
            occurredAt: zonedWallClockToUtc(
              {
                year: Number(entry.date.slice(0, 4)),
                month: Number(entry.date.slice(5, 7)),
                day: Number(entry.date.slice(8, 10)),
                hour: 12,
                minute: 0,
              },
              user.timezone ?? "UTC",
            ),
            status: "DONE",
            kind: "OTHER",
            clinicalEncrypted,
            reasonEncrypted: incoming.reason
              ? encryptToBytes(incoming.reason)
              : null,
            outcomeEncrypted: incoming.outcome
              ? encryptToBytes(incoming.outcome)
              : null,
          },
        });
        encounterId = visit.id;
      }
      await tx.encounterDocumentLink.upsert({
        where: { encounterId_documentId: { encounterId, documentId: id } },
        create: { userId: user.id, encounterId, documentId: id },
        update: {},
      });
      await tx.inboundDocument.update({
        where: { id },
        data: {
          visitDraftEncrypted: encryptToBytes(
            JSON.stringify({ ...draft, savedEncounterId: encounterId }),
          ),
        },
      });
      return { encounterId };
    });
    if (result.error !== undefined)
      return apiError(result.error, result.status);
    await auditLog("documents.inbound.update", {
      userId: user.id,
      details: {
        documentId: id,
        encounterId: result.encounterId,
        action: "confirmVisitDraft",
      },
    });
    return apiSuccess(result);
  },
);
