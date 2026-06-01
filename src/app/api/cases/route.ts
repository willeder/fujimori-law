import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { toCaseJson } from '@/lib/serialize'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** 全案件を cases.json と同一形で返す */
export async function GET() {
  const rows = await prisma.case.findMany({ orderBy: { id: 'asc' } })
  return NextResponse.json(rows.map(toCaseJson))
}
