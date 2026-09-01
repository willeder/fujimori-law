/**
 * 絞り込みモーダル（kintone の「絞り込む」画面に相当）。
 *
 *   条件カード： [フィールド ▼] [演算子 ▼] [値]                    [−]
 *   選択肢フィールドは複数選択リスト（クリックでトグル。Ctrl 併用は不要）
 *   日付フィールドは「日付を指定／今日・今月などの相対／今日から N 日前後」の3モード
 *   フッター： キャンセル ／ 保存 ／ 適用
 *
 * 値の解釈はサーバの searchCases と対になっている（src/server/handlers.ts）。
 */
import { useEffect, useMemo, useState } from 'react'
import { SuggestInput } from './SuggestInput'
import {
  DATE_TOKENS,
  DATE_TOKEN_LABEL,
  MULTI_VALUE_OPERATORS,
  NO_VALUE_OPERATORS,
  OPERATORS_BY_TYPE,
  OPERATOR_LABEL,
  RELATIVE_UNITS,
  RELATIVE_UNIT_LABEL,
  TWO_VALUE_OPERATORS,
  buildRelativeToken,
  compactFilterQuery,
  isDateToken,
  parseRelativeToken,
  type FilterCondition,
  type FilterOperator,
  type FilterQuery,
} from '../types/filter'
import type { SearchFieldDef } from '../pages/searchFields'
import { fieldTypeOf } from '../pages/searchFields'

const inputCls =
  'rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500'
/**
 * 絞り込みの「項目」を選ぶ欄（修正依頼42）。
 *
 * 事務所からの指摘:
 *   「絞り込みの項目をドロップダウンではなく、入力して絞り込んでいく形にしてほしい」
 * 項目は79件あり、一覧から目で探すのは現実的ではない。
 * 打ち込むと候補が絞られ、選ぶと確定する形にする。
 * ラベルは全項目で一意（76件・重複0）なので、表示名から項目を引ける。
 */
function FieldPicker({
  fields,
  value,
  onChange,
  inputCls: cls,
}: {
  fields: SearchFieldDef[]
  value: string
  onChange: (field: string) => void
  inputCls: string
}) {
  const labelOf = useMemo(
    () => new Map(fields.map((f) => [f.field, f.label])),
    [fields]
  )
  const fieldOfLabel = useMemo(
    () => new Map(fields.map((f) => [f.label, f.field])),
    [fields]
  )
  // 外から項目が変わったとき（条件の追加・保存した絞り込みの読み込み）に
  // 表示を合わせる。effect で setState すると余計な再描画を招くので、
  // 「前回の value」を持っておいて描画中に気づく形にする。
  const [text, setText] = useState(labelOf.get(value) ?? '')
  const [seenValue, setSeenValue] = useState(value)
  if (seenValue !== value) {
    setSeenValue(value)
    setText(labelOf.get(value) ?? '')
  }

  return (
    <SuggestInput
      value={text}
      onValueChange={setText}
      onSelect={(v) => {
        const f = fieldOfLabel.get(v)
        if (f) onChange(f)
      }}
      onBlur={() => {
        // 選ばずに離れたときは、打ちかけの文字を捨てて元の項目名に戻す
        const f = fieldOfLabel.get(text)
        if (f) onChange(f)
        else setText(labelOf.get(value) ?? '')
      }}
      suggestions={fields.map((f) => f.label)}
      placeholder="項目名を入力（例: 最終支払）"
      className={`${cls} w-full`}
    />
  )
}

const btnCls =
  'rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40'
const btnPrimaryCls =
  'rounded bg-blue-600 px-5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50'

/** 日付値の入力モード */
type DateMode = 'absolute' | 'token' | 'relative'

function dateModeOf(value: string): DateMode {
  if (!value) return 'absolute'
  if (isDateToken(value)) return 'token'
  if (parseRelativeToken(value)) return 'relative'
  return 'absolute'
}

export function FilterModal({
  open,
  value,
  fields,
  creditorNames = [],
  onClose,
  onApply,
  onSave,
  saveDisabledReason,
}: {
  open: boolean
  /** 初期表示する条件 */
  value: FilterQuery
  /** 選べるフィールド */
  fields: SearchFieldDef[]
  /** 債権者名の候補（債権者名フィールドで使用） */
  creditorNames?: string[]
  onClose: () => void
  onApply: (q: FilterQuery) => void
  /** 「保存」を押したとき。未指定なら保存ボタンを出さない */
  onSave?: (q: FilterQuery) => void
  /** 保存できない理由（あればツールチップに出し、ボタンを無効化する） */
  saveDisabledReason?: string
}) {
  const [draft, setDraft] = useState<FilterQuery>(value)

  // 開くたびに現在の条件を編集用にコピーする（value の変化には追随しない）
  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const fieldMap = useMemo(
    () => Object.fromEntries(fields.map((f) => [f.field, f])),
    [fields]
  )

  if (!open) return null

  const setCond = (i: number, patch: Partial<FilterCondition>) =>
    setDraft((d) => ({
      ...d,
      conditions: d.conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
    }))

  const addCond = () => {
    const first = fields[0]
    if (!first) return
    setDraft((d) => ({
      ...d,
      conditions: [
        ...d.conditions,
        {
          field: first.field,
          operator: OPERATORS_BY_TYPE[fieldTypeOf(first.field)][0],
          values: [],
        },
      ],
    }))
  }

  const removeCond = (i: number) =>
    setDraft((d) => ({ ...d, conditions: d.conditions.filter((_, idx) => idx !== i) }))

  const clearAll = () => setDraft((d) => ({ ...d, conditions: [] }))

  const effective = compactFilterQuery(draft)

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-4xl rounded-lg bg-white shadow-xl">
        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-lg font-bold text-slate-800">絞り込む</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="flex h-7 w-7 items-center justify-center rounded-full text-lg leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ×
          </button>
        </div>

        {/* 使い方 */}
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-2 text-[0.6875rem] text-slate-500">
          フィールドと条件を選んで「適用」を押すと一覧が絞り込まれます。「保存」すると、
          この条件に名前を付けて全員で共有できます。
        </div>

        <div className="max-h-[62vh] overflow-auto px-5 py-4">
          {/* AND / OR */}
          <div className="mb-2 flex items-center gap-3">
            <span className="text-xs font-bold text-slate-700">条件</span>
            <select
              value={draft.logic}
              onChange={(e) =>
                setDraft((d) => ({ ...d, logic: e.target.value === 'or' ? 'or' : 'and' }))
              }
              className={inputCls}
            >
              <option value="and">すべての条件を満たす（AND）</option>
              <option value="or">いずれかの条件を満たす（OR）</option>
            </select>
            {draft.conditions.length > 0 && (
              <button type="button" onClick={clearAll} className="text-[0.6875rem] text-slate-400 hover:text-slate-700">
                すべての条件を消す
              </button>
            )}
          </div>

          {/* 条件カード */}
          <div className="space-y-2">
            {draft.conditions.length === 0 && (
              <p className="rounded border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">
                条件がありません。「＋ 条件を追加」から追加してください。
                <br />
                条件を1つも入れずに適用すると、絞り込みなし（全件表示）になります。
              </p>
            )}

            {draft.conditions.map((cond, i) => {
              const type = fieldTypeOf(cond.field)
              const ops = OPERATORS_BY_TYPE[type]
              return (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded border border-slate-200 bg-white px-3 py-2.5"
                >
                  {/* 項目。79項目あるので、打ち込んで絞り込める形にする（修正依頼42） */}
                  <div className="w-52 shrink-0">
                    <FieldPicker
                      fields={fields}
                      value={cond.field}
                      onChange={(nextField) => {
                        const nextType = fieldTypeOf(nextField)
                        setCond(i, {
                          field: nextField,
                          operator: OPERATORS_BY_TYPE[nextType][0],
                          values: [],
                        })
                      }}
                      inputCls={inputCls}
                    />
                  </div>

                  {/* 演算子 */}
                  <select
                    value={cond.operator}
                    onChange={(e) =>
                      setCond(i, { operator: e.target.value as FilterOperator, values: [] })
                    }
                    className={`${inputCls} w-52 shrink-0 font-medium text-blue-600`}
                  >
                    {ops.map((op) => (
                      <option key={op} value={op}>
                        {OPERATOR_LABEL[op]}
                      </option>
                    ))}
                  </select>

                  {/* 値 */}
                  <div className="min-w-0 flex-1">
                    <ValueInput
                      cond={cond}
                      def={fieldMap[cond.field]}
                      creditorNames={creditorNames}
                      onChange={(values) => setCond(i, { values })}
                    />
                  </div>

                  {/* 削除 */}
                  <button
                    type="button"
                    onClick={() => removeCond(i)}
                    aria-label="この条件を削除"
                    title="この条件を削除"
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-300 text-slate-400 hover:border-rose-300 hover:text-rose-600"
                  >
                    −
                  </button>
                </div>
              )
            })}
          </div>

          <button type="button" onClick={addCond} className={`${btnCls} mt-3`}>
            ＋ 条件を追加
          </button>
        </div>

        {/* フッター */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button type="button" onClick={onClose} className={btnCls}>
            キャンセル
          </button>
          <div className="flex items-center gap-2">
            <span className="mr-2 text-[0.6875rem] text-slate-500">
              有効な条件 {effective.conditions.length} 件
            </span>
            {onSave && (
              <button
                type="button"
                disabled={!!saveDisabledReason}
                title={saveDisabledReason}
                onClick={() => onSave(effective)}
                className={btnCls}
              >
                保存
              </button>
            )}
            <button type="button" onClick={() => onApply(effective)} className={btnPrimaryCls}>
              適用
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 値の入力欄（フィールドの種別ごとに出し分ける） ──────────────────────
function ValueInput({
  cond,
  def,
  creditorNames,
  onChange,
}: {
  cond: FilterCondition
  def: SearchFieldDef | undefined
  creditorNames: string[]
  onChange: (values: string[]) => void
}) {
  const type = def?.type ?? 'text'

  if (NO_VALUE_OPERATORS.includes(cond.operator)) {
    return <span className="text-[0.6875rem] text-slate-400">値の入力は不要です</span>
  }

  // 選択肢（複数選択）
  if (type === 'choice' && def?.options?.length) {
    const selected = new Set(cond.values)
    const multi = MULTI_VALUE_OPERATORS.includes(cond.operator)
    const toggle = (v: string) => {
      if (!multi) {
        onChange([v])
        return
      }
      const next = new Set(selected)
      if (next.has(v)) next.delete(v)
      else next.add(v)
      onChange([...next])
    }
    return (
      <div className="max-h-40 overflow-auto rounded border border-slate-300 bg-slate-50">
        {def.options.map((o) => {
          const on = selected.has(o)
          return (
            <button
              key={o}
              type="button"
              onClick={() => toggle(o)}
              className={`flex w-full items-center gap-2 px-2 py-1 text-left text-xs hover:bg-blue-50 ${
                on ? 'font-medium text-blue-700' : 'text-slate-700'
              }`}
            >
              <span className={on ? 'text-blue-600' : 'text-transparent'}>✔</span>
              <span className="truncate">{o}</span>
            </button>
          )
        })}
      </div>
    )
  }

  // 債権者名（候補から選べる）
  if (type === 'creditor') {
    return (
      <SuggestInput
        value={cond.values[0] ?? ''}
        onValueChange={(v) => onChange([v])}
        suggestions={creditorNames}
        placeholder="債権者名（部分一致）"
        className="w-full"
      />
    )
  }

  // 日付
  if (type === 'date') {
    const two = TWO_VALUE_OPERATORS.includes(cond.operator)
    return (
      <div className="flex flex-wrap items-center gap-2">
        <DateValue
          value={cond.values[0] ?? ''}
          onChange={(v) => onChange(two ? [v, cond.values[1] ?? ''] : [v])}
        />
        {two && (
          <>
            <span className="text-xs text-slate-400">〜</span>
            <DateValue
              value={cond.values[1] ?? ''}
              onChange={(v) => onChange([cond.values[0] ?? '', v])}
            />
          </>
        )}
      </div>
    )
  }

  // 数値
  if (type === 'number') {
    const two = TWO_VALUE_OPERATORS.includes(cond.operator)
    return (
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          inputMode="numeric"
          value={cond.values[0] ?? ''}
          onChange={(e) => onChange(two ? [e.target.value, cond.values[1] ?? ''] : [e.target.value])}
          placeholder="数値"
          className={`${inputCls} w-32`}
        />
        {two && (
          <>
            <span className="text-xs text-slate-400">〜</span>
            <input
              type="text"
              inputMode="numeric"
              value={cond.values[1] ?? ''}
              onChange={(e) => onChange([cond.values[0] ?? '', e.target.value])}
              placeholder="数値"
              className={`${inputCls} w-32`}
            />
          </>
        )}
      </div>
    )
  }

  // 文字列・電話番号
  return (
    <input
      type="text"
      value={cond.values[0] ?? ''}
      onChange={(e) => onChange([e.target.value])}
      placeholder={type === 'phone' ? '電話番号（ハイフン不要・下4桁可）' : '値を入力'}
      className={`${inputCls} w-full`}
    />
  )
}

// ── 日付1つ分の入力（3モード） ───────────────────────────────────
function DateValue({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const mode = dateModeOf(value)
  const rel = parseRelativeToken(value)

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select
        value={mode}
        onChange={(e) => {
          const next = e.target.value as DateMode
          if (next === 'absolute') onChange('')
          else if (next === 'token') onChange('TODAY')
          else onChange(buildRelativeToken(0, 'DAYS'))
        }}
        className={`${inputCls} w-32`}
      >
        <option value="absolute">日付を指定</option>
        <option value="token">今日・今月など</option>
        <option value="relative">今日から N</option>
      </select>

      {mode === 'absolute' && (
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputCls} w-40`}
        />
      )}

      {mode === 'token' && (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} w-28`}>
          {DATE_TOKENS.map((t) => (
            <option key={t} value={t}>
              {DATE_TOKEN_LABEL[t]}
            </option>
          ))}
        </select>
      )}

      {mode === 'relative' && rel && (
        <>
          <input
            type="number"
            value={rel.n}
            onChange={(e) => onChange(buildRelativeToken(Number(e.target.value || 0), rel.unit))}
            className={`${inputCls} w-20`}
          />
          <select
            value={rel.unit}
            onChange={(e) =>
              onChange(buildRelativeToken(rel.n, e.target.value as (typeof RELATIVE_UNITS)[number]))
            }
            className={`${inputCls} w-20`}
          >
            {RELATIVE_UNITS.map((u) => (
              <option key={u} value={u}>
                {RELATIVE_UNIT_LABEL[u]}
              </option>
            ))}
          </select>
          <span className="text-[0.6875rem] text-slate-400">後（過去はマイナス）</span>
        </>
      )}
    </div>
  )
}
