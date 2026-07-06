-- CreateTable: 編集中プレゼンス（同時編集の検知用）
CREATE TABLE "edit_presences" (
    "id" SERIAL NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edit_presences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "edit_presences_entity_entityId_email_key" ON "edit_presences"("entity", "entityId", "email");

-- CreateIndex
CREATE INDEX "edit_presences_entity_entityId_idx" ON "edit_presences"("entity", "entityId");
