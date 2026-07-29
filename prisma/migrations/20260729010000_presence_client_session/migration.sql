-- ============================================================================
-- 同時編集の識別を「アカウント（メール）」から「セッション（タブ）」に変更する
-- ----------------------------------------------------------------------------
-- 背景:
--   edit_presences のキーが (entity, entityId, email) で、他ユーザーの取得も
--   email <> 自分 で絞っていたため、
--     - 同じアカウントを2つのウィンドウで開いても相手を検知できない
--     - 事務所でアカウントを共有していると、2人が同じ案件を同時に編集しても
--       誰も気づかないまま後勝ちで上書きされる
--   という状態だった。タブ単位の clientId で識別するよう変更する。
--
--   あわせて editingSince（編集を開始した時刻）を追加する。
--   これが最も早いセッションをロック保持者とすることで、
--   「AとBがほぼ同時に編集を始めると両方がブロックされて解除されない」
--   相互ブロックを構造的に防ぐ。
--
--   cases.updatedByClient は先勝ち保存の判定用。従来は updatedBy（メール）で
--   比較していたため、同一アカウントの別ウィンドウ同士が素通りしていた。
-- ============================================================================

-- ── edit_presences ───────────────────────────────────────────────────────
ALTER TABLE "edit_presences" ADD COLUMN "clientId" TEXT;

-- 既存行は移行のため email をそのまま識別子として使う（TTLで数分以内に自然消滅する）
UPDATE "edit_presences" SET "clientId" = "email" WHERE "clientId" IS NULL;

ALTER TABLE "edit_presences" ALTER COLUMN "clientId" SET NOT NULL;

ALTER TABLE "edit_presences" ADD COLUMN "editingSince" TIMESTAMP(3);

-- 旧ユニーク制約（email 基準）を外し、clientId 基準に張り替える
DROP INDEX IF EXISTS "edit_presences_entity_entityId_email_key";

CREATE UNIQUE INDEX "edit_presences_entity_entityId_clientId_key"
  ON "edit_presences"("entity", "entityId", "clientId");

-- ── cases ────────────────────────────────────────────────────────────────
ALTER TABLE "cases" ADD COLUMN "updatedByClient" TEXT;
