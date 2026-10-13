#!/usr/bin/env bash
# Hoàn tất luồng đảo bút toán trên UI (dùng JS click để tránh lỗi toạ độ của harness).
set -u
cd "$(dirname "$0")"
FRONT="http://localhost:5173"

ab() { agent-browser "$@" >/dev/null 2>&1; }

# Click theo toạ độ thật (mô phỏng người dùng) để xác minh nút có bấm được không.
realclick() {  # $1 = JS biểu thức trả về phần tử
  local raw x y
  raw=$(agent-browser eval "var b=$1; var r=b.getBoundingClientRect(); Math.round(r.left+r.width/2)+','+Math.round(r.top+r.height/2)" 2>/dev/null | tail -1)
  raw=${raw//\"/}
  raw=${raw//\'/}
  x=${raw%%,*}
  y=${raw##*,}
  echo "   toạ độ click: $x,$y"
  agent-browser mouse move "$x" "$y" >/dev/null 2>&1
  agent-browser mouse down >/dev/null 2>&1
  agent-browser mouse up >/dev/null 2>&1
}

ab open "$FRONT/journals"
sleep 3

echo "== Mở chi tiết bút toán đã ghi sổ =="
agent-browser snapshot -i > ab-r1.txt 2>/dev/null
R=$(grep -m1 'button "Bán hàng thu tiền mặt (kiểm thử UI)"' ab-r1.txt | sed -n 's/.*ref=\(e[0-9]*\).*/\1/p')
ab click "@$R"
sleep 2

echo "== Bấm 'Đảo bút toán' bằng chuột thật =="
realclick "Array.from(document.querySelectorAll('[role=dialog] button')).filter(x=>x.textContent.trim()==='Đảo bút toán')[0]"
sleep 2
echo "   #reverse-reason = $(agent-browser get count '#reverse-reason' 2>/dev/null | tail -1)"

ab fill "#reverse-reason" "Kiểm thử UI: đảo để xác minh luồng điều chỉnh"
sleep 0.6
agent-browser screenshot ui-rev-dialog.png >/dev/null 2>&1

echo "== Bấm 'Xác nhận đảo' bằng chuột thật =="
realclick "Array.from(document.querySelectorAll('[role=dialog] button')).filter(x=>x.textContent.trim()==='Xác nhận đảo')[0]"
sleep 3
echo "   dialog còn lại = $(agent-browser get count '[role=dialog]' 2>/dev/null | tail -1)"
agent-browser screenshot ui-after-reverse.png >/dev/null 2>&1

echo "== Tải lại danh sách =="
ab open "$FRONT/journals"
sleep 3
agent-browser screenshot ui-journal-final.png >/dev/null 2>&1
agent-browser errors 2>/dev/null | tail -5
echo DONE
