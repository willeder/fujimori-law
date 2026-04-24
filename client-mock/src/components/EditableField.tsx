import { useState, useEffect, useRef } from "react";

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

export function EditableField({
  label,
  value,
  onChange,
  type = "text",
  options,
  suffix,
  placeholder,
  disabled = false,
  compact = false,
  compactSize = "md",
  compactLayout = "inline",
  dateDisplayToggle = false,
  bordered = false,
  truncateValue = false,
  confirmMessage,
  renderValue,
  fillWidth = false,
}: EditableFieldProps) {
  const labelWithColon =
    label.endsWith("：") || label.endsWith(":") ? label : `${label}：`;

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

  const handleSave = () => {
    if (confirmMessage) {
      if (!window.confirm(confirmMessage)) {
        return;
      }
    }
    onChange(editValue);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(String(value ?? ""));
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && type !== "textarea") {
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  const displayValue = value ?? "-";
  const formattedDisplay =
    type === "number" && typeof value === "number"
      ? value.toLocaleString()
      : displayValue;

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
  const showDateToggle = type === "date" && dateDisplayToggle && !isEditing;
  const toggleLabel = dateDisplayMode === "gregorian" ? "和暦" : "西暦";
  const toggleButton = showDateToggle ? (
    <button
      type="button"
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
              <span>{displayText}</span>
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
            <span className="block min-w-0 overflow-x-auto whitespace-nowrap [-webkit-overflow-scrolling:touch]">
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
        <div className="min-w-0 flex-1 text-xs text-slate-700">
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
              className={`group min-w-0 cursor-pointer rounded px-0.5 py-0.5 -mx-0.5 leading-tight text-slate-700 hover:bg-blue-50/80 ${compactValueClass}`}
              onClick={() => {
                setEditValue(String(value ?? ""));
                setIsEditing(true);
              }}
            >
              <div className="flex min-w-0 items-center gap-1">
                <span className="min-w-0 flex-1 whitespace-normal break-words">
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
            className={valueContainerClass}
            onClick={() => {
              setEditValue(String(value ?? ""));
              setIsEditing(true);
            }}
          >
            <span className={valueSpanClass}>
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
          className="flex min-w-0 cursor-pointer items-baseline gap-1 rounded py-0.5 transition-colors group hover:bg-blue-50"
          onClick={() => {
            setEditValue(String(value ?? ""));
            setIsEditing(true);
          }}
        >
          <span className="shrink-0 text-[11px] font-medium text-slate-500">
            {labelWithColon}
          </span>
          <span className="min-w-0 flex-1 whitespace-normal break-words text-xs text-slate-700">
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

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <div className="flex min-w-0 items-start gap-1">
        <span className="shrink-0 pt-0.5 text-[11px] font-medium text-slate-500">
          {labelWithColon}
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
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
