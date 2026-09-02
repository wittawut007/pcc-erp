# 🖥️ คู่มือการตั้งค่า VPS — PCC ERP Migration Guide
### จาก Vercel + Supabase Cloud → Ubuntu 24.04 LTS + Self-hosted Supabase

> [!IMPORTANT]
> **อ่านก่อนเริ่ม:** คู่มือนี้ใช้คำสั่งทั้งหมดที่พิมพ์เข้าไปใน Terminal ของ VPS (ผ่าน SSH) ไม่ใช่บนเครื่อง Mac
> ทุกบรรทัดที่ขึ้นต้นด้วย `$` คือคำสั่งที่ต้องพิมพ์เข้าไป

---

## 📊 สรุปภาพรวมขั้นตอนทั้งหมด

```
Phase 1  → เตรียม VPS (Ubuntu Setup, Security)
Phase 2  → ติดตั้ง Dependencies (Node, Docker, Nginx, PM2)
Phase 3  → Self-hosted Supabase (Docker)
Phase 4  → Migrate ฐานข้อมูล (PostgreSQL Data + Storage)
Phase 5  → Deploy Next.js (PM2)
Phase 6  → Nginx + SSL
Phase 7  → GitHub Actions CI/CD
Phase 8  → Backup Script
Phase 9  → Monitoring
Phase 10 → ทดสอบและ Go Live
```

---

## ─── PHASE 1: เตรียม VPS ─────────────────────────────

### 1.1 เข้า SSH ครั้งแรก

```bash
# จากเครื่อง Mac ของเรา — เชื่อมต่อไปยัง VPS
$ ssh root@<VPS_IP_ADDRESS>

# ตัวอย่าง
$ ssh root@123.456.789.10
```

### 1.2 อัปเดตระบบ Ubuntu

```bash
$ apt update && apt upgrade -y
$ apt install -y curl wget git unzip software-properties-common build-essential
```

### 1.3 สร้าง User ใหม่ (ห้ามใช้ root ตลอด)

```bash
# สร้าง user ชื่อ deploy
$ adduser deploy

# ให้สิทธิ์ sudo
$ usermod -aG sudo deploy

# เพิ่มเข้ากลุ่ม docker (ทำได้หลังติดตั้ง Docker แล้ว)
$ usermod -aG docker deploy
```

### 1.4 ตั้งค่า SSH Key (ห้ามใช้ Password Login)

```bash
# บน Mac ของเรา — สร้าง SSH Key ถ้ายังไม่มี
$ ssh-keygen -t ed25519 -C "pcc-erp-vps"

# Copy public key ไปยัง VPS
$ ssh-copy-id -i ~/.ssh/id_ed25519.pub deploy@<VPS_IP>

# ทดสอบ Login ด้วย Key
$ ssh deploy@<VPS_IP>
```

```bash
# บน VPS — ปิด Password Login
$ sudo nano /etc/ssh/sshd_config

# แก้ไข / เพิ่มบรรทัดเหล่านี้:
PasswordAuthentication no
PubkeyAuthentication yes
PermitRootLogin no

# บันทึกและ restart SSH
$ sudo systemctl restart sshd
```

### 1.5 ตั้งค่า Firewall (UFW)

```bash
$ sudo ufw default deny incoming
$ sudo ufw default allow outgoing

# Allow SSH
$ sudo ufw allow 22/tcp

# Allow HTTP + HTTPS
$ sudo ufw allow 80/tcp
$ sudo ufw allow 443/tcp

# เปิด UFW
$ sudo ufw enable

# ตรวจสอบสถานะ
$ sudo ufw status verbose
```

### 1.6 ติดตั้ง Fail2Ban (ป้องกัน Brute Force)

```bash
$ sudo apt install -y fail2ban

$ sudo nano /etc/fail2ban/jail.local
```

```ini
# เนื้อหาของ /etc/fail2ban/jail.local
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port    = 22
```

```bash
$ sudo systemctl enable fail2ban
$ sudo systemctl start fail2ban
$ sudo fail2ban-client status sshd
```

---

## ─── PHASE 2: ติดตั้ง Dependencies ────────────────────

### 2.1 ติดตั้ง Node.js LTS (v22 — ตรงกับที่ Next.js 16 ต้องการ)

```bash
$ curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
$ sudo apt install -y nodejs

# ตรวจสอบ version
$ node -v   # ควรได้ v22.x.x
$ npm -v    # ควรได้ 10.x.x
```

### 2.2 ติดตั้ง PM2 (Process Manager)

```bash
$ sudo npm install -g pm2

# ให้ PM2 start อัตโนมัติเมื่อ VPS reboot
$ pm2 startup systemd -u deploy --hp /home/deploy
$ sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u deploy --hp /home/deploy
```

### 2.3 ติดตั้ง Docker Engine

```bash
# เพิ่ม Docker repository
$ sudo install -m 0755 -d /etc/apt/keyrings
$ curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
$ sudo chmod a+r /etc/apt/keyrings/docker.gpg

$ echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

$ sudo apt update
$ sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# ให้ user deploy ใช้ docker ได้ไม่ต้อง sudo
$ sudo usermod -aG docker deploy
$ newgrp docker

# ทดสอบ
$ docker --version
$ docker compose version
```

### 2.4 ติดตั้ง Nginx

```bash
$ sudo apt install -y nginx
$ sudo systemctl enable nginx
$ sudo systemctl start nginx

# ทดสอบ
$ curl http://localhost
```

---

## ─── PHASE 3: Self-hosted Supabase ────────────────────

### 3.1 Clone Official Supabase Docker

```bash
# Switch เป็น user deploy
$ su - deploy

# สร้าง directory สำหรับ Supabase
$ mkdir -p /home/deploy/supabase
$ cd /home/deploy/supabase

# ดาวน์โหลด Official Supabase Self-hosted
$ git clone --depth 1 https://github.com/supabase/supabase
$ cd supabase/docker

# Copy ตัวอย่าง env
$ cp .env.example .env
```

### 3.2 แก้ไข Supabase Environment

```bash
$ nano .env
```

```env
# ── ค่าที่ต้องแก้ไขทุกตัว ──

# Generate ด้วย: openssl rand -base64 32
POSTGRES_PASSWORD=<STRONG_RANDOM_PASSWORD>

# Generate ด้วย: openssl rand -base64 32
JWT_SECRET=<STRONG_JWT_SECRET_32_CHARS_MIN>

# Generate ด้วย: node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
ANON_KEY=<NEW_ANON_KEY>
SERVICE_ROLE_KEY=<NEW_SERVICE_ROLE_KEY>

# Domain ของ VPS เรา
SITE_URL=https://erp.pccpostention.com
API_EXTERNAL_URL=https://erp.pccpostention.com

# Dashboard Password
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=<STRONG_DASHBOARD_PASSWORD>

# SMTP (สำหรับ Email Verification / Reset Password)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@pccpostention.com
SMTP_PASS=<GMAIL_APP_PASSWORD>
SMTP_SENDER_NAME=PCC ERP
```

### 3.3 รัน Supabase Docker

```bash
$ cd /home/deploy/supabase/docker
$ docker compose up -d

# ตรวจสอบว่า containers ทำงานครบ
$ docker compose ps

# ควรเห็น containers เหล่านี้ทั้งหมด:
# supabase-db, supabase-auth, supabase-rest
# supabase-realtime, supabase-storage, supabase-studio
# supabase-kong, supabase-meta, supabase-imgproxy
```

> [!NOTE]
> Supabase Studio จะเข้าได้ที่ `http://<VPS_IP>:3000` หลังจาก run แล้ว (ก่อนตั้งค่า Nginx)

---

## ─── PHASE 4: Migrate ฐานข้อมูล ──────────────────────

### 4.1 Export ข้อมูลจาก Supabase Cloud

```bash
# บนเครื่อง Mac — ติดตั้ง Supabase CLI
$ brew install supabase/tap/supabase

# Login
$ supabase login

# Export Schema + Data จาก Project เดิม
$ supabase db dump --db-url "postgresql://postgres.<PROJECT_REF>:<DB_PASSWORD>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres" \
  -f schema_dump.sql

# Export Data เฉพาะ (ไม่รวม system tables)
$ supabase db dump --db-url "postgresql://postgres.<PROJECT_REF>:<DB_PASSWORD>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres" \
  --data-only \
  -f data_dump.sql
```

> [!TIP]
> `<PROJECT_REF>` คือ `ywogqmduwvjwzpgwfhhl` ดูได้จาก `.env.local` ของเรา

### 4.2 Copy ไฟล์ Dump ไปยัง VPS

```bash
# บนเครื่อง Mac
$ scp schema_dump.sql data_dump.sql deploy@<VPS_IP>:/home/deploy/
```

### 4.3 Import เข้า Self-hosted PostgreSQL

```bash
# บน VPS — หา container name ของ PostgreSQL
$ docker ps | grep postgres

# Import Schema
$ docker exec -i supabase-db psql -U postgres -d postgres < /home/deploy/schema_dump.sql

# Import Data
$ docker exec -i supabase-db psql -U postgres -d postgres < /home/deploy/data_dump.sql

# ตรวจสอบ
$ docker exec -it supabase-db psql -U postgres -c "\dt"
```

### 4.4 Migrate Storage Files

```bash
# บนเครื่อง Mac — ดาวน์โหลดไฟล์จาก Supabase Cloud Storage
# ใช้ Supabase CLI
$ supabase storage ls --project-ref ywogqmduwvjwzpgwfhhl

# Download bucket job_photos
$ supabase storage cp -r "ss://job_photos" ./job_photos_backup \
  --project-ref ywogqmduwvjwzpgwfhhl

# Copy ไปยัง VPS
$ scp -r ./job_photos_backup deploy@<VPS_IP>:/home/deploy/

# บน VPS — Copy เข้า Supabase Storage volume
$ docker cp /home/deploy/job_photos_backup/. supabase-storage:/var/lib/storage/
```

---

## ─── PHASE 5: Deploy Next.js (PM2) ─────────────────────

### 5.1 Clone Repository ลงบน VPS

```bash
# บน VPS — Switch เป็น deploy user
$ su - deploy

# สร้าง SSH Key สำหรับ GitHub Deploy Key
$ ssh-keygen -t ed25519 -C "vps-github-deploy" -f ~/.ssh/github_deploy

# Copy public key
$ cat ~/.ssh/github_deploy.pub
# → นำไปเพิ่มใน GitHub → Repository → Settings → Deploy Keys

# Clone Repository
$ git clone git@github.com:<USERNAME>/pcc-erp.git /home/deploy/pcc-erp
$ cd /home/deploy/pcc-erp
```

### 5.2 สร้าง .env.production บน VPS

```bash
$ nano /home/deploy/pcc-erp/.env.production
```

```env
# ── PCC ERP Production Environment ──
NODE_ENV=production

# Self-hosted Supabase URL (เปลี่ยนเป็น domain VPS ของเรา)
NEXT_PUBLIC_SUPABASE_URL=https://erp.pccpostention.com

# Key ใหม่จาก Self-hosted Supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=<NEW_ANON_KEY_FROM_SELF_HOSTED>
SUPABASE_SERVICE_ROLE_KEY=<NEW_SERVICE_ROLE_KEY_FROM_SELF_HOSTED>

# Resource Limits (ปรับตามแผน VPS)
NEXT_PUBLIC_SUPABASE_TIER_NAME=Self-Hosted
NEXT_PUBLIC_SUPABASE_DB_SIZE_LIMIT=53687091200
NEXT_PUBLIC_SUPABASE_STORAGE_SIZE_LIMIT=107374182400
NEXT_PUBLIC_SUPABASE_AUTH_USERS_LIMIT=100000
```

### 5.3 Build และ Start ด้วย PM2

```bash
$ cd /home/deploy/pcc-erp
$ npm install
$ npm run build

# สร้าง ecosystem.config.js
$ nano /home/deploy/pcc-erp/ecosystem.config.js
```

```javascript
module.exports = {
  apps: [{
    name: 'pcc-erp',
    script: 'node_modules/.bin/next',
    args: 'start',
    cwd: '/home/deploy/pcc-erp',
    instances: 'max',
    exec_mode: 'cluster',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    max_memory_restart: '1G',
    error_file: '/home/deploy/logs/pcc-erp-error.log',
    out_file: '/home/deploy/logs/pcc-erp-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    watch: false,
    autorestart: true,
    restart_delay: 3000
  }]
}
```

```bash
# สร้าง directory สำหรับ logs
$ mkdir -p /home/deploy/logs

# Start ด้วย PM2
$ pm2 start ecosystem.config.js --env production

# บันทึกสถานะ PM2
$ pm2 save

# ตรวจสอบสถานะ
$ pm2 status
$ pm2 logs pcc-erp --lines 50
```

---

## ─── PHASE 6: Nginx + SSL ──────────────────────────────

### 6.1 สร้าง Nginx Config สำหรับ Next.js

```bash
$ sudo nano /etc/nginx/sites-available/pcc-erp
```

```nginx
# /etc/nginx/sites-available/pcc-erp

# Rate Limiting
limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;

server {
    listen 80;
    server_name erp.pccpostention.com;

    # Redirect HTTP → HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name erp.pccpostention.com;

    # SSL (จะถูกเติมโดย Certbot อัตโนมัติ)
    ssl_certificate     /etc/letsencrypt/live/erp.pccpostention.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/erp.pccpostention.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Gzip Compression
    gzip on;
    gzip_vary on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
    gzip_min_length 1024;

    # Large File Upload (สำหรับรูปถ่าย)
    client_max_body_size 50M;

    # Next.js App
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }

    # Supabase API (Self-hosted Kong)
    location /supabase/ {
        proxy_pass http://localhost:8000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;

        limit_req zone=api burst=50 nodelay;
    }

    # Next.js Static Files Cache
    location /_next/static/ {
        proxy_pass http://localhost:3000;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
```

```bash
# เปิดใช้งาน site
$ sudo ln -s /etc/nginx/sites-available/pcc-erp /etc/nginx/sites-enabled/

# ลบ default site
$ sudo rm /etc/nginx/sites-enabled/default

# ทดสอบ config
$ sudo nginx -t

# Reload Nginx
$ sudo systemctl reload nginx
```

### 6.2 ติดตั้ง SSL Certificate (Let's Encrypt)

> [!IMPORTANT]
> ต้องให้ DNS ชี้มาที่ IP ของ VPS ก่อน แล้วค่อย run คำสั่งนี้

```bash
# ติดตั้ง Certbot
$ sudo apt install -y certbot python3-certbot-nginx

# ขอ SSL Certificate
$ sudo certbot --nginx -d erp.pccpostention.com \
  --email admin@pccpostention.com \
  --agree-tos \
  --non-interactive

# ทดสอบ Auto Renewal
$ sudo certbot renew --dry-run

# ตั้ง cron สำหรับ Auto Renewal (ทำอัตโนมัติอยู่แล้ว แต่ตรวจสอบได้)
$ sudo crontab -l | grep certbot
```

---

## ─── PHASE 7: GitHub Actions CI/CD ────────────────────

### 7.1 ตั้งค่า GitHub Secrets

ไปที่ GitHub Repository → **Settings → Secrets and variables → Actions** → เพิ่ม Secrets:

| Secret Name | Value |
|---|---|
| `VPS_HOST` | IP Address ของ VPS |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | Private Key (`~/.ssh/id_ed25519` ทั้งหมด) |
| `VPS_PORT` | `22` |

```bash
# บนเครื่อง Mac — Copy Private Key เพื่อนำไปวางใน GitHub Secrets
$ cat ~/.ssh/id_ed25519
```

### 7.2 สร้าง GitHub Actions Workflow

```bash
# บนเครื่อง Mac — สร้างไฟล์ workflow
$ mkdir -p .github/workflows
$ nano .github/workflows/deploy.yml
```

```yaml
# .github/workflows/deploy.yml
name: 🚀 Deploy to VPS

on:
  push:
    branches: [main]

jobs:
  deploy:
    name: Deploy PCC ERP
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: ✅ Checkout code
        uses: actions/checkout@v4

      - name: 🚀 Deploy via SSH
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          port: ${{ secrets.VPS_PORT }}
          script: |
            set -e
            cd /home/deploy/pcc-erp

            echo "📥 Pulling latest code..."
            git pull origin main

            echo "📦 Installing dependencies..."
            npm ci --production=false

            echo "🔨 Building application..."
            npm run build

            echo "♻️ Restarting PM2..."
            pm2 reload ecosystem.config.js --env production

            echo "🏥 Health check..."
            sleep 5
            response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health)
            if [ "$response" != "200" ]; then
              echo "❌ Health check failed (HTTP $response) — Rolling back..."
              pm2 reload ecosystem.config.js --env production
              exit 1
            fi

            echo "✅ Deploy successful!"
            pm2 status
```

```bash
# Commit และ Push
$ git add .github/workflows/deploy.yml
$ git commit -m "feat: add GitHub Actions CD pipeline"
$ git push origin main
```

---

## ─── PHASE 8: Backup Script ────────────────────────────

### 8.1 สร้าง Backup Script อัตโนมัติ

```bash
# บน VPS
$ nano /home/deploy/scripts/backup.sh
$ chmod +x /home/deploy/scripts/backup.sh
```

```bash
#!/bin/bash
# /home/deploy/scripts/backup.sh
# Automatic daily backup for PCC ERP

set -e

DATE=$(date +%Y-%m-%d_%H-%M)
BACKUP_DIR="/home/deploy/backups"
DB_BACKUP="$BACKUP_DIR/db_${DATE}.sql.gz"
STORAGE_BACKUP="$BACKUP_DIR/storage_${DATE}.tar.gz"
RETENTION_DAYS=30

mkdir -p "$BACKUP_DIR"

echo "🗄️ [$(date)] Starting database backup..."
docker exec supabase-db pg_dump -U postgres postgres | gzip > "$DB_BACKUP"
echo "✅ Database backup: $DB_BACKUP"

echo "📁 [$(date)] Starting storage backup..."
docker run --rm \
  --volumes-from supabase-storage \
  -v "$BACKUP_DIR":/backup \
  ubuntu \
  tar czf /backup/storage_${DATE}.tar.gz /var/lib/storage
echo "✅ Storage backup: $STORAGE_BACKUP"

# ลบ backup ที่เก่าเกิน 30 วัน
echo "🧹 Cleaning backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete

echo "✅ [$(date)] Backup complete."
ls -lh "$BACKUP_DIR" | tail -10
```

### 8.2 การตั้งเวลา Backup อัตโนมัติ (เชื่อมกับหน้าตั้งค่าในระบบ ERP)

ระบบ PCC ERP รองรับการตั้งเวลา Backup อัตโนมัติได้จาก **หน้าตั้งค่า (Settings -> Backup)** โดยตรง:
1. **Next.js In-Process Scheduler (อัตโนมัติ):** เมื่อรันระบบผ่าน PM2 ตัว Next.js Server จะมี Scheduler ภายในตัว คอยตรวจเช็คเวลาไทยทุก 10 นาที หากถึงชั่วโมงที่ตั้งไว้ในหน้าจอจะทำ Backup ทันที และบันทึกประวัติให้ดาวน์โหลดได้
2. **Linux Crontab Trigger (แนะนำให้ตั้งไว้ควบคู่กันเพื่อความแม่นยำ 100%):**
```bash
# คัดลอกสคริปต์ไปยังโฟลเดอร์ scripts
$ cp /home/deploy/pcc-erp/scripts/cron_auto_backup.sh /home/deploy/scripts/
$ chmod +x /home/deploy/scripts/cron_auto_backup.sh

# เปิดแก้ไข crontab
$ crontab -e
```

เพิ่มคำสั่งนี้ลงใน crontab (รันทุกต้นชั่วโมงเพื่อเรียกตรวจตามเวลาที่ตั้งไว้ในหน้าเว็บ):
```cron
# PCC ERP — Hourly Auto Backup Check (รันตามเวลาที่ตั้งไว้ในหน้า Settings)
0 * * * * /home/deploy/scripts/cron_auto_backup.sh >> /home/deploy/logs/auto_backup_cron.log 2>&1

# (ทางเลือกเสริม) รัน pg_dump สำรองไฟล์ระดับ OS ไว้ที่เครื่องทุกวันเวลา 02:00 AM
0 2 * * * /home/deploy/scripts/backup.sh >> /home/deploy/logs/backup.log 2>&1
```

---

## ─── PHASE 9: Monitoring ────────────────────────────────

### 9.1 ตรวจสอบสถานะระบบด้วยคำสั่งทั่วไป

```bash
# ดู PM2 Status
$ pm2 status
$ pm2 monit

# ดู Resource Usage
$ htop

# ดู Docker Containers
$ docker stats

# ดู Disk Usage
$ df -h
$ du -sh /home/deploy/backups/*

# ดู Nginx Logs
$ sudo tail -f /var/log/nginx/access.log
$ sudo tail -f /var/log/nginx/error.log

# ดู PostgreSQL ใน Docker
$ docker exec -it supabase-db psql -U postgres -c "SELECT pg_size_pretty(pg_database_size('postgres'));"
```

### 9.2 ติดตั้ง Netdata (Optional — สำหรับ Dashboard Monitoring)

```bash
$ wget -O /tmp/netdata-install.sh https://get.netdata.cloud/kickstart.sh
$ sudo bash /tmp/netdata-install.sh

# เข้าดู Dashboard
# http://<VPS_IP>:19999
```

---

## ─── PHASE 10: ทดสอบและ Go Live ──────────────────────

### 10.1 Checklist ก่อน Go Live

```bash
# ✅ ทดสอบว่า Next.js ทำงาน
$ curl -s -o /dev/null -w "%{http_code}" https://erp.pccpostention.com
# ควรได้ 200

# ✅ ทดสอบ Supabase API
$ curl https://erp.pccpostention.com/supabase/rest/v1/ \
  -H "apikey: <ANON_KEY>"

# ✅ ตรวจสอบ SSL
$ curl -vI https://erp.pccpostention.com 2>&1 | grep -E "SSL|TLS|subject"

# ✅ ตรวจสอบ PM2
$ pm2 status

# ✅ ตรวจสอบ Docker
$ docker compose -f /home/deploy/supabase/docker/docker-compose.yml ps

# ✅ ตรวจสอบ Nginx
$ sudo systemctl status nginx

# ✅ ทดสอบ Login ระบบ
# เปิด Browser → https://erp.pccpostention.com/login
```

### 10.2 เปลี่ยน DNS (Go Live)

```
1. เข้า DNS Provider (Cloudflare / ผู้ให้บริการ Domain)
2. แก้ไข A Record:
   erp.pccpostention.com → <VPS_IP>
3. รอ DNS Propagate (5-30 นาที)
4. ทดสอบอีกครั้ง
```

### 10.3 หลัง Go Live — ปิด Supabase Cloud

> [!CAUTION]
> อย่าปิด Supabase Cloud ก่อนที่จะทดสอบระบบใหม่ให้แน่ใจอย่างน้อย 3-7 วัน

```
1. ทดสอบทุกฟีเจอร์ของระบบบน VPS ให้ครบ
2. ตรวจสอบ Activity Logs ว่าข้อมูลถูกบันทึกถูกต้อง
3. ตรวจสอบรูปถ่ายทั้งหมดยังแสดงผลได้
4. หลังจากมั่นใจแล้ว → Pause Supabase Cloud Project
```

---

## 🔧 คำสั่งที่ใช้บ่อยสำหรับการดูแลระบบ

```bash
# Restart Next.js
$ pm2 reload pcc-erp

# ดู Logs แบบ Realtime
$ pm2 logs pcc-erp

# Deploy ด้วยมือ (Emergency)
$ cd /home/deploy/pcc-erp && git pull && npm run build && pm2 reload pcc-erp

# Restart Supabase
$ cd /home/deploy/supabase/docker && docker compose restart

# Restore Database จาก Backup
$ gunzip -c /home/deploy/backups/db_2026-07-23.sql.gz | docker exec -i supabase-db psql -U postgres

# ดู Supabase Logs
$ docker compose -f /home/deploy/supabase/docker/docker-compose.yml logs -f --tail=50
```

---

## ⚠️ ข้อควรระวังสำคัญ

> [!CAUTION]
> **ANON_KEY และ SERVICE_ROLE_KEY** จากระบบ Self-hosted จะเป็นคนละค่ากับ Supabase Cloud ต้องอัปเดตใน `.env.production` บน VPS และใน GitHub Secrets ทุกครั้ง

> [!WARNING]
> **ห้าม** เก็บไฟล์ `.env.production` หรือ Backup Files ใน Git Repository โดยเด็ดขาด

> [!TIP]
> ก่อน Go Live จริง ควรทดสอบบน Staging Domain ก่อน เช่น `staging.pccpostention.com` ชี้ไปยัง VPS เดียวกัน แต่ใช้ข้อมูล test
