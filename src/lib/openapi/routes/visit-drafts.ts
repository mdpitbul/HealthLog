import type { ZodOpenApiObject } from "zod-openapi";
import { z } from "zod/v4";
import {
  confirmVisitDraftSchema,
  visitExtractionSchema,
} from "@/lib/validations/visit-extraction";
import { isoDateTime } from "@/lib/validations/datetime";
import { dataEnvelope, errorEnvelope, stdResponses } from "./shared";
import { aiRunAccepted } from "./ai-run-accepted";
const id = [
  {
    name: "id",
    in: "path" as const,
    required: true,
    schema: { type: "string" as const },
  },
];
const draft = z.object({
  version: z.uuid(),
  generatedAt: isoDateTime(),
  model: z.string(),
  pageCount: z.number().int(),
  pagesRead: z.number().int(),
  extraction: visitExtractionSchema,
  savedEncounterId: z.string().optional(),
});
const conflict = {
  description:
    "The draft or selected visit changed, or this draft was already saved.",
  content: { "application/json": { schema: errorEnvelope } },
};
export const visitDraftRunResult = z.object({
  documentId: z.string(),
  draftReady: z.literal(true),
});
export const visitDraftPaths: NonNullable<ZodOpenApiObject["paths"]> = {
  "/api/documents/inbound/{id}/visit-draft": {
    get: {
      tags: ["Documents"],
      summary: "Read a durable visit draft",
      description:
        "Owner-only read of an encrypted draft and a live background run id, if present. Does not call a model.",
      parameters: id,
      responses: {
        ...stdResponses,
        "200": {
          description: "Draft and live run.",
          content: {
            "application/json": {
              schema: dataEnvelope(
                z.object({
                  draft: draft.nullable(),
                  runId: z.string().nullable(),
                }),
                "VisitDraftEnvelope",
              ),
            },
          },
        },
      },
    },
    post: {
      tags: ["Documents"],
      summary: "Read the original into a visit review draft",
      description:
        "Owner-only documentAi action, gated by provider consent, rate limit and budget. Always queues DOCUMENT_VISIT_DRAFT; polls through /api/ai-runs/{id}. Renders up to four PDF pages at high resolution; the draft records pagesRead/pageCount. Creates no clinical records. A saved draft cannot be regenerated.",
      parameters: id,
      responses: {
        ...stdResponses,
        ...aiRunAccepted,
        "409": conflict,
      },
    },
  },
  "/api/documents/inbound/{id}/visit-draft/confirm": {
    post: {
      tags: ["Documents"],
      summary: "Confirm reviewed visit fields and attach the source",
      description:
        "Owner-only, no model work. Version-checked transaction creates one encounter and document link. Replaying the same confirmed version returns its existing encounterId. Selecting an owned encounter appends reviewed reason/outcome text without discarding existing manual notes, replaces the reviewed clinical details and checks expectedUpdatedAt. Deleted visits release the document for a new review. No disease or medication records are created.",
      parameters: id,
      requestBody: {
        required: true,
        content: { "application/json": { schema: confirmVisitDraftSchema } },
      },
      responses: {
        ...stdResponses,
        "200": {
          description: "Saved or already saved visit.",
          content: {
            "application/json": {
              schema: dataEnvelope(
                z.object({ encounterId: z.string() }),
                "VisitDraftConfirmedEnvelope",
              ),
            },
          },
        },
        "409": conflict,
      },
    },
  },
};
