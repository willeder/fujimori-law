-- メール送信履歴（No.92/93）
CREATE TABLE "email_logs" (
    "id" SERIAL NOT NULL,
    "caseId" INTEGER,
    "toAddress" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "provider" TEXT NOT NULL DEFAULT '',
    "providerId" TEXT,
    "sentBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "email_logs_caseId_idx" ON "email_logs"("caseId");
CREATE INDEX "email_logs_createdAt_idx" ON "email_logs"("createdAt");
