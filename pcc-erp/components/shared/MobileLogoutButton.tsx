'use client'

import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

export default function MobileLogoutButton() {
  const supabase = createClient()

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
      // Hard redirect — avoids Next.js router "Failed to fetch" race after signOut
      window.location.href = '/login'
    } catch (e: any) {
      toast.error('เกิดข้อผิดพลาดในการออกจากระบบ')
    }
  }

  return (
    <button
      onClick={handleLogout}
      className="flex items-center justify-center bg-red-50 text-red-600 rounded-full border-none cursor-pointer transition-transform active:scale-95"
      style={{
        width: '38px',
        height: '38px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}
      title="ออกจากระบบ"
    >
      <i className="fas fa-sign-out-alt text-lg"></i>
    </button>
  )
}
