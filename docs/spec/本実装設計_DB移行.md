# 受任案件管理システム — 本実装 設計書（DB移行）

プロトタイプ（Vite SPA ＋ 実データ JSON）から、DB を用いた本番実装へ移行するための設計。

## 1. 確定した方針

| 項目 | 採用 | 理由 |
|------|------|------|
| 全体構成 | **Next.js（App Router）に統合** | フロント・API・LINE Webhook を Vercel 上で一体運用。型を共有でき、デプロイ先が1つで済む |
| DB | **PostgreSQL（マネージド）** | リレーション・全文検索・JSON に強い。Neon を第一候補（サーバーレス・Vercel連携・ブランチ機能） |
| ORM | **Prisma 6** | 既存 TS 型がほぼそのままスキーマ化でき、型安全。マイグレーション・seed が容易 |
| 認証 | **Auth.js（NextAuth v5）** | App Router 対応。スタッフのメール/パスワード or Google SSO。現行 Basic 認証を置換 |
| 初期スコープ | **DB化 → CRUD永続化 → 認証 → LINE基盤まで** | 一気通貫で本番化 |
| データ所在 | クラウドマネージドで可（東京リージョン推奨） | 機微情報のため Japan リージョン・通信/保存暗号化を前提 |

## 2. 全体アーキテクチャ

```
[ブラウザ(事務所スタッフ)]              [LINE プラットフォーム]
        │ 認証(Auth.js)                        │ Webhook(follow/message)
        ▼                                      ▼
┌─────────────────────────── Next.js (Vercel) ───────────────────────────┐
│  App Router                                                            │
│   ├─ 画面(RSC/Client)  … 既存 client-mock の画面を移植                 │
│   ├─ Server Actions / Route Handlers … 案件・入金・債権者・接触履歴CRUD │
│   ├─ /api/line/webhook        … userId 取得・登録コード照合・紐付け     │
│   ├─ /api/line/push (内部)     … Messaging API push 配信               │
│   └─ /api/cron/payment-reminder … 入金予定リマインドの日次バッチ        │
│                         │ Prisma                                       │
└─────────────────────────┼────────────────────────────────────────────┘
                          ▼
                  PostgreSQL (Neon, 東京)
```

外部サービス：LINE Messaging API（公式アカウント・ライトプラン）／Vercel Cron（日次バッチ）。

## 3. データモデル（`prisma/schema.prisma`）

既存型 `client-mock/src/types/case.ts` を踏襲し、次のテーブルで構成（詳細はスキーマ本体参照）。

- **cases** … 案件（依頼者）。基本情報・アポ・債務・和解・報酬・入金サマリ・リマインド・メタを1テーブルに集約（`externalId` で kintone と突合）。
- **creditors** … 和解対象債権（`caseId` で 1対多）。
- **payments** … 入金予定/実績。`creditorId == null` は案件全体行、債権者IDありは弁済スケジュール行。
- **contact_histories** … 接触履歴。`targetType`(CLIENT/CREDITOR)、`comment` は複数行(Text)。
- **line_links** … 依頼者の LINE userId 紐付け（登録コード方式）。`registrationCode`・`lineUserId` は一意。
- **line_notification_logs** … push 配信ログ。`(caseId, scheduledDate, type)` 一意で二重送信防止（冪等）。
- **users / accounts / sessions / verification_tokens** … Auth.js 標準。`role`(ADMIN/STAFF)。

金額は `Int`（円）、日付は `DateTime @db.Date`、日時は `DateTime`。

## 4. 認証

Auth.js（NextAuth v5）＋ Prisma Adapter。初期はスタッフのメール/パスワード（`passwordHash`）。Middleware で全画面・APIを保護し、現行の Basic 認証（`middleware.ts`／`vite.config.ts`）は撤去。ロールで管理者操作（ユーザー追加・LINE設定）を制限。LINE Webhook は署名検証で保護（セッション認証は不要）。

## 5. LINE 連携（登録コード方式）

1. 受任時、案件ごとに `line_links` へ一意 `registrationCode`（推測困難・有効期限付き）を発行。
2. 依頼者が公式アカウントを友だち追加 → `follow` イベントが `/api/line/webhook` に届く（`lineUserId` 取得）。歓迎メッセージでコード入力を依頼。
3. 依頼者がコードを送信 → `message` イベントで照合し `lineUserId ↔ caseId` を保存（`status=LINKED`）。
4. 日次バッチ `/api/cron/payment-reminder` が、当日対象の `nextPaymentDate`/入金予定を抽出し、`LINKED` の依頼者へ Messaging API push。`line_notification_logs` に記録（冪等キーで二重送信防止）。
5. 本文は機微情報を含めず「予定日のお知らせ＋マイページ誘導」に留める。未連携者はメール/SMS フォールバック（将来）。

Webhook 署名検証・チャネルアクセストークンは環境変数で管理。

## 6. 実データ移行（seed）

既存の `scripts/generate_realdata_json.py`（CSV→JSON、全2,911件）を再利用。`prisma/seed.ts` が生成済み JSON（cases/creditors/payments/contactHistories）を読み込み、ネスト構造をフラットな Prisma 行へ変換して `createMany` で一括投入する。

- `id`/`caseId`/`creditorId` は JSON の連番をそのまま採用し、投入後にシーケンスをリセット。
- 日付文字列は `Date` へ変換、空は `null`。`targetType` は 依頼者→CLIENT / 債権者→CREDITOR。
- 債権者別の弁済スケジュール（合算からのFIFO配分）は現状フロント実行時算出。本実装では seed では入れず、必要に応じて payments に creditorId 付き行として実体化するか、API 側で算出するかを段階で選択。

手順（ルート）:

```
# 1) CSV → JSON 生成（既存）
python3 scripts/generate_realdata_json.py
# 2) DB マイグレーション
npx prisma migrate dev --name init
# 3) seed 投入
npx prisma db seed
```

## 7. 段階ロードマップ

1. **基盤**: Next.js プロジェクト化（client-mock の画面移植）、Prisma/Neon 接続、`migrate dev`。
2. **移行**: `prisma/seed.ts` で実データ投入、画面のデータ取得を JSON fetch → Prisma 経由 API に置換（まず読み取り）。
3. **CRUD**: 案件・入金・債権者・接触履歴の編集/追加を Server Actions で永続化（現行のメモリ更新を置換）。
4. **認証**: Auth.js 導入、Basic 認証撤去、ロール制御。
5. **LINE**: Webhook（紐付け）→ push 配信 → 日次リマインド（Cron）→ 通知ログ。
6. **仕上げ**: 監査ログ・バックアップ方針・本番環境変数・E2E。

## 8. 留意点

- 機微情報（債務整理）につき、東京リージョン・保存/通信暗号化・アクセス制御・監査を前提に。
- 入金 182,778 行は DB なら問題なし（プロトタイプの JSON 肥大化問題が解消）。
- まずは Neon の開発ブランチで `migrate`＋`seed`を回し、本番ブランチへ昇格する運用を推奨。
