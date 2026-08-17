-- 旧「弁済除外」列を廃止。
-- 移行時から全16,738行が NULL のままで、判定は和解状況の「弁済対象」
-- （creditors.repaymentTarget）で行っているため不要。
ALTER TABLE "creditors" DROP COLUMN IF EXISTS "repaymentExcluded";
