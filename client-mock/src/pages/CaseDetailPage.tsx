import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { NavigateFunction } from "react-router-dom";
import {
  useCase,
  useContactHistoriesByCaseId,
  useCreditorsByCaseId,
  usePaymentsByCaseId,
  useCaseDispatch,
} from "../store/useCaseStore";
import { SectionCard, EditableField, StatusBadge, Tabs } from "../components";
import { CreditorTab } from "./CreditorTab";
import { ContactHistoryTable } from "./ContactHistoryTable";
import { PaymentTable } from "./PaymentTable";
import { SettlementFiles } from "../components/case/SettlementFiles";
import { LineUrlQuickEdit } from "../components/case/LineUrlQuickEdit";
import type { Case } from "../types";
import {
  creditorTabAccentSummary,
  creditorTabAccentForName,
} from "../lib/creditorTabAccent";

function formatYenPair(left: number | null, right: number | null) {
  const l = left != null ? `${left.toLocaleString()}円` : "-";
  const r = right != null ? `${right.toLocaleString()}円` : "-";
  return (
    <span className="inline-flex items-center gap-0.5 tabular-nums leading-none">
      <span>{l}</span>
      <span className="font-normal text-slate-400">/</span>
      <span>{r}</span>
    </span>
  );
}

type VAccountFieldsProps = {
  branch: string | null;
  number: string | null;
  onSave: (branch: string | null, number: string | null) => void;
};

/** バーチャル口座：未入力は「-」表示、クリックで編集（空は null で保持） */
function VAccountFields({ branch, number, onSave }: VAccountFieldsProps) {
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

  if (!editing) {
    return (
      <div
        className={`${rowCls} group cursor-pointer rounded px-1 py-0.5 -mx-1 hover:bg-blue-50/70`}
        onClick={() => {
          const b = branch ?? "";
          const n = number ?? "";
          setCancelSnapshot({ b, n });
          setDraftB(b);
          setDraftN(n);
          setEditing(true);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const b = branch ?? "";
            const n = number ?? "";
            setCancelSnapshot({ b, n });
            setDraftB(b);
            setDraftN(n);
            setEditing(true);
          }
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
        <span className="shrink-0 text-xs text-blue-400 opacity-0 transition-opacity group-hover:opacity-100">
          編集
        </span>
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

function CaseDetailBody({
  id,
  navigate,
}: {
  id: string;
  navigate: NavigateFunction;
}) {
  const caseData = useCase(Number(id));
  const creditors = useCreditorsByCaseId(Number(id));
  const contactHistories = useContactHistoriesByCaseId(Number(id));
  const payments = usePaymentsByCaseId(Number(id));
  const caseLevelPayments = useMemo(
    () => payments.filter((p) => p.creditorId == null),
    [payments],
  );
  const dispatch = useCaseDispatch();

  /** 和解対象債権と入金予定履歴で共有（同じ id・同じ並び） */
  const [creditorScopeTabId, setCreditorScopeTabId] = useState("all");
  const displayCreditorScopeTabId =
    creditorScopeTabId === "all" ||
    creditors.some((c) => String(c.id) === creditorScopeTabId)
      ? creditorScopeTabId
      : "all";

  const settlementTabs = useMemo(() => {
    if (!caseData) return [];
    return [
      {
        id: "all",
        label: "すべて合算",
        accent: creditorTabAccentSummary(),
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
        badge: c.status === "和解済" ? "済" : undefined,
        accent: creditorTabAccentForName(c.creditorName, c.id),
        content: (
          <CreditorTab caseId={caseData.id} creditors={[c]} view="detail" />
        ),
      })),
    ];
  }, [caseData, creditors]);

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
        badge: c.status === "和解済" ? "済" : undefined,
        accent: creditorTabAccentForName(c.creditorName, c.id),
        content: (
          <PaymentTable
            caseId={caseData.id}
            payments={payments.filter((p) => p.creditorId === c.id)}
            scheduleCreditorId={c.id}
          />
        ),
      })),
    ];
  }, [caseData, caseLevelPayments, creditors, payments]);

  if (!caseData) {
    return (
      <div className="min-h-screen bg-slate-200 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-500 mb-4">案件が見つかりません</p>
          <button
            onClick={() => navigate("/")}
            className="text-blue-500 hover:text-blue-600"
          >
            一覧に戻る
          </button>
        </div>
      </div>
    );
  }

  const updateCase = (updates: Partial<Case>) => {
    dispatch({
      type: "UPDATE_CASE",
      payload: { ...caseData, ...updates },
    });
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

  const cumulativePaid = caseData.paymentInfo.cumulativePaymentAmount ?? 0;
  const cumulativePlanned = caseData.paymentInfo.cumulativePlannedPayment ?? 0;
  const remainingPlanned =
    caseData.paymentInfo.cumulativePlannedPayment != null &&
    caseData.paymentInfo.cumulativePaymentAmount != null
      ? cumulativePlanned - cumulativePaid
      : null;

  const lineUrlRaw = caseData.clientBasicInfo.lineUrl?.trim() ?? "";
  const lineHref =
    lineUrlRaw.length > 0
      ? /^https?:\/\//i.test(lineUrlRaw)
        ? lineUrlRaw
        : `https://${lineUrlRaw}`
      : null;
  return (
    <div className="flex min-h-screen min-h-0 flex-col bg-slate-200">
      {/* Header（スクロール時に固定） */}
      <header className="sticky top-0 z-40 shrink-0 border-b border-slate-200 bg-white shadow-sm">
        {/* 1行目：一覧に戻る（左）、LINE@（右） */}
        <div className="flex w-full items-center justify-between px-4 py-1.5 border-b border-slate-100">
          <button
            onClick={() => navigate("/")}
            className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
          >
            ← 一覧に戻る
          </button>
          <span className="flex shrink-0 items-center gap-1">
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
              onSave={(next) =>
                updateClientBasicInfo(
                  "lineUrl",
                  next != null && next.length > 0 ? next : "",
                )
              }
            />
          </span>
        </div>
        {/* 2行目：基本情報（8カラムグリッド） */}
        <div className="grid grid-cols-8 gap-1 px-2 py-1">
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-xs text-slate-500 shrink-0">ステータス</span>
            <span
              className="flex-1 min-w-0 text-[14px] rounded border border-slate-200 bg-slate-50/50 px-1.5 py-0.5 cursor-pointer hover:border-blue-300"
              onClick={() => {
                const newStatus = prompt("ステータスを入力", caseData.settlementInfo.status || "");
                if (newStatus !== null) updateSettlementInfo("status", newStatus);
              }}
            >
              <StatusBadge status={caseData.settlementInfo.status || ""} size="md" />
            </span>
          </div>
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-xs text-slate-500 shrink-0">ID</span>
            <span
              className="flex-1 min-w-0 text-[14px] font-medium text-slate-800 rounded border border-slate-200 bg-slate-50/50 px-1.5 py-0.5 cursor-pointer hover:border-blue-300 truncate"
              onClick={() => {
                const newVal = prompt("IDを入力", caseData.metadata.externalId || "");
                if (newVal !== null) updateMetadata("externalId", newVal);
              }}
            >
              {caseData.metadata.externalId || "-"}
            </span>
          </div>
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-xs text-slate-500 shrink-0">名前</span>
            <span
              className="flex-1 min-w-0 text-[14px] font-medium text-slate-800 rounded border border-slate-200 bg-slate-50/50 px-1.5 py-0.5 cursor-pointer hover:border-blue-300 truncate"
              onClick={() => {
                const newVal = prompt("名前を入力", caseData.clientBasicInfo.name || "");
                if (newVal !== null) updateClientBasicInfo("name", newVal);
              }}
            >
              {caseData.clientBasicInfo.name || "-"}
            </span>
          </div>
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-xs text-slate-500 shrink-0">フリガナ</span>
            <span
              className="flex-1 min-w-0 text-[14px] font-medium text-slate-800 rounded border border-slate-200 bg-slate-50/50 px-1.5 py-0.5 cursor-pointer hover:border-blue-300 truncate"
              onClick={() => {
                const newVal = prompt("フリガナを入力", caseData.clientBasicInfo.furigana || "");
                if (newVal !== null) updateClientBasicInfo("furigana", newVal);
              }}
            >
              {caseData.clientBasicInfo.furigana || "-"}
            </span>
          </div>
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-xs text-slate-500 shrink-0">電話番号</span>
            <span
              className="flex-1 min-w-0 text-[14px] font-medium text-slate-800 rounded border border-slate-200 bg-slate-50/50 px-1.5 py-0.5 cursor-pointer hover:border-blue-300 truncate"
              onClick={() => {
                const newVal = prompt("電話番号を入力", caseData.clientBasicInfo.phone || "");
                if (newVal !== null) updateClientBasicInfo("phone", newVal);
              }}
            >
              {caseData.clientBasicInfo.phone || "-"}
            </span>
          </div>
          <div className="flex items-center gap-1 min-w-0 col-span-2">
            <span className="text-xs text-slate-500 shrink-0">メール</span>
            <span
              className="flex-1 min-w-0 text-[14px] font-medium text-slate-800 rounded border border-slate-200 bg-slate-50/50 px-1.5 py-0.5 cursor-pointer hover:border-blue-300 truncate"
              onClick={() => {
                const newVal = prompt("メールを入力", caseData.clientBasicInfo.email || "");
                if (newVal !== null) updateClientBasicInfo("email", newVal);
              }}
            >
              {caseData.clientBasicInfo.email || "-"}
            </span>
          </div>
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-xs text-slate-500 shrink-0">要注意</span>
            <span
              className="flex-1 min-w-0 text-[14px] font-medium text-slate-800 rounded border border-slate-200 bg-slate-50/50 px-1.5 py-0.5 cursor-pointer hover:border-blue-300 truncate"
              onClick={() => {
                const newVal = prompt("要注意ランク (A/B/C)", caseData.clientBasicInfo.cautionRank || "");
                if (newVal !== null) updateClientBasicInfo("cautionRank", newVal);
              }}
            >
              {caseData.clientBasicInfo.cautionRank || "-"}
            </span>
          </div>
        </div>
        {/* 3行目：リスト・受任情報（8カラムグリッド） */}
        <div className="grid grid-cols-8 gap-1 px-2 py-1">
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-xs text-slate-500 shrink-0">リスト区分</span>
            <span
              className="flex-1 min-w-0 text-[14px] font-medium text-slate-800 rounded border border-slate-200 bg-slate-50/50 px-1.5 py-0.5 cursor-pointer hover:border-blue-300 truncate"
              onClick={() => {
                const newVal = prompt("リスト区分を入力", caseData.metadata.listCategory || "");
                if (newVal !== null) updateMetadata("listCategory", newVal);
              }}
            >
              {caseData.metadata.listCategory || "-"}
            </span>
          </div>
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-xs text-slate-500 shrink-0">登録日</span>
            <span
              className="flex-1 min-w-0 text-[14px] font-medium text-slate-800 rounded border border-slate-200 bg-slate-50/50 px-1.5 py-0.5 cursor-pointer hover:border-blue-300 truncate"
              onClick={() => {
                const newVal = prompt("リスト登録日を入力 (YYYY-MM-DD)", caseData.metadata.listRegisteredDate || "");
                if (newVal !== null) updateMetadata("listRegisteredDate", newVal);
              }}
            >
              {caseData.metadata.listRegisteredDate || "-"}
            </span>
          </div>
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-xs text-slate-500 shrink-0">受任日</span>
            <span
              className="flex-1 min-w-0 text-[14px] font-medium text-slate-800 rounded border border-slate-200 bg-slate-50/50 px-1.5 py-0.5 cursor-pointer hover:border-blue-300 truncate"
              onClick={() => {
                const newVal = prompt("受任日を入力 (YYYY-MM-DD)", caseData.appointmentInfo.acceptanceDate || "");
                if (newVal !== null) updateAppointmentInfo("acceptanceDate", newVal);
              }}
            >
              {caseData.appointmentInfo.acceptanceDate || "-"}
            </span>
          </div>
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-xs text-slate-500 shrink-0">アポ担当</span>
            <span
              className="flex-1 min-w-0 text-[14px] font-medium text-slate-800 rounded border border-slate-200 bg-slate-50/50 px-1.5 py-0.5 cursor-pointer hover:border-blue-300 truncate"
              onClick={() => {
                const newVal = prompt("アポ担当を入力", caseData.appointmentInfo.appointmentStaff || "");
                if (newVal !== null) updateAppointmentInfo("appointmentStaff", newVal);
              }}
            >
              {caseData.appointmentInfo.appointmentStaff || "-"}
            </span>
          </div>
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-xs text-slate-500 shrink-0">面談担当</span>
            <span
              className="flex-1 min-w-0 text-[14px] font-medium text-slate-800 rounded border border-slate-200 bg-slate-50/50 px-1.5 py-0.5 cursor-pointer hover:border-blue-300 truncate"
              onClick={() => {
                const newVal = prompt("面談担当を入力", caseData.appointmentInfo.interviewStaff || "");
                if (newVal !== null) updateAppointmentInfo("interviewStaff", newVal);
              }}
            >
              {caseData.appointmentInfo.interviewStaff || "-"}
            </span>
          </div>
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-xs text-slate-500 shrink-0">受任ランク</span>
            <span
              className="flex-1 min-w-0 text-[14px] font-medium text-slate-800 rounded border border-slate-200 bg-slate-50/50 px-1.5 py-0.5 cursor-pointer hover:border-blue-300 truncate"
              onClick={() => {
                const newVal = prompt("受任ランク (A/B/C)", caseData.appointmentInfo.acceptanceRank || "");
                if (newVal !== null) updateAppointmentInfo("acceptanceRank", newVal);
              }}
            >
              {caseData.appointmentInfo.acceptanceRank || "-"}
            </span>
          </div>
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-xs text-slate-500 shrink-0">入金日</span>
            <span
              className="flex-1 min-w-0 text-[14px] font-medium text-slate-800 rounded border border-slate-200 bg-slate-50/50 px-1.5 py-0.5 cursor-pointer hover:border-blue-300 truncate"
              onClick={() => {
                const newVal = prompt("毎月入金日を入力", caseData.paymentInfo.monthlyPaymentDay || "");
                if (newVal !== null) updatePaymentInfo("monthlyPaymentDay", newVal);
              }}
            >
              {caseData.paymentInfo.monthlyPaymentDay || "-"}
            </span>
          </div>
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-xs text-slate-500 shrink-0">基本入金額</span>
            <span
              className="flex-1 min-w-0 text-[14px] font-medium text-slate-800 rounded border border-slate-200 bg-slate-50/50 px-1.5 py-0.5 cursor-pointer hover:border-blue-300 truncate"
              onClick={() => {
                const newVal = prompt("基本入金額を入力", String(caseData.paymentInfo.basePaymentAmount || ""));
                if (newVal !== null) updatePaymentInfo("basePaymentAmount", newVal);
              }}
            >
              {caseData.paymentInfo.basePaymentAmount != null
                ? `${caseData.paymentInfo.basePaymentAmount.toLocaleString()}円`
                : "-"}
            </span>
          </div>
        </div>
        {/* 4行目：入金・報酬状況（8カラムグリッド） */}
        <div className="grid grid-cols-8 gap-1 px-2 py-1">
          <div className="flex items-center gap-1 min-w-0 col-span-2">
            <span className="text-xs text-slate-500 shrink-0">累計入金額</span>
            <span className="flex-1 min-w-0 text-[14px] font-medium tabular-nums text-blue-600 rounded border border-slate-200 bg-slate-50/50 px-1.5 py-0.5 truncate">
              {formatYenPair(
                caseData.paymentInfo.cumulativePaymentAmount,
                caseData.paymentInfo.cumulativePlannedPayment,
              )}
            </span>
          </div>
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-xs text-slate-500 shrink-0">残入金予定</span>
            <span className="flex-1 min-w-0 text-[14px] font-medium tabular-nums text-blue-600 rounded border border-slate-200 bg-slate-50/50 px-1.5 py-0.5 truncate">
              {remainingPlanned != null
                ? `${remainingPlanned.toLocaleString()}円`
                : "-"}
            </span>
          </div>
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-xs text-slate-500 shrink-0">次回入金日</span>
            <span
              className="flex-1 min-w-0 text-[14px] font-medium text-slate-800 rounded border border-slate-200 bg-slate-50/50 px-1.5 py-0.5 cursor-pointer hover:border-blue-300 truncate"
              onClick={() => {
                const newVal = prompt("次回入金日を入力 (YYYY-MM-DD)", caseData.paymentInfo.nextPaymentDate || "");
                if (newVal !== null) updatePaymentInfo("nextPaymentDate", newVal);
              }}
            >
              {caseData.paymentInfo.nextPaymentDate || "-"}
            </span>
          </div>
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-xs text-slate-500 shrink-0">通常報酬額</span>
            <span
              className="flex-1 min-w-0 text-[14px] font-medium text-slate-800 rounded border border-slate-200 bg-slate-50/50 px-1.5 py-0.5 cursor-pointer hover:border-blue-300 truncate"
              onClick={() => {
                const newVal = prompt("通常報酬額を入力", String(caseData.feeInfo.normalFee || ""));
                if (newVal !== null) updateFeeInfo("normalFee", newVal);
              }}
            >
              {caseData.feeInfo.normalFee != null
                ? `${caseData.feeInfo.normalFee.toLocaleString()}円`
                : "-"}
            </span>
          </div>
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-xs text-slate-500 shrink-0">報酬充当額</span>
            <span className="flex-1 min-w-0 text-[14px] font-medium tabular-nums text-blue-600 rounded border border-slate-200 bg-slate-50/50 px-1.5 py-0.5 truncate">
              {caseData.paymentInfo.cumulativeFeeAllocation != null
                ? `${caseData.paymentInfo.cumulativeFeeAllocation.toLocaleString()}円`
                : "-"}
            </span>
          </div>
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-xs text-slate-500 shrink-0">報酬未回収</span>
            <span
              className="flex-1 min-w-0 text-[14px] font-medium text-slate-800 rounded border border-slate-200 bg-slate-50/50 px-1.5 py-0.5 cursor-pointer hover:border-blue-300 truncate"
              onClick={() => {
                const newVal = prompt("報酬未回収を入力", String(caseData.feeInfo.uncollectedFee || ""));
                if (newVal !== null) updateFeeInfo("uncollectedFee", newVal);
              }}
            >
              {caseData.feeInfo.uncollectedFee != null
                ? `${caseData.feeInfo.uncollectedFee.toLocaleString()}円`
                : "-"}
            </span>
          </div>
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-xs text-slate-500 shrink-0">分割数</span>
            <span
              className="flex-1 min-w-0 text-[14px] font-medium text-slate-800 rounded border border-slate-200 bg-slate-50/50 px-1.5 py-0.5 cursor-pointer hover:border-blue-300 truncate"
              onClick={() => {
                const newVal = prompt("報酬分割数を入力", String(caseData.feeInfo.installmentCount || ""));
                if (newVal !== null) updateFeeInfo("installmentCount", newVal);
              }}
            >
              {caseData.feeInfo.installmentCount != null
                ? `${caseData.feeInfo.installmentCount}回`
                : "-"}
            </span>
          </div>
        </div>
      </header>

      {/* Content（ヘッダー以外のみスクロール） */}
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex min-w-0 w-full flex-col">
          <div className="min-w-0 space-y-1.5 px-2 pb-2 pt-1.5">
            {/* 入金スケジュール・和解状況 */}
            <div className="min-w-0">
              <SectionCard title="入金スケジュール・和解状況" color="green">
                <Tabs
                  variant="split"
                  tabBodyScroll="host"
                  tabBodyMaxHeightClassName="h-[min(55vh,26rem)]"
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
                                <VAccountFields
                                  branch={caseData.paymentInfo.vAccountBranch}
                                  number={caseData.paymentInfo.vAccountNumber}
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
                                  <span className="font-medium tabular-nums text-slate-900">
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
                                  <span className="font-medium tabular-nums">
                                    {sumActualAgentFee.toLocaleString()}円
                                  </span>
                                </span>
                                <span className="inline-flex shrink-0 items-center gap-0.5">
                                  <span className="text-slate-400">
                                    累計）プール充当：
                                  </span>
                                  <span className="font-medium tabular-nums">
                                    {sumActualPool.toLocaleString()}円
                                  </span>
                                </span>
                                <span className="inline-flex shrink-0 items-center gap-0.5 font-medium text-slate-900">
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
                        {/* Row 1: 性別(2), 生年月日(2), 年齢(2), 結婚(2), 子供(2) = 10 */}
                        <div className="min-w-0 col-span-2">
                          <EditableField
                            label="性別"
                            value={caseData.clientBasicInfo.gender}
                            onChange={(v) => updateClientBasicInfo("gender", v)}
                            type="select"
                            options={[
                              { value: "男", label: "男" },
                              { value: "女", label: "女" },
                            ]}
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                          />
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
                          />
                        </div>
                        <div className="min-w-0 col-span-2">
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
                            options={[
                              { value: "既婚", label: "既婚" },
                              { value: "未婚", label: "未婚" },
                              { value: "離婚", label: "離婚" },
                            ]}
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
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
                          />
                        </div>
                        {/* Row 2: 居住形態(2), 都道府県(2), 住所(4), 同居(2) = 10 */}
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
                          />
                        </div>
                        <div className="min-w-0 col-span-2">
                          <EditableField
                            label="都道府県"
                            value={caseData.clientBasicInfo.prefecture}
                            onChange={(v) =>
                              updateClientBasicInfo("prefecture", v)
                            }
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
                          />
                        </div>
                        <div className="min-w-0 col-span-4">
                          <EditableField
                            label="住所"
                            value={caseData.clientBasicInfo.address}
                            onChange={(v) =>
                              updateClientBasicInfo("address", v)
                            }
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
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
                          />
                        </div>
                        <div className="col-span-2" />
                        {/* Row 6: 年金(1), 遅れ(1), 自転車(1), 他事務所相談(1), 空(6) = 10 */}
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
                          />
                        </div>
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
                            options={[
                              { value: "任意整理", label: "任意整理" },
                              { value: "自己破産", label: "自己破産" },
                              { value: "個人再生", label: "個人再生" },
                            ]}
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
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
                          />
                        </div>
                        <div className="min-w-0 col-span-2">
                          <EditableField
                            label="予定弁済総数"
                            value={caseData.settlementInfo.plannedPaymentCount}
                            onChange={(v) =>
                              updateSettlementInfo("plannedPaymentCount", v)
                            }
                            type="number"
                            suffix="回"
                            compact
                            compactLayout="inline"
                            bordered
                            truncateValue
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
          </div>
        </div>
      </main>
    </div>
  );
}
