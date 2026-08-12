-- 辞任日（kintone 基本情報.csv の「辞任日」）。取り込み漏れだった項目。
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "resignationDate" DATE;
