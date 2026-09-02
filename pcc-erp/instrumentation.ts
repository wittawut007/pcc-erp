/**
 * Next.js Server Lifecycle Instrumentation
 * ทำงานเมื่อ Next.js Server เริ่มต้นทำงาน (Server Startup)
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initBackupScheduler } = await import('@/lib/backup-scheduler')
    initBackupScheduler()
  }
}
