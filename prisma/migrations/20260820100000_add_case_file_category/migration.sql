-- 受任資料の区分（身分証明書・委任状・和解書など）。
-- kintone から移した分（相談票添付・和解ファイル）には入らない。
ALTER TABLE "case_files" ADD COLUMN IF NOT EXISTS "category" TEXT;
CREATE INDEX IF NOT EXISTS "case_files_caseId_category_idx" ON "case_files"("caseId", "category");
