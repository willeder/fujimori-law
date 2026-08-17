-- GMOあおぞらAPI Webhook（振込入金口座_入金明細通知）の受信記録
CREATE TABLE IF NOT EXISTS "gmo_webhook_events" (
    "id" SERIAL NOT NULL,
    "eventKey" TEXT NOT NULL,
    "eventType" TEXT,
    "sourceIp" TEXT,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "parsedRows" INTEGER NOT NULL DEFAULT 0,
    "reflected" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "gmo_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "gmo_webhook_events_eventKey_key" ON "gmo_webhook_events"("eventKey");
CREATE INDEX IF NOT EXISTS "gmo_webhook_events_receivedAt_idx" ON "gmo_webhook_events"("receivedAt");
CREATE INDEX IF NOT EXISTS "gmo_webhook_events_status_idx" ON "gmo_webhook_events"("status");
