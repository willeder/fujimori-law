import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { toContactJson } from '@/lib/serialize'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** 全接触履歴を contactHistories.json と同一形で返す */
export async function GET() {
  const rows = await prisma.contactHistory.findMany({ orderBy: { id: 'asc' } })
  return NextResponse.json(rows.map(toContactJson))
}
