# セットアップ手順（本実装 / Vite + React + Prisma + PostgreSQL）

設計は [`docs/spec/本実装設計_DB移行.md`](docs/spec/本実装設計_DB移行.md) を参照。

アプリは **リポジトリ直下の単一 Vite プロジェクト**（旧 `client-mock` を昇格）。
Vite 開発サーバに DB 接続 API（`/api/*`）と LINE Webhook/cron を内蔵し、別プロセスは不要。
本番は Vercel に 1 プロジェクトとしてデプロイし、`api/` を Vercel Functions として動かす。

## 前提

- Node.js 20+ / Python 3（実データ生成用）
- pnpm（パッケージマネージャ）。`package.json` の `packageManager` で版を固定済み。
  未導入なら `corepack enable`（同梱の corepack が自動で該当版を用意）。
- PostgreSQL（Supabase / Neon 等のマネージド・東京リージョン推奨）

## 初回セットアップ

> 注意: zsh は対話シェルで行末の `# コメント` をコメント扱いしない（既定で `interactive_comments` 無効）。
> 下記は**1行ずつ・コメントを付けずに**実行すること。複数行を一括ペーストしない。

```bash
pnpm install
```

`.env` を用意し、接続文字列と各シークレットを設定する:

```bash
cp .env.example .env
```

`.env` をエディタで開き、以下を設定（Supabase: Project Settings → Database → Connection string）:

- `DATABASE_URL` … Transaction pooler（ポート 6543）+ `?pgbouncer=true&connection_limit=1`（実行時用）
- `DIRECT_URL` … Session pooler（ポート 5432）（マイグレーション/seed 用）
- `[YOUR-PASSWORD]` は DB パスワードに置換。`AUTH_SECRET` は `openssl rand -base64 32` の出力。
- LINE 連携を使う場合は `LINE_CHANNEL_ACCESS_TOKEN` / `LINE_CHANNEL_SECRET` / `CRON_SECRET` / `VITE_LINE_ADD_FRIEND_URL` も設定（下記「LINE 連携」参照）。

```bash
pnpm db:generate
```

```bash
pnpm db:migrate --name init
```

```bash
pnpm data:build
```

```bash
pnpm db:seed
```

### 起動（1コマンド）

リポジトリ root で:

```bash
pnpm dev
```

ブラウザで **http://localhost:5173**（Basic 認証 `mock` / `Ui7mK9pQ2vLx4wR8`）。
DB 接続 API（`/api/*`）は Vite 開発サーバ内蔵（`src/server/handlers.ts` を `vite.config.ts` の
`dbApiPlugin` が処理）。`DATABASE_URL` は root の `.env` を Vite が読み込む。

### 本番ビルド

```bash
pnpm build   # prisma generate && tsc -b && vite build
```

`build` に `prisma generate` を含めているため、Vercel でも Prisma クライアントが確実に生成される。
Vercel は `pnpm-lock.yaml` を検出して自動で pnpm を使う。Prisma 等のビルド許可は
`pnpm-workspace.yaml` の `allowBuilds` に明示済み（pnpm は既定で postinstall を無効化するため）。

## ディレクトリ

| パス | 役割 |
|------|------|
| `src/` | React アプリ（画面・コンポーネント・状態） |
| `src/server/` | サーバ専用ロジック（DB API・LINE クライアント・Webhook・リマインド） |
| `api/` | 本番 Vercel Functions（`line/webhook`・`cron/payment-reminder`） |
| `vite.config.ts` | Vite 設定。`dbApiPlugin` が開発時の `/api/*` を内蔵処理 |
| `middleware.ts` | Vercel 用 Basic 認証 |
| `prisma/schema.prisma` | DB スキーマ |
| `prisma/seed.ts` | 実データ移行 seed |
| `scripts/generate_realdata_json.py` | CSV → JSON 生成（出力: `public/data/`） |

## 構成方針

- **単一 Vite プロジェクトで完結**。Vite 開発サーバに DB 接続 API を内蔵
  （`src/server/handlers.ts` を `vite.config.ts` の `dbApiPlugin` が `/api/*` として処理）。
- `/api/cases` `/api/creditors` `/api/payments` `/api/contact-histories` が DB の内容を
  旧 JSON と同一形で返す。`CaseStore` はこれを fetch（`public/data/*.json` は seed 用途のみ）。
- DB スキーマ・マイグレーション・seed は `prisma/`。Prisma クライアントは root に1つ。
- 本番は Vercel に 1 プロジェクトとしてデプロイ。`api/` の Functions と `vercel.json` の cron が
  Webhook/リマインドを処理する。

## 移行ステータス

- [x] Prisma スキーマ / seed / 実データ投入
- [x] DB 接続 API（`/api/*`）＋ UI を API 経由に（UI 据え置きで DB 化）
- [x] 単一プロジェクト化（旧 `client-mock` をルートへ昇格・旧 Next.js 撤去）
- [ ] 編集・追加の永続化（API に書き込み系を追加し、CaseStore の更新を反映）
- [x] 認証（軽量カスタム・Basic 認証撤去）＋ メンバー管理（下記「認証・メンバー管理」）
- [ ] 行動ログ閲覧UI・変更履歴の差分表示／revert（バックエンドの記録は実装済み）
- [x] LINE 連携（Webhook・push・日次リマインド）… 下記「LINE 連携」参照
- [ ] 本番デプロイ構成の最終確認（Vercel rootDirectory・環境変数・cron）

## 認証・メンバー管理

軽量カスタム認証（scrypt パスワード＋DB セッション＋http-only Cookie）。Basic 認証は撤去し、
`/api/*` はセッション必須。管理操作は `ADMIN` ロール限定。すべての変更で
監査ログ（`audit_logs`）と変更履歴（`change_logs`: before/after）を記録する。

| 種別 | 内容 |
|------|------|
| ログイン画面 | ID（氏名ベース）＋パスワード。`src/pages/LoginPage.tsx` |
| メンバー管理 | 一覧/追加/ロール変更/有効・無効化/パスワード再発行。`/members`（ADMIN のみ） |
| API | `/api/auth/{login,logout,me}`、`/api/members`(GET/POST)、`/api/members/:id`(PATCH)、`/api/members/:id/reset-password`(POST) |
| 安全策 | 自己ロックアウト防止・最後の管理者保護・パスワード再発行時に当該ユーザーのセッション失効 |

初期ユーザーの作成:

```bash
pnpm auth:create-admin -- --email admin --password '<強いパスワード>' --name 管理者
pnpm auth:seed-staff   # 第一法務事務所スタッフ15名（全員ADMIN）を投入
```

## LINE 連携

連携フロー本体はサーバ専用ロジック（`src/server/`）に集約し、Vite 開発サーバと
Vercel Functions の双方から再利用する。

| ファイル | 役割 |
|------|------|
| `src/server/line.ts` | Messaging API クライアント（署名検証・コード生成・reply/push）。`@line/bot-sdk` 非依存（`node:crypto` + `fetch`） |
| `src/server/lineWebhook.ts` | Webhook 処理（follow→歓迎／message→コード照合→`LINKED`／unfollow→`BLOCKED`） |
| `src/server/paymentReminder.ts` | 入金予定リマインドの配信（冪等ログで二重送信防止） |
| `src/server/handlers.ts` | 登録コードの発行・連携状況（`/api/line/links/:id`） |
| `api/line/webhook.ts` | 本番 Webhook 受け口（Vercel Function） |
| `api/cron/payment-reminder.ts` | 本番の日次バッチ（Vercel Cron。`vercel.json` の `crons`） |

### エンドポイント

- `GET/POST /api/line/links/:caseId` … 連携状況の取得 / 登録コードの発行（UI の `LineLinkControl`）
- `POST /api/line/webhook` … LINE プラットフォームからの Webhook（署名検証必須）
- `GET/POST /api/cron/payment-reminder?days=N` … リマインド配信（`days` 既定 1=前日）

開発時（Vite）はこれらを `vite.config.ts` の `dbApiPlugin` が処理する。本番（Vercel）は
`api/` の Functions と `vercel.json` の cron が処理する。

### 環境変数（root の `.env`）

```bash
LINE_CHANNEL_ACCESS_TOKEN=""   # Messaging API チャネルアクセストークン（push/reply）
LINE_CHANNEL_SECRET=""         # Webhook 署名検証
CRON_SECRET=""                 # cron 保護（Vercel が Authorization: Bearer <値> を付与）
VITE_LINE_ADD_FRIEND_URL=""    # 友だち追加URL。VITE_ 接頭辞のためブラウザに渡る
```

### ローカル検証

```bash
pnpm dev
```

- 登録コード発行: 案件詳細の「LINE連携」→「登録コードを発行」。
- リマインド手動実行: `curl 'http://mock:Ui7mK9pQ2vLx4wR8@localhost:5173/api/cron/payment-reminder?days=0'`
  （`CRON_SECRET` 設定時は `-H "Authorization: Bearer <値>"` を付与）。
- Webhook 実機確認: LINE Developers の Webhook URL に本番 `…/api/line/webhook` を設定し、
  友だち追加→発行コード送信で `status` が `LINKED` になることを確認。

### 本番（Vercel）の注意

- Vercel プロジェクトのルートはリポジトリ直下。`build`（`prisma generate` を含む）で
  Prisma クライアントが生成される。
- Webhook の署名検証は raw body が必要。Functions は Web 標準ハンドラ（`req.text()`）で実装済み。

## 注意

- `public/data/*.json` は再生成可のため Git 管理外。clone 後は `pnpm data:build` を実行。
- 機微情報（債務整理）につき、本番は東京リージョン・暗号化・アクセス制御を前提に。
