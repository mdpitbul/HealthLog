import { describe, expect, it } from "vitest";
import {
  visitDate,
  visitExtractionSchema,
  confirmVisitDraftSchema,
} from "../visit-extraction";
const clinical = {
  doctor: "",
  specialty: "",
  clinic: "",
  complaints: "",
  diagnoses: "",
  treatment: "",
  followUp: "",
};
describe("visit transcription validation", () => {
  it("rejects impossible dates instead of normalizing them", () => {
    expect(visitDate.safeParse("2024-02-30").success).toBe(false);
    expect(visitDate.safeParse("2024-02-29").success).toBe(true);
    expect(visitDate.safeParse("2999-01-01").success).toBe(false);
  });
  it("allows an unknown source date but requires it for confirmation", () => {
    expect(
      visitExtractionSchema.safeParse({
        date: null,
        clinical,
        uncertainties: ["Date illegible"],
        evidence: [],
      }).success,
    ).toBe(true);
    expect(
      confirmVisitDraftSchema.safeParse({
        version: "02ac822d-cf23-43ec-86a6-62d6228d681a",
        date: null,
        clinical,
        encounterId: null,
        expectedUpdatedAt: null,
      }).success,
    ).toBe(false);
  });
  it("preserves uncertain diagnoses and unreadable prescriptions literally", () => {
    const input = {
      date: "2024-02-29",
      clinical: {
        ...clinical,
        diagnoses: "Suspected viral infection?",
        treatment: "[unclear] 2 drops, 3 times daily, 5 days",
      },
      uncertainties: ["Drug name illegible"],
      evidence: [{ page: 1, quote: "2 drops" }],
    };
    expect(visitExtractionSchema.parse(input)).toEqual(input);
  });
  it("refuses instructions and extra clinical fields from model output", () => {
    expect(
      visitExtractionSchema.safeParse({
        date: null,
        clinical: { ...clinical, runCommand: "anything" },
        uncertainties: [],
        evidence: [],
      }).success,
    ).toBe(false);
  });
});
