-- GMO オープンAPI の流量制御（プライベートアクセスは 1TPS）のための最終呼び出し時刻。
-- Vercel は同時に複数のインスタンスが動くため、プロセス内キューだけでは
-- 「全体の流量」を 1TPS 以下に保てない。DB を共有ゲートにして直列化する。
CREATE TABLE IF NOT EXISTS "gmo_rate_limit" (
  "id"           INTEGER      PRIMARY KEY,
  "lastCalledAt" TIMESTAMP(3) NOT NULL DEFAULT (NOW() - INTERVAL '1 hour')
);

INSERT INTO "gmo_rate_limit" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
