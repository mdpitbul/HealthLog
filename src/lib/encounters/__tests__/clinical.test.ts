import { describe, expect, it } from "vitest";
import { encryptToBytes } from "@/lib/ai/coach/bytes-codec";
import { clinicalNoteUpdate, readClinical } from "../clinical";
process.env.ENCRYPTION_KEY ??=
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const legacy = {
  doctor: "Example",
  specialty: "",
  clinic: "",
  diagnoses: "Original finding",
  complaints: "Original complaint",
  treatment: "Original directions",
  examinations: "Original tests",
  followUp: "Original follow-up",
};
const stored = () => encryptToBytes(JSON.stringify(legacy));
describe("editing native notes on legacy visits", () => {
  it("clearing reason removes its fallback without touching the plan", () => {
    const clinical = readClinical(
      clinicalNoteUpdate({ reason: null }, stored()),
    );
    expect(clinical?.complaints).toBeUndefined();
    expect(clinical?.treatment).toBe(legacy.treatment);
    expect(clinical?.diagnoses).toBe(legacy.diagnoses);
  });
  it("clearing outcome removes all plan fallbacks without touching complaints", () => {
    const clinical = readClinical(
      clinicalNoteUpdate({ outcome: null }, stored()),
    );
    expect(clinical?.treatment).toBeUndefined();
    expect(clinical?.examinations).toBeUndefined();
    expect(clinical?.followUp).toBeUndefined();
    expect(clinical?.complaints).toBe(legacy.complaints);
  });
  it("unrelated edits leave encrypted clinical notes untouched", () => {
    expect(clinicalNoteUpdate({}, stored())).toBeUndefined();
  });
});
