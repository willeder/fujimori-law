-- ============================================================================
-- 案件の累計値カラムを追加（累)弁代報酬・累)ﾌﾟｰﾙ充当予定・累)手数料 ほか）
-- ----------------------------------------------------------------------------
-- kintone「基本情報」には以前から存在していたが、移行スクリプトが
-- 取り込んでいなかった項目。「報酬・弁代・プールチェック」の一覧で必要になった。
-- 全3,084件すべてに値が入っているため、追加後に再シードすること。
--   1) npx prisma migrate deploy
--   2) npx prisma generate
--   3) python3 scripts/generate_realdata_json.py
--   4) pnpm db:seed
-- ============================================================================
ALTER TABLE "cases" ADD COLUMN "cumulativePlannedAgentFeeAllocation"  INTEGER; -- 累)弁代報酬充当予定額
ALTER TABLE "cases" ADD COLUMN "cumulativeAgentFeeAllocation"         INTEGER; -- 累)弁代報酬充当額
ALTER TABLE "cases" ADD COLUMN "cumulativePlannedPoolAllocation"      INTEGER; -- 累)ﾌﾟｰﾙ充当予定額
ALTER TABLE "cases" ADD COLUMN "cumulativePlannedRepaymentAllocation" INTEGER; -- 累)弁済充当予定額
ALTER TABLE "cases" ADD COLUMN "cumulativeHandlingFee"                INTEGER; -- 累)手数料
