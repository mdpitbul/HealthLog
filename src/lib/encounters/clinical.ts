import { decryptFromBytes } from "@/lib/ai/coach/bytes-codec";
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
