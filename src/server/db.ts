/**
 * Prisma クライアント（サーバ専用シングルトン）。
 * handlers.ts と同じ globalThis.__prisma キーを共有し、
 * Vite 開発サーバ（ssrLoadModule）でも Vercel Functions でも
 * 1 プロセス 1 インスタンスに保つ。
 */
import { PrismaClient } from '@prisma/client'

const g = globalThis as unknown as { __prisma?: PrismaClient }
export const prisma = g.__prisma ?? new PrismaClient()
if (!g.__prisma) g.__prisma = prisma
