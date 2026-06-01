import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/** 1 案件の詳細（基本情報＋債権者＋入金＋接触履歴）を返す */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const caseId = Number(id)
  if (!Number.isFinite(caseId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  const data = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      creditors: true,
      payments: { orderBy: { plannedDate: 'asc' } },
      contactHistories: { orderBy: [{ contactDate: 'asc' }, { id: 'asc' }] },
      lineLink: true,
    },
  })

  if (!data) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  return NextResponse.json(data)
}
