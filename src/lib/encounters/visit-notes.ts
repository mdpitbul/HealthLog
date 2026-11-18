import type { VisitClinical } from "@/lib/validations/visit-extraction";
export const VISIT_REASON_MAX = 6000;
export const VISIT_OUTCOME_MAX = 20000;
export function clinicalDetails(value: VisitClinical): VisitClinical {
  const details = { ...value };
  delete details.complaints;
  delete details.treatment;
  delete details.examinations;
  delete details.followUp;
  return details;
}
/** Legacy text is carried verbatim; never reclassify an already reviewed plan. */
export function visitNotes(
  reason: string | null | undefined,
  outcome: string | null | undefined,
  clinical: VisitClinical | null | undefined,
) {
  return {
    reason: reason ?? clinical?.complaints ?? null,
    outcome:
      outcome ??
      ([clinical?.treatment, clinical?.examinations, clinical?.followUp]
        .filter(Boolean)
        .join("\n\n") ||
        null),
  };
}
export function sectionedOutcome(
  clinical: VisitClinical,
  labels: { treatment: string; examinations: string; followUp: string },
) {
  return (["treatment", "examinations", "followUp"] as const)
    .filter((key) => clinical[key]?.trim())
    .map((key) => `${labels[key]}:\n${clinical[key]}`)
    .join("\n\n");
}
/** Append exact reviewed text without discarding the visit's manual notes. */
export function appendVisitNote(
  current: string | null | undefined,
  incoming: string | null | undefined,
): string | null {
  if (!incoming?.trim()) return current || null;
  if (!current?.trim()) return incoming;
  return current.includes(incoming.trim())
    ? current
    : `${current}\n\n${incoming}`;
}
