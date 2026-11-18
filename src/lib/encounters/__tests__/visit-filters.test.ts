import { describe, expect, it } from "vitest";
import type { EncounterDTO } from "../dto";
import { filterVisits } from "../visit-filters";
const row = {
  id: "visit-1",
  occurredAt: "2024-03-01T23:30:00.000Z",
  reason: "Original complaint",
  outcome: "Follow-up directions",
  clinical: {
    doctor: "José Example",
    specialty: "Example specialty",
    clinic: "Example clinic",
    diagnoses: "Provisional finding?",
  },
  practitioner: null,
} as EncounterDTO;
describe("visit search and dates", () => {
  it("searches all the agreed fields with case and accent independent words", () => {
    for (const search of [
      "JOSE",
      "complaint",
      "directions",
      "clinic",
      "specialty",
      "finding",
      "jose finding",
    ])
      expect(filterVisits([row], { search, from: "", to: "" }, "UTC")).toEqual([
        row,
      ]);
    expect(
      filterVisits([row], { search: "missing", from: "", to: "" }, "UTC"),
    ).toEqual([]);
  });
  it("applies inclusive dates in the record's time zone", () => {
    expect(
      filterVisits(
        [row],
        { search: "", from: "2024-03-02", to: "2024-03-02" },
        "Europe/Kyiv",
      ),
    ).toEqual([row]);
    expect(
      filterVisits(
        [row],
        { search: "", from: "", to: "2024-03-01" },
        "Europe/Kyiv",
      ),
    ).toEqual([]);
  });
  it("keeps every record and its order when filters are empty", () => {
    expect(
      filterVisits(
        [row, { ...row, id: "visit-2" }],
        { search: "", from: "", to: "" },
        "UTC",
      ).map((r) => r.id),
    ).toEqual(["visit-1", "visit-2"]);
  });
  it("can still search notes from older saved visits", () => {
    const old = {
      ...row,
      reason: null,
      outcome: null,
      clinical: {
        ...row.clinical!,
        complaints: "Legacy complaint",
        treatment: "Legacy prescription",
        followUp: "Legacy follow-up",
      },
    };
    expect(
      filterVisits(
        [old],
        { search: "legacy prescription", from: "", to: "" },
        "UTC",
      ),
    ).toEqual([old]);
  });
});
