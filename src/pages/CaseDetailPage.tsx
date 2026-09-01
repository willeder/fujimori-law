import { useEffect, useMemo, useRef, useState } from "react";
import { CaseEditContext } from "../context/CaseEditContext";
import type { CaseEditContextValue } from "../context/CaseEditContext";
import { useParams, useNavigate, useLocation, useBlocker } from "react-router-dom";
import type { NavigateFunction } from "react-router-dom";
import {
  useCase,
  useContactHistoriesByCaseId,
  useCreditorsByCaseId,
  usePaymentsByCaseId,
  useCaseDispatch,
  useEnsureContactHistories,
  useEnsurePayments,
  useEnsureCreditors,
  useEnsureFullCase,
} from "../store/useCaseStore";
import { useRefreshCases } from "../store/CaseStore";
import { useFoundSet } from "../store/FoundSet";
import { useAuth } from "../context/AuthContext";
import { SectionCard, EditableField, StatusBadge, Tabs } from "../components";
import { CreditorTab } from "./CreditorTab";
import { ContactHistoryTable } from "./ContactHistoryTable";
import { PaymentTable } from "./PaymentTable";
import { CreditorPaymentTable } from "./CreditorPaymentTable";
import { SettlementFiles } from "../components/case/SettlementFiles";
import { LineUrlQuickEdit } from "../components/case/LineUrlQuickEdit";
import { LineLinkControl } from "../components/case/LineLinkControl";
import { CaseMailControl } from "../components/case/CaseMailControl";
import { CaseChangeHistory } from "../components/case/CaseChangeHistory";
import { FindModeLauncher } from "../components/case/FindModeLauncher";
import { LAST_LIST_PATH_KEY } from "../components/AppHeader";
import type { Case, Creditor } from "../types";
import {
  creditorTabAccentSummary,
  creditorTabAccentForName,
} from "../lib/creditorTabAccent";
import { joinAddress, stripPrefecture } from "../utils/address";
import { getClientId } from "../utils/clientId";
import { settlementTotals } from "../lib/settlementTotals";
import { isEmptyRow } from "../lib/paymentRows";
import { CaseReminders } from "../components/case/CaseReminders";
import { CaseReminderBanner } from "../components/case/CaseReminderBanner";
import {
  CASE_STATUS_OPTIONS,
  DEBT_ADJUSTMENT_TYPE_OPTIONS,
  GENDER_OPTIONS,
  MARITAL_STATUS_OPTIONS,
  ACCEPTANCE_RANK_OPTIONS,
  CAUTION_RANK_OPTIONS,
  toSelectOptions,
} from '../constants/fieldOptions'

/** nested な案件編集を DB 列（フラット）へ。列名はほぼ同名、settlementInfo のみ別名 */
const CASE_FIELD_RENAME: Record<string, string> = {
  "settlementInfo.status": "settlementStatus",
  "settlementInfo.proposalDate": "settlementProposalDate",
};
function flattenCaseUpdate(updates: Partial<Case>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [group, val] of Object.entries(updates)) {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      for (const [field, v] of Object.entries(val as unknown as Record<string, unknown>)) {
        out[CASE_FIELD_RENAME[`${group}.${field}`] ?? field] = v;
      }
    }
  }
  return out;
}

function formatYenPair(left: number | null, right: number | null) {
  const l = left != null ? `${left.toLocaleString()}円` : "-";
  const r = right != null ? `${right.toLocaleString()}円` : "-";
  const leftNegative = left != null && left < 0;
  const rightNegative = right != null && right < 0;
  return (
    <span className="inline-flex items-center gap-0.5 tabular-nums leading-none">
      <span className={leftNegative ? "text-red-600" : ""}>{l}</span>
      <span className="font-normal text-slate-400">/</span>
      <span className={rightNegative ? "text-red-600" : ""}>{r}</span>
    </span>
  );
}

type VAccountFieldsProps = {
  branch: string | null;
  number: string | null;
  onSave: (branch: string | null, number: string | null) => void;
  /** 編集モードでないときは読み取り専用にする */
  disabled?: boolean;
};

/** バーチャル口座：未入力は「-」表示、クリックで編集（空は null で保持） */
function VAccountFields({
  branch,
  number,
  onSave,
  disabled = false,
}: VAccountFieldsProps) {
  const [editing, setEditing] = useState(false);
  const [draftB, setDraftB] = useState(branch ?? "");
  const [draftN, setDraftN] = useState(number ?? "");
  const [cancelSnapshot, setCancelSnapshot] = useState({
    b: branch ?? "",
    n: number ?? "",
  });

  useEffect(() => {
    if (!editing) setDraftB(branch ?? "");
  }, [branch]);
  useEffect(() => {
    if (!editing) setDraftN(number ?? "");
  }, [number]);

  const commit = () => {
    const norm = (s: string) => {
      const t = s.replace(/\n/g, "").trim();
      // 表示用の '-' が紛れた場合は未入力扱いにする
      if (t === "-") return null;
      return t.length > 0 ? t : null;
    };
    onSave(norm(draftB), norm(draftN));
  };

  const rowCls =
    "flex shrink-0 flex-nowrap items-center gap-x-2 whitespace-nowrap leading-none";
  const labelCls = "inline-flex shrink-0 items-center gap-1 text-xs";

  const displayB = (branch ?? "").trim();
  const displayN = (number ?? "").trim();

  const startEdit = () => {
    if (disabled) return;
    const b = branch ?? "";
    const n = number ?? "";
    setCancelSnapshot({ b, n });
    setDraftB(b);
    setDraftN(n);
    setEditing(true);
  };

  if (!editing) {
    return (
      <div
        className={
          disabled
            ? `${rowCls} rounded px-1 py-0.5 -mx-1`
            : `${rowCls} group cursor-pointer rounded px-1 py-0.5 -mx-1 hover:bg-blue-50/70`
        }
        onClick={startEdit}
        role={disabled ? undefined : "button"}
        tabIndex={disabled ? undefined : 0}
        onKeyDown={(e) => {
          if (e.key === "Enter") startEdit();
        }}
      >
        <span className="inline-flex shrink-0 items-center text-xs font-semibold text-blue-700">
          バーチャル口座
        </span>
        <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-slate-800">
          <span className="text-slate-500">支店：</span>
          <span
            className={`font-medium tabular-nums ${displayB ? "" : "text-slate-400"}`}
          >
            {displayB || "-"}
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-slate-800">
          <span className="text-slate-500">口座番号：</span>
          <span
            className={`font-medium tabular-nums ${displayN ? "" : "text-slate-400"}`}
          >
            {displayN || "-"}
          </span>
        </span>
        {!disabled && (
          <span className="shrink-0 text-xs text-blue-400 opacity-0 transition-opacity group-hover:opacity-100">
            編集
          </span>
        )}
      </div>
    );
  }

  const editableCls =
    "min-w-[3.5rem] rounded px-1 py-0.5 font-medium tabular-nums text-slate-900 outline-none ring-1 ring-transparent focus:ring-blue-400 bg-white/60";

  return (
    <div
      className={rowCls}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        commit();
        setEditing(false);
      }}
    >
      <span className="inline-flex shrink-0 items-center text-xs font-semibold text-blue-700">
        バーチャル口座
      </span>
      <span className={labelCls}>
        <span className="shrink-0 text-slate-500">支店：</span>
        <span
          className={`${editableCls} ${draftB.trim() ? "" : "text-slate-400"}`}
          contentEditable
          suppressContentEditableWarning
          onFocus={(e) => {
            // 選択しやすいように末尾へ
            const sel = window.getSelection();
            if (!sel) return;
            const range = document.createRange();
            range.selectNodeContents(e.currentTarget);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
          }}
          onInput={(e) =>
            setDraftB((e.currentTarget.textContent ?? "").replace(/\n/g, ""))
          }
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.currentTarget as HTMLSpanElement).blur();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setDraftB(cancelSnapshot.b);
              setDraftN(cancelSnapshot.n);
              setEditing(false);
            }
          }}
        >
          {draftB}
        </span>
      </span>
      <span className={labelCls}>
        <span className="shrink-0 text-slate-500">口座番号：</span>
        <span
          className={`${editableCls} ${draftN.trim() ? "" : "text-slate-400"}`}
          contentEditable
          suppressContentEditableWarning
          onFocus={(e) => {
            const sel = window.getSelection();
            if (!sel) return;
            const range = document.createRange();
            range.selectNodeContents(e.currentTarget);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
          }}
          onInput={(e) =>
            setDraftN((e.currentTarget.textContent ?? "").replace(/\n/g, ""))
          }
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.currentTarget as HTMLSpanElement).blur();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setDraftB(cancelSnapshot.b);
              setDraftN(cancelSnapshot.n);
              setEditing(false);
            }
          }}
        >
          {draftN}
        </span>
      </span>
    </div>
  );
}

export function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  if (!id) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-200">
        <p className="text-slate-500">案件が見つかりません</p>
      </div>
    );
  }
  return <CaseDetailBody key={id} id={id} navigate={navigate} />;
}

/**
 * 「一覧に戻る」の戻り先。直近に表示していた一覧ページ（AppHeader が記録）へ戻す。
 * 未記録（直リンク等）の場合は案件一覧へ。絞り込み・ソートは各一覧側の
 * sessionStorage 保持により復元される（No.160）。
 */
function lastListPath(): string {
  try {
    return sessionStorage.getItem(LAST_LIST_PATH_KEY) || "/";
  } catch {
    return "/";
  }
}

/**
 * 一覧で見えていた並び順（案件IDの配列）。
 * DataTable が行を開く直前に sessionStorage へ控えている（修正依頼㉙）。
 * 絞り込みと並び替えを反映した順なので、そのまま前後移動に使える。
 */
function listOrder(): number[] {
  try {
    const raw = sessionStorage.getItem("caseList.order");
    const arr = raw ? (JSON.parse(raw) as unknown[]) : [];
    return Array.isArray(arr)
      ? arr.map((v) => Number(v)).filter((n) => Number.isFinite(n))
      : [];
  } catch {
    return [];
  }
}

function CaseDetailBody({
  id,
  navigate,
}: {
  id: string;
  navigate: NavigateFunction;
}) {
  const caseData = useCase(Number(id));
  const fullLoaded = useEnsureFullCase(Number(id)); // 一覧はサマリのみ。詳細はフル取得
  useEnsureContactHistories(Number(id)); // 接触履歴はこの案件分だけ遅延取得
  useEnsurePayments(Number(id)); // 入金明細もこの案件分だけ遅延取得
  useEnsureCreditors(Number(id)); // 債権者もこの案件分だけ遅延取得
  const creditors = useCreditorsByCaseId(Number(id));
  const contactHistories = useContactHistoriesByCaseId(Number(id));
  const payments = usePaymentsByCaseId(Number(id));
  // 案件全体行（creditorId == null）から「合計行」だけを除外する。
  //
  // ★以前は「入金予定日が無い行＝合計行」として除外していたが、それでは
  //   予定外に入金された行（入金予定日が無く実入金日だけある行）まで消えていた。
  //   実データで 302行・205案件・約1,301万円 が画面から欠落していたため、
  //   「予定日も実入金日も無い行」だけを合計行とみなすように直した。
  const caseLevelPayments = useMemo(
    () => payments.filter((p) => p.creditorId == null && !isEmptyRow(p)),
    [payments],
  );
  // 次回入金日：実入金日が未入力の最初の入金予定日（※ early return より前で算出すること）
  const nextPaymentDate = useMemo(() => {
    const unpaidPayments = caseLevelPayments
      .filter((p) => p.actualDate == null && p.plannedDate != null)
      .sort((a, b) => (a.plannedDate ?? "").localeCompare(b.plannedDate ?? ""));
    return unpaidPayments[0]?.plannedDate ?? null;
  }, [caseLevelPayments]);
  const dispatch = useCaseDispatch();
  // ── 編集モード ──
  // 「編集」を押している間だけ項目を触れる。変更は下書きに貯め、
  // 「編集完了」で案件・債権者をまとめて保存する（押さなければ保存しない）。
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  /** 案件の下書き（DB列名 → 値）。編集完了時にこれを1回のPATCHで送る */
  const caseDraftRef = useRef<Record<string, unknown>>({});
  /** 債権者の下書き（債権者ID → 変更列） */
  const creditorDraftRef = useRef<Map<number, Record<string, unknown>>>(new Map());
  const [dirty, setDirty] = useState(false);
  /** 編集モードの現在値（イベントハンドラ内から参照するため ref にも持つ） */
  const editingRef = useRef(false);

  // 未保存のまま別の画面へ移動しようとしたら引き留める（アプリ内の遷移）
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );
  // タブを閉じる/再読み込みするときはブラウザ標準の確認ダイアログを出す
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
  const { user } = useAuth();
  const refreshCases = useRefreshCases();
  const isAdmin = user?.role === "ADMIN";

  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [showHistory, setShowHistory] = useState(false);

  // ── 同時編集の検知（編集中ロック）＋先勝ち保存（後発は保存不可） ──
  // 識別はアカウント（メール）ではなく **タブ単位の clientId**。
  // これにより「同じアカウントを別ウィンドウで開いている」場合も相手として検知できる。
  //
  // otherEditors  : 同じレコードを開いている他セッション（自分の別ウィンドウを含む）
  // locked        : いま編集ロックを持っている他セッション。null 以外の間は操作不可
  // conflictBy    : 保存競合（409）した相手（表示用）
  // presenceError : ハートビート自体が失敗しているときの理由（無言で死なせない）
  const clientId = useMemo(() => getClientId(), []);
  const [otherEditors, setOtherEditors] = useState<
    { email: string; name: string; editing: boolean; sameAccount: boolean }[]
  >([]);
  const [locked, setLocked] = useState<{ name: string; sameAccount: boolean } | null>(
    null,
  );
  const [conflictBy, setConflictBy] = useState<string | null>(null);
  const [presenceError, setPresenceError] = useState<string | null>(null);
  // 読み込み時点の updatedAt（ISO・ミリ秒）。保存時に __baseUpdatedAt として送り先勝ち判定に使う
  const baseUpdatedAtRef = useRef<string | null>(null);
  // 自分がいまロックを主張しているか、と即時ハートビート送信用の参照
  const claimingRef = useRef(false);
  const beatFnRef = useRef<() => void>(() => {});
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    baseUpdatedAtRef.current = caseData?.metadata?.updatedAtExact ?? null;
  }, [caseData?.metadata?.updatedAtExact]);

  // 滞在中のハートビート送信と他セッションの検知（通常20秒間隔・離脱時に削除）。
  // 編集の開始/終了は即時送信する。
  useEffect(() => {
    const caseId = Number(id);
    if (!Number.isInteger(caseId) || caseId <= 0) return;
    let stopped = false;
    const beat = async () => {
      try {
        const r = await fetch("/api/presence/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity: "Case",
            entityId: caseId,
            clientId,
            name: user?.name ?? user?.email ?? "",
            editing: claimingRef.current,
          }),
        });
        if (!r.ok) {
          // 以前はここで無言 return していたため、テーブル未作成やルーティング漏れでも
          // 「何も起きない」だけで原因が分からなかった。理由を画面に出す。
          if (stopped) return;
          setPresenceError(
            r.status === 404
              ? "同時編集の監視APIが見つかりません（404）。デプロイ状況を確認してください"
              : r.status === 401
                ? "ログインの有効期限が切れています。再読み込みしてください"
                : `同時編集の監視に失敗しています（${r.status}）。マイグレーション未適用の可能性があります`,
          );
          setOtherEditors([]);
          setLocked(null);
          return;
        }
        const d = (await r.json()) as {
          others?: {
            email: string;
            name: string;
            editing?: boolean;
            sameAccount?: boolean;
          }[];
          lock?: { name: string; isMine?: boolean; sameAccount?: boolean } | null;
        };
        if (stopped) return;
        setPresenceError(null);
        setOtherEditors(
          (d.others ?? []).map((o) => ({
            email: o.email,
            name: o.name,
            editing: o.editing === true,
            sameAccount: o.sameAccount === true,
          })),
        );
        // ロック保持者はサーバが先着（editingSince の早い順）で1人に決めている。
        // 自分が保持者なら編集を続けてよい＝ブロックしない。
        const lock = d.lock ?? null;
        setLocked(
          lock && lock.isMine !== true
            ? { name: lock.name, sameAccount: lock.sameAccount === true }
            : null,
        );
      } catch {
        if (stopped) return;
        setPresenceError("同時編集の監視で通信エラーが発生しています");
      }
    };
    beatFnRef.current = () => void beat();
    void beat();
    const iv = setInterval(() => void beat(), 20000);
    const leave = () => {
      try {
        navigator.sendBeacon?.(
          "/api/presence/leave",
          new Blob(
            [JSON.stringify({ entity: "Case", entityId: caseId, clientId })],
            { type: "application/json" },
          ),
        );
      } catch {
        /* noop */
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => {
      stopped = true;
      clearInterval(iv);
      window.removeEventListener("beforeunload", leave);
      leave();
    };
  }, [id, clientId, user?.name, user?.email]);

  // 自分の編集開始/終了の検知。
  // 入力欄（input/textarea/select/contentEditable）にフォーカスしている間を編集中とするが、
  // フォーカスが外れた瞬間にロックを手放すと、数秒で終わる編集が相手のポーリングの
  // 隙間に落ちて「ポップアップが出ない」ことになる。
  // そこで **最後の編集から MIN_LOCK_HOLD_MS の間はロックを保持** し、
  // 相手の次のポーリングに必ず載るようにする。
  const MIN_LOCK_HOLD_MS = 8000;
  useEffect(() => {
    const isFormEl = (el: Element | null): boolean =>
      !!el &&
      (el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.tagName === "SELECT" ||
        (el as HTMLElement).isContentEditable);

    const claim = () => {
      if (releaseTimerRef.current) {
        clearTimeout(releaseTimerRef.current);
        releaseTimerRef.current = null;
      }
      if (!claimingRef.current) {
        claimingRef.current = true;
        beatFnRef.current();
      }
    };
    const scheduleRelease = () => {
      if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = setTimeout(() => {
        releaseTimerRef.current = null;
        if (editingRef.current) return; // 編集モード中はロックを保持し続ける
        if (isFormEl(document.activeElement)) return; // 入力に戻っていれば保持継続
        if (claimingRef.current) {
          claimingRef.current = false;
          beatFnRef.current();
        }
      }, MIN_LOCK_HOLD_MS);
    };

    const update = () => {
      if (isFormEl(document.activeElement)) claim();
      else scheduleRelease();
    };
    const onFocusIn = () => update();
    // blur 直後は activeElement が body になる瞬間があるため少し待ってから判定
    const onFocusOut = () => setTimeout(update, 50);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current);
      if (claimingRef.current) {
        claimingRef.current = false;
        beatFnRef.current();
      }
    };
  }, []);

  // 「編集」を押している間は、入力欄にフォーカスしていなくてもロックを主張する。
  // （他の人が同じ案件を同時に編集して保存が競合するのを防ぐ）
  useEffect(() => {
    editingRef.current = editing;
    if (editing) {
      if (releaseTimerRef.current) {
        clearTimeout(releaseTimerRef.current);
        releaseTimerRef.current = null;
      }
      if (!claimingRef.current) {
        claimingRef.current = true;
        beatFnRef.current();
      }
    } else if (claimingRef.current) {
      claimingRef.current = false;
      beatFnRef.current();
    }
  }, [editing]);

  // 他セッションが同じレコードを開いている間・ロック中は5秒間隔で監視
  // （相手の編集開始を素早く検知し、終了も素早く反映するため）
  useEffect(() => {
    if (locked == null && otherEditors.length === 0) return;
    const iv = setInterval(() => beatFnRef.current(), 5000);
    return () => clearInterval(iv);
  }, [locked, otherEditors.length]);

  // ロック中はフォーカスを外す（inert で入力は無効化されるが、
  // ロック開始時点で入力欄にフォーカスが残っているとキャレットが残るため）
  useEffect(() => {
    if (locked == null) return;
    const el = document.activeElement as HTMLElement | null;
    if (el && typeof el.blur === "function") el.blur();
  }, [locked]);

  // ロック解除（相手の編集終了）を検知したら、最新データを再取得して画面へ反映
  const prevLockedRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevLockedRef.current != null && locked == null) {
      const caseId = Number(id);
      fetch(`/api/cases/${caseId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((full) => {
          if (full) dispatch({ type: "MERGE_FULL_CASE", payload: full });
        })
        .catch(() => {});
      setHistoryRefreshKey((k) => k + 1);
    }
    prevLockedRef.current = locked ? locked.name : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);
  // 案件削除（ADMIN のみ）。確認モーダル→「はい」で実行→一覧へ戻る。
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const handleDeleteCase = async () => {
    if (!caseData) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/cases/${caseData.id}`, { method: "DELETE" });
      const body = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!r.ok || !body.ok) {
        alert(body.error ?? `削除に失敗しました（HTTP ${r.status}）`);
        setDeleting(false);
        return;
      }
      setConfirmDelete(false);
      await refreshCases(); // 一覧キャッシュを更新（削除案件を除去）
      navigate("/");
    } catch (e) {
      alert(`削除に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
      setDeleting(false);
    }
  };
  /** 和解対象債権と入金予定履歴で共有（同じ id・同じ並び） */
  const [creditorScopeTabId, setCreditorScopeTabId] = useState("all");
  /** 入金スケジュール / 和解状況 の上段タブ（カード高さの切り替えに使用） */
  const [paymentScheduleSectionTab, setPaymentScheduleSectionTab] = useState<
    "payments" | "settlement"
  >("payments");

  // 検索結果セット（左右ナビで案件を渡り歩く）
  const foundSet = useFoundSet();

  // 一覧での前後の案件（修正依頼㉙「一覧に戻らないと前後が見られない」）。
  // 検索結果の前後送りが出ているときは、そちらと役割が重なるので出さない。
  const listIds = useMemo(() => listOrder(), []);
  const listIdx = listIds.indexOf(Number(id));
  const prevCaseId = listIdx > 0 ? listIds[listIdx - 1] : null;
  const nextCaseId =
    listIdx >= 0 && listIdx < listIds.length - 1 ? listIds[listIdx + 1] : null;
  const showListNav = foundSet.items.length === 0 && listIdx >= 0;
  const gotoFound = (i: number) => {
    const item = foundSet.items[i];
    if (!item) return;
    foundSet.setIndex(i);
    navigate(`/cases/${item.caseId}`, {
      state: { focusCreditorId: item.creditorId },
    });
  };

  // 他画面（GMO要対応など）から focusCreditorId 付きで遷移したら、
  // 和解状況の該当債権者タブを初期選択して表示する。
  const location = useLocation();
  useEffect(() => {
    const st = location.state as { focusCreditorId?: number } | null;
    if (st?.focusCreditorId != null) {
      setCreditorScopeTabId(String(st.focusCreditorId));
      setPaymentScheduleSectionTab("settlement");
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);
  const displayCreditorScopeTabId =
    creditorScopeTabId === "all" ||
    creditors.some((c) => String(c.id) === creditorScopeTabId)
      ? creditorScopeTabId
      : "all";

  /**
   * 債権者ごとの弁済完了（完済）判定。
   * 「済」は和解成立ではなく、その債権者の弁済予定がすべて入金済みのときだけ付ける。
   * 弁済予定が無い（未スケジュール）の債権者は完済とみなさない。
   */
  /**
   * 和解状況の4項目（和解弁済総数・和解後代弁社数・予定弁済総数・予定代弁社数）。
   * kintone では手入力だったが、債権者データから機械的に出せるため画面で計算する。
   * 定義は src/lib/settlementTotals.ts を参照。
   */
  const settlementSummary = useMemo(() => settlementTotals(creditors), [creditors]);

  const creditorFullyRepaid = useMemo(() => {
    const m = new Map<number, boolean>();
    for (const c of creditors) {
      const rows = payments.filter((p) => p.creditorId === c.id);
      m.set(c.id, rows.length > 0 && rows.every((p) => p.actualDate != null));
    }
    return m;
  }, [creditors, payments]);

  const settlementTabs = useMemo(() => {
    if (!caseData) return [];
    return [
      {
        id: "all",
        label: "すべて合算",
        accent: creditorTabAccentSummary(),
        fixed: true,
        content: (
          <CreditorTab
            caseId={caseData.id}
            creditors={creditors}
            view="summary"
          />
        ),
      },
      ...creditors.map((c) => ({
        id: String(c.id),
        label: c.creditorName,
        badge: creditorFullyRepaid.get(c.id) ? "済" : undefined,
        accent: creditorTabAccentForName(c.creditorName, c.id),
        muted: c.status === "受任対象外",
        content: (
          <CreditorTab caseId={caseData.id} creditors={[c]} view="detail" />
        ),
      })),
    ];
  }, [caseData, creditors, creditorFullyRepaid]);

  const paymentTabs = useMemo(() => {
    if (!caseData) return [];
    return [
      {
        id: "all",
        label: "すべて合算",
        accent: creditorTabAccentSummary(),
        content: (
          <PaymentTable
            caseId={caseData.id}
            payments={caseLevelPayments}
            scheduleCreditorId={null}
          />
        ),
      },
      ...creditors.map((c) => ({
        id: String(c.id),
        label: c.creditorName,
        badge: creditorFullyRepaid.get(c.id) ? "済" : undefined,
        accent: creditorTabAccentForName(c.creditorName, c.id),
        muted: c.status === "受任対象外",
        content: (
          <CreditorPaymentTable
            caseId={caseData.id}
            creditor={c}
            payments={payments.filter((p) => p.creditorId === c.id)}
          />
        ),
      })),
    ];
  }, [caseData, caseLevelPayments, creditors, payments, creditorFullyRepaid]);

  /**
   * 債権者タブのドラッグ並べ替え確定。
   * グループ制約: 受任(=「受任対象外」以外)を先・「受任対象外」を後ろに固定し、各グループ内は
   * ドラッグ順を維持。store を即時並べ替えし（合算一覧・入金タブも連動）、displayOrder を永続化。
   */
  const handleReorderCreditors = (orderedIds: string[]) => {
    if (!caseData) return;
    const caseId = caseData.id;
    const ids = orderedIds
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n));
    const byId = new Map(creditors.map((c) => [c.id, c]));
    const accepted = ids.filter((id) => byId.get(id)?.status !== "受任対象外");
    const excluded = ids.filter((id) => byId.get(id)?.status === "受任対象外");
    const includedSet = new Set(ids);
    const rest = creditors
      .filter((c) => !includedSet.has(c.id))
      .map((c) => c.id);
    const finalIds = [...accepted, ...excluded, ...rest];
    const currentIds = creditors.map((c) => c.id);
    if (
      finalIds.length === currentIds.length &&
      finalIds.every((v, i) => v === currentIds[i])
    ) {
      return; // 並びに変化なし
    }
    dispatch({
      type: "REORDER_CREDITORS",
      payload: { caseId, orderedIds: finalIds },
    });
    // displayOrder が変わる債権者のみサーバへ保存
    finalIds.forEach((cid, i) => {
      const order = i + 1;
      const prev = byId.get(cid);
      if (prev && prev.displayOrder !== order) {
        void fetch(`/api/creditors/${cid}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ displayOrder: order }),
        }).catch((e) => console.error("債権者並び順の保存に失敗:", e));
      }
    });
  };

  if (!caseData) {
    return (
      <div className="min-h-screen bg-slate-200 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-500 mb-4">案件が見つかりません</p>
          <button
            onClick={() => navigate(lastListPath())}
            className="text-blue-500 hover:text-blue-600"
          >
            一覧に戻る
          </button>
        </div>
      </div>
    );
  }

  // 一覧はサマリのみのため、フル案件データの取得を待ってから詳細を表示
  if (!fullLoaded) {
    return (
      <div className="min-h-screen bg-slate-200 flex flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-slate-600" />
        <p className="text-sm text-slate-500">案件データを読み込み中…</p>
      </div>
    );
  }

  /** 案件・債権者の最新値をサーバから取り直して画面へ反映（下書き破棄時に使う） */
  const reloadCaseFromServer = async () => {
    const caseId = caseData.id;
    try {
      const [full, rows] = await Promise.all([
        fetch(`/api/cases/${caseId}`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/creditors?caseId=${caseId}`).then((r) =>
          r.ok ? (r.json() as Promise<Creditor[]>) : null,
        ),
      ]);
      if (full) dispatch({ type: "MERGE_FULL_CASE", payload: full });
      if (rows)
        dispatch({ type: "MERGE_CREDITORS", payload: { caseId, rows } });
    } catch {
      /* 取り直しに失敗しても画面は壊さない */
    }
  };

  /** 下書きを捨てる（サーバの内容に戻す） */
  const discardDrafts = () => {
    caseDraftRef.current = {};
    creditorDraftRef.current.clear();
    setDirty(false);
    void reloadCaseFromServer();
  };

  /** 債権者タブからの変更を下書きへ積む（CreditorTab に context 経由で渡す） */
  const stageCreditor = (creditor: Creditor, updates: Partial<Creditor>) => {
    dispatch({ type: "UPDATE_CREDITOR", payload: { ...creditor, ...updates } });
    if (creditor.id == null) return;
    const prev = creditorDraftRef.current.get(creditor.id) ?? {};
    creditorDraftRef.current.set(creditor.id, {
      ...prev,
      ...(updates as Record<string, unknown>),
    });
    setDirty(true);
  };

  const updateCase = (updates: Partial<Case>) => {
    dispatch({
      type: "UPDATE_CASE",
      payload: { ...caseData, ...updates },
    });
    // 変更フィールドをサーバへ永続化（サーバ側で差分判定・変更履歴/監査に記録）
    // __baseUpdatedAt: 読み込み時点の更新時刻。他ユーザーが先に保存していた場合は
    // サーバが 409 を返し、この保存は反映されない（先勝ち）。
    const cols = flattenCaseUpdate(updates);
    // 編集モード中は保存せず下書きへ積むだけ（「編集完了」でまとめて保存）
    if (editing) {
      if (Object.keys(cols).length > 0) {
        Object.assign(caseDraftRef.current, cols);
        setDirty(true);
      }
      return;
    }
    if (Object.keys(cols).length > 0) {
      fetch(`/api/cases/${caseData.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...cols,
          __baseUpdatedAt: baseUpdatedAtRef.current,
          __clientId: clientId,
        }),
      })
        .then(async (r) => {
          if (r.status === 409) {
            // 保存競合：先に保存した側が優先。最新を取り直してローカル変更を破棄
            const d = (await r.json().catch(() => ({}))) as {
              editedBy?: string;
            };
            setConflictBy(d.editedBy ?? "他のユーザー");
            fetch(`/api/cases/${caseData.id}`)
              .then((rr) => (rr.ok ? rr.json() : null))
              .then((full) => {
                if (full) dispatch({ type: "MERGE_FULL_CASE", payload: full });
              })
              .catch(() => {});
            return;
          }
          if (!r.ok) {
            console.error("案件更新の保存に失敗:", r.status);
            return;
          }
          // 保存成功：次回保存の基準時刻を更新（自分の連続保存が競合扱いにならないように）
          const d = (await r.json().catch(() => null)) as {
            case?: { metadata?: { updatedAtExact?: string | null } };
          } | null;
          const exact = d?.case?.metadata?.updatedAtExact;
          if (exact) baseUpdatedAtRef.current = exact;
          setHistoryRefreshKey((k) => k + 1);
        })
        .catch((e) => console.error("案件更新の通信エラー:", e));
    }
  };

  /** 「編集完了」：下書きをまとめて保存する */
  const commitEdit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // ① 案件（1回の PATCH）
      const cols = caseDraftRef.current;
      if (Object.keys(cols).length > 0) {
        const r = await fetch(`/api/cases/${caseData.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...cols,
            __baseUpdatedAt: baseUpdatedAtRef.current,
            __clientId: clientId,
          }),
        });
        if (r.status === 409) {
          // 先勝ち。相手の保存が先だったので、こちらの変更は破棄して最新を読み直す
          const d = (await r.json().catch(() => ({}))) as { editedBy?: string };
          setConflictBy(d.editedBy ?? "他のユーザー");
          discardDrafts();
          setEditing(false);
          return;
        }
        if (!r.ok) {
          // 通信・サーバエラー。下書きは残したままにして、やり直せるようにする
          alert(`案件の保存に失敗しました（${r.status}）。もう一度お試しください。`);
          return;
        }
        const d = (await r.json().catch(() => null)) as {
          case?: { metadata?: { updatedAtExact?: string | null } };
        } | null;
        const exact = d?.case?.metadata?.updatedAtExact;
        if (exact) baseUpdatedAtRef.current = exact;
      }

      // ② 債権者（変更のあった債権者ごとに PATCH）
      const failed: number[] = [];
      for (const [creditorId, updates] of creditorDraftRef.current) {
        try {
          const r = await fetch(`/api/creditors/${creditorId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates),
          });
          if (!r.ok) failed.push(creditorId);
        } catch {
          failed.push(creditorId);
        }
      }
      if (failed.length > 0) {
        alert(
          `債権者 ${failed.length} 件の保存に失敗しました。通信状況を確認してもう一度お試しください。`,
        );
        return;
      }

      caseDraftRef.current = {};
      creditorDraftRef.current.clear();
      setDirty(false);
      setEditing(false);
      setHistoryRefreshKey((k) => k + 1);
      // 一覧キャッシュは UPDATE_CASE で楽観更新済みなので再取得はしない
      // （/api/cases はサマリのみを返すため、ここで上書きすると詳細が欠ける）
      await reloadCaseFromServer();
    } finally {
      setSaving(false);
    }
  };

  /** 「取消」：下書きを捨てて編集モードを抜ける */
  const cancelEdit = () => {
    if (dirty && !window.confirm("編集内容は保存されません。取り消しますか？")) {
      return;
    }
    discardDrafts();
    setEditing(false);
  };

  const updateClientBasicInfo = (
    field: keyof Case["clientBasicInfo"],
    value: string,
  ) => {
    const numericFields: (keyof Case["clientBasicInfo"])[] = [
      "age",
      "rent",
      "monthlyIncome",
      "recordNumber",
    ];
    updateCase({
      clientBasicInfo: {
        ...caseData.clientBasicInfo,
        [field]: numericFields.includes(field)
          ? value === ""
            ? null
            : Number(value)
          : value || null,
      },
    });
  };

  const updatePaymentInfo = (
    field: keyof Case["paymentInfo"],
    value: string,
  ) => {
    const numericFields: (keyof Case["paymentInfo"])[] = [
      "firstPaymentAmount",
      "basePaymentAmount",
      "cumulativePaymentAmount",
    ];
    updateCase({
      paymentInfo: {
        ...caseData.paymentInfo,
        [field]: numericFields.includes(field)
          ? value === ""
            ? null
            : Number(value)
          : value || null,
      },
    });
  };

  const updateAppointmentInfo = (
    field: keyof Case["appointmentInfo"],
    value: string,
  ) => {
    let next: Case["appointmentInfo"][typeof field];
    if (field === "elapsedDays") {
      next = (
        value === "" ? null : Number(value)
      ) as Case["appointmentInfo"][typeof field];
    } else if (field === "acceptanceRank") {
      const r = value || null;
      next = (
        r && ["A", "B", "C"].includes(r) ? r : null
      ) as Case["appointmentInfo"][typeof field];
    } else if (field === "debtAdjustmentType") {
      const t = value || null;
      next = (
        t && ["任意整理", "自己破産", "個人再生"].includes(t) ? t : null
      ) as Case["appointmentInfo"][typeof field];
    } else {
      next = (value || null) as Case["appointmentInfo"][typeof field];
    }
    updateCase({
      appointmentInfo: {
        ...caseData.appointmentInfo,
        [field]: next,
      },
    });
  };

  const updateDebtInfo = (field: keyof Case["debtInfo"], value: string) => {
    const numericFields: (keyof Case["debtInfo"])[] = [
      "creditorCount",
      "declaredDebtAmount",
      "totalDebtAmount",
      "preRequestPayment",
      "postRequestPayment",
    ];
    updateCase({
      debtInfo: {
        ...caseData.debtInfo,
        [field]: numericFields.includes(field)
          ? value === ""
            ? null
            : Number(value)
          : value || null,
      },
    });
  };

  const updateSettlementInfo = (
    field: keyof Case["settlementInfo"],
    value: string,
  ) => {
    const numericFields: (keyof Case["settlementInfo"])[] = [
      "settlementCount",
      "postSettlementPaymentCount",
      "plannedPaymentCount",
      "plannedAgentCount",
    ];
    const dateFields: (keyof Case["settlementInfo"])[] = [
      "proposalDate",
      "allSettlementDocSentDate",
    ];
    updateCase({
      settlementInfo: {
        ...caseData.settlementInfo,
        [field]: numericFields.includes(field)
          ? value === ""
            ? null
            : Number(value)
          : dateFields.includes(field)
            ? value || null
            : value || null,
      },
    });
  };

  const updateReminderInfo = (
    field: keyof Case["reminderInfo"],
    value: string,
  ) => {
    updateCase({
      reminderInfo: {
        ...caseData.reminderInfo,
        [field]: value || null,
      },
    });
  };

  const updateFeeInfo = (field: keyof Case["feeInfo"], value: string) => {
    const numericFields: (keyof Case["feeInfo"])[] = [
      "normalFee",
      "officeFee",
      "installmentCount",
      "plannedPaymentFeeTotal",
      "uncollectedFee",
    ];
    updateCase({
      feeInfo: {
        ...caseData.feeInfo,
        [field]: numericFields.includes(field)
          ? Number(value) || null
          : value || null,
      },
    });
  };

  const updateMetadata = (field: keyof Case["metadata"], value: string) => {
    updateCase({
      metadata: {
        ...caseData.metadata,
        [field]: value || null,
      },
    });
  };

  // 入金サマリ用の計算値（案件全体行のみ。債権者別行は二重計上しない）
  const plannedDates = caseLevelPayments
    .map((p) => p.plannedDate)
    .filter((d): d is string => Boolean(d));
  const finalPlannedDate =
    plannedDates.length > 0
      ? plannedDates.reduce((a, b) => (a > b ? a : b))
      : null;

  const sumActualAgentFee = caseLevelPayments.reduce(
    (s, p) => s + (p.actualAgentFeeAllocation ?? 0),
    0,
  );
  const sumActualPool = caseLevelPayments.reduce(
    (s, p) => s + (p.actualPoolAllocation ?? 0),
    0,
  );
  const sumActualRepayment = caseLevelPayments.reduce(
    (s, p) => s + (p.actualRepaymentAllocation ?? 0),
    0,
  );
  const sumPlannedRepayment = caseLevelPayments.reduce(
    (s, p) => s + (p.plannedRepaymentAllocation ?? 0),
    0,
  );

  // 累計入金額：全入金スケジュール（合計行を除く）の実入金額の合計
  const paymentsWithoutSummary = payments.filter((p) => !isEmptyRow(p));
  const cumulativePaid = paymentsWithoutSummary.reduce(
    (s, p) => s + (p.actualAmount ?? 0),
    0,
  );
  // 累計入金予定額：全入金スケジュール（合計行を除く）の予定入金額の合計
  const cumulativePlanned = paymentsWithoutSummary.reduce(
    (s, p) => s + (p.plannedAmount ?? 0),
    0,
  );
  const remainingPlanned = cumulativePlanned - cumulativePaid;

  const lineUrlRaw = caseData.clientBasicInfo.lineUrl?.trim() ?? "";
  const lineHref =
    lineUrlRaw.length > 0
      ? /^https?:\/\//i.test(lineUrlRaw)
        ? lineUrlRaw
        : `https://${lineUrlRaw}`
      : null;
  // 画面全体へ編集モードを配る。EditableField はこれを見て読み取り専用になり、
  // CreditorTab は stageCreditor があれば下書きへ積む。
  const readOnly = locked != null;
  const editCtx: CaseEditContextValue = {
    editing: editing && !readOnly,
    stageCreditor,
    dirty,
    locked: readOnly,
  };

  return (
    <CaseEditContext.Provider value={editCtx}>
      {/* 未保存のまま移動しようとしたときの引き留め */}
      {blocker.state === "blocked" && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50">
          <div className="w-[24rem] max-w-[90vw] rounded-lg bg-white p-4 shadow-xl">
            <div className="text-sm font-semibold text-amber-700">
              保存されていない変更があります
            </div>
            <div className="mt-2 text-xs leading-relaxed text-slate-600">
              「編集完了」を押していないため、いま入力した内容はまだ保存されていません。
              <br />
              このまま移動すると変更は失われます。
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => blocker.reset?.()}
                className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                編集に戻る
              </button>
              <button
                type="button"
                onClick={() => {
                  discardDrafts();
                  setEditing(false);
                  blocker.proceed?.();
                }}
                className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                破棄して移動する
              </button>
            </div>
          </div>
        </div>
      )}
      {/*
        ロック中は「閲覧はできるが更新はできない」状態にする。
        以前は inert でページ全体を止めていたが、それだとスクロールも
        テキスト選択（コピー）もできず、内容を確認することすらできなかった。
        いまは編集モードに入れないようにしたうえで、行ごとの編集・追加・削除
        ボタンを CaseEditContext の locked で個別に無効化している。
      */}
      <div className="flex min-h-screen min-h-0 flex-col bg-slate-200">
      {/* 案件削除の確認ダイアログ */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
          onClick={() => !deleting && setConfirmDelete(false)}
        >
          <div
            className="w-[22rem] max-w-[90vw] rounded-lg bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-semibold text-slate-800">
              本当に削除しますか？
            </div>
            <div className="mt-2 text-xs leading-relaxed text-slate-600">
              「{caseData.clientBasicInfo.name ?? "(無名)"}」（ID:{" "}
              {caseData.metadata?.externalId ?? caseData.id}）を削除します。
              <br />
              紐づく債権者・入金スケジュール・接触履歴・LINE連携も全て削除され、
              <span className="font-semibold text-red-600">
                この操作は取り消せません。
              </span>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirmDelete(false)}
                className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                いいえ
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleDeleteCase()}
                className="rounded bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "削除中…" : "はい、削除する"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 保存競合（先勝ち）ポップアップ：後からの保存は反映されない */}
      {conflictBy != null && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
          onClick={() => setConflictBy(null)}
        >
          <div
            className="w-[24rem] max-w-[90vw] rounded-lg bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-semibold text-red-600">
              保存できませんでした（他のユーザーが先に保存）
            </div>
            <div className="mt-2 text-xs leading-relaxed text-slate-600">
              {conflictBy} さんが先にこのレコードを保存したため、
              いま入力した変更は保存されていません。
              <br />
              最新の内容を再読み込みしました。内容を確認のうえ、
              必要であればもう一度入力してください。
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setConflictBy(null)}
                className="rounded bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 編集中ロック（他セッションが編集中）。
          ポップアップは出さず、赤バナーで知らせつつ inert で編集だけ止める */}
      {locked && (
        <div className="sticky top-0 z-50 border-b-2 border-red-800 bg-red-600 px-4 py-2 text-white shadow-md">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-block h-3 w-3 shrink-0 animate-pulse rounded-full bg-white" />
            <span className="rounded bg-white/25 px-2 py-0.5 text-xs font-black tracking-wide">
              編集中
            </span>
            <span className="text-sm font-bold">
              {locked.sameAccount
                ? "同じアカウントの別のウィンドウで編集中です"
                : `${locked.name} さんが編集中です`}
            </span>
            <span className="text-xs font-semibold text-red-100">
              編集が終わると自動で解除され、最新の内容に更新されます
            </span>
          </div>
        </div>
      )}
      {/* 同時編集の監視が失敗しているときの警告（無言で機能しないのを防ぐ） */}
      {presenceError && (
        <div className="sticky top-0 z-50 flex items-center gap-2 border-b-2 border-rose-600 bg-rose-600 px-4 py-2 text-sm font-bold text-white shadow-md">
          <span className="inline-block h-3 w-3 shrink-0 animate-pulse rounded-full bg-white" />
          <span className="rounded bg-white/25 px-2 py-0.5 text-xs font-black tracking-wide">
            通信エラー
          </span>
          {presenceError}
        </div>
      )}
      {/* 同時閲覧の常時バナー（同じレコードを開いている人がいる間の注意喚起） */}
      {otherEditors.length > 0 && (
        <div className="sticky top-0 z-50 border-b-2 border-amber-600 bg-amber-400 px-4 py-2 text-slate-900 shadow-md">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-block h-3 w-3 shrink-0 animate-pulse rounded-full bg-red-600" />
            <span className="rounded bg-slate-900 px-2 py-0.5 text-xs font-black tracking-wide text-amber-300">
              同時閲覧中 {otherEditors.length}人
            </span>
            <span className="text-sm font-bold">
              {otherEditors
                .map((o) => (o.sameAccount ? `${o.name}（別のウィンドウ）` : `${o.name} さん`))
                .join("、")}
              　もこのレコードを開いています
            </span>
            <span className="text-xs font-semibold text-amber-900">
              誰かが編集を始めると、他の人は編集できなくなります
            </span>
          </div>
        </div>
      )}
      {/* Header（スクロール時に固定） */}
      <header className="sticky top-0 z-40 shrink-0 border-b border-slate-200 bg-white shadow-sm">
        {/* 1行目：一覧に戻る（左）、LINE@（右） */}
        <div className="flex w-full items-center justify-between px-4 py-1.5 border-b border-slate-100">
          <button
            onClick={() => navigate(lastListPath())}
            className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
          >
            ← 一覧に戻る
          </button>
          {showListNav && (
            <span className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs">
              <button
                type="button"
                onClick={() => prevCaseId != null && navigate(`/cases/${prevCaseId}`)}
                disabled={prevCaseId == null}
                className="rounded px-1.5 font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-30"
                title="一覧での前の依頼者"
              >
                ◀
              </button>
              <span className="tabular-nums text-slate-600">
                {listIdx + 1} / {listIds.length}
              </span>
              <button
                type="button"
                onClick={() => nextCaseId != null && navigate(`/cases/${nextCaseId}`)}
                disabled={nextCaseId == null}
                className="rounded px-1.5 font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-30"
                title="一覧での次の依頼者"
              >
                ▶
              </button>
            </span>
          )}
          {foundSet.items.length > 0 && (
            <span className="flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs">
              <button
                type="button"
                onClick={() => gotoFound(foundSet.index - 1)}
                disabled={foundSet.index <= 0}
                className="rounded px-1.5 font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-30"
                title="前の該当案件"
              >
                ◀
              </button>
              <span className="text-blue-900">
                検索結果 {foundSet.index + 1} / {foundSet.items.length}
                {foundSet.description && (
                  <span className="ml-1 text-blue-500">（{foundSet.description}）</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => gotoFound(foundSet.index + 1)}
                disabled={foundSet.index >= foundSet.items.length - 1}
                className="rounded px-1.5 font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-30"
                title="次の該当案件"
              >
                ▶
              </button>
              <button
                type="button"
                onClick={() => foundSet.clear()}
                className="rounded px-1.5 text-blue-500 hover:bg-blue-100"
                title="検索結果を解除"
              >
                ✕
              </button>
            </span>
          )}
          <span className="flex shrink-0 items-center gap-1.5">
            {/* 編集モードの切り替え。ここを押している間だけ項目・債権者タブを編集できる */}
            {editing ? (
              <>
                <span className="rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
                  編集中{dirty ? "（未保存の変更あり）" : ""}
                </span>
                <button
                  type="button"
                  onClick={() => void commitEdit()}
                  disabled={saving}
                  className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "保存中…" : "編集完了"}
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={saving}
                  className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  取消
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                disabled={locked != null}
                title={
                  locked != null
                    ? "他の人が編集中のため、いまは編集できません"
                    : undefined
                }
                className="rounded border border-blue-500 bg-white px-3 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 disabled:border-slate-300 disabled:text-slate-400 disabled:hover:bg-white"
              >
                編集
              </button>
            )}
            {/* 全体検索（検索モード）: 案件詳細でも Ctrl+F / Ctrl+Shift+F またはボタンで起動（No.150） */}
            <FindModeLauncher />
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowHistory((v) => !v)}
                className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
              >
                変更履歴
              </button>
              {showHistory && (
                <div className="absolute right-0 z-50 mt-1 w-[26rem] rounded-lg border border-slate-200 bg-white shadow-lg">
                  <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
                    変更履歴
                    <button
                      type="button"
                      onClick={() => setShowHistory(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      ×
                    </button>
                  </div>
                  <CaseChangeHistory
                    caseId={caseData.id}
                    refreshKey={historyRefreshKey}
                    onReverted={() => {
                      setHistoryRefreshKey((k) => k + 1);
                      fetch(`/api/cases/${caseData.id}`)
                        .then((r) => (r.ok ? r.json() : null))
                        .then((full) => {
                          if (full)
                            dispatch({ type: "MERGE_FULL_CASE", payload: full });
                        })
                        .catch(() => {});
                    }}
                  />
                </div>
              )}
            </div>
            <CaseMailControl
              caseId={caseData.id}
              defaultTo={caseData.clientBasicInfo.email}
            />
            <LineLinkControl
              caseId={caseData.id}
              clientName={caseData.clientBasicInfo.name}
            />
            {lineHref ? (
              <a
                href={lineHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded bg-[#06C755] px-3 py-1 text-sm font-semibold text-white shadow-sm hover:opacity-90"
              >
                LINE@
              </a>
            ) : (
              <span className="text-slate-400 text-sm">LINE@未設定</span>
            )}
            <LineUrlQuickEdit
              lineUrl={caseData.clientBasicInfo.lineUrl}
              disabled={!editing}
              onSave={(next) =>
                updateClientBasicInfo(
                  "lineUrl",
                  next != null && next.length > 0 ? next : "",
                )
              }
            />
            {isAdmin && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={locked != null}
                title={
                  locked != null
                    ? "他の人が編集中のため、いまは削除できません"
                    : "この案件を削除（管理者のみ）"
                }
                className="ml-1 rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:border-slate-300 disabled:text-slate-400 disabled:hover:bg-white"
              >
                削除
              </button>
            )}
          </span>
        </div>
        {/* 2行目：基本情報（8カラムグリッド） */}
        <div className="grid grid-cols-8 gap-0.5 px-2 py-0.5 [&>div]:min-w-0">
          <EditableField
            label="ステータス"
            value={caseData.settlementInfo.status}
            onChange={(v) => updateSettlementInfo("status", v)}
            type="select"
            options={toSelectOptions(CASE_STATUS_OPTIONS)}
            compact
            compactLayout="inline"
            bordered
            truncateValue
            fillWidth
            renderValue={(v) => <StatusBadge status={v as string} size="md" />}
          />
          <EditableField
            label="ID"
            value={caseData.metadata.externalId}
            onChange={(v) => updateMetadata("externalId", v)}
            compact
            compactLayout="inline"
            bordered
            truncateValue
            fillWidth
          />
          <EditableField
            label="名前"
            value={caseData.clientBasicInfo.name}
            onChange={(v) => updateClientBasicInfo("name", v)}
            compact
            compactLayout="inline"
            bordered
            truncateValue
            fillWidth
          />
          <EditableField
            label="フリガナ"
            value={caseData.clientBasicInfo.furigana}
            onChange={(v) => updateClientBasicInfo("furigana", v)}
            compact
            compactLayout="inline"
            bordered
            truncateValue
            fillWidth
          />
          <EditableField
            label="電話番号"
            value={caseData.clientBasicInfo.phone}
            onChange={(v) => updateClientBasicInfo("phone", v)}
            compact
            compactLayout="inline"
            bordered
            truncateValue
            fillWidth
          />
          <EditableField
            label="要注意"
            value={caseData.clientBasicInfo.cautionRank}
            onChange={(v) => updateClientBasicInfo("cautionRank", v)}
            type="select"
            options={toSelectOptions(CAUTION_RANK_OPTIONS)}
            compact
            compactLayout="inline"
            bordered
            truncateValue
            fillWidth
          />
          <EditableField
            label="メール"
            value={caseData.clientBasicInfo.email}
            onChange={(v) => updateClientBasicInfo("email", v)}
            compact
            compactLayout="inline"
            bordered
            truncateValue
            fillWidth
          />
          <EditableField
            label="リマインド日"
            value={caseData.reminderInfo?.reminderDate ?? null}
            onChange={(v) => updateReminderInfo("reminderDate", v)}
            type="date"
            compact
            compactLayout="inline"
            bordered
            truncateValue
            fillWidth
          />
        </div>
        {/* 3行目：リスト・受任情報（8カラムグリッド） */}
        <div className="grid grid-cols-8 gap-0.5 px-2 py-0.5 [&>div]:min-w-0">
          <EditableField
            label="リスト区分"
            value={caseData.metadata.listCategory}
            onChange={(v) => updateMetadata("listCategory", v)}
            compact
            compactLayout="inline"
            bordered
            truncateValue
            fillWidth
          />
          <EditableField
            label="登録日"
            value={caseData.metadata.listRegisteredDate}
            onChange={(v) => updateMetadata("listRegisteredDate", v)}
            type="date"
            compact
            compactLayout="inline"
            bordered
            truncateValue
            fillWidth
          />
          <EditableField
            label="受任日"
            value={caseData.appointmentInfo.acceptanceDate}
            onChange={(v) => updateAppointmentInfo("acceptanceDate", v)}
            type="date"
            compact
            compactLayout="inline"
            bordered
            truncateValue
            fillWidth
          />
          <EditableField
            label="アポ担当"
            value={caseData.appointmentInfo.appointmentStaff}
            onChange={(v) => updateAppointmentInfo("appointmentStaff", v)}
            compact
            compactLayout="inline"
            bordered
            truncateValue
            fillWidth
          />
          <EditableField
            label="面談担当"
            value={caseData.appointmentInfo.interviewStaff}
            onChange={(v) => updateAppointmentInfo("interviewStaff", v)}
            compact
            compactLayout="inline"
            bordered
            truncateValue
            fillWidth
          />
          <EditableField
            label="受任ランク"
            value={caseData.appointmentInfo.acceptanceRank}
            onChange={(v) => updateAppointmentInfo("acceptanceRank", v)}
            type="select"
            options={toSelectOptions(ACCEPTANCE_RANK_OPTIONS)}
            compact
            compactLayout="inline"
            bordered
            truncateValue
            fillWidth
          />
          <EditableField
            label="入金日"
            value={caseData.paymentInfo.monthlyPaymentDay}
            onChange={(v) => updatePaymentInfo("monthlyPaymentDay", v)}
            compact
            compactLayout="inline"
            bordered
            truncateValue
            fillWidth
          />
          <EditableField
            label="基本入金額"
            value={caseData.paymentInfo.basePaymentAmount}
            onChange={(v) => updatePaymentInfo("basePaymentAmount", v)}
            type="number"
            suffix="円"
            compact
            compactLayout="inline"
            bordered
            truncateValue
            fillWidth
          />
        </div>
        {/* 4行目：入金・報酬状況（8カラムグリッド） */}
        <div className="grid grid-cols-8 gap-0.5 px-2 py-0.5 [&>div]:min-w-0">
          <div className="flex min-w-0 items-center gap-1 py-0 min-h-[1.5rem] col-span-2">
            <span className="shrink-0 text-slate-500 leading-tight whitespace-nowrap text-[11px]">・累計入金額</span>
            <span className="flex-1 min-w-0 text-xs font-bold tabular-nums text-blue-600 rounded border border-slate-200 bg-slate-50/50 px-1.5 py-0.5 truncate">
              {formatYenPair(cumulativePaid, cumulativePlanned)}
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-1 py-0 min-h-[1.5rem]">
            <span className="shrink-0 text-slate-500 leading-tight whitespace-nowrap text-[11px]">・残入金予定</span>
            <span className={`flex-1 min-w-0 text-xs font-bold tabular-nums rounded border border-slate-200 bg-slate-50/50 px-1.5 py-0.5 truncate ${remainingPlanned != null && remainingPlanned < 0 ? "text-red-600" : "text-blue-600"}`}>
              {remainingPlanned != null
                ? `${remainingPlanned.toLocaleString()}円`
                : "-"}
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-1 py-0 min-h-[1.5rem]">
            <span className="shrink-0 text-slate-500 leading-tight whitespace-nowrap text-[11px]">・次回入金日</span>
            <span className="flex-1 min-w-0 text-xs font-bold tabular-nums text-blue-600 rounded border border-slate-200 bg-slate-50/50 px-1.5 py-0.5 truncate">
              {nextPaymentDate ?? "-"}
            </span>
          </div>
          <EditableField
            label="通常報酬額"
            value={caseData.feeInfo.normalFee}
            onChange={(v) => updateFeeInfo("normalFee", v)}
            type="number"
            suffix="円"
            compact
            compactLayout="inline"
            bordered
            truncateValue
            fillWidth
          />
          <div className="flex min-w-0 items-center gap-1 py-0 min-h-[1.5rem]">
            <span className="shrink-0 text-slate-500 leading-tight whitespace-nowrap text-[11px]">・報酬充当額</span>
            <span className={`flex-1 min-w-0 text-xs font-bold tabular-nums rounded border border-slate-200 bg-slate-50/50 px-1.5 py-0.5 truncate ${caseData.paymentInfo.cumulativeFeeAllocation != null && caseData.paymentInfo.cumulativeFeeAllocation < 0 ? "text-red-600" : "text-blue-600"}`}>
              {caseData.paymentInfo.cumulativeFeeAllocation != null
                ? `${caseData.paymentInfo.cumulativeFeeAllocation.toLocaleString()}円`
                : "-"}
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-1 py-0 min-h-[1.5rem]">
            <span className="shrink-0 text-slate-500 leading-tight whitespace-nowrap text-[11px]">・報酬未回収</span>
            <span className={`flex-1 min-w-0 text-xs font-bold tabular-nums rounded border border-slate-200 bg-slate-50/50 px-1.5 py-0.5 truncate ${caseData.feeInfo.uncollectedFee != null && caseData.feeInfo.uncollectedFee < 0 ? "text-red-600" : "text-blue-600"}`}>
              {caseData.feeInfo.uncollectedFee != null
                ? `${caseData.feeInfo.uncollectedFee.toLocaleString()}円`
                : "-"}
            </span>
          </div>
          <EditableField
            label="分割数"
            value={caseData.feeInfo.installmentCount}
            onChange={(v) => updateFeeInfo("installmentCount", v)}
            type="number"
            suffix="回"
            compact
            compactLayout="inline"
            bordered
            truncateValue
            fillWidth
          />
        </div>
      </header>

      {/*
        未対応のリマインド。案件を開いた時点で必ず目に入るよう、ヘッダーの直下に出す。
        下の「リマインド」セクションと同じ状態を共有しているので、
        どちらでチェックを入れても両方から消える。未対応が無ければ何も出ない。
      */}
      <CaseReminderBanner caseId={caseData.id} locked={locked != null} />

      {/* Content（ヘッダー以外のみスクロール） */}
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex min-w-0 w-full flex-col">
          <div className="min-w-0 space-y-1.5 px-2 pb-2 pt-1.5">
            {/* 基本情報。事務所のご要望により一番上に置く（修正依頼・竹谷様） */}
            <SectionCard
              title="基本情報"
              color="slate"
              collapsible
              defaultOpen={false}
            >
              <Tabs
                defaultTab="client"
                density="dense"
                tabBodyScroll="none"
                panelTopSpacing="tight"
                tabs={[
                  {
                    id: "client",
                    label: "依頼者基本情報",
                    accent: creditorTabAccentSummary(),
                    content: (
                      <div className="grid grid-cols-10 gap-x-0.5 gap-y-0.5">
                        {/* Row 1: 性別+年齢(2), 生年月日(2), 結婚(2), 旧姓(2), 子供(2) = 10 */}
                        <div className="min-w-0 col-span-2 flex gap-0.5">
                          <div className="min-w-0 flex-1">
                            <EditableField
                              label="性別"
                              value={caseData.clientBasicInfo.gender}
                              onChange={(v) => updateClientBasicInfo("gender", v)}
                              type="select"
                              options={toSelectOptions(GENDER_OPTIONS)}
                              compact
                              compactLayout="inline"
                              bordered
                              truncateValue
                              fillWidth
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <EditableField
                              label="年齢"
                              value={caseData.clientBasicInfo.age}
                              onChange={(v) => updateClientBasicInfo("age", v)}
                              type="number"
                              suffix="歳"
                              compact
                              compactLayout="inline"
                              bordered
                              truncateValue
                              fillWidth
                            />
                          </div>
                        </div>
                        <div className="min-w-0 col-span-2">
                          <EditableField
                            label="生年月日"
                            value={caseData.clientBasicInfo.birthDate}
                            onChange={(v) =>
                              updateClientBasicInfo("birthDate", v)
                            }
                            type="date"
                            compact
                            compactLayout="inline"
                            dateDisplayToggle
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        <div className="min-w-0 col-span-2">
                          <EditableField
                            label="結婚"
                            value={caseData.clientBasicInfo.maritalStatus}
                            onChange={(v) =>
                              updateClientBasicInfo("maritalStatus", v)
                            }
                            type="select"
                            options={toSelectOptions(MARITAL_STATUS_OPTIONS)}
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        <div className="min-w-0 col-span-2">
                          <EditableField
                            label="旧姓"
                            value={caseData.clientBasicInfo.maidenName ?? ""}
                            onChange={(v) =>
                              updateClientBasicInfo("maidenName", v)
                            }
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        <div className="min-w-0 col-span-2">
                          <EditableField
                            label="子供"
                            value={caseData.clientBasicInfo.children}
                            onChange={(v) =>
                              updateClientBasicInfo("children", v)
                            }
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        {/* Row 2: 居住形態(2), 郵便番号(2), 住所(都道府県から全て)(4), 同居(2) = 10 */}
                        <div className="min-w-0 col-span-2">
                          <EditableField
                            label="居住形態"
                            value={caseData.clientBasicInfo.residenceType}
                            onChange={(v) =>
                              updateClientBasicInfo("residenceType", v)
                            }
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        <div className="min-w-0 col-span-2">
                          <EditableField
                            label="郵便番号"
                            value={caseData.clientBasicInfo.postalCode ?? ""}
                            onChange={(v) =>
                              updateClientBasicInfo("postalCode", v)
                            }
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        <div className="min-w-0 col-span-4">
                          <EditableField
                            label="住所"
                            value={joinAddress(
                              caseData.clientBasicInfo.prefecture,
                              caseData.clientBasicInfo.address,
                            )}
                            onChange={(v) =>
                              updateClientBasicInfo(
                                "address",
                                stripPrefecture(
                                  caseData.clientBasicInfo.prefecture,
                                  v,
                                ),
                              )
                            }
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        <div className="min-w-0 col-span-2">
                          <EditableField
                            label="同居"
                            value={caseData.clientBasicInfo.cohabitation ?? ""}
                            onChange={(v) =>
                              updateClientBasicInfo("cohabitation", v)
                            }
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        {/* Row 3: 旧住所(4), 内密先(2), 緊急連絡先(2), 関係(緊急)(2) = 10 */}
                        <div className="min-w-0 col-span-4">
                          <EditableField
                            label="旧住所"
                            value={
                              caseData.clientBasicInfo.previousAddress ?? ""
                            }
                            onChange={(v) =>
                              updateClientBasicInfo("previousAddress", v)
                            }
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        <div className="min-w-0 col-span-2">
                          <EditableField
                            label="内密先"
                            value={
                              caseData.clientBasicInfo.confidentialContact ?? ""
                            }
                            onChange={(v) =>
                              updateClientBasicInfo("confidentialContact", v)
                            }
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        <div className="min-w-0 col-span-2">
                          <EditableField
                            label="緊急連絡先"
                            value={
                              caseData.clientBasicInfo.emergencyContact ?? ""
                            }
                            onChange={(v) =>
                              updateClientBasicInfo("emergencyContact", v)
                            }
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        <div className="min-w-0 col-span-2">
                          <EditableField
                            label="関係(緊急)"
                            value={
                              caseData.clientBasicInfo
                                .emergencyContactRelation ?? ""
                            }
                            onChange={(v) =>
                              updateClientBasicInfo(
                                "emergencyContactRelation",
                                v,
                              )
                            }
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        {/* Row 4: 月収(2), 給与日(2), 給与口座(2), 勤務形態(2), 勤務先名(2) = 10 */}
                        <div className="min-w-0 col-span-2">
                          <EditableField
                            label="月収"
                            value={caseData.clientBasicInfo.monthlyIncome}
                            onChange={(v) =>
                              updateClientBasicInfo("monthlyIncome", v)
                            }
                            type="number"
                            suffix="円"
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        <div className="min-w-0 col-span-2">
                          <EditableField
                            label="給与日"
                            value={caseData.clientBasicInfo.payDay}
                            onChange={(v) => updateClientBasicInfo("payDay", v)}
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        <div className="min-w-0 col-span-2">
                          <EditableField
                            label="給与口座"
                            value={
                              caseData.clientBasicInfo.payrollAccount ?? ""
                            }
                            onChange={(v) =>
                              updateClientBasicInfo("payrollAccount", v)
                            }
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        <div className="min-w-0 col-span-2">
                          <EditableField
                            label="勤務形態"
                            value={caseData.clientBasicInfo.employmentType}
                            onChange={(v) =>
                              updateClientBasicInfo("employmentType", v)
                            }
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        <div className="min-w-0 col-span-2">
                          <EditableField
                            label="勤務先名"
                            value={caseData.clientBasicInfo.employerName ?? ""}
                            onChange={(v) =>
                              updateClientBasicInfo("employerName", v)
                            }
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        {/* Row 5: 勤)連絡先(4), 勤)住所(4), 空(2) = 10 */}
                        <div className="min-w-0 col-span-4">
                          <EditableField
                            label="勤)連絡先"
                            value={
                              caseData.clientBasicInfo.employerContact ?? ""
                            }
                            onChange={(v) =>
                              updateClientBasicInfo("employerContact", v)
                            }
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        <div className="min-w-0 col-span-4">
                          <EditableField
                            label="勤)住所"
                            value={
                              caseData.clientBasicInfo.employerAddress ?? ""
                            }
                            onChange={(v) =>
                              updateClientBasicInfo("employerAddress", v)
                            }
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        <div className="col-span-2" />
                        {/* Row 5.5: 旧)勤務先名(2), 旧)勤務連絡先(4), 旧)勤務先住所(4) = 10 */}
                        <div className="min-w-0 col-span-2">
                          <EditableField
                            label="旧)勤務先名"
                            value={
                              caseData.clientBasicInfo.previousEmployerName ??
                              ""
                            }
                            onChange={(v) =>
                              updateClientBasicInfo("previousEmployerName", v)
                            }
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        <div className="min-w-0 col-span-4">
                          <EditableField
                            label="旧)勤務連絡先"
                            value={
                              caseData.clientBasicInfo
                                .previousEmployerContact ?? ""
                            }
                            onChange={(v) =>
                              updateClientBasicInfo(
                                "previousEmployerContact",
                                v,
                              )
                            }
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        <div className="min-w-0 col-span-4">
                          <EditableField
                            label="旧)勤務先住所"
                            value={
                              caseData.clientBasicInfo
                                .previousEmployerAddress ?? ""
                            }
                            onChange={(v) =>
                              updateClientBasicInfo(
                                "previousEmployerAddress",
                                v,
                              )
                            }
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        {/* Row 6: 年金(1), 遅れ(1), 自転車(1), 他事務所(2), 都道府県(1), 空(4) = 10 */}
                        <div className="min-w-0 col-span-1">
                          <EditableField
                            label="年金"
                            value={caseData.clientBasicInfo.pension ?? ""}
                            onChange={(v) =>
                              updateClientBasicInfo("pension", v)
                            }
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        <div className="min-w-0 col-span-1">
                          <EditableField
                            label="遅れ"
                            value={caseData.clientBasicInfo.paymentDelay ?? ""}
                            onChange={(v) =>
                              updateClientBasicInfo("paymentDelay", v)
                            }
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        <div className="min-w-0 col-span-1">
                          <EditableField
                            label="自転車"
                            value={caseData.clientBasicInfo.bicycleNote ?? ""}
                            onChange={(v) =>
                              updateClientBasicInfo("bicycleNote", v)
                            }
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        <div className="min-w-0 col-span-2">
                          <EditableField
                            label="他事務所"
                            value={
                              caseData.clientBasicInfo
                                .otherOfficeConsultation ?? ""
                            }
                            onChange={(v) =>
                              updateClientBasicInfo(
                                "otherOfficeConsultation",
                                v,
                              )
                            }
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        <div className="min-w-0 col-span-1">
                          <EditableField
                            label="都道府県"
                            value={caseData.clientBasicInfo.prefecture ?? ""}
                            onChange={(v) =>
                              updateClientBasicInfo("prefecture", v)
                            }
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        <div className="col-span-4" />
                      </div>
                    ),
                  },
                  {
                    id: "appointment",
                    label: "受任情報",
                    accent: creditorTabAccentSummary(),
                    content: (
                      <div className="grid grid-cols-10 gap-x-0.5 gap-y-0.5">
                        {/* Row 1: アポ担当(2), 後確担当(2), 受任日(2), 経過日数(2), 債務整理区分(2) = 10 */}
                        <div className="min-w-0 col-span-2">
                          <EditableField
                            label="アポ担当"
                            value={caseData.appointmentInfo.appointmentStaff}
                            onChange={(v) =>
                              updateAppointmentInfo("appointmentStaff", v)
                            }
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        <div className="min-w-0 col-span-2">
                          <EditableField
                            label="後確担当"
                            value={caseData.appointmentInfo.followUpStaff}
                            onChange={(v) =>
                              updateAppointmentInfo("followUpStaff", v)
                            }
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        <div className="min-w-0 col-span-2">
                          <EditableField
                            label="受任日"
                            value={caseData.appointmentInfo.acceptanceDate}
                            onChange={(v) =>
                              updateAppointmentInfo("acceptanceDate", v)
                            }
                            type="date"
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        <div className="min-w-0 col-span-2">
                          <EditableField
                            label="経過日数"
                            value={caseData.appointmentInfo.elapsedDays ?? ""}
                            onChange={(v) =>
                              updateAppointmentInfo("elapsedDays", v)
                            }
                            type="number"
                            suffix="日"
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        <div className="min-w-0 col-span-2">
                          <EditableField
                            label="債務整理区分"
                            value={
                              caseData.appointmentInfo.debtAdjustmentType ?? ""
                            }
                            onChange={(v) =>
                              updateAppointmentInfo("debtAdjustmentType", v)
                            }
                            type="select"
                            options={toSelectOptions(DEBT_ADJUSTMENT_TYPE_OPTIONS)}
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        {/* Row 2: C受任昇格日(2), 債権社数(2), 申告債務額(2), 予定弁済総数(2), 予定弁済報酬総額(2) = 10 */}
                        <div className="min-w-0 col-span-2">
                          <EditableField
                            label="C受任昇格日"
                            value={
                              caseData.appointmentInfo.cAcceptancePromotionDate
                            }
                            onChange={(v) =>
                              updateAppointmentInfo(
                                "cAcceptancePromotionDate",
                                v,
                              )
                            }
                            type="date"
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        <div className="min-w-0 col-span-2">
                          <EditableField
                            label="債権社数"
                            value={caseData.debtInfo.creditorCount}
                            onChange={(v) => updateDebtInfo("creditorCount", v)}
                            type="number"
                            suffix="社"
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        <div className="min-w-0 col-span-2">
                          <EditableField
                            label="申告債務額"
                            value={caseData.debtInfo.declaredDebtAmount}
                            onChange={(v) =>
                              updateDebtInfo("declaredDebtAmount", v)
                            }
                            type="number"
                            suffix="円"
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        <div className="min-w-0 col-span-2">
                          {/* 債権者から自動計算（手入力しない）。定義は settlementTotals.ts */}
                          <EditableField
                            label="予定弁済総数"
                            value={settlementSummary.plannedPaymentCount}
                            onChange={() => {}}
                            type="number"
                            suffix="回"
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                            disabled
                          />
                        </div>
                        <div className="min-w-0 col-span-2">
                          <EditableField
                            label="予定弁済報酬総額"
                            value={caseData.feeInfo.plannedPaymentFeeTotal}
                            onChange={(v) =>
                              updateFeeInfo("plannedPaymentFeeTotal", v)
                            }
                            type="number"
                            suffix="円"
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        {/* Row 3: 依頼前返済額(2), 依頼後返済額(2), 初回入金予定日(2), 10日以内(2), 初回入金額(2) = 10 */}
                        <div className="min-w-0 col-span-2">
                          <EditableField
                            label="依頼前返済額"
                            value={caseData.debtInfo.preRequestPayment}
                            onChange={(v) =>
                              updateDebtInfo("preRequestPayment", v)
                            }
                            type="number"
                            suffix="円"
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        <div className="min-w-0 col-span-2">
                          <EditableField
                            label="依頼後返済額"
                            value={caseData.debtInfo.postRequestPayment}
                            onChange={(v) =>
                              updateDebtInfo("postRequestPayment", v)
                            }
                            type="number"
                            suffix="円"
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        <div className="min-w-0 col-span-2">
                          <EditableField
                            label="初回入金予定日"
                            value={caseData.paymentInfo.firstPaymentDate}
                            onChange={(v) =>
                              updatePaymentInfo("firstPaymentDate", v)
                            }
                            type="date"
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        <div className="min-w-0 col-span-2">
                          <EditableField
                            label="10日以内"
                            value={
                              caseData.paymentInfo.firstPaymentWithinTenDays
                            }
                            onChange={(v) =>
                              updatePaymentInfo("firstPaymentWithinTenDays", v)
                            }
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        <div className="min-w-0 col-span-2">
                          <EditableField
                            label="初回入金額"
                            value={caseData.paymentInfo.firstPaymentAmount}
                            onChange={(v) =>
                              updatePaymentInfo("firstPaymentAmount", v)
                            }
                            type="number"
                            suffix="円"
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                            fillWidth
                          />
                        </div>
                        {/* Row 4-6: テキストエリア（フルスパン） */}
                        <div className="col-span-full min-w-0">
                          <EditableField
                            label="面談時備考１"
                            value={caseData.appointmentInfo.interviewMemo1}
                            onChange={(v) =>
                              updateAppointmentInfo("interviewMemo1", v)
                            }
                            type="textarea"
                          />
                        </div>
                        <div className="col-span-full min-w-0">
                          <EditableField
                            label="面談時備考２"
                            value={caseData.appointmentInfo.interviewMemo2}
                            onChange={(v) =>
                              updateAppointmentInfo("interviewMemo2", v)
                            }
                            type="textarea"
                          />
                        </div>
                        <div className="col-span-full min-w-0">
                          <EditableField
                            label="収支メモ"
                            value={caseData.appointmentInfo.incomeExpenseMemo}
                            onChange={(v) =>
                              updateAppointmentInfo("incomeExpenseMemo", v)
                            }
                            type="textarea"
                          />
                        </div>
                      </div>
                    ),
                  },
                  {
                    id: "files",
                    label: "受任資料",
                    accent: creditorTabAccentSummary(),
                    content: <SettlementFiles caseId={caseData.id} />,
                  },
                ]}
              />
            </SectionCard>
            {/* 入金スケジュール・和解状況 */}
            <div className="min-w-0">
              <SectionCard title="入金スケジュール・和解状況" color="green">
                <Tabs
                  variant="split"
                  tabBodyScroll="host"
                  tabBodyMaxHeightClassName={
                    paymentScheduleSectionTab === "settlement" &&
                    displayCreditorScopeTabId !== "all"
                      ? "h-fit max-h-[min(55vh,26rem)]"
                      : "h-[min(55vh,26rem)]"
                  }
                  hostBodyNaturalHeight={
                    paymentScheduleSectionTab === "settlement" &&
                    displayCreditorScopeTabId !== "all"
                  }
                  activeTabId={paymentScheduleSectionTab}
                  onActiveTabChange={(id) =>
                    setPaymentScheduleSectionTab(
                      id === "settlement" ? "settlement" : "payments",
                    )
                  }
                  tabs={[
                    {
                      id: "payments",
                      label: "入金スケジュール",
                      content: (
                        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5">
                          {/* 債権者タブ切替でも常に見えるサマリ */}
                          <div className="min-w-0 overflow-x-auto">
                            <div className="flex w-max min-w-0 flex-nowrap items-center whitespace-nowrap text-xs leading-none text-slate-800">
                              <div className="flex min-h-[1.75rem] items-center gap-x-6 rounded-md border border-slate-100/80 bg-slate-50/60 px-2 py-0.5">
                                {/* 催促通知除外 */}
                                <span className="inline-flex shrink-0 items-center gap-1">
                                  <span className="text-xs text-slate-500">催促通知除外：</span>
                                  <select
                                    value={caseData.paymentInfo.notificationExcluded ?? ''}
                                    onChange={(e) =>
                                      updateCase({
                                        paymentInfo: {
                                          ...caseData.paymentInfo,
                                          notificationExcluded: e.target.value === '除外' ? '除外' : null,
                                        },
                                      })
                                    }
                                    className={`rounded border border-slate-200 px-1.5 py-0.5 text-xs ${
                                      caseData.paymentInfo.notificationExcluded === '除外'
                                        ? 'font-bold text-red-600'
                                        : 'text-slate-700'
                                    }`}
                                  >
                                    <option value="">-</option>
                                    <option value="除外" className="font-bold text-red-600">除外</option>
                                  </select>
                                </span>
                                <span
                                  className="mx-0.5 h-3 w-px shrink-0 self-center bg-slate-300"
                                  aria-hidden
                                />
                                <VAccountFields
                                  branch={caseData.paymentInfo.vAccountBranch}
                                  number={caseData.paymentInfo.vAccountNumber}
                                  disabled={!editing}
                                  onSave={(b, n) =>
                                    updateCase({
                                      paymentInfo: {
                                        ...caseData.paymentInfo,
                                        vAccountBranch: b,
                                        vAccountNumber: n,
                                      },
                                    })
                                  }
                                />
                                <span
                                  className="mx-0.5 h-3 w-px shrink-0 self-center bg-slate-300"
                                  aria-hidden
                                />
                                <span className="inline-flex shrink-0 items-center gap-0.5">
                                  <span className="text-slate-400">
                                    最終入金予定日：
                                  </span>
                                  <span className="font-bold tabular-nums text-blue-600">
                                    {finalPlannedDate &&
                                    finalPlannedDate.length > 0
                                      ? finalPlannedDate
                                      : "-"}
                                  </span>
                                </span>
                                <span className="inline-flex shrink-0 items-center gap-0.5">
                                  <span className="text-slate-400">
                                    累計）弁代報酬充当額：
                                  </span>
                                  <span className={`font-bold tabular-nums ${sumActualAgentFee < 0 ? "text-red-600" : "text-blue-600"}`}>
                                    {sumActualAgentFee.toLocaleString()}円
                                  </span>
                                </span>
                                <span className="inline-flex shrink-0 items-center gap-0.5">
                                  <span className="text-slate-400">
                                    累計）プール充当：
                                  </span>
                                  <span className={`font-bold tabular-nums ${sumActualPool < 0 ? "text-red-600" : "text-blue-600"}`}>
                                    {sumActualPool.toLocaleString()}円
                                  </span>
                                </span>
                                <span className="inline-flex shrink-0 items-center gap-0.5 font-bold text-blue-600">
                                  <span className="font-normal text-slate-400">
                                    累計）弁済充当（実／予定）：
                                  </span>
                                  {formatYenPair(
                                    sumActualRepayment,
                                    sumPlannedRepayment,
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>

                          <Tabs
                            tabs={paymentTabs}
                            defaultTab="all"
                            activeTabId={displayCreditorScopeTabId}
                            onActiveTabChange={setCreditorScopeTabId}
                            density="dense"
                            tabBodyScroll="guest"
                          />
                        </div>
                      ),
                    },
                    {
                      id: "settlement",
                      label: "和解状況",
                      content: (
                        <Tabs
                          tabs={settlementTabs}
                          defaultTab="all"
                          activeTabId={displayCreditorScopeTabId}
                          onActiveTabChange={setCreditorScopeTabId}
                          density="dense"
                          tabBodyScroll="guest"
                          guestExpandToParent={(id) => id === "all"}
                          reorderable={locked == null}
                          onReorder={handleReorderCreditors}
                        />
                      ),
                    },
                  ]}
                  defaultTab="payments"
                />
              </SectionCard>
            </div>
            {/* 接触履歴（下部・コンパクト表示） */}
            <div className="min-w-0">
              <SectionCard title="接触履歴" color="slate">
                <Tabs
                  variant="split"
                  defaultTab="creditor"
                  tabs={[
                    {
                      id: "creditor",
                      label: "債権者接触",
                      content: (
                        <ContactHistoryTable
                          caseId={caseData.id}
                          targetType="債権者"
                          histories={contactHistories.filter(
                            (h) => h.targetType === "債権者",
                          )}
                        />
                      ),
                    },
                    {
                      id: "client",
                      label: "依頼者接触",
                      content: (
                        <ContactHistoryTable
                          caseId={caseData.id}
                          targetType="依頼者"
                          histories={contactHistories.filter(
                            (h) => h.targetType === "依頼者",
                          )}
                        />
                      ),
                    },
                  ]}
                />
              </SectionCard>
            </div>
            {/* kintone で「★リマインド」という債権者の行にしていたもの */}
            <SectionCard title="リマインド" color="slate" collapsible defaultOpen={false}>
              <CaseReminders caseId={caseData.id} locked={locked != null} />
            </SectionCard>
          </div>
        </div>
      </main>
      </div>
    </CaseEditContext.Provider>
  );
}
