-- 債権者資料（各社タブのファイル格納）。No.8
CREATE TABLE "creditor_files" (
    "id" SERIAL NOT NULL,
    "creditorId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creditor_files_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "creditor_files_creditorId_idx" ON "creditor_files"("creditorId");

ALTER TABLE "creditor_files" ADD CONSTRAINT "creditor_files_creditorId_fkey" FOREIGN KEY ("creditorId") REFERENCES "creditors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
