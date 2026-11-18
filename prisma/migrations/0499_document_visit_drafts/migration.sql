-- Optional encrypted clinical blocks and durable visit review drafts.
-- Nullable fields preserve all existing visits and documents.
-- @retry-on-lock-timeout
DO $migration$
BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    ALTER TABLE "encounters" ADD COLUMN IF NOT EXISTS "clinical_encrypted" BYTEA;
    ALTER TABLE "inbound_documents" ADD COLUMN IF NOT EXISTS "visit_draft_encrypted" BYTEA;
    ALTER TYPE "document_ai_run_kind" ADD VALUE IF NOT EXISTS 'DOCUMENT_VISIT_DRAFT';
END
$migration$;
