/**
 * 初期管理者（または任意ユーザー）の作成・パスワード設定。
 *
 *   pnpm auth:create-admin -- --email a@example.com --password 'secret' --name 山田 --role ADMIN
 *
 * 既存メールなら passwordHash / role / status を更新（upsert）。
 * DATABASE_URL は .env から読み込む。
 */
import { config as loadDotenv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

loadDotenv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') })

const { prisma } = await import('../src/server/db')
const { hashPassword } = await import('../src/server/auth')

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const email = arg('email')?.trim().toLowerCase()
const password = arg('password')
const name = arg('name') ?? null
const role = (arg('role') ?? 'ADMIN').toUpperCase() === 'STAFF' ? 'STAFF' : 'ADMIN'

if (!email || !password) {
  console.error(
    'Usage: pnpm auth:create-admin -- --email <email> --password <password> [--name <name>] [--role ADMIN|STAFF]'
  )
  process.exit(1)
}

const passwordHash = hashPassword(password)

const user = await prisma.user.upsert({
  where: { email },
  create: { email, name, role, status: 'ACTIVE', passwordHash },
  update: { role, status: 'ACTIVE', passwordHash, ...(name ? { name } : {}) },
  select: { id: true, email: true, name: true, role: true, status: true },
})

console.log('OK:', user)
await prisma.$disconnect()
