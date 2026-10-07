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

SRC=css/style.css
OUT=css/style.min.css
CSSO="node_modules/.bin/csso"

if [ "$1" = "--check" ]; then
  TMP="$(mktemp)"
  "$CSSO" "$SRC" --no-restructure -o "$TMP"
  if cmp -s "$TMP" "$OUT"; then
    rm -f "$TMP"; echo "✓ $OUT ตรงกับ $SRC"
  else
    rm -f "$TMP"; echo "✗ $OUT ไม่ตรงกับ $SRC — รัน ./build-css.sh แล้ว commit ไฟล์ .min ด้วย" >&2; exit 1
  fi
else
  "$CSSO" "$SRC" --no-restructure -o "$OUT"
  echo "✓ สร้าง $OUT แล้ว"
fi
