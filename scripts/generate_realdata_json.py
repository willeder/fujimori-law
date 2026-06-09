#!/usr/bin/env python3
"""
docs/data/source/ の実データ CSV 8本を統合し、client-mock 用の実行時 JSON を生成する。

入力 (docs/data/source/):
  1st.csv / 2nd.csv / 3rd.csv         依頼者マスタ（ID 1:1 で横結合）
  依頼者　接触履歴.csv / 債権者　接触履歴.csv
  入金情報.csv                         入金予定・実績明細
  和解内容詳細.csv / 和解対象債権者一覧.csv  和解・債権者

出力 (client-mock/public/data/):
  cases.json / payments.json / creditors.json / contactHistories.json / manifest.json

型は client-mock/src/types/case.ts に対応。全 2,911 件・全フィールドを反映。

使い方（リポジトリルート）:
  python3 scripts/generate_realdata_json.py
"""
from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "docs/data/source"
OUT = ROOT / "public/data"

csv.field_size_limit(min(sys.maxsize, 2**31 - 1))

GENDER_ALLOWED = {"男", "女"}
MARITAL_ALLOWED = {"既婚", "未婚", "離婚"}
RANK_ALLOWED = {"A", "B", "C"}
ADJUSTMENT_ALLOWED = {"任意整理", "自己破産", "個人再生"}
CREDITOR_STATUS_ALLOWED = {
    "受任通知発送待ち", "受任通知発送済", "債権調査中",
    "和解提案中", "和解済", "弁済中", "完済",
}
CREDITOR_STATUS_MAP = {
    "債権調査票待ち": "債権調査中",
    "和解提案書発送待ち": "和解提案中",
    "和解提案書発送済": "和解提案中",
    "一部受任通知発送済": "受任通知発送済",
    "全社受任通知発送済": "受任通知発送済",
    "全和解済_支払中": "弁済中",
    "一部和解済_支払中": "弁済中",
}


# ---------- 値変換ヘルパ ----------
def s(val):
    if val is None:
        return None
    t = str(val).strip()
    return t or None


def iso_date(val):
    t = s(val)
    if not t or t == "########":
        return None
    t = t.split(" ")[0].split("T")[0]
    t = t.replace("/", "-")
    m = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})$", t)
    if not m:
        return None
    y, mo, d = m.groups()
    return f"{int(y):04d}-{int(mo):02d}-{int(d):02d}"


def ym(val):
    t = s(val)
    if not t:
        return None
    t = t.split(" ")[0].replace("/", "-")
    m = re.match(r"^(\d{4})-(\d{1,2})", t)
    if not m:
        return None
    return f"{int(m.group(1)):04d}-{int(m.group(2)):02d}"


def num(val):
    t = s(val)
    if t is None or t == "########":
        return None
    t = t.replace(",", "")
    try:
        return float(t)
    except ValueError:
        return None


def i(val):
    n = num(val)
    return int(n) if n is not None else None


def pick(value, allowed, default=None):
    t = s(value)
    if t in allowed:
        return t
    return default


def creditor_status(raw):
    t = s(raw)
    if not t:
        return "受任通知発送待ち"
    if t in CREDITOR_STATUS_ALLOWED:
        return t
    return CREDITOR_STATUS_MAP.get(t, "受任通知発送待ち")


def negotiation_partner(val):
    t = s(val)
    if t in (None, "0", "0.0"):
        return None
    return t


def future_interest(val):
    t = s(val)
    if t in (None, "0", "0.0"):
        return "なし"
    return t


def read_csv(name):
    path = SRC / name
    with open(path, "r", encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


# ---------- マスタ読み込み・caseId 採番 ----------
def build_master():
    d1 = read_csv("1st.csv")
    d2 = {r["ID"]: r for r in read_csv("2nd.csv")}
    d3 = {r["ID"]: r for r in read_csv("3rd.csv")}
    id_to_case = {}
    master = {}
    for n, r1 in enumerate(d1, start=1):
        eid = r1["ID"].strip()
        id_to_case[eid] = n
        merged = dict(r1)
        merged.update(d2.get(eid, {}))
        merged.update(d3.get(eid, {}))
        master[eid] = merged
    return d1, master, id_to_case


def emit_cases(order_ids, master, id_to_case):
    out = []
    for eid in order_ids:
        c = master[eid]
        g = c.get
        case = {
            "id": id_to_case[eid],
            "clientBasicInfo": {
                "name": s(g("名前")) or "（氏名未設定）",
                "furigana": s(g("フリガナ")),
                "phone": s(g("電話番号")),
                "lineUrl": s(g("LINE@ URL")),
                "email": s(g("メールアドレス")),
                "postalCode": s(g("郵便番号")),
                "prefecture": s(g("都道府県")),
                "address": s(g("住所")),
                "birthDate": iso_date(g("生年月日")),
                "age": i(g("年齢")),
                "gender": pick(g("性別"), GENDER_ALLOWED),
                "maritalStatus": pick(g("結婚"), MARITAL_ALLOWED),
                "maidenName": s(g("旧姓")),
                "children": s(g("子供")),
                "residenceType": s(g("居住形態")),
                "rent": i(g("家賃")),
                "monthlyIncome": i(g("月収(手取)")),
                "payDay": s(g("給与日")),
                "employmentType": s(g("勤務形態")),
                "cautionRank": pick(g("要注意ランク"), RANK_ALLOWED),
                "recordNumber": i(g("レコード番号")),
                "correspondenceRequired": s(g("対応要否")),
                "correspondenceHours": s(g("対応時間")),
                "cohabitation": s(g("同居")),
                "confidentialContact": s(g("内密先")),
                "emergencyContact": s(g("緊急連絡先")),
                "emergencyContactRelation": s(g("関係(緊急)")),
                "previousAddress": s(g("旧住所")),
                "payrollAccount": s(g("給与口座")),
                "employerName": s(g("勤務先名")),
                "employerContact": s(g("勤務先連絡先")),
                "employerAddress": s(g("勤務先住所")),
                "previousEmployerName": s(g("旧ー勤務先名")),
                "previousEmployerContact": s(g("旧ー勤務先連絡先")),
                "previousEmployerAddress": s(g("旧ー勤務先住所")),
                "otherOfficeConsultation": s(g("他事務所相談")),
                "paymentDelay": s(g("遅れ")),
                "bicycleNote": s(g("自転車")),
                "pension": s(g("年金")),
            },
            "appointmentInfo": {
                "appointmentStaff": s(g("アポ担当")),
                "followUpStaff": s(g("後確担当")),
                "interviewStaff": s(g("面談担当")),
                "judicialScrivener": s(g("担当司法書士")),
                "debtAdjustmentType": pick(g("債務整理区分"), ADJUSTMENT_ALLOWED),
                "acceptanceRank": pick(g("受任ランク"), RANK_ALLOWED),
                "acceptanceDate": iso_date(g("受任日")),
                "elapsedDays": i(g("経過日数")),
                "cAcceptancePromotionDate": iso_date(g("C受任昇格日")),
                "interviewMemo1": s(g("面談時備考１")),
                "interviewMemo2": s(g("面談時備考２")),
                "incomeExpenseMemo": s(g("収支メモ")),
            },
            "debtInfo": {
                "creditorCount": i(g("債権社数")),
                "declaredDebtAmount": i(g("申告債務額")),
                "totalDebtAmount": i(g("債務額総額")),
                "preRequestPayment": i(g("依頼 前 返済額")),
                "postRequestPayment": i(g("依頼 後 返済額")),
            },
            "settlementInfo": {
                "status": s(g("受任後ステータス")),
                "proposalDate": iso_date(g("和解提案予定日")),
                "settlementCount": i(g("和解弁済総数")),
                "postSettlementPaymentCount": i(g("和解後代弁社数")),
                "plannedPaymentCount": i(g("予定弁済総数")),
                "plannedAgentCount": i(g("予定代弁社数")),
                "allSettlementDocSentDate": iso_date(g("全和解書送付日")),
            },
            "feeInfo": {
                "normalFee": i(g("通常報酬")),
                "officeFee": i(g("事務所報酬（通常）")),
                "installmentCount": i(g("報酬分割回数")),
                "agentPayment": s(g("弁済代行")),
                "plannedPaymentFeeTotal": i(g("予定弁済報酬総額")),
                "uncollectedFee": i(g("報酬未回収額")),
            },
            "paymentInfo": {
                "firstPaymentDate": iso_date(g("初回入金予定日")),
                "firstPaymentWithinTenDays": s(g("10日以内")),
                "firstPaymentAmount": i(g("初回入金額")),
                "monthlyPaymentDay": s(g("毎月入金日")),
                "basePaymentAmount": i(g("基本入金額")),
                "nextPaymentDate": iso_date(g("次回入金日")),
                "cumulativePaymentAmount": i(g("累)入金金額")),
                "cumulativePlannedPayment": i(g("累)入金予定額")),
                "cumulativeFeeAllocation": i(g("累)報酬充当額")),
                "cumulativePlannedFeeAllocation": i(g("累)報酬充当予定額")),
                "cumulativePoolAllocation": i(g("累)ﾌﾟｰﾙ充当額")),
                "cumulativeRepaymentAllocation": i(g("累)弁済充当額")),
                "totalMinusPoolMinusRepayment": i(g("総額-ﾌﾟｰﾙ-累弁済")),
                "notificationExcluded": None,
                "vAccountBranch": s(g("V口座-支店")),
                "vAccountNumber": s(g("V口座-番号")),
            },
            "reminderInfo": {
                "reminderDate": iso_date(g("リマインド日")),
                "reminderTime": s(g("リマインド時間")),
                "nextResponseDate": iso_date(g("次回対応日")),
                "responseTime": None,
            },
            "metadata": {
                "createdAt": iso_date(g("作成日時")),
                "updatedAt": iso_date(g("更新日時")),
                "createdBy": s(g("作成者")),
                "updatedBy": s(g("更新者")),
                "externalId": eid,
                "listCategory": s(g("リスト区分")),
                "listRegisteredDate": iso_date(g("リスト登録日")),
                "acceptanceDocs": "",
            },
        }
        out.append(case)
    return out


def emit_payments(id_to_case):
    out = []
    pid = 1
    for r in read_csv("入金情報.csv"):
        eid = r["ID"].strip()
        cid = id_to_case.get(eid)
        if cid is None:
            continue
        out.append({
            "id": pid,
            "caseId": cid,
            "creditorId": None,
            "creditorInstallmentIndex": None,
            "plannedDate": iso_date(r.get("入金予定日")),
            "plannedAmount": i(r.get("入金予定額")),
            "plannedFeeAllocation": i(r.get("報酬充当予定額")),
            "plannedAgentFeeAllocation": i(r.get("弁代報酬充当予定額")),
            "plannedPoolAllocation": i(r.get("ﾌﾟｰﾙ充当予定額")),
            "plannedRepaymentAllocation": i(r.get("弁済充当予定額")),
            "actualDate": iso_date(r.get("実入金日")),
            "actualAmount": i(r.get("実入金額")),
            "actualFeeAllocation": i(r.get("報酬充当額")),
            "actualAgentFeeAllocation": i(r.get("弁代報酬充当額")),
            "actualPoolAllocation": i(r.get("ﾌﾟｰﾙ充当額")),
            "actualRepaymentAllocation": i(r.get("弁済充当額")),
            "handlingFee": i(r.get("手数料")),
            "repaymentCount": i(r.get("社数")),
            "cumulativePool": i(r.get("累積ﾌﾟｰﾙ")),
        })
        pid += 1
    return out


def emit_creditors(id_to_case):
    detail = {}
    for r in read_csv("和解内容詳細.csv"):
        name = s(r.get("債権者"))
        if not name:
            continue
        detail[(r["ID"].strip(), name)] = r

    out = []
    cid_seq = 1
    for r in read_csv("和解対象債権者一覧.csv"):
        eid = r["ID"].strip()
        case_id = id_to_case.get(eid)
        name = s(r.get("債権者"))
        if case_id is None or not name or name.startswith("★") or name == "債権者":
            continue
        d = detail.get((eid, name), {})
        settlement_amount = i(d.get("和解金額"))
        if settlement_amount is None:
            settlement_amount = i(r.get("和解"))
        out.append({
            "id": cid_seq,
            "caseId": case_id,
            "creditorName": name,
            "negotiationPartner": negotiation_partner(r.get("交渉相手")),
            "declaredAmount": i(r.get("申告額")),
            "debtAmount": i(r.get("債務額")),
            "expectedSettlement": i(r.get("想定和解")),
            "expectedSettlementAmount": None,
            "expectedPaymentCount": None,
            "expectedFutureInterest": None,
            "status": creditor_status(r.get("債権者別ステータス")),
            "repaymentExcluded": None,
            "check": s(r.get("CHECK[CHECK]")),
            "nextProcessDate": iso_date(r.get("次回処理日時")),
            "acceptanceNoticeSentDate": iso_date(r.get("受任通知送付日")),
            "debtInquiryArrivalDate": iso_date(r.get("債権調査到着日")),
            "customerCode": s(r.get("顧客コード")),
            "contractDate": iso_date(r.get("調査票_契約日")),
            "settlementProposalDate": iso_date(r.get("和解提案日")),
            "settlementProposal": i(r.get("和解提案")),
            "responseStatus": s(r.get("回答状況")),
            "settlementDate": iso_date(r.get("和解日") or d.get("和解日")),
            "settlementAmount": settlement_amount,
            "settlementDebtAmount": i(r.get("和解時債務金額")),
            "settlementContentComment": s(r.get("和解内容コメント")),
            "reminder": s(r.get("リマインド")),
            "paymentStartMonth": ym(d.get("支払開始月")),
            "paymentDay": i(d.get("支払日")),
            "paymentCount": i(d.get("支払回数")),
            "firstPaymentAmount": i(d.get("初回支払額")),
            "subsequentPaymentAmount": i(d.get("２回目以降支払額")),
            "finalPaymentAmount": i(d.get("最終支払額")),
            "finalPaymentMonth": ym(d.get("最終支払月")),
            "futureInterest": future_interest(d.get("将来利息")),
            "bankName": s(d.get("振込先銀行名")),
            "financialInstitutionCode": s(d.get("金融機関コード")),
            "branchName": s(d.get("振込先支店名")),
            "branchCode": s(d.get("支店コード")),
            "accountType": s(d.get("振込先口座種別")),
            "accountNumber": s(d.get("振込先口座番号")),
            "accountHolder": s(d.get("振込先口座名義")),
            "designatedCode": s(d.get("指定コード")),
            "repaymentTarget": s(d.get("弁済対象")),
        })
        cid_seq += 1
    return out


def emit_contacts(id_to_case):
    out = []
    hid = 1
    for r in read_csv("依頼者　接触履歴.csv"):
        cid = id_to_case.get(r["ID"].strip())
        if cid is None:
            continue
        out.append({
            "id": hid, "caseId": cid,
            "contactDate": iso_date(r.get("接触日")),
            "contactTime": s(r.get("時刻")),
            "staff": s(r.get("担当")),
            "tool": s(r.get("ツール")),
            "targetType": "依頼者",
            "comment": s(r.get("コメント")),
        })
        hid += 1
    for r in read_csv("債権者　接触履歴.csv"):
        cid = id_to_case.get(r["ID"].strip())
        if cid is None:
            continue
        out.append({
            "id": hid, "caseId": cid,
            "contactDate": iso_date(r.get("接触日")),
            "contactTime": s(r.get("時刻")),
            "staff": s(r.get("担当")),
            "tool": s(r.get("ツール")),
            "targetType": "債権者",
            "creditorName": s(r.get("債権者")),
            "comment": s(r.get("コメント")),
        })
        hid += 1
    return out


def write_json(name, data):
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / name
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    return path.stat().st_size


def main():
    d1, master, id_to_case = build_master()
    order_ids = [r["ID"].strip() for r in d1]

    cases = emit_cases(order_ids, master, id_to_case)
    payments = emit_payments(id_to_case)
    creditors = emit_creditors(id_to_case)
    contacts = emit_contacts(id_to_case)

    sizes = {
        "cases.json": write_json("cases.json", cases),
        "payments.json": write_json("payments.json", payments),
        "creditors.json": write_json("creditors.json", creditors),
        "contactHistories.json": write_json("contactHistories.json", contacts),
    }
    manifest = {
        "generatedFrom": "docs/data/source/*.csv",
        "counts": {
            "cases": len(cases),
            "payments": len(payments),
            "creditors": len(creditors),
            "contactHistories": len(contacts),
        },
        "bytes": sizes,
    }
    write_json("manifest.json", manifest)

    print("counts:", manifest["counts"])
    for k, v in sizes.items():
        print(f"  {k}: {v/1_048_576:.1f} MB")


if __name__ == "__main__":
    main()
