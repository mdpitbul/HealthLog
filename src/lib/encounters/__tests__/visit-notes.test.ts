import { describe, expect, it } from "vitest";
import {
  appendVisitNote,
  clinicalDetails,
  sectionedOutcome,
  visitNotes,
} from "../visit-notes";
const clinical = {
  doctor: "Example clinician",
  specialty: "",
  clinic: "",
  complaints: "Original complaint",
  diagnoses: "Unconfirmed finding?",
  treatment: "Original directions [unclear]",
  examinations: "Original examination request",
  followUp: "Original follow-up",
};
describe("canonical visit notes", () => {
  it("keeps legacy notes verbatim without overriding existing manual notes", () => {
    expect(visitNotes(null, null, clinical)).toEqual({
      reason: clinical.complaints,
      outcome: [
        clinical.treatment,
        clinical.examinations,
        clinical.followUp,
      ].join("\n\n"),
    });
    expect(visitNotes("Manual reason", "Manual outcome", clinical)).toEqual({
      reason: "Manual reason",
      outcome: "Manual outcome",
    });
    expect(visitNotes("", "", clinical)).toEqual({ reason: "", outcome: "" });
  });
  it("uses only nonempty sections and never rewrites prescriptions", () => {
    expect(
      sectionedOutcome(clinical, {
        treatment: "Treatment",
        examinations: "Examinations",
        followUp: "Follow-up",
      }),
    ).toBe(
      `Treatment:\n${clinical.treatment}\n\nExaminations:\n${clinical.examinations}\n\nFollow-up:\n${clinical.followUp}`,
    );
    expect(
      sectionedOutcome(
        { ...clinical, examinations: "", followUp: "" },
        {
          treatment: "Treatment",
          examinations: "Examinations",
          followUp: "Follow-up",
        },
      ),
    ).toBe(`Treatment:\n${clinical.treatment}`);
  });
  it("does not retain duplicate copies of native notes in the clinical block", () => {
    expect(clinicalDetails(clinical)).toEqual({
      doctor: clinical.doctor,
      specialty: "",
      clinic: "",
      diagnoses: clinical.diagnoses,
    });
    expect(clinical.complaints).toBe("Original complaint");
  });
  it("preserves manual notes and avoids identical appended text", () => {
    expect(appendVisitNote("Manual note", "Reviewed directions")).toBe(
      "Manual note\n\nReviewed directions",
    );
    expect(
      appendVisitNote(
        "Manual note\n\nReviewed directions",
        "Reviewed directions",
      ),
    ).toBe("Manual note\n\nReviewed directions");
    expect(appendVisitNote("Manual note", "")).toBe("Manual note");
  });
});
