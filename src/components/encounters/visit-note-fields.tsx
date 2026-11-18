"use client";
import { Textarea } from "@/components/ui/textarea";
import { FieldGroup } from "@/components/ui/field-group";
import { useTranslations } from "@/lib/i18n/context";
import {
  VISIT_REASON_MAX,
  VISIT_OUTCOME_MAX,
} from "@/lib/encounters/visit-notes";
export function VisitNoteFields({
  reason,
  outcome,
  onReason,
  onOutcome,
}: {
  reason: string;
  outcome: string;
  onReason: (text: string) => void;
  onOutcome: (text: string) => void;
}) {
  const { t } = useTranslations();
  return (
    <>
      <FieldGroup htmlFor="visit-reason" label={t("encounters.form.reason")}>
        <Textarea
          id="visit-reason"
          rows={3}
          value={reason}
          maxLength={VISIT_REASON_MAX}
          onChange={(e) => onReason(e.target.value)}
        />
      </FieldGroup>
      <FieldGroup htmlFor="visit-outcome" label={t("encounters.form.outcome")}>
        <Textarea
          id="visit-outcome"
          rows={9}
          value={outcome}
          maxLength={VISIT_OUTCOME_MAX}
          onChange={(e) => onOutcome(e.target.value)}
        />
      </FieldGroup>
    </>
  );
}
