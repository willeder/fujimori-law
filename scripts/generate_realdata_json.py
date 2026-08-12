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
# 債権者別ステータスは kintone の値をそのまま保持する。
# 以前は7種類に丸めていたため「和解後完済済」「弁護士和解済 返済中」などが
# すべて「受任通知発送待ち」になり、GMO振込の対象からも外れていた。
CREDITOR_STATUS_ALLOWED = {
    "受任通知発送待ち", "債権調査票待ち", "求償先調査票待ち",
    "和解提案書作成待ち", "和解提案書発送待ち", "和解提案書発送済",
    "和解再提案待ち", "和解稟議中",
    "和解済", "弁護士和解済 返済中", "和解後完済済",
    "破産申立待ち", "破産申立済", "弁護士引継ぎ待ち", "弁護士引継ぎ済",
    "受任対象外",
}
# 案件側のステータスが債権者欄に混ざっていた場合の読み替えだけ残す
CREDITOR_STATUS_MAP = {
    "一部受任通知発送済": "受任通知発送待ち",
    "全社受任通知発送済": "受任通知発送待ち",
    "全和解済_支払中": "和解済",
    "一部和解済_支払中": "和解済",
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
    """kintone の債権者別ステータスをそのまま返す。
    空欄のときだけ「受任通知発送待ち」を既定にする。
    未知の値は丸めずそのまま通す（丸めると実態が消えるため）。"""
    t = s(raw)
    if not t:
        return ""
    if t in CREDITOR_STATUS_ALLOWED:
        return t
    return CREDITOR_STATUS_MAP.get(t, t)


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


def _read_path(path):
    # 文字コード自動判定: UTF-8(BOM可) を優先し、失敗したら CP932(Shift-JIS)。
    for enc in ("utf-8-sig", "cp932"):
        try:
            with open(path, "r", encoding=enc, newline="") as f:
                return list(csv.DictReader(f))
        except UnicodeDecodeError:
            continue
    with open(path, "r", encoding="utf-8", errors="replace", newline="") as f:
        return list(csv.DictReader(f))


def read_csv(*names):
    # 複数の候補名を順に試し、最初に存在したファイルを読む（新旧の名称差を吸収）。
    for name in names:
        p = SRC / name
        if p.exists():
            return _read_path(p)
    return _read_path(SRC / names[0])


# ---------- マスタ読み込み・caseId 採番 ----------
def build_master():
    # 新形式: 「基本情報.csv」1本に全列が入っている。あれば優先。
    # 旧形式: 1st/2nd/3rd.csv を ID で横結合（後方互換で残す）。
    if (SRC / "基本情報.csv").exists():
        d1 = read_csv("基本情報.csv")
        id_to_case = {}
        master = {}
        n = 0
        rows = []
        for r1 in d1:
            eid = (r1.get("ID") or "").strip()
            if not eid or eid in id_to_case:
                continue  # 空ID・重複IDはスキップ
            n += 1
            id_to_case[eid] = n
            master[eid] = dict(r1)
            rows.append(r1)
        return rows, master, id_to_case

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
                "resignationDate": iso_date(g("辞任日")),
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
                # 2026-08-07 追加（従来は取り込んでいなかった累計値）
                "cumulativePlannedAgentFeeAllocation": i(g("累)弁代報酬充当予定額")),
                "cumulativeAgentFeeAllocation": i(g("累)弁代報酬充当額")),
                "cumulativePlannedPoolAllocation": i(g("累)ﾌﾟｰﾙ充当予定額")),
                "cumulativePlannedRepaymentAllocation": i(g("累)弁済充当予定額")),
                "cumulativeHandlingFee": i(g("累)手数料")),
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
            # 実績側（kintone は予定と別項目）。予定値の流用をやめてこちらを使う。
            "repaymentDate": iso_date(r.get("弁済日")),
            "actualRepaymentCount": i(r.get("数")),
            "actualHandlingFee": i(r.get("振)手数料")),
            "cumulativePool": i(r.get("累積ﾌﾟｰﾙ")),
        })
        pid += 1
    return out


# 和解内容コメント（例: 「【和解内容】和解金額：536,112円 ※将来利息0％ 支払回数：60回 …」）
# から和解金額を取り出す。和解内容詳細と突合できた行で照合したところ
# 4,962/4,999 件（99.3%）で詳細の和解金額と一致したため、フォールバックとして信頼できる。
_SETTLE_AMOUNT_RE = re.compile(r"和解金額[：:]\s*([0-9,]+)\s*円")


def settlement_amount_from_comment(text):
    m = _SETTLE_AMOUNT_RE.search(text or "")
    if not m:
        return None
    try:
        return int(m.group(1).replace(",", ""))
    except ValueError:
        return None


def _build_creditor(cid, case_id, name, r, d):
    """1債権者レコードを生成。r=和解対象債権者一覧 行（補助情報）, d=和解内容詳細 行（弁済スケジュール）。
    どちらか一方が {} でも可。"""
    # 和解金額。
    # 一覧（和解対象債権一覧.csv）の「和解」列は **金額ではなく支払回数** で、
    # 突合できた行で照合すると 5,106/5,138 件（99.4%）が詳細の「支払回数」と一致する。
    # ここを金額のフォールバックにしていたため、詳細と債権者名が一致しない行
    # （4,346 件）で「37」「60」といった回数が和解金額として表示されていた。
    # 金額は次の順に補う：
    #   ① 和解内容詳細の「和解金額」（正）
    #   ② 和解内容コメント内の「和解金額：X円」（詳細と 99.3% 一致）
    #   ③ 一覧の「和解時債務金額」（詳細と 98.7% 一致）
    settlement_amount = i(d.get("和解金額"))
    if settlement_amount is None:
        settlement_amount = settlement_amount_from_comment(r.get("和解内容コメント"))
    if settlement_amount is None:
        settlement_amount = i(r.get("和解時債務金額"))
    status = creditor_status(r.get("債権者別ステータス"))
    # 一覧にステータスが無く、和解詳細にスケジュール/和解日があれば和解済とみなす
    if not status and (s(d.get("支払開始月")) or s(d.get("和解日"))):
        status = "和解済"
    if not status:
        status = "受任通知発送待ち"
    return {
        "id": cid,
        "caseId": case_id,
        "creditorName": name,
        "negotiationPartner": negotiation_partner(r.get("交渉相手")),
        "declaredAmount": i(r.get("申告額")),
        "debtAmount": i(r.get("債務額")),
        "expectedSettlement": i(r.get("想定和解")),
        "expectedSettlementAmount": None,
        "expectedPaymentCount": None,
        "expectedFutureInterest": None,
        "status": status,
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
        # 支払開始月／最終支払月の列には実際は年月日(例 2026/09/27)が入っているため、
        # ym()で月に切り詰めず iso_date() で「支払開始日／最終支払日」を年月日のまま保持する。
        "paymentStartMonth": iso_date(d.get("支払開始月")),
        "paymentDay": i(d.get("支払日")),
        "paymentCount": i(d.get("支払回数")),
        "firstPaymentAmount": i(d.get("初回支払額")),
        "subsequentPaymentAmount": i(d.get("２回目以降支払額")),
        "finalPaymentAmount": i(d.get("最終支払額")),
        "finalPaymentMonth": iso_date(d.get("最終支払月")),
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
    }


def emit_creditors(id_to_case):
    """和解詳細（弁済スケジュール）を「弁済の正」として全件取り込む。
    和解対象債権者一覧とは債権者の括り方が異なり(合算/求償分/回数分割/債権回収会社)、
    (ID,債権者名)では結合できない行が多いため、和解詳細の各行を必ず弁済プランとして出力し、
    一覧側の補助情報(申告額/債務額/ステータス等)は名前一致した場合のみ付加する。
    和解詳細に現れない一覧債権者(スケジュール未確定)は表示用に別途出力する。"""
    # 一覧を (ID,債権者名) -> 行 でインデックス（補助情報・最初の出現を採用）
    listidx = {}
    for r in read_csv("和解対象債権一覧.csv", "和解対象債権者一覧.csv"):
        eid = r["ID"].strip()
        name = s(r.get("債権者"))
        if not name:
            continue
        listidx.setdefault((eid, name), r)

    out = []
    cid_seq = 1
    matched = set()

    # 1) 和解詳細の各行＝弁済プランを必ず出力（弁済の正）
    for d in read_csv("和解内容詳細.csv"):
        eid = d["ID"].strip()
        name = s(d.get("債権者"))
        case_id = id_to_case.get(eid)
        if case_id is None or not name or name.startswith("★") or name == "債権者":
            continue
        r = listidx.get((eid, name))
        if r is not None:
            matched.add((eid, name))
        out.append(_build_creditor(cid_seq, case_id, name, r or {}, d))
        cid_seq += 1

    # 2) 和解詳細に無い一覧債権者（スケジュール未確定）も表示用に出力
    for (eid, name), r in listidx.items():
        if (eid, name) in matched:
            continue
        case_id = id_to_case.get(eid)
        if case_id is None or name.startswith("★") or name == "債権者":
            continue
        out.append(_build_creditor(cid_seq, case_id, name, r, {}))
        cid_seq += 1

    return out


def emit_contacts(id_to_case):
    out = []
    hid = 1
    for r in read_csv("依頼者接触履歴.csv", "依頼者　接触履歴.csv"):
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
    for r in read_csv("債権者接触履歴.csv", "債権者　接触履歴.csv"):
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
