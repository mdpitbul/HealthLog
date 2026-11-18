import { encryptToBytes, decryptFromBytes } from "@/lib/ai/coach/bytes-codec";
import {
  visitClinicalSchema,
  type VisitClinical,
} from "@/lib/validations/visit-extraction";
export function readClinical(
  value: Uint8Array | null | undefined,
): VisitClinical | null {
  if (!value) return null;
  try {
    return visitClinicalSchema.parse(JSON.parse(decryptFromBytes(value)));
  } catch {
    return null;
  }
}

/** Explicitly clearing a native note must not resurrect its legacy copy. */
export function clinicalNoteUpdate(
  entry: {
    clinical?: VisitClinical | null;
    reason?: string | null;
    outcome?: string | null;
  },
  current: Uint8Array | null,
): Uint8Array<ArrayBuffer> | null | undefined {
  if (entry.clinical !== undefined)
    return entry.clinical
      ? encryptToBytes(JSON.stringify(entry.clinical))
      : null;
  if (entry.reason === undefined && entry.outcome === undefined)
    return undefined;
  const clinical = readClinical(current);
  if (!clinical) return undefined;
  if (entry.reason !== undefined) delete clinical.complaints;
  if (entry.outcome !== undefined) {
    delete clinical.treatment;
    delete clinical.examinations;
    delete clinical.followUp;
  }
  return encryptToBytes(JSON.stringify(clinical));
}
