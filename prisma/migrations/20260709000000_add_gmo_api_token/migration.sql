-- GMOあおぞらAPI連携のトークン保存（1行運用）。No.153
CREATE TABLE "gmo_api_tokens" (
    "id" SERIAL NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "scope" TEXT,
    "expiresAt" TIMESTAMP(3),
    "pendingState" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gmo_api_tokens_pkey" PRIMARY KEY ("id")
);
