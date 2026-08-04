-- ============================================================================
-- public スキーマ全テーブルで Row Level Security (RLS) を有効化する
-- ----------------------------------------------------------------------------
-- 背景:
--   本アプリは DB へ Prisma 経由（DATABASE_URL / DIRECT_URL, postgres ロール）
--   でのみアクセスしており、Supabase の anon キー / PostgREST 自動 API は
--   一切利用していない（@supabase/supabase-js 未依存）。
--   postgres ロールはこれらテーブルの所有者であり、ENABLE（FORCE ではない）
--   RLS は所有者には適用されない。したがって:
--     - Prisma からの読み書きは従来どおり全件アクセス可能（アプリ無変更・無停止）
--     - PostgREST が使う anon / authenticated ロールはポリシー無し = 全拒否
--   これにより Supabase リンターの ERROR
--   （0013 rls_disabled_in_public / 0023 sensitive_columns_exposed）を解消する。
--
--   ※ ポリシーは意図的に一切作成しない（外部 API からのアクセスは全面遮断が正）。
--   ※ 将来ブラウザから anon キーで直接アクセスする設計に変える場合のみ、
--     その時点で必要なテーブルに CREATE POLICY を追加すること。
-- ============================================================================

ALTER TABLE public.cases                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creditors              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_histories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_links             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_tokens    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edit_presences         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gmo_api_tokens         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creditor_files         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs             ENABLE ROW LEVEL SECURITY;

-- Prisma 内部管理テーブル（リンターが指摘するため同様に有効化）。
-- Prisma は所有者ロールで書き込むため RLS 有効でもマイグレーション記録は継続可能。
ALTER TABLE public._prisma_migrations     ENABLE ROW LEVEL SECURITY;
