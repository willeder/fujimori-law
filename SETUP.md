# セットアップ手順（本実装 / Next.js + Prisma + PostgreSQL）

設計は [`docs/spec/本実装設計_DB移行.md`](docs/spec/本実装設計_DB移行.md) を参照。

## 前提

- Node.js 20+ / Python 3（実データ生成用）
- PostgreSQL（Neon 等のマネージド・東京リージョン推奨）

## 初回セットアップ

> 注意: zsh は対話シェルで行末の `# コメント` をコメント扱いしない（既定で `interactive_comments` 無効）。
> 下記は**1行ずつ・コメントを付けずに**実行すること。複数行を一括ペーストしない。

```bash
npm install
```

`.env` を用意し、Supabase の接続文字列と `AUTH_SECRET` を設定する:

```bash
cp .env.example .env
```

`.env` をエディタで開き、以下を設定（Supabase: Project Settings → Database → Connection string）:

- `DATABASE_URL` … Transaction pooler（ポート 6543）+ `?pgbouncer=true&connection_limit=1`（実行時用）
- `DIRECT_URL` … Session pooler（ポート 5432）（マイグレーション/seed 用）
- `[YOUR-PASSWORD]` は DB パスワードに置換。`AUTH_SECRET` は `openssl rand -base64 32` の出力。

```bash
npm run db:generate
```

```bash
npm run db:migrate -- --name init
```

```bash
npm run data:build
```

```bash
npm run db:seed
```

### 起動（client-mock 単体・1コマンド）

API は client-mock の Vite 開発サーバに内蔵済み（`/api/*` を DB 接続で処理）。別プロセスの Next は不要。
Prisma クライアントは**リポジトリ root に1つ**だけ持ち（migrate/seed と共用）、client-mock は親ディレクトリ経由でそれを参照する。

リポジトリ root で（クライアント生成・初回/スキーマ変更時のみ）:

```bash
npm run db:generate
```

client-mock 起動:

```bash
cd client-mock
npm install
npm run dev
```

ブラウザで **http://localhost:5173**（Basic 認証 `mock` / `Ui7mK9pQ2vLx4wR8`）。元の UI のまま、中身が DB（Supabase）由来になる。

> DATABASE_URL はリポジトリ root の `.env` を Vite が読み込む（`vite.config.ts`）。
> マイグレーション/seed はこれまで通り **リポジトリ root** で `npm run db:migrate` / `npm run db:seed`。
> client-mock 側には `@prisma/client` を入れない（root と二重生成になり「did not initialize」エラーの原因になるため）。

## ディレクトリ

| パス | 役割 |
|------|------|
| `src/app/` | Next.js App Router（画面・API） |
| `src/app/api/` | Route Handlers（案件詳細 等） |
| `src/lib/prisma.ts` | Prisma クライアント（シングルトン） |
| `prisma/schema.prisma` | DB スキーマ |
| `prisma/seed.ts` | 実データ移行 seed |
| `scripts/generate_realdata_json.py` | CSV → JSON 生成 |
| `client-mock/` | 旧プロトタイプ（移植元・参照用。段階的に `src/app` へ移行） |

## 構成方針

- **client-mock（Vite）単体で完結**。UI は据え置きのまま、Vite 開発サーバに DB 接続 API を内蔵（`client-mock/src/server/handlers.ts` を `vite.config.ts` の `dbApiPlugin` が `/api/*` として処理）。
- `/api/cases` `/api/creditors` `/api/payments` `/api/contact-histories` が DB の内容を旧 JSON と同一形で返す。`CaseStore` はこれを fetch（旧 `public/data/*.json` は不使用）。
- DB スキーマ・マイグレーション・seed はリポジトリ root の `prisma/` を共有（client-mock は `--schema ../prisma/schema.prisma` でクライアント生成）。
- root の Next.js（`src/app` 等）は**もう使わない**（残置可。削除しても動作に影響なし）。本番 Vercel では client-mock を 1 プロジェクトとしてデプロイし、`/api/*` は Vercel Functions 化する（別途対応）。

## 移行ステータス

- [x] Prisma スキーマ / seed / 実データ投入
- [x] DB 接続 API（`/api/*`）＋ client-mock を API 経由に（UI 据え置きで DB 化）
- [ ] 編集・追加の永続化（API に書き込み系を追加し、CaseStore の更新を反映）
- [ ] 認証（Auth.js・Basic 認証撤去）
- [ ] LINE 連携（Webhook・push・日次リマインド）
- [ ] 本番デプロイ構成（単一 Vercel へ集約 or 2 プロジェクト）

## 注意

- `client-mock/public/data/*.json` は再生成可のため Git 管理外。clone 後は `npm run data:build` を実行。
- 機微情報（債務整理）につき、本番は東京リージョン・暗号化・アクセス制御を前提に。
