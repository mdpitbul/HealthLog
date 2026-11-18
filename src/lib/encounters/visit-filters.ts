import type { EncounterDTO } from "./dto";
import { userDayKey } from "@/lib/tz/format";
import { visitNotes } from "./visit-notes";
export interface VisitFilters {
  search: string;
  from: string;
  to: string;
}
function searchable(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .trim();
}
export function filterVisits(
  visits: readonly EncounterDTO[],
  filters: VisitFilters,
  timezone: string,
): EncounterDTO[] {
  const words = searchable(filters.search).split(" ").filter(Boolean);
  return visits.filter((visit) => {
    const day =
      filters.from || filters.to
        ? userDayKey(new Date(visit.occurredAt), timezone)
        : "";
    if (
      (filters.from && day < filters.from) ||
      (filters.to && day > filters.to)
    )
      return false;
    if (!words.length) return true;
    const notes = visitNotes(visit.reason, visit.outcome, visit.clinical);
    const haystack = searchable(
      [
        visit.practitioner?.name,
        visit.practitioner?.practice,
        visit.practitioner?.specialty,
        visit.clinical?.doctor,
        visit.clinical?.clinic,
        visit.clinical?.specialty,
        visit.clinical?.diagnoses,
        notes.reason,
        notes.outcome,
      ]
        .filter(Boolean)
        .join(" "),
    );
    return words.every((word) => haystack.includes(word));
  });
}
