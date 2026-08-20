-- リマインド（案件ごとの「いつ・何をする」）。
-- kintone では和解対象債権のサブテーブルに債権者名「★リマインド」の行として
-- 入っていたため債権社数の集計を狂わせていた。独立した表に切り出す。
CREATE TABLE IF NOT EXISTS "case_reminders" (
  "id"        SERIAL       PRIMARY KEY,
  "caseId"    INTEGER      NOT NULL,
  "dueDate"   DATE,
  "body"      TEXT         NOT NULL,
  "done"      BOOLEAN      NOT NULL DEFAULT false,
  "doneAt"    TIMESTAMP(3),
  "doneBy"    TEXT,
  "source"    TEXT         NOT NULL DEFAULT '',
  "createdBy" TEXT         NOT NULL DEFAULT '',
  "updatedBy" TEXT         NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$ BEGIN
  ALTER TABLE "case_reminders"
    ADD CONSTRAINT "case_reminders_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "case_reminders_caseId_idx"       ON "case_reminders"("caseId");
CREATE INDEX IF NOT EXISTS "case_reminders_dueDate_idx"      ON "case_reminders"("dueDate");
CREATE INDEX IF NOT EXISTS "case_reminders_done_dueDate_idx" ON "case_reminders"("done", "dueDate");
