#!/bin/bash
# ============================================================
# GMOあおぞらAPI用 固定IPプロキシ 起動スクリプト（Lightsail用）
# 対象OS: Ubuntu 24.04 LTS
# 使い方: Lightsailインスタンス作成画面の「起動スクリプト」に
#         このファイルの中身を貼り付けるだけ。SSH作業は不要。
#
# ★★ 作成前に必ず書き換える箇所（2箇所）★★
#   1) PROXY_PASS : 長いランダム文字列に変更（例: openssl rand -hex 24 の出力）
#      ※本番用と開発用のインスタンスで必ず別の値にすること
#   2) ALLOWED_DOMAINS : 本番用 / 開発用で許可ドメインを切り替える
# ============================================================

set -eux

# ---- 認証情報（★書き換える） --------------------------------
PROXY_USER="gmoproxy"
PROXY_PASS="CHANGE_ME_TO_LONG_RANDOM_STRING"

# ---- 許可する接続先（★本番/開発で切り替える） ----------------
# 本番用インスタンス: GMO本番APIのみ
# 開発用インスタンス: GMOテスト環境API ＋ テスト用IBサイトのドメインを追加
#   （テスト環境の正確なドメインはGMOの接続試験手順書で確認して追記）
# api.ipify.org は送信元IPの動作確認用（残しても実害なし）
ALLOWED_DOMAINS="
api.gmo-aozora.com
api.ipify.org
"

# ---- パッケージ導入 ------------------------------------------
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y tinyproxy unattended-upgrades

# ---- 自動セキュリティ更新を有効化（日常運用を不要にする） ----
cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

# ---- tinyproxy 設定 ------------------------------------------
# 注意: tinyproxyのパーサーは設定ファイル内の非ASCII文字や引用符なしの
#       Filterパスで構文エラーになることがあるため、設定本体はASCIIのみとする
cat >/etc/tinyproxy/tinyproxy.conf <<EOF
User tinyproxy
Group tinyproxy
Port 8888
Timeout 600
MaxClients 20
LogLevel Notice
Syslog On
Allow 0.0.0.0/0
BasicAuth ${PROXY_USER} ${PROXY_PASS}
ConnectPort 443
FilterDefaultDeny Yes
Filter "/etc/tinyproxy/filter"
DisableViaHeader Yes
EOF

# ---- 接続先ホワイトリスト ------------------------------------
: > /etc/tinyproxy/filter
for d in ${ALLOWED_DOMAINS}; do
  # tinyproxyのFilterは正規表現。ドットをエスケープして完全一致させる
  echo "^$(echo "$d" | sed 's/\./\\./g')$" >> /etc/tinyproxy/filter
done

systemctl enable tinyproxy
systemctl restart tinyproxy

echo "===== GMO proxy setup completed ====="
