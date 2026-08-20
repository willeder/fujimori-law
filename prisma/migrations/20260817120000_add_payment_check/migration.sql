-- 入金情報サブテーブルのチェックボックス（kintone: check[check]）
-- ビュー「受任後入金管理」の絞り込み条件に使う
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "check" TEXT;
CREATE INDEX IF NOT EXISTS "payments_check_idx" ON "payments"("check") WHERE "check" IS NOT NULL;
