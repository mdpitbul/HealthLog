"use client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FieldGroup } from "@/components/ui/field-group";
import { useTranslations } from "@/lib/i18n/context";
import type { VisitClinical } from "@/lib/validations/visit-extraction";
export const CLINICAL_FIELDS = [
  "doctor",
  "specialty",
  "clinic",
  "complaints",
  "diagnoses",
  "treatment",
  "followUp",
] as const;
export function VisitClinicalFields({
  value,
  onChange,
}: {
  value: VisitClinical;
  onChange: (value: VisitClinical) => void;
}) {
  const { t } = useTranslations();
  return (
    <div className="space-y-4">
      {CLINICAL_FIELDS.map((field, index) => (
        <FieldGroup
          key={field}
          htmlFor={`visit-clinical-${field}`}
          label={t(`visitExtraction.${field}`)}
        >
          {index < 3 ? (
            <Input
              id={`visit-clinical-${field}`}
              value={value[field]}
              maxLength={field === "clinic" ? 500 : 300}
              onChange={(e) => onChange({ ...value, [field]: e.target.value })}
            />
          ) : (
            <Textarea
              id={`visit-clinical-${field}`}
              rows={field === "treatment" ? 5 : 3}
              value={value[field]}
              maxLength={6000}
              onChange={(e) => onChange({ ...value, [field]: e.target.value })}
            />
          )}
        </FieldGroup>
      ))}
    </div>
  );
}
