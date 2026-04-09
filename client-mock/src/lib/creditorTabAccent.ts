/**
 * 和解対象債権タブ用の色分け（名称に応じたブランドに近いトーン + 未マッチはローテーション）。
 * Tailwind のクラスは文字列リテラルで列挙（JIT で拾われるように）。
 */
export type CreditorTabAccent = {
  inactive: string
  active: string
  badgeInactive: string
  badgeActive: string
}

const ACCENTS = {
  summary: {
    inactive:
      'border-l-slate-400 border-b-transparent text-slate-600 hover:bg-slate-50/90 hover:text-slate-800 hover:border-l-slate-500',
    active:
      'border-l-slate-700 border-b-slate-600 bg-slate-100/90 text-slate-900 shadow-sm',
    badgeInactive: 'bg-slate-200/80 text-slate-600',
    badgeActive: 'bg-slate-300/90 text-slate-800',
  },
  /** 楽天カード系 */
  rakuten: {
    inactive:
      'border-l-red-400 border-b-transparent text-slate-700 hover:bg-red-50/80 hover:text-red-900 hover:border-l-red-500',
    active: 'border-l-red-600 border-b-red-600 bg-red-50/90 text-red-950 shadow-sm',
    badgeInactive: 'bg-red-100/90 text-red-700',
    badgeActive: 'bg-red-200 text-red-900',
  },
  /** セゾン・クレディセゾン */
  saison: {
    inactive:
      'border-l-emerald-500 border-b-transparent text-slate-700 hover:bg-emerald-50/80 hover:text-emerald-950 hover:border-l-emerald-600',
    active:
      'border-l-emerald-700 border-b-emerald-600 bg-emerald-50/90 text-emerald-950 shadow-sm',
    badgeInactive: 'bg-emerald-100/90 text-emerald-800',
    badgeActive: 'bg-emerald-200 text-emerald-950',
  },
  /** 三井住友カード */
  smbc: {
    inactive:
      'border-l-teal-500 border-b-transparent text-slate-700 hover:bg-teal-50/80 hover:text-teal-950 hover:border-l-teal-600',
    active: 'border-l-teal-700 border-b-teal-600 bg-teal-50/90 text-teal-950 shadow-sm',
    badgeInactive: 'bg-teal-100/90 text-teal-800',
    badgeActive: 'bg-teal-200 text-teal-950',
  },
  /** dカード */
  dcard: {
    inactive:
      'border-l-orange-500 border-b-transparent text-slate-700 hover:bg-orange-50/80 hover:text-orange-950 hover:border-l-orange-600',
    active:
      'border-l-orange-600 border-b-orange-500 bg-orange-50/90 text-orange-950 shadow-sm',
    badgeInactive: 'bg-orange-100/90 text-orange-800',
    badgeActive: 'bg-orange-200 text-orange-950',
  },
  /** アコム */
  acom: {
    inactive:
      'border-l-sky-500 border-b-transparent text-slate-700 hover:bg-sky-50/80 hover:text-sky-950 hover:border-l-sky-600',
    active: 'border-l-sky-700 border-b-sky-600 bg-sky-50/90 text-sky-950 shadow-sm',
    badgeInactive: 'bg-sky-100/90 text-sky-800',
    badgeActive: 'bg-sky-200 text-sky-950',
  },
  /** アイフル */
  aiful: {
    inactive:
      'border-l-rose-400 border-b-transparent text-slate-700 hover:bg-rose-50/80 hover:text-rose-950 hover:border-l-rose-500',
    active: 'border-l-rose-600 border-b-rose-500 bg-rose-50/90 text-rose-950 shadow-sm',
    badgeInactive: 'bg-rose-100/90 text-rose-800',
    badgeActive: 'bg-rose-200 text-rose-950',
  },
  /** モビット */
  mobitto: {
    inactive:
      'border-l-violet-500 border-b-transparent text-slate-700 hover:bg-violet-50/80 hover:text-violet-950 hover:border-l-violet-600',
    active:
      'border-l-violet-700 border-b-violet-600 bg-violet-50/90 text-violet-950 shadow-sm',
    badgeInactive: 'bg-violet-100/90 text-violet-800',
    badgeActive: 'bg-violet-200 text-violet-950',
  },
  /** レイク */
  lake: {
    inactive:
      'border-l-cyan-500 border-b-transparent text-slate-700 hover:bg-cyan-50/80 hover:text-cyan-950 hover:border-l-cyan-600',
    active: 'border-l-cyan-700 border-b-cyan-600 bg-cyan-50/90 text-cyan-950 shadow-sm',
    badgeInactive: 'bg-cyan-100/90 text-cyan-800',
    badgeActive: 'bg-cyan-200 text-cyan-950',
  },
  poolA: {
    inactive:
      'border-l-indigo-400 border-b-transparent text-slate-700 hover:bg-indigo-50/80 hover:text-indigo-950 hover:border-l-indigo-500',
    active:
      'border-l-indigo-700 border-b-indigo-600 bg-indigo-50/90 text-indigo-950 shadow-sm',
    badgeInactive: 'bg-indigo-100/90 text-indigo-800',
    badgeActive: 'bg-indigo-200 text-indigo-950',
  },
  poolB: {
    inactive:
      'border-l-amber-500 border-b-transparent text-slate-700 hover:bg-amber-50/80 hover:text-amber-950 hover:border-l-amber-600',
    active:
      'border-l-amber-700 border-b-amber-600 bg-amber-50/90 text-amber-950 shadow-sm',
    badgeInactive: 'bg-amber-100/90 text-amber-800',
    badgeActive: 'bg-amber-200 text-amber-950',
  },
  poolC: {
    inactive:
      'border-l-fuchsia-500 border-b-transparent text-slate-700 hover:bg-fuchsia-50/80 hover:text-fuchsia-950 hover:border-l-fuchsia-600',
    active:
      'border-l-fuchsia-700 border-b-fuchsia-600 bg-fuchsia-50/90 text-fuchsia-950 shadow-sm',
    badgeInactive: 'bg-fuchsia-100/90 text-fuchsia-800',
    badgeActive: 'bg-fuchsia-200 text-fuchsia-950',
  },
} as const satisfies Record<string, CreditorTabAccent>

const POOL_KEYS = ['poolA', 'poolB', 'poolC'] as const

function poolAccentForId(id: number): CreditorTabAccent {
  const k = POOL_KEYS[((id % 3) + 3) % 3]
  return ACCENTS[k]
}

export function creditorTabAccentSummary(): CreditorTabAccent {
  return ACCENTS.summary
}

export function creditorTabAccentForName(name: string, creditorId: number): CreditorTabAccent {
  if (name.includes('楽天')) return ACCENTS.rakuten
  if (name.includes('セゾン')) return ACCENTS.saison
  if (name.includes('三井住友')) return ACCENTS.smbc
  if (name.includes('dカード')) return ACCENTS.dcard
  if (name.includes('アコム')) return ACCENTS.acom
  if (name.includes('アイフル')) return ACCENTS.aiful
  if (name.includes('モビット')) return ACCENTS.mobitto
  if (name.includes('レイク')) return ACCENTS.lake
  return poolAccentForId(creditorId)
}
