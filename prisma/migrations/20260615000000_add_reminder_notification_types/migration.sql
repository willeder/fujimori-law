-- 入金催促通知の4タイミングを NotificationType に追加。
-- Postgres の ALTER TYPE ... ADD VALUE はトランザクション内で実行できないため、
-- 各 ADD VALUE を独立した文として実行する（Prisma は enum 追加を非トランザクションで適用する）。
-- IF NOT EXISTS により再実行しても安全。

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PAYMENT_REMINDER_3D';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PAYMENT_REMINDER_1D';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PAYMENT_REMINDER_0D_1';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PAYMENT_REMINDER_0D_2';
