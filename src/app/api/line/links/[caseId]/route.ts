import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateRegistrationCode } from '@/lib/line'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** 連携状況の取得 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ caseId: string }> }
) {
  const { caseId } = await params
  const id = Number(caseId)
  if (!Number.isFinite(id))
    return NextResponse.json({ error: 'invalid caseId' }, { status: 400 })

  const link = await prisma.lineLink.findUnique({ where: { caseId: id } })
  return NextResponse.json(link ?? { caseId: id, status: 'NONE' })
}

/** 登録コードの発行（既存があれば再発行し PENDING に戻す）。有効期限 90 日 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ caseId: string }> }
) {
  const { caseId } = await params
  const id = Number(caseId)
  if (!Number.isFinite(id))
    return NextResponse.json({ error: 'invalid caseId' }, { status: 400 })

  const exists = await prisma.case.findUnique({ where: { id }, select: { id: true } })
  if (!exists)
    return NextResponse.json({ error: 'case not found' }, { status: 404 })

  // 衝突しないコードを生成
  let code = generateRegistrationCode()
  for (let i = 0; i < 5; i++) {
    const dup = await prisma.lineLink.findUnique({
      where: { registrationCode: code },
    })
    if (!dup) break
    code = generateRegistrationCode()
  }

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 90)

  const link = await prisma.lineLink.upsert({
    where: { caseId: id },
    create: {
      caseId: id,
      registrationCode: code,
      status: 'PENDING',
      codeExpiresAt: expiresAt,
    },
    update: {
      registrationCode: code,
      status: 'PENDING',
      codeExpiresAt: expiresAt,
      lineUserId: null,
      linkedAt: null,
    },
  })

  return NextResponse.json(link)
}
