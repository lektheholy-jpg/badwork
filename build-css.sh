#!/bin/sh
# สร้าง css/style.min.css จาก css/style.css (แก้ที่ style.css แล้วรันสคริปต์นี้ก่อน deploy)
# 1) ตรวจว่าไม่มีกฎซ้อนทับ  2) minify
set -e
cd "$(dirname "$0")"
[ -d tools/node_modules/postcss ] || npm install --prefix tools --no-save --no-audit --no-fund --silent postcss
node tools/check-css.js css/style.css
npx --yes csso-cli css/style.css --no-restructure -o css/style.min.css
