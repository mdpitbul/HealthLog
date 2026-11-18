import type { Prisma } from "@/generated/prisma/client";
import type { VisitDraft } from "@/lib/validations/visit-extraction";
/** Deleting a visit releases the document for a fresh review; GET stays read-only. */
export async function hasSavedVisit(
  db: Pick<Prisma.TransactionClient, "encounter">,
  userId: string,
  draft: VisitDraft | null,
): Promise<boolean> {
  if (!draft?.savedEncounterId) return false;
  return !!(await db.encounter.findFirst({
    where: { id: draft.savedEncounterId, userId, deletedAt: null },
    select: { id: true },
  }));
}
