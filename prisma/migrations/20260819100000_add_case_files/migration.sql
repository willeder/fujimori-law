-- 案件の添付ファイル（kintone「相談票添付」「和解ファイル」）の置き場所を持つ表。
-- 実体は Supabase Storage（バケット case-files）。DBにはパスとメタ情報だけ。
CREATE TABLE IF NOT EXISTS "case_files" (
  "id"             SERIAL       PRIMARY KEY,
  "caseId"         INTEGER      NOT NULL,
  "field"          TEXT         NOT NULL,
  "name"           TEXT         NOT NULL,
  "mime"           TEXT         NOT NULL DEFAULT 'application/octet-stream',
  "size"           INTEGER      NOT NULL,
  "storagePath"    TEXT         NOT NULL,
  "kintoneFileKey" TEXT,
  "uploadedBy"     TEXT         NOT NULL DEFAULT '',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$ BEGIN
  ALTER TABLE "case_files"
    ADD CONSTRAINT "case_files_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "case_files_storagePath_key"    ON "case_files"("storagePath");
CREATE UNIQUE INDEX IF NOT EXISTS "case_files_kintoneFileKey_key" ON "case_files"("kintoneFileKey");
CREATE INDEX        IF NOT EXISTS "case_files_caseId_idx"         ON "case_files"("caseId");
CREATE INDEX        IF NOT EXISTS "case_files_caseId_field_idx"   ON "case_files"("caseId", "field");
