#!/usr/bin/env python3
"""
kintone API で取得した records.ndjson を、CSVエクスポートと同じ形の CSV に戻す。

なぜ必要か:
  取込ロジック（scripts/generate_realdata_json.py）は kintone の **CSVエクスポート**
  を前提に、列を「フィールドのラベル」で読んでいる。
  一方 API が返すのは「フィールドコード」（例: ラベル「申告債務額」→ コード「受任時債務額」）。
  ここで API の記録をラベル基準の CSV に戻せば、既に検証済みの取込ロジックを
  そのまま再利用できる。JS側でマッピングを書き直すと二重管理になり必ずズレる。

出力（既定 docs/data/kintone/csv/）:
  基本情報.csv / 入金情報.csv / 和解内容詳細.csv /
  和解対象債権一覧.csv / 依頼者接触履歴.csv / 債権者接触履歴.csv

使い方:
  python3 scripts/kintone_ndjson_to_csv.py
  python3 scripts/kintone_ndjson_to_csv.py --record-numbers 3129-3154
  python3 scripts/kintone_ndjson_to_csv.py --only-missing-from public/data/cases.json

  --record-numbers   取り出すレコード番号（例 3129-3154,3200 / 省略で全件）
  --out              出力先ディレクトリ

チェックボックスは kintone のCSVと同じ「ラベル[選択肢]」列名で出す
（取込側が check[check] / CHECK[CHECK] を見ているため）。
"""
from __future__ import annotations

import argparse
import csv
import json
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "docs/data/kintone"
FIELDS_JSON = DATA / "app_fields.json"
RECORDS = DATA / "records.ndjson"

# サブテーブルのフィールドコード → 出力ファイル名
SUBTABLES = {
    "入金情報": "入金情報.csv",
    "和解内容詳細": "和解内容詳細.csv",
    "テーブル_0": "和解対象債権一覧.csv",
    "依頼者_接触履歴": "依頼者接触履歴.csv",
    "債権者接触履歴_0": "債権者接触履歴.csv",
}

# CSVに出しても意味がない型（ファイル・グループ・作業者など）
SKIP_TYPES = {"FILE", "GROUP", "SUBTABLE", "STATUS_ASSIGNEE", "CATEGORY", "SPACER", "LABEL", "HR"}


def load_fields():
    """フィールドコード → (ラベル, 型, 選択肢) の対応表を作る（サブテーブルも含む）"""
    doc = json.loads(FIELDS_JSON.read_text(encoding="utf-8"))
    props = doc.get("properties", doc)
    top = {}
    subs = {}
    for code, p in props.items():
        if p.get("type") == "SUBTABLE":
            subs[code] = {
                c: (f.get("label", c), f.get("type", ""), list(f.get("options", {}).keys()))
                for c, f in p.get("fields", {}).items()
            }
        top[code] = (p.get("label", code), p.get("type", ""), list(p.get("options", {}).keys()))
    return top, subs


# API の日時は UTC（例 2026-08-01T07:45:00Z）。CSVエクスポートは JST 表記なので、
# そのまま日付だけ切り出すと JST 00:00〜08:59 に作られたレコードが前日にずれる。
_UTC_TO_JST = timedelta(hours=9)


def jst(v):
    """UTCのISO日時を JST の 'YYYY-MM-DD HH:MM' にする（CSVエクスポートと同じ形）"""
    try:
        d = datetime.strptime(v, "%Y-%m-%dT%H:%M:%SZ") + _UTC_TO_JST
    except (TypeError, ValueError):
        return str(v or "")
    return d.strftime("%Y-%m-%d %H:%M")


def cell(raw, ftype):
    """API の値をCSVの1セル相当の文字列にする"""
    v = raw.get("value") if isinstance(raw, dict) else raw
    if v is None:
        return ""
    if ftype in ("CREATOR", "MODIFIER"):
        # CSVエクスポートはログイン名（メール）が入る。既存3,084件がその形なので合わせる
        return (v or {}).get("code", "") or (v or {}).get("name", "")
    if ftype in ("CREATED_TIME", "UPDATED_TIME", "DATETIME"):
        return jst(v)
    if ftype in ("USER_SELECT", "ORGANIZATION_SELECT", "GROUP_SELECT"):
        return ",".join(x.get("name", "") for x in (v or []))
    if isinstance(v, list):
        return ",".join(str(x) for x in v)
    return str(v)


def columns_for(defs, exclude=()):
    """出力する列（ラベル基準）。チェックボックスは ラベル[選択肢] に展開する"""
    cols = []
    for code, (label, ftype, options) in defs.items():
        if code in exclude or ftype in SKIP_TYPES:
            continue
        if ftype == "CHECK_BOX":
            for o in options:
                cols.append((f"{label}[{o}]", code, ftype, o))
        else:
            cols.append((label, code, ftype, None))
    return cols


def value_for(row, code, ftype, option):
    raw = row.get(code)
    if raw is None:
        return ""
    if ftype == "CHECK_BOX":
        vals = raw.get("value") or []
        return option if option in vals else ""
    return cell(raw, ftype)


def parse_record_numbers(spec):
    if not spec:
        return None
    out = set()
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            a, b = part.split("-", 1)
            out.update(range(int(a), int(b) + 1))
        else:
            out.add(int(part))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--record-numbers", default=None, help="例 3129-3154,3200")
    ap.add_argument("--out", default=str(DATA / "csv"))
    args = ap.parse_args()

    want = parse_record_numbers(args.record_numbers)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    top, subs = load_fields()
    master_cols = columns_for(top, exclude=set(SUBTABLES.keys()))
    sub_cols = {code: columns_for(defs) for code, defs in subs.items()}

    writers = {}
    files = {}

    def writer(name, header):
        if name not in writers:
            f = open(out_dir / name, "w", encoding="utf-8-sig", newline="")
            w = csv.writer(f)
            w.writerow(header)
            writers[name] = w
            files[name] = f
        return writers[name]

    n_rec = 0
    n_sub = {k: 0 for k in SUBTABLES}
    with open(RECORDS, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            rn = int(rec["レコード番号"]["value"])
            if want is not None and rn not in want:
                continue
            n_rec += 1

            ext = str(rec.get("ID", {}).get("value") or "").strip()

            w = writer("基本情報.csv", [c[0] for c in master_cols])
            w.writerow([value_for(rec, c[1], c[2], c[3]) for c in master_cols])

            for sub_code, fname in SUBTABLES.items():
                block = rec.get(sub_code)
                if not block:
                    continue
                cols = sub_cols[sub_code]
                sw = writer(fname, ["ID"] + [c[0] for c in cols])
                for row in block.get("value", []):
                    vals = row.get("value", {})
                    sw.writerow([ext] + [value_for(vals, c[1], c[2], c[3]) for c in cols])
                    n_sub[sub_code] += 1

    for f in files.values():
        f.close()

    print(f"出力先: {out_dir}")
    print(f"  基本情報.csv {n_rec} 件")
    for code, fname in SUBTABLES.items():
        print(f"  {fname} {n_sub[code]} 行")


if __name__ == "__main__":
    main()
