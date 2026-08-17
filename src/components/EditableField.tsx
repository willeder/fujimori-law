import { useState, useEffect, useRef } from "react";
import { SuggestInput } from "./SuggestInput";
import { useCaseEdit } from "../context/CaseEditContext";

interface EditableFieldProps {
  label: string;
  value: string | number | null | undefined;
  onChange: (value: string) => void;
  type?: "text" | "number" | "date" | "select" | "textarea";
  options?: { value: string; label: string }[];
  suffix?: string;
  placeholder?: string;
  disabled?: boolean;
  /** ラベルと値を1行に詰め、余白・字サイズを下げる（詳細ヘッダー等） */
  compact?: boolean;
  /** compact の字サイズ（`header` は案件詳細ヘッダー2行目向け：項目名を1行目より小さく、値は2行目相当） */
  compactSize?: "md" | "lg" | "header";
  /** compact 時のレイアウト（横並び/上下2段） */
  compactLayout?: "inline" | "stacked";
  /** type="date" のとき、西暦/和暦の表示切替ボタンを出す（入力は西暦のまま） */
  dateDisplayToggle?: boolean;
  /** 枠線を表示する */
  bordered?: boolean;
  /** 値が長い場合に省略する（クリックで編集時に全文表示） */
  truncateValue?: boolean;
  /** 保存前に確認ダイアログを表示するメッセージ（指定時のみ） */
  confirmMessage?: string;
  /** 値の表示をカスタマイズするレンダー関数 */
  renderValue?: (value: string | number | null | undefined) => React.ReactNode;
  /** 値エリアを親要素の幅いっぱいに広げる */
  fillWidth?: boolean;
  /**
   * type="text" のとき、入力候補（datalist）を表示する。
   * 既存の値からのドロップダウン選択＋自由入力の両方が可能（例: 債権者名の表記ゆれ防止）。
   */
  suggestions?: string[];
}

function parseIsoDateToUtcDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d))
    return null;
  return new Date(Date.UTC(y, mo - 1, d));
}

function formatJapaneseEraDate(iso: string): string | null {
  const dt = parseIsoDateToUtcDate(iso);
  if (!dt) return null;
  try {
    return new Intl.DateTimeFormat("ja-JP-u-ca-japanese", {
      era: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "UTC",
    }).format(dt);
  } catch {
    return null;
  }
}

/**
 * いま編集中の入力欄から見て、文書順で前後にある「編集可能な項目」を探す。
 * 表示状態の項目には data-ef-trigger を付けてあるので、それを辿る。
 */
function findAdjacentField(
  from: HTMLElement | null,
  dir: 1 | -1,
): HTMLElement | null {
  if (!from) return null;
  const all = Array.from(
    document.querySelectorAll<HTMLElement>('[data-ef-trigger="1"]'),
  );
  if (dir === 1) {
    for (const el of all) {
      if (
        from.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING
      )
        return el;
    }
    return null;
  }
  let prev: HTMLElement | null = null;
  for (const el of all) {
    if (from.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING)
      prev = el;
    else break;
  }
  return prev;
}

export function EditableField({
  label,
  value,
  onChange,
  type = "text",
  options,
  suffix,
  placeholder,
  disabled: disabledProp = false,
  compact = false,
  compactSize = "md",
  compactLayout = "inline",
  dateDisplayToggle = false,
  bordered = false,
  truncateValue = false,
  confirmMessage,
  renderValue,
  fillWidth = false,
  suggestions,
}: EditableFieldProps) {
  // 案件詳細の「編集モード」。編集ボタンを押していない間は読み取り専用にする。
  // （プロバイダの外側では editing=true なので、他画面の挙動は変わらない）
  const { editing: editModeOn } = useCaseEdit();
  const disabled = disabledProp || !editModeOn;
  const labelWithColon =
    label.endsWith("：") || label.endsWith(":") ? label : `${label}：`;

  // 入力候補。type="text" かつ候補があるとき、編集中の入力を SuggestInput
  // （クリックで全件表示・入力で絞り込み・クリック/Enterで選択確定）に切り替える
  const hasSuggestions =
    type === "text" && !!suggestions && suggestions.length > 0;

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(value ?? ""));
  const inputRef = useRef<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >(null);
  const [dateDisplayMode, setDateDisplayMode] = useState<
    "gregorian" | "japanese"
  >("gregorian");

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  // 値を確定して編集終了（候補選択時は選択値を直接渡す）
  const commit = (v: string) => {
    if (confirmMessage) {
      if (!window.confirm(confirmMessage)) {
        return;
      }
    }
    onChange(v);
    setIsEditing(false);
  };
  const handleSave = () => commit(editValue);

  const handleCancel = () => {
    setEditValue(String(value ?? ""));
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && type !== "textarea") {
      handleSave();
      return;
    }
    if (e.key === "Escape") {
      handleCancel();
      return;
    }
    // Tab: 値を確定して「次の項目」を開く。
    // 編集中の入力欄は確定と同時に DOM から消えるため、そのままだとフォーカスが
    // 迷子になり無関係な場所へ飛ぶ。消える前に次の項目を特定しておく。
    if (e.key === "Tab" && type !== "textarea") {
      const next = findAdjacentField(inputRef.current, e.shiftKey ? -1 : 1);
      handleSave();
      if (next) {
        e.preventDefault();
        requestAnimationFrame(() => {
          next.focus();
          next.click(); // そのまま入力を続けられるように編集状態で開く
        });
      }
    }
  };

  const displayValue = value ?? "-";
  const formattedDisplay =
    type === "number" && typeof value === "number"
      ? value.toLocaleString()
      : displayValue;

  // マイナス値は赤字で表示
  const isNegativeNumber =
    type === "number" && typeof value === "number" && value < 0;
  const negativeTextClass = isNegativeNumber ? "text-red-600" : "";

  const displayText = renderValue
    ? renderValue(value)
    : type === "date" &&
        dateDisplayToggle &&
        dateDisplayMode === "japanese" &&
        typeof value === "string" &&
        value.length > 0
      ? (formatJapaneseEraDate(value) ?? formattedDisplay)
      : formattedDisplay;

  const isLg = compactSize === "lg";
  const isHdr = compactSize === "header";
  /** 項目名：header=12px, lg=12px, md=11px */
  const compactLabelClass = isHdr
    ? "text-xs"
    : isLg
      ? "text-xs"
      : "text-[11px]";
  /** 入力値：header=16px, lg=14px, md=12px */
  const compactValueClass = isHdr ? "text-base" : isLg ? "text-sm" : "text-xs";
  const compactMinHRow = isLg ? "min-h-[2rem]" : "min-h-[1.5rem]";
  const compactEditHintClass = isLg
    ? "text-xs"
    : isHdr
      ? "text-[9px]"
      : "text-[10px]";
  const compactSuffixClass = isLg
    ? "text-xs"
    : isHdr
      ? "text-[10px]"
      : "text-[11px]";
  const compactToggleClass = isLg
    ? "text-xs"
    : isHdr
      ? "text-[10px]"
      : "text-[11px]";
  const stackedEditingLabelClass = isLg
    ? "text-xs"
    : isHdr
      ? "text-[10px]"
      : "text-[9px]";

  const compactInputBase = isLg
    ? "flex-1 min-w-0 text-sm border border-blue-300 rounded px-1.5 py-0.5 h-8 leading-tight focus:outline-none focus:ring-1 focus:ring-blue-500"
    : "flex-1 min-w-0 text-xs border border-blue-300 rounded px-1 py-0.5 h-7 leading-tight focus:outline-none focus:ring-1 focus:ring-blue-500";

  const inputBase = compact
    ? compactInputBase
    : "flex-1 text-xs border border-blue-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500";

  const isStacked = compact && compactLayout === "stacked";

  /**
   * 表示状態の項目を Tab で辿れるようにするための共通プロパティ。
   *
   * これまでは表示状態が単なる <div onClick> だったため、Tab キーが項目を
   * すべて読み飛ばし、次に見つかった別のボタン（「ファイル追加」など）へ
   * 飛んでいた。tabIndex を与えてキーボードでも開けるようにする。
   */
  const openForEdit = () => {
    setEditValue(String(value ?? ""));
    setIsEditing(true);
  };
  const triggerProps = {
    "data-ef-trigger": "1",
    role: "button" as const,
    tabIndex: 0,
    onClick: openForEdit,
    onKeyDown: (e: React.KeyboardEvent) => {
      // Enter / Space で編集開始。Tab はブラウザ既定のまま次の項目へ進む
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openForEdit();
      }
    },
  };
  const showDateToggle = type === "date" && dateDisplayToggle && !isEditing;
  const toggleLabel = dateDisplayMode === "gregorian" ? "和暦" : "西暦";
  const toggleButton = showDateToggle ? (
    <button
      type="button"
      // 表示切替はタブ順に入れない。入れると項目の間に余計な停止位置ができ、
      // Tab で次の入力欄へ進めなくなる。
      tabIndex={-1}
      className={`shrink-0 rounded bg-slate-100 px-1 py-0.5 font-medium text-slate-600 hover:bg-slate-200 ${compactToggleClass}`}
      onClick={(e) => {
        e.stopPropagation();
        setDateDisplayMode((m) =>
          m === "gregorian" ? "japanese" : "gregorian",
        );
      }}
    >
      {toggleLabel}
    </button>
  ) : null;

  if (disabled) {
    if (compact) {
      if (isStacked) {
        return (
          <div className="min-w-0">
            <div
              className={`${compactLabelClass} font-medium text-slate-500 leading-tight whitespace-nowrap`}
            >
              {labelWithColon}
            </div>
            <div
              className={`min-w-0 ${compactValueClass} text-slate-700 whitespace-normal break-words leading-tight`}
            >
              <span className={negativeTextClass}>{displayText}</span>
              {suffix && <span className="text-slate-400 ml-0">{suffix}</span>}
              {toggleButton && (
                <span className="ml-1 inline-flex align-middle">
                  {toggleButton}
                </span>
              )}
            </div>
          </div>
        );
      }
      return (
        <div
          className={`flex min-w-0 items-baseline gap-1 py-0 ${compactMinHRow}`}
        >
          <span
            className={`shrink-0 font-medium text-slate-500 leading-tight whitespace-nowrap ${compactLabelClass}`}
          >
            {labelWithColon}
          </span>
          <div
            className={`min-w-0 flex-1 text-slate-700 leading-tight ${compactValueClass}`}
          >
            <span className={`block min-w-0 overflow-x-auto whitespace-nowrap [-webkit-overflow-scrolling:touch] ${negativeTextClass}`}>
              {displayText}
              {suffix && <span className="text-slate-400 ml-0">{suffix}</span>}
            </span>
          </div>
          {toggleButton}
        </div>
      );
    }
    return (
      <div className="flex min-w-0 items-baseline gap-1">
        <span className="shrink-0 text-[11px] font-medium text-slate-500">
          {labelWithColon}
        </span>
        <div className={`min-w-0 flex-1 text-xs text-slate-700 ${negativeTextClass}`}>
          {displayText}
          {suffix && <span className="text-slate-400 ml-0.5">{suffix}</span>}
        </div>
        {toggleButton}
      </div>
    );
  }

  if (!isEditing) {
    if (compact) {
      if (isStacked) {
        return (
          <div className="min-w-0">
            <div
              className={`${compactLabelClass} font-medium text-slate-500 leading-tight whitespace-nowrap`}
            >
              {labelWithColon}
            </div>
            <div
              {...triggerProps}
              className={`group min-w-0 cursor-pointer rounded px-0.5 py-0.5 -mx-0.5 leading-tight text-slate-700 hover:bg-blue-50/80 focus:outline-none focus:ring-2 focus:ring-blue-400 ${compactValueClass}`}
            >
              <div className="flex min-w-0 items-center gap-1">
                <span className={`min-w-0 flex-1 whitespace-normal break-words ${negativeTextClass}`}>
                  {displayText}
                  {suffix && (
                    <span className="text-slate-400 ml-0">{suffix}</span>
                  )}
                </span>
                {toggleButton}
                <span
                  className={`shrink-0 text-blue-400 opacity-0 transition-opacity group-hover:opacity-100 ${compactEditHintClass}`}
                >
                  編集
                </span>
              </div>
            </div>
          </div>
        );
      }
      const valueBorderedClass = bordered
        ? "border border-slate-200 rounded bg-slate-50/50 px-1.5 py-0.5"
        : "px-0.5 py-0.5 -mx-0.5";
      const valueSpanClass = truncateValue
        ? "min-w-0 flex-1 truncate"
        : "min-w-0 flex-1 overflow-x-auto whitespace-nowrap [-webkit-overflow-scrolling:touch]";
      const labelPrefix = bordered ? "・" : "";
      const valueContainerClass = fillWidth
        ? `group flex min-w-0 flex-1 cursor-pointer items-center gap-0.5 rounded leading-tight text-slate-700 hover:bg-blue-50/80 ${compactValueClass} ${valueBorderedClass}`
        : `group flex min-w-0 cursor-pointer items-center gap-0.5 rounded leading-tight text-slate-700 hover:bg-blue-50/80 ${compactValueClass} ${valueBorderedClass}`;
      return (
        <div
          className={`flex min-w-0 items-center gap-1 py-0 ${compactMinHRow}`}
        >
          <span
            className={`shrink-0 text-slate-500 leading-tight whitespace-nowrap ${compactLabelClass}`}
          >
            {labelPrefix}
            {label}
          </span>
          <div
            {...triggerProps}
            className={`${valueContainerClass} focus:outline-none focus:ring-2 focus:ring-blue-400`}
          >
            <span className={`${valueSpanClass} ${negativeTextClass}`}>
              {displayText}
              {suffix && <span className="text-slate-400 ml-0">{suffix}</span>}
            </span>
            {toggleButton}
            <span
              className={`shrink-0 text-blue-400 opacity-0 transition-opacity group-hover:opacity-100 ${compactEditHintClass}`}
            >
              編集
            </span>
          </div>
        </div>
      );
    }
    return (
      <div className="flex min-w-0 flex-col gap-0.5">
        <div
          {...triggerProps}
          className="flex min-w-0 cursor-pointer items-baseline gap-1 rounded py-0.5 transition-colors group hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <span className="shrink-0 text-[11px] font-medium text-slate-500">
            {labelWithColon}
          </span>
          <span className={`min-w-0 flex-1 whitespace-normal break-words text-xs text-slate-700 ${negativeTextClass}`}>
            {displayText}
            {suffix && <span className="text-slate-400 ml-0.5">{suffix}</span>}
          </span>
          {toggleButton}
          <span className="shrink-0 text-blue-400 opacity-0 transition-opacity group-hover:opacity-100 text-[11px]">
            編集
          </span>
        </div>
      </div>
    );
  }

  if (compact) {
    if (isStacked) {
      return (
        <div className="min-w-0">
          <div
            className={`${stackedEditingLabelClass} font-medium text-slate-500 leading-tight whitespace-nowrap`}
          >
            {labelWithColon}
          </div>
          <div className="flex min-w-0 items-center gap-0.5">
            {type === "select" && options ? (
              <select
                ref={inputRef as React.RefObject<HTMLSelectElement>}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                className={inputBase}
              >
                <option value="">選択してください</option>
                {options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : type === "textarea" ? (
              <textarea
                ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                rows={2}
                className={`${inputBase} min-h-[2.5rem]`}
              />
            ) : hasSuggestions ? (
              <SuggestInput
                value={editValue}
                onValueChange={setEditValue}
                onSelect={(v) => commit(v)}
                suggestions={suggestions!}
                placeholder={placeholder}
                autoFocus
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                className={inputBase}
              />
            ) : (
              <input
                ref={inputRef as React.RefObject<HTMLInputElement>}
                type={type}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className={inputBase}
              />
            )}
            {suffix && (
              <span
                className={`text-slate-400 shrink-0 pl-0 ${compactSuffixClass}`}
              >
                {suffix}
              </span>
            )}
            {type === "textarea" && (
              <div className="flex shrink-0 gap-0.5">
                <button
                  type="button"
                  onClick={handleSave}
                  className="px-1.5 py-0.5 text-[10px] bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  保存
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-1.5 py-0.5 text-[10px] bg-slate-200 text-slate-600 rounded hover:bg-slate-300"
                >
                  取消
                </button>
              </div>
            )}
          </div>
        </div>
      );
    }
    const editLabelPrefix = bordered ? "・" : "";
    const editInputContainerClass = fillWidth
      ? "flex min-w-0 flex-1 items-center gap-0.5"
      : "flex min-w-0 items-center gap-0.5";
    return (
      <div className={`flex min-w-0 items-center gap-1 py-0 ${compactMinHRow}`}>
        <span
          className={`shrink-0 text-slate-500 leading-tight whitespace-nowrap ${compactLabelClass}`}
        >
          {editLabelPrefix}
          {label}
        </span>
        <div className={editInputContainerClass}>
          {type === "select" && options ? (
            <select
              ref={inputRef as React.RefObject<HTMLSelectElement>}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              className={inputBase}
            >
              <option value="">選択してください</option>
              {options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : type === "textarea" ? (
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              rows={2}
              className={`${inputBase} min-h-[2.5rem]`}
            />
          ) : (
            hasSuggestions ? (
              <SuggestInput
                value={editValue}
                onValueChange={setEditValue}
                onSelect={(v) => commit(v)}
                suggestions={suggestions!}
                placeholder={placeholder}
                autoFocus
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                className={inputBase}
              />
            ) : (
              <input
                ref={inputRef as React.RefObject<HTMLInputElement>}
                type={type}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className={inputBase}
              />
            )
          )}
          {suffix && (
            <span
              className={`text-slate-400 shrink-0 pl-0 ${compactSuffixClass}`}
            >
              {suffix}
            </span>
          )}
          {type === "textarea" && (
            <div className="flex shrink-0 gap-0.5">
              <button
                type="button"
                onClick={handleSave}
                className="px-1.5 py-0.5 text-[10px] bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                保存
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="px-1.5 py-0.5 text-[10px] bg-slate-200 text-slate-600 rounded hover:bg-slate-300"
              >
                取消
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <div className="flex min-w-0 items-start gap-1">
        <span className="shrink-0 pt-0.5 text-[11px] font-medium text-slate-500">
          {labelWithColon}
        </span>
        <div
          className={`flex min-w-0 flex-1 flex-wrap gap-1 ${type === "textarea" ? "items-start" : "items-center"}`}
        >
          {type === "select" && options ? (
            <select
              ref={inputRef as React.RefObject<HTMLSelectElement>}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              className="flex-1 text-xs border border-blue-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">選択してください</option>
              {options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : type === "textarea" ? (
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              rows={2}
              className="min-h-[2.75rem] max-h-48 min-w-0 grow resize-y text-xs border border-blue-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          ) : hasSuggestions ? (
            <SuggestInput
              value={editValue}
              onValueChange={setEditValue}
              onSelect={(v) => commit(v)}
              suggestions={suggestions!}
              placeholder={placeholder}
              autoFocus
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              className="flex-1 text-xs border border-blue-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          ) : (
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type={type}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="flex-1 text-xs border border-blue-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
          {suffix && <span className="text-slate-400 text-xs">{suffix}</span>}
          {type === "textarea" && (
            <div className="flex gap-1">
              <button
                onClick={handleSave}
                className="px-1.5 py-0.5 text-[10px] bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                保存
              </button>
              <button
                onClick={handleCancel}
                className="px-1.5 py-0.5 text-[10px] bg-slate-200 text-slate-600 rounded hover:bg-slate-300"
              >
                取消
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
