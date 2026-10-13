#!/usr/bin/env bash
# Kiểm thử UI mục 4 & 5 qua agent-browser (không thuộc repo).
# Dùng: bash ui-journal-flow.sh
set -u
cd "$(dirname "$0")"

FRONT="http://localhost:5173"
SNAP=ab-snap.txt

ab() { agent-browser "$@" >/dev/null 2>&1; }

login() {
  echo "== Đăng nhập =="
  ab open "$FRONT/login"
  sleep 2
  ab fill "#email" "$1"
  ab fill "#password" "$2"
  ab click "button[type=submit]"
  sleep 2.5
  echo "   url: $(agent-browser get url 2>/dev/null | tail -1)"
}

# Chọn một mục trong Radix Select: mở trigger, snapshot lấy ref của option, click.
pick() {
  ab click "$1"
  sleep 1
  agent-browser snapshot -i > "$SNAP" 2>/dev/null
  local ref
  ref=$(grep -m1 "option \"$2" "$SNAP" | sed -n 's/.*ref=\(e[0-9]*\).*/\1/p')
  echo "   chọn [$2] -> @$ref"
  ab click "@$ref"
  sleep 1
}

set_date() {
  agent-browser eval "(function(){var el=document.getElementById('$1');var s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(el,'$2');el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return el.value;})()" >/dev/null 2>&1
}

login "admin@example.com" "Admin@12345"

echo "== Mở form lập bút toán =="
ab open "$FRONT/journals"
sleep 2.5
ab find role button click --name "Lập bút toán"
sleep 1.5
echo "   dialog: $(agent-browser get count '[role=dialog]' 2>/dev/null | tail -1)"

set_date journal-date "2026-02-15"
ab fill "#journal-description" "Bán hàng thu tiền mặt (kiểm thử UI)"
ab fill "#journal-reference" "HD-UI-001"

pick 'button[aria-label="Dòng 1 — tài khoản"]' '111 —'
pick 'button[aria-label="Dòng 2 — tài khoản"]' '511 —'

ab fill "#journal-line-0-debit" "1500000"
ab fill "#journal-line-1-credit" "1500000"
sleep 0.8
agent-browser screenshot form-ready.png >/dev/null 2>&1

echo "== Lưu nháp =="
ab scrollintoview 'button[form="journal-form"]'
sleep 0.4
ab click 'button[form="journal-form"]'
sleep 3
agent-browser screenshot after-create.png >/dev/null 2>&1
echo "   dialog sau lưu: $(agent-browser get count '[role=dialog]' 2>/dev/null | tail -1)"
agent-browser errors 2>/dev/null | tail -5
