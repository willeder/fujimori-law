-- 債権者タブ/一覧の表示順を保持する displayOrder を追加。
-- 取込時に「受任 → 受任対象外」の順で採番し、UI からのドラッグ並べ替えでも更新する。
-- NULL は未設定（従来データ）。並び替えは displayOrder NULLS LAST 相当 + id 昇順で安定化する。

-- AlterTable
ALTER TABLE "creditors" ADD COLUMN "displayOrder" INTEGER;

-- CreateIndex
CREATE INDEX "creditors_caseId_displayOrder_idx" ON "creditors"("caseId", "displayOrder");
