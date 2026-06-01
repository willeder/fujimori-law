import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { toPaymentJson } from '@/lib/serialize'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** 全入金明細を payments.json と同一形で返す（案件全体行のみ。debtor別は UI 側で算出） */
export async function GET() {
  const rows = await prisma.payment.findMany({ orderBy: { id: 'asc' } })
  return NextResponse.json(rows.map(toPaymentJson))
}
