/**
 * 債権者資料（各社タブのファイル格納フィールド）。No.8
 *
 * 和解対象債権の各社タブに添付する資料（和解書・債権調査票など）を
 * DB（bytea）に保存する。Vercel Functions のボディ上限を考慮し、
 * 1ファイル 4MB までとする（超える場合は分割/圧縮を案内）。
 *
 * アップロードは JSON { name, mime, dataBase64 } で受ける。
 */
import { prisma } from './db.js'
import { writeAudit, type Actor } from './audit.js'

export const MAX_FILE_BYTES = 4 * 1024 * 1024

export type CreditorFileMeta = {
  id: number
  creditorId: number
  name: string
  mime: string
  size: number
  uploadedBy: string
  createdAt: string
}

export async function listCreditorFiles(creditorId: number): Promise<CreditorFileMeta[]> {
  const rows = await prisma.creditorFile.findMany({
    where: { creditorId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      creditorId: true,
      name: true,
      mime: true,
      size: true,
      uploadedBy: true,
      createdAt: true,
    },
  })
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))
}

export async function uploadCreditorFile(
  actor: Actor & { name?: string | null },
  creditorId: number,
  raw: string
): Promise<{ status: number; body: unknown }> {
  let body: { name?: string; mime?: string; dataBase64?: string }
  try {
    body = JSON.parse(raw || '{}') as { name?: string; mime?: string; dataBase64?: string }
  } catch {
    return { status: 400, body: { error: 'bad request' } }
  }
  const name = (body.name ?? '').trim().slice(0, 255)
  const mime = (body.mime ?? 'application/octet-stream').slice(0, 100)
  if (!name || !body.dataBase64) return { status: 400, body: { error: 'ファイル名とデータは必須です' } }
  let data: Buffer
  try {
    data = Buffer.from(body.dataBase64, 'base64')
  } catch {
    return { status: 400, body: { error: 'データの形式が不正です' } }
  }
  if (data.length === 0) return { status: 400, body: { error: '空のファイルです' } }
  if (data.length > MAX_FILE_BYTES) {
    return {
      status: 413,
      body: { error: `ファイルが大きすぎます（上限 ${Math.floor(MAX_FILE_BYTES / 1024 / 1024)}MB）` },
    }
  }
  const creditor = await prisma.creditor.findUnique({
    where: { id: creditorId },
    select: { id: true, creditorName: true, caseId: true },
  })
  if (!creditor) return { status: 404, body: { error: 'creditor not found' } }
  const created = await prisma.creditorFile.create({
    data: {
      creditorId,
      name,
      mime,
      size: data.length,
      data: new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)) as Uint8Array<ArrayBuffer>,
      uploadedBy: actor.email ?? '',
    },
    select: { id: true, creditorId: true, name: true, mime: true, size: true, uploadedBy: true, createdAt: true },
  })
  await writeAudit({
    actor,
    action: 'CREATE',
    entity: 'CreditorFile',
    entityId: String(created.id),
    summary: `債権者資料アップロード: ${creditor.creditorName} / ${name}（${(data.length / 1024).toFixed(0)}KB）`,
    metadata: { caseId: creditor.caseId, creditorId },
  })
  return { status: 200, body: { ok: true, file: { ...created, createdAt: created.createdAt.toISOString() } } }
}

export async function getCreditorFile(
  fileId: number
): Promise<{ name: string; mime: string; data: Buffer } | null> {
  const row = await prisma.creditorFile.findUnique({
    where: { id: fileId },
    select: { name: true, mime: true, data: true },
  })
  if (!row) return null
  return { name: row.name, mime: row.mime, data: Buffer.from(row.data) }
}

export async function deleteCreditorFile(
  actor: Actor,
  fileId: number
): Promise<{ status: number; body: unknown }> {
  const row = await prisma.creditorFile.findUnique({
    where: { id: fileId },
    select: { id: true, name: true, creditorId: true },
  })
  if (!row) return { status: 404, body: { error: 'not found' } }
  await prisma.creditorFile.delete({ where: { id: fileId } })
  await writeAudit({
    actor,
    action: 'DELETE',
    entity: 'CreditorFile',
    entityId: String(fileId),
    summary: `債権者資料削除: ${row.name}`,
    metadata: { creditorId: row.creditorId },
  })
  return { status: 200, body: { ok: true } }
}
