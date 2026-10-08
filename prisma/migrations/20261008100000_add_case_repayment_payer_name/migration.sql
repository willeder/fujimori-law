-- 弁済時振込名義を追加する（事務所のご要望 2026-10-08、Rei 確認済み）。
--
--   「依頼後に名前が変わった際、名前フィールドを変更してしまうと、弁済時の振込元名義も
--     連動して変更されてしまうため、『弁済時振込名義』フィールドを新たに設置し、
--     弁済時の振込名義は当フィールドを参照してほしい。
--     現時点の全案件は現在のフリガナ値を参照、移管後は登録時のフリガナ値を参照し、
--     未来でフリガナ値を編集しても弁済時振込名義の値は変更されない仕様でお願いしたい」
--
-- 既存の全案件には、適用時点のフリガナを一度だけ写す。以後は連動しない。
ALTER TABLE "cases" ADD COLUMN "repaymentPayerName" TEXT;
UPDATE "cases" SET "repaymentPayerName" = "furigana"
WHERE "furigana" IS NOT NULL AND btrim("furigana") <> '';
