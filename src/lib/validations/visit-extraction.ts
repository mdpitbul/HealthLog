import { z } from "zod/v4";
import { isoDateTime } from "@/lib/validations/datetime";

import { dateOnlyKey } from "@/lib/tz/date-only";
export const visitDate = z.iso
  .date()
  .refine(
    (s) =>
      s >= "1900-01-01" && s <= dateOnlyKey(new Date(Date.now() + 86_400_000)),
    "Enter the visit's actual calendar date",
  );
const text = z.string().max(6000);
export const visitClinicalSchema = z
  .object({
    dateOnly: z.literal(true).optional(),
    doctor: z.string().max(300),
    specialty: z.string().max(300),
    clinic: z.string().max(500),
    complaints: text.optional(),
    diagnoses: text,
    treatment: text.optional(),
    examinations: text.optional(),
    followUp: text.optional(),
  })
  .strict();
export type VisitClinical = z.infer<typeof visitClinicalSchema>;
export const visitExtractionSchema = z
  .object({
    date: visitDate.nullable(),
    clinical: visitClinicalSchema,
    uncertainties: z.array(z.string().max(1000)).max(40),
    evidence: z
      .array(
        z
          .object({
            page: z.number().int().min(1).max(10000),
            quote: z.string().max(2000),
          })
          .strict(),
      )
      .max(40),
  })
  .strict();
export type VisitExtraction = z.infer<typeof visitExtractionSchema>;
export interface VisitDraft {
  version: string;
  generatedAt: string;
  notesVersion?: 2;
  model: string;
  pageCount: number;
  pagesRead: number;
  extraction: VisitExtraction;
  savedEncounterId?: string;
}
export const confirmVisitDraftSchema = z
  .object({
    version: z.string().uuid(),
    date: visitDate,
    clinical: visitClinicalSchema,
    reason: z.string().max(6000).nullable().optional(),
    outcome: z.string().max(20000).nullable().optional(),
    encounterId: z.string().min(1).max(40).nullable(),
    expectedUpdatedAt: isoDateTime().nullable(),
  })
  .strict();
