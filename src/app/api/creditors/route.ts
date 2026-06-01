import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { toCreditorJson } from '@/lib/serialize'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** 全債権者を creditors.json と同一形で返す */
export async function GET() {
  const rows = await prisma.creditor.findMany({ orderBy: { id: 'asc' } })
  return NextResponse.json(rows.map(toCreditorJson))
}
