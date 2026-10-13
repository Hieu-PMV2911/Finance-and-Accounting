#!/usr/bin/env bash
# Kiểm thử vòng đời bút toán trên UI: nháp -> xác nhận -> ghi sổ -> đảo.
set -u
cd "$(dirname "$0")"
FRONT="http://localhost:5173"

ab() { agent-browser "$@" >/dev/null 2>&1; }
snap_ref() {  # $1 = grep pattern
  agent-browser snapshot -i > ab-snap2.txt 2>/dev/null
  grep -m1 "$1" ab-snap2.txt | sed -n 's/.*ref=\(e[0-9]*\).*/\1/p'
}
btn() { echo "   → nút: $1"; ab find role button click --name "$1"; sleep 2.5; }

ab open "$FRONT/journals"
sleep 3

echo "== 1. Danh sách bút toán =="
agent-browser screenshot ui-journal-list.png >/dev/null 2>&1

echo "== 2. Mở chi tiết bút toán nháp =="
REF=$(snap_ref 'button "Bán hàng thu tiền mặt (kiểm thử UI)"')
echo "   chi tiết @$REF"
ab click "@$REF"
sleep 2
agent-browser screenshot ui-journal-detail-draft.png >/dev/null 2>&1

echo "== 3. Xác nhận (draft -> approved) =="
btn "Xác nhận"
agent-browser screenshot ui-journal-approved.png >/dev/null 2>&1

echo "== 4. Ghi sổ (approved -> posted) =="
btn "Ghi sổ"
agent-browser screenshot ui-journal-posted.png >/dev/null 2>&1

echo "== 5. Đảo bút toán =="
btn "Đảo bút toán"
sleep 1.5
agent-browser screenshot ui-journal-reverse-dialog.png >/dev/null 2>&1
ab fill "#reverse-reason" "Kiểm thử UI: đảo để xác minh luồng điều chỉnh"
sleep 0.6
agent-browser screenshot ui-journal-reverse-filled.png >/dev/null 2>&1
btn "Xác nhận đảo"
sleep 1.5
agent-browser screenshot ui-journal-after-reverse.png >/dev/null 2>&1

echo "== 6. Danh sách sau cùng =="
ab open "$FRONT/journals"
sleep 3
agent-browser screenshot ui-journal-final.png >/dev/null 2>&1
agent-browser errors 2>/dev/null | tail -5
echo "DONE"
