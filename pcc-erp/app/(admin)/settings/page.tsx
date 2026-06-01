import Header from '@/components/layout/Header'
import SettingsClient from './SettingsClient'
import { getSystemStatsAction } from '@/app/actions/settings'

export const metadata = {
  title: 'Settings — PCC ERP',
  description: 'ตั้งค่าระบบสำหรับ Admin',
}

export default async function SettingsPage() {
  const { data: stats, error: statsError } = await getSystemStatsAction()

  return (
    <>
      <Header title="Settings" subtitle="ตั้งค่าระบบ — เฉพาะ Admin" />
      <SettingsClient stats={stats ?? null} statsError={statsError} />
    </>
  )
}
