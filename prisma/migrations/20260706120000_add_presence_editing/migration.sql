-- 編集中フラグ（同一レコードの編集ロック用）。閲覧のみ=false、編集中=true
ALTER TABLE "edit_presences" ADD COLUMN "editing" BOOLEAN NOT NULL DEFAULT false;
