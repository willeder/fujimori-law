-- 画面の文字サイズをアカウントごとに保持する（堀本様 2026-08-23 のご要望）。
-- これまではブラウザ側（localStorage）にしか持っておらず、同じPCを共有すると
-- 別の人の設定が出たり、端末を変えると設定が戻ったりしていた。
-- 値は 'large' | 'standard' | 'compact' | 'dense'。NULL は未設定（既定を使う）。
ALTER TABLE "users" ADD COLUMN "uiFontScale" TEXT;
