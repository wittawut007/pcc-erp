#!/bin/bash
# ============================================================
# PCC ERP — Hourly Auto-Backup Trigger for Ubuntu VPS Crontab
# ============================================================
#
# สคริปต์นี้จะถูกเรียกโดย Linux Crontab ทุกต้นชั่วโมง
# เพื่อส่งคำขอไปยัง Next.js API endpoint (/api/admin/backup/auto)
# ให้ระบบตรวจสอบเวลาที่ Admin ตั้งไว้ในหน้า Settings ว่าถึงรอบ Backup หรือยัง
# หากถึงเวลาแล้ว ระบบจะทำ Backup อัตโนมัติและบันทึกลง Database + Storage
#
# วิธีการติดตั้งใน Crontab (รันคำสั่ง crontab -e บน VPS):
# 0 * * * * /home/deploy/scripts/cron_auto_backup.sh >> /home/deploy/logs/auto_backup_cron.log 2>&1
# ============================================================

set -e

APP_DIR="/home/deploy/pcc-erp"
ENV_FILE="$APP_DIR/.env.local"

# อ่านค่า Environment Variables จาก .env.local (ถ้ามี)
if [ -f "$ENV_FILE" ]; then
  SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' "$ENV_FILE" | cut -d '=' -f2- | tr -d '"' | tr -d "'")
  CRON_SECRET=$(grep '^CRON_SECRET=' "$ENV_FILE" | cut -d '=' -f2- | tr -d '"' | tr -d "'")
fi

SECRET="${CRON_SECRET:-$SERVICE_ROLE_KEY}"
ENDPOINT="http://localhost:3000/api/admin/backup/auto"

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
echo "[$TIMESTAMP] [CRON TRIGGER] Checking auto backup at $ENDPOINT..."

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "$ENDPOINT" \
  -H "Authorization: Bearer $SECRET" \
  -H "Content-Type: application/json")

HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "[$TIMESTAMP] [CRON RESULT] HTTP $HTTP_CODE: $BODY"
