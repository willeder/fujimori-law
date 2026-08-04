-- ============================================================================
-- LINE 連携セッション（line_code_sessions）
-- ----------------------------------------------------------------------------
-- 依頼者が「連携開始」等のトリガー語を送ってから一定時間だけ、次の発言を
-- 登録コードとして受け付けるための一時状態。
--
-- 背景:
--   この公式アカウントはスタッフが手動チャットにも使用している（chatMode=chat）。
--   従来の実装は受信テキストを無条件に登録コードとして照合していたため、
--   通常の会話にまで「登録コードを送信してください。」「コードが確認できません
--   でした。」が毎回自動返信されていた。
--   トリガー語を受け取ったユーザーだけをこのテーブルに登録し、セッション中の
--   発言のみをコードとして扱うことで、通常会話への誤爆をなくす。
--
-- Vercel Functions はリクエストごとに使い捨てのためメモリに状態を保持できず、
-- DB に永続化する必要がある。期限切れ行はトリガー受信時にまとめて削除する。
--
-- 20260722000000_enable_rls_public と同じ方針で、本テーブルも RLS を有効化する
-- （ポリシーは作らない = PostgREST の anon / authenticated からは全拒否。
--   所有者ロール postgres 経由の Prisma からは従来どおりアクセス可能）。
-- ============================================================================

-- CreateTable
CREATE TABLE "line_code_sessions" (
    "lineUserId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "line_code_sessions_pkey" PRIMARY KEY ("lineUserId")
);

-- CreateIndex
CREATE INDEX "line_code_sessions_expiresAt_idx" ON "line_code_sessions"("expiresAt");

-- RLS（ポリシーは意図的に作成しない。20260722000000_enable_rls_public と同方針）
ALTER TABLE public.line_code_sessions ENABLE ROW LEVEL SECURITY;
