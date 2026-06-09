/**
 * メンバー管理ページ（ADMIN 限定）。
 * 一覧 / 追加 / ロール変更 / 有効・無効化 / パスワード再発行。
 * 変更はサーバ側で監査ログ・変更履歴に記録される。
 */
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { DataTable, type Column } from '../components'
import { AppHeader } from '../components/AppHeader'
import { PageLoading } from '../components/PageLoading'

type Member = {
  id: string
  email: string
  name: string | null
  role: 'ADMIN' | 'STAFF'
  status: 'ACTIVE' | 'DISABLED'
  lastLoginAt: string | null
}

const ROLE_LABEL: Record<Member['role'], string> = { ADMIN: '管理者', STAFF: 'スタッフ' }

/** 強パスワード生成（大小英字＋数字＋記号、14桁） */
function genPassword(len = 14): string {
  const lower = 'abcdefghijkmnpqrstuvwxyz'
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const digit = '23456789'
  const sym = '!@#$%^&*?-_=+'
  const all = lower + upper + digit + sym
  const rnd = (n: number) => Math.floor(Math.random() * n)
  const chars = [lower[rnd(lower.length)], upper[rnd(upper.length)], digit[rnd(digit.length)], sym[rnd(sym.length)]]
  while (chars.length < len) chars.push(all[rnd(all.length)])
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rnd(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

export function MembersPage() {
  const { user } = useAuth()
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ text: string; secret?: string } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ email: '', name: '', role: 'STAFF' as Member['role'], password: '' })

  const load = useCallback(async () => {
    setLoading(true)
    const { ok, data } = await api('/api/members', 'GET')
    if (ok) setMembers((data as { members: Member[] }).members)
    else setError((data as { error?: string }).error ?? '読み込みに失敗しました')
    setLoading(false)
  }, [])

  useEffect(() => {
    // 初回/ユーザー確定時にメンバーを取得（setState は fetch 後の非同期）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user?.role === 'ADMIN') void load()
    else setLoading(false)
  }, [user, load])

  if (user && user.role !== 'ADMIN') {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <a href="/" className="text-sm text-slate-500 hover:underline">← 案件一覧へ</a>
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          このページは管理者のみ利用できます。
        </div>
      </div>
    )
  }

  const create = async () => {
    setBusyId('new')
    setError(null)
    const { ok, data } = await api('/api/members', 'POST', form)
    if (ok) {
      setNotice({ text: `「${form.name || form.email}」を追加しました。初期パスワードを控えてください。`, secret: form.password })
      setForm({ email: '', name: '', role: 'STAFF', password: '' })
      setShowAdd(false)
      await load()
    } else {
      setError((data as { error?: string }).error ?? '追加に失敗しました')
    }
    setBusyId(null)
  }

  const patch = async (m: Member, body: Partial<Pick<Member, 'role' | 'status'>>) => {
    setBusyId(m.id)
    setError(null)
    const { ok, data } = await api(`/api/members/${m.id}`, 'PATCH', body)
    if (ok) await load()
    else setError((data as { error?: string }).error ?? '更新に失敗しました')
    setBusyId(null)
  }

  const resetPw = async (m: Member) => {
    setBusyId(m.id)
    setError(null)
    const password = genPassword()
    const { ok, data } = await api(`/api/members/${m.id}/reset-password`, 'POST', { password })
    if (ok) setNotice({ text: `「${m.name || m.email}」のパスワードを再発行しました。`, secret: password })
    else setError((data as { error?: string }).error ?? '再発行に失敗しました')
    setBusyId(null)
  }

  const columns: Column<Member>[] = [
    {
      key: 'name',
      header: '氏名',
      width: '140px',
      render: (m) => (
        <span className="font-medium text-slate-800">
          {m.name ?? '—'}
          {m.id === user?.id && <span className="ml-1 text-[10px] text-slate-400">(自分)</span>}
        </span>
      ),
    },
    {
      key: 'email',
      header: 'ID',
      width: '170px',
      render: (m) => <span className="font-mono text-xs text-slate-600">{m.email}</span>,
    },
    {
      key: 'role',
      header: 'ロール',
      width: '110px',
      sortable: false,
      render: (m) => (
        <select
          value={m.role}
          disabled={busyId === m.id}
          onChange={(e) => patch(m, { role: e.target.value as Member['role'] })}
          className="rounded border border-slate-300 px-1.5 py-1 text-xs"
        >
          <option value="STAFF">{ROLE_LABEL.STAFF}</option>
          <option value="ADMIN">{ROLE_LABEL.ADMIN}</option>
        </select>
      ),
    },
    {
      key: 'status',
      header: '状態',
      width: '80px',
      align: 'center',
      sortable: false,
      render: (m) => (
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] ${m.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}
        >
          {m.status === 'ACTIVE' ? '有効' : '無効'}
        </span>
      ),
    },
    {
      key: 'lastLoginAt',
      header: '最終ログイン',
      width: '140px',
      render: (m) => (m.lastLoginAt ? m.lastLoginAt.slice(0, 16).replace('T', ' ') : '—'),
    },
    {
      key: 'actions',
      header: '操作',
      width: '180px',
      sortable: false,
      render: (m) => (
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={busyId === m.id}
            onClick={() => patch(m, { status: m.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' })}
            className="rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            {m.status === 'ACTIVE' ? '無効化' : '有効化'}
          </button>
          <button
            type="button"
            disabled={busyId === m.id}
            onClick={() => resetPw(m)}
            className="rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            パスワード再発行
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="min-h-screen bg-slate-100">
      <AppHeader title="メンバー管理" />
      <div className="mx-auto max-w-5xl p-6">
      <div className="mb-4 flex items-center justify-end">
        <button
          type="button"
          onClick={() => { setShowAdd((v) => !v); setForm((f) => ({ ...f, password: f.password || genPassword() })) }}
          className="rounded bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
        >
          {showAdd ? '閉じる' : '＋ メンバーを追加'}
        </button>
      </div>

      {notice && (
        <div className="mb-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
          {notice.text}
          {notice.secret && (
            <span className="ml-2 rounded bg-white px-2 py-0.5 font-mono font-bold tracking-wide text-slate-800">{notice.secret}</span>
          )}
          <button type="button" onClick={() => setNotice(null)} className="ml-2 underline">閉じる</button>
        </div>
      )}
      {error && (
        <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      )}

      {showAdd && (
        <div className="mb-4 grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-5">
          <input placeholder="氏名" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
          <input placeholder="ID（例: yamada.taro）" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Member['role'] })} className="rounded border border-slate-300 px-2 py-1.5 text-sm">
            <option value="STAFF">スタッフ</option>
            <option value="ADMIN">管理者</option>
          </select>
          <div className="flex gap-1">
            <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-xs" />
            <button type="button" onClick={() => setForm({ ...form, password: genPassword() })} className="shrink-0 rounded border border-slate-300 px-2 text-xs text-slate-600 hover:bg-white">生成</button>
          </div>
          <button type="button" disabled={busyId === 'new'} onClick={create} className="rounded bg-green-700 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">{busyId === 'new' ? '追加中…' : '追加'}</button>
        </div>
      )}

      {loading ? (
        <PageLoading message="メンバーを読み込み中…" />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <DataTable
            data={members}
            columns={columns}
            keyField="id"
            density="compact"
            paginated
            emptyMessage="メンバーがいません"
          />
        </div>
      )}
      </div>
    </div>
  )
}
