import { Loader2 } from 'lucide-react'

export default function Loading() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-50/60 dark:bg-slate-900/60 backdrop-blur-sm transition-all duration-300">
      <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-white/80 dark:bg-slate-800/80 shadow-xl border border-slate-100 dark:border-slate-700/50">
        <div className="relative">
          {/* Animated glow ring behind spinner */}
          <div className="absolute inset-0 rounded-full bg-blue-500/20 blur-md animate-pulse"></div>
          {/* Main spinner icon */}
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex flex-col items-center text-center">
          <p className="text-base font-semibold text-slate-800 dark:text-slate-100 animate-pulse font-sans">
            กำลังโหลดข้อมูล...
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-sans">
            กรุณารอสักครู่ ระบบกำลังประมวลผล
          </p>
        </div>
      </div>
    </div>
  )
}
