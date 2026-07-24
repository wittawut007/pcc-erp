# ROLE

You are a Senior DevOps Engineer, Senior Backend Engineer, and Solution Architect.

Your task is to migrate an existing production system from:

- Next.js
- Vercel
- Supabase Cloud

to

- Ubuntu 24.04 LTS VPS
- Self-hosted Supabase
- GitHub Actions Auto Deploy

The migration must preserve all existing functionality while minimizing downtime.

---

# CURRENT SYSTEM

Frontend / Backend

- Next.js (App Router)
- TypeScript
- Tailwind CSS

Hosting

- Vercel

Database

- Supabase PostgreSQL

Authentication

- Supabase Auth

Storage

- Supabase Storage

Repository

- GitHub

Deployment

Developer

↓

git commit

↓

git push

↓

Vercel Auto Deploy

---

# TARGET SYSTEM

Everything must run on a single Ubuntu 24 LTS VPS.

Architecture

Internet
    │
Cloudflare (Optional)
    │
Nginx Reverse Proxy
    │
────────────────────────────────────────────
│
├── Next.js (PM2)
│
├── Docker Engine
│      │
│      ├── Self-hosted Supabase
│      │      ├── PostgreSQL
│      │      ├── Auth
│      │      ├── Storage
│      │      ├── Realtime
│      │      ├── Kong
│      │      ├── Studio
│      │      └── Meta
│      │
│      └── Future Containers
│             ├── Redis
│             ├── n8n
│             ├── AI Services
│             └── Monitoring
│
└── Backup

---

# OBJECTIVES

The migration must achieve the following goals.

✓ Reduce monthly operating cost

✓ Own all company data

✓ Self-host every critical service

✓ Improve performance by keeping application and database on the same server

✓ Maintain current developer workflow

✓ Minimize code changes

✓ Production-ready

---

# DEVELOPMENT WORKFLOW

Developer

↓

Edit Code

↓

Git Commit

↓

Git Push

↓

GitHub Actions

↓

SSH to VPS

↓

git pull

↓

npm install

↓

npm run build

↓

pm2 restart

↓

Deploy Complete

This workflow should replace Vercel deployment.

---

# SELF-HOST SUPABASE

Use the official Self-hosted Supabase architecture.

Docker Containers should include

- PostgreSQL
- Kong
- Auth
- Storage
- Realtime
- Studio
- Meta
- ImgProxy

Do not redesign Supabase.

Use the official deployment method.

---

# NEXT.JS

Next.js should NOT run inside Docker.

Run using

Node.js LTS

+

PM2

Reasons

- easier deployment
- easier debugging
- faster restart
- lower resource usage

---

# DATABASE

Current

Supabase PostgreSQL

Target

Self-host PostgreSQL

Requirements

- migrate all schema
- migrate tables
- migrate indexes
- migrate constraints
- migrate triggers
- migrate sequences
- migrate all data

---

# AUTHENTICATION

Current

Supabase Auth

Target

Self-host Supabase Auth

No changes to authentication logic.

Existing features must continue working.

- Login
- Logout
- Session
- JWT
- Reset Password
- Email Verification

---

# STORAGE

Current

Supabase Storage

Target

Self-host Storage

Requirements

Migrate

- Buckets
- Files
- Metadata
- Access Policies

No application code should require major modification.

---

# ENVIRONMENT VARIABLES

Move all environment variables from Vercel to Ubuntu.

Store securely.

Example

.env.production

Include

NEXT_PUBLIC_SUPABASE_URL

NEXT_PUBLIC_SUPABASE_ANON_KEY

SUPABASE_SERVICE_ROLE_KEY

DATABASE_URL

JWT_SECRET

SMTP

etc.

---

# NGINX

Configure

HTTPS

Reverse Proxy

Compression

Security Headers

Large File Upload

HTTP2

Caching

---

# SSL

Use

Let's Encrypt

Auto Renewal

---

# GITHUB ACTIONS

Implement complete CI/CD

Trigger

Push to main

Pipeline

SSH

↓

Pull

↓

Install

↓

Build

↓

Restart PM2

↓

Health Check

↓

Rollback if failed

---

# BACKUP

Implement automatic backup

Database

Daily pg_dump

Storage

Daily archive

Retention

30 days

Destination

External Storage

Examples

Google Drive

OneDrive

S3

Backblaze

---

# MONITORING

Prepare monitoring

CPU

RAM

Disk

Docker

PostgreSQL

Next.js

PM2

Logs

Alert

---

# SECURITY

Configure

UFW

Fail2Ban

SSH Key Authentication

Disable Password Login

Docker Network Isolation

Database not publicly exposed

Secure Environment Variables

---

# PERFORMANCE

Optimize

Node.js

PostgreSQL

Nginx

Docker

Linux

NVMe

Connection Pool

Caching

Compression

---

# DOCUMENTATION

Generate complete documentation.

Include

1. Architecture Diagram

2. Folder Structure

3. Docker Structure

4. Deployment Flow

5. Authentication Flow

6. Storage Flow

7. Database Flow

8. Backup Flow

9. Restore Flow

10. Disaster Recovery

11. Server Maintenance

12. CI/CD Flow

13. Upgrade Procedure

14. Security Checklist

15. Troubleshooting Guide

16. Production Checklist

---

# FINAL GOAL

The final system must provide the same developer experience as Vercel + Supabase Cloud while being completely self-hosted.

The system should be maintainable for at least the next 5–10 years and scalable for future services such as AI, Redis, n8n, OCR, Queue Workers, and Microservices.

Whenever recommending configuration, prioritize:

- Official best practices
- Long-term maintainability
- Security
- High performance
- Easy disaster recovery
- Minimal downtime during migration