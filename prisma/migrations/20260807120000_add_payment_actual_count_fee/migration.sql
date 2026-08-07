-- 入金予定の「実績側」項目を追加。
-- kintone は予定（社数 / 手数料）と実績（数 / 振)手数料 / 弁済日）で別項目を持つが、
-- 移行時に予定側しか取り込んでおらず、実績の社数・手数料が予定値のままだった。
ALTER TABLE "payments" ADD COLUMN "repaymentDate" DATE;
ALTER TABLE "payments" ADD COLUMN "actualRepaymentCount" INTEGER;
ALTER TABLE "payments" ADD COLUMN "actualHandlingFee" INTEGER;
