import type { NextRequest } from "next/server";
import { apiHandler, requireAuth } from "@/lib/api-handler";
import { apiError, apiSuccess, safeJson } from "@/lib/api-response";
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
    const body = await safeJson(request, { maxBytes: 48 * 1024 });
    if (body.error) return body.error;
    const parsed = confirmVisitDraftSchema.safeParse(body.data);
    if (!parsed.success)
      return apiError("Check the visit date and fields", 422);
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
        if (!saved)
          return {
            error: "The saved visit was removed. Restore it before continuing.",
            status: 409,
          } as const;
        return { encounterId: saved.id };
      }
      const clinicalEncrypted = encryptToBytes(
        JSON.stringify(
          entry.encounterId
            ? entry.clinical
            : { ...entry.clinical, dateOnly: true },
        ),
      );
      let encounterId: string;
      if (entry.encounterId) {
        // All existing manual fields and other attachments survive. Only the
        // clinical block shown in the review is replaced on explicit confirmation.
        const count = await tx.encounter.updateMany({
          where: {
            id: entry.encounterId,
            userId: user.id,
            deletedAt: null,
            updatedAt: entry.expectedUpdatedAt
              ? new Date(entry.expectedUpdatedAt)
              : new Date(0),
          },
          data: { clinicalEncrypted },
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
