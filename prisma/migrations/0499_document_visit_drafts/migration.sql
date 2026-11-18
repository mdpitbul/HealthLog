ALTER TABLE "encounters" ADD COLUMN "clinical_encrypted" BYTEA;
ALTER TABLE "inbound_documents" ADD COLUMN "visit_draft_encrypted" BYTEA;
ALTER TYPE "DocumentAiRunKind" ADD VALUE IF NOT EXISTS 'DOCUMENT_VISIT_DRAFT';
