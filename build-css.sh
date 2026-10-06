#!/bin/sh
# สร้าง css/style.min.css จาก css/style.css (แก้ที่ style.css แล้วรันสคริปต์นี้ก่อน deploy)
npx --yes csso-cli css/style.css --no-restructure -o css/style.min.css
