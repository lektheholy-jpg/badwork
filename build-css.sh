#!/bin/sh
# สร้าง css/style.min.css จาก css/style.css (แก้ที่ style.css เท่านั้น — .min เป็นไฟล์ที่สร้างขึ้น ห้ามแก้มือ)
#   ./build-css.sh           ตรวจกฎ แล้วสร้าง css/style.min.css
#   ./build-css.sh --check   ตรวจกฎ + ตรวจว่า .min ตรงกับ style.css (ไม่เขียนไฟล์) ใช้ใน CI / ก่อน deploy
# เครื่องมือ (csso-cli, postcss) ล็อกเวอร์ชันไว้ใน package.json + package-lock.json จึงได้ผลลัพธ์เดิมทุกครั้ง
set -e
cd "$(dirname "$0")"

# ติดตั้งเมื่อยังไม่มี หรือเวอร์ชันที่ติดตั้งไม่ตรงกับที่ล็อกไว้
if ! npm ls csso-cli postcss >/dev/null 2>&1; then
  if [ -f package-lock.json ]; then npm ci --no-audit --no-fund --silent
  else npm install --no-audit --no-fund --silent; fi
fi

node tools/check-inline.js
node tools/check-sw.js
node tools/check-css.js css/style.css
node tools/split-css.js --verify

SRC=css/style.css
CSSO="node_modules/.bin/csso"

# แยก style.css ตาม /* @bundle … */ แล้วย่อทีละก้อน (ดู tools/split-css.js)
#   core.css → css/style.min.css (โหลดตอนเปิดแอป) · docs.css → css/docs.min.css (โหลดตอนเปิดหน้าระบบเอกสาร)
PARTS="$(mktemp -d)"
trap 'rm -rf "$PARTS"' EXIT
node tools/split-css.js "$PARTS" >/dev/null

# ชื่อไฟล์ที่ได้: core → css/style.min.css · ชื่ออื่น → css/<ชื่อ>.min.css
out_of() { if [ "$1" = "core" ]; then echo css/style.min.css; else echo "css/$1.min.css"; fi; }

STATUS=0
for part in "$PARTS"/*.css; do
  name="$(basename "$part" .css)"
  OUT="$(out_of "$name")"
  if [ "$1" = "--check" ]; then
    TMP="$(mktemp)"
    "$CSSO" "$part" --no-restructure -o "$TMP"
    if cmp -s "$TMP" "$OUT"; then echo "✓ $OUT ตรงกับ $SRC"
    else echo "✗ $OUT ไม่ตรงกับ $SRC — รัน ./build-css.sh แล้ว commit ไฟล์ .min ด้วย" >&2; STATUS=1; fi
    rm -f "$TMP"
  else
    "$CSSO" "$part" --no-restructure -o "$OUT"
    echo "✓ สร้าง $OUT แล้ว"
  fi
done
exit $STATUS
