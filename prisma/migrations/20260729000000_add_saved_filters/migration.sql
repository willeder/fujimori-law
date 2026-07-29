-- ============================================================================
-- 保存した絞り込み条件（saved_filters）
-- ----------------------------------------------------------------------------
-- 一覧画面で組んだ検索条件・並び順に名前を付けて保存し、全ユーザーで共有する。
--   scope = 'SHARED'  … 全ユーザーが呼び出せる
--   scope = 'PRIVATE' … 作成者本人のみ
-- 編集・削除の可否（作成者本人 or ADMIN）はアプリ側（src/server/savedFilters.ts）で判定する。
--
-- 20260722000000_enable_rls_public と同じ方針で、本テーブルも RLS を有効化する
-- （ポリシーは作らない = PostgREST の anon / authenticated からは全拒否。
--   所有者ロール postgres 経由の Prisma からは従来どおりアクセス可能）。
-- ============================================================================

-- CreateEnum
CREATE TYPE "SavedFilterScope" AS ENUM ('SHARED', 'PRIVATE');

-- CreateTable
CREATE TABLE "saved_filters" (
    "id" TEXT NOT NULL,
    "target" TEXT NOT NULL DEFAULT 'caseList',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" "SavedFilterScope" NOT NULL DEFAULT 'SHARED',
    "payload" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_filters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_filters_target_scope_idx" ON "saved_filters"("target", "scope");

-- CreateIndex
CREATE INDEX "saved_filters_ownerId_idx" ON "saved_filters"("ownerId");

-- AddForeignKey
ALTER TABLE "saved_filters" ADD CONSTRAINT "saved_filters_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS（ポリシーは意図的に作成しない。20260722000000_enable_rls_public と同方針）
ALTER TABLE public.saved_filters ENABLE ROW LEVEL SECURITY;
