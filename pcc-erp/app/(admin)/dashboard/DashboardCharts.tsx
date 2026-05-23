'use client'

import { useEffect, useRef } from 'react'

interface DashboardChartsProps {
  dailyData?: {
    labels: string[]
    planData: number[]
    actualData: number[]
  }
  weeklyData?: {
    labels: string[]
    datasets: any[]
  }
  bedData?: {
    labels: string[]       // Bed names e.g. ['Bed 1','Bed 2',...]
    castData: number[]     // qty_cast per bed
    targetData: number[]   // qty_target per bed
    statusColors: string[] // color per bed based on dominant status
  }
  defectTrendData?: {
    labels: string[]
    datasets: any[]
  }
  renderGroup?: 'analytics' | 'quality'
}

export default function DashboardCharts({ dailyData, weeklyData, bedData, defectTrendData, renderGroup }: DashboardChartsProps) {
  const daily = useRef<HTMLCanvasElement>(null)
  const weekly = useRef<HTMLCanvasElement>(null)
  const bed = useRef<HTMLCanvasElement>(null)
  const defectTrend = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const load = async () => {
      const { Chart, registerables } = await import('chart.js')
      Chart.register(...registerables)
      Chart.defaults.font.family = "'IBM Plex Sans Thai', sans-serif"
      Chart.defaults.color = '#6B6E85'

      if (daily.current && dailyData) {
        const existing = Chart.getChart(daily.current)
        if (existing) existing.destroy()
        new Chart(daily.current.getContext('2d')!, {
          type: 'bar',
          data: {
            labels: dailyData.labels.length > 0 ? dailyData.labels : ['ไม่มีข้อมูล'],
            datasets: [
              { label: 'แผนการผลิต (Plan)', data: dailyData.labels.length > 0 ? dailyData.planData : [0], backgroundColor: '#DBEAFE', borderRadius: 4 },
              { label: 'ผลิตได้จริง (Actual)', data: dailyData.labels.length > 0 ? dailyData.actualData : [0], backgroundColor: '#2563EB', borderRadius: 4 },
            ],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } },
            scales: {
              y: { beginAtZero: true, border: { display: false }, grid: { color: '#EBEBF0' } },
              x: { border: { display: false }, grid: { display: false } },
            },
          },
        })
      }

      if (weekly.current && weeklyData) {
        const existing = Chart.getChart(weekly.current)
        if (existing) existing.destroy()
        new Chart(weekly.current.getContext('2d')!, {
          type: 'line',
          data: {
            labels: weeklyData.labels.length > 0 ? weeklyData.labels : ['ไม่มีข้อมูล'],
            datasets: weeklyData.datasets.length > 0 ? weeklyData.datasets : [{ label: 'ไม่มีข้อมูล', data: [0], borderColor: '#CBD5E1' }],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } },
              tooltip: { mode: 'index', intersect: false },
            },
            scales: {
              y: { beginAtZero: true, border: { display: false }, grid: { color: '#EBEBF0' } },
              x: { border: { display: false }, grid: { display: false } },
            },
            interaction: { mode: 'nearest', axis: 'x', intersect: false },
          },
        })
      }

      if (bed.current && bedData && bedData.labels.length > 0) {
        const existing = Chart.getChart(bed.current)
        if (existing) existing.destroy()
        new Chart(bed.current.getContext('2d')!, {
          type: 'bar',
          data: {
            labels: bedData.labels,
            datasets: [
              {
                label: 'เป้าหมาย (Target)',
                data: bedData.targetData,
                backgroundColor: '#E0E7FF',
                borderRadius: 4,
                borderSkipped: false,
              },
              {
                label: 'ผลิตแล้ว',
                data: bedData.castData,
                backgroundColor: bedData.statusColors,
                borderRadius: 4,
                borderSkipped: false,
              },
            ],
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } },
              tooltip: {
                callbacks: {
                  afterBody: (items: any[]) => {
                    const idx = items[0]?.dataIndex
                    if (idx === undefined) return []
                    const cast = bedData.castData[idx]
                    const target = bedData.targetData[idx]
                    const pct = target > 0 ? Math.round((cast / target) * 100) : 0
                    return [`ความคืบหน้า: ${pct}%`]
                  },
                },
              },
            },
            scales: {
              x: { beginAtZero: true, border: { display: false }, grid: { color: '#EBEBF0' } },
              y: { border: { display: false }, grid: { display: false } },
            },
          },
        })
      }

      if (defectTrend.current && defectTrendData) {
        const existing = Chart.getChart(defectTrend.current)
        if (existing) existing.destroy()
        const hasData = defectTrendData.datasets.some((ds: any) => ds.data.some((v: number) => v > 0))
        new Chart(defectTrend.current.getContext('2d')!, {
          type: 'line',
          data: {
            labels: defectTrendData.labels,
            datasets: hasData ? defectTrendData.datasets : [{ label: 'ไม่มีข้อมูลของเสีย', data: [0,0,0,0,0,0], borderColor: '#CBD5E1', fill: false }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } },
              tooltip: { mode: 'index', intersect: false },
            },
            scales: {
              y: { beginAtZero: true, border: { display: false }, grid: { color: '#EBEBF0' }, ticks: { precision: 0 } },
              x: { border: { display: false }, grid: { display: false } },
            },
            interaction: { mode: 'nearest', axis: 'x', intersect: false },
          },
        })
      }
    }
    load()
  }, [dailyData, weeklyData, bedData, defectTrendData])

  return (
    <>
      {(!renderGroup || renderGroup === 'analytics') && dailyData && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>แผนการผลิตรายวัน วันนี้ (แยกตามหมวดหมู่)</span>
          </div>
          <div style={{ height: 280, width: '100%' }}>
            <canvas ref={daily}></canvas>
          </div>
        </div>
      )}
      {(!renderGroup || renderGroup === 'analytics') && weeklyData && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>ผลการผลิตย้อนหลัง 6 วัน (แยกตามหมวดหมู่)</span>
          </div>
          <div style={{ height: 250, width: '100%' }}>
            <canvas ref={weekly}></canvas>
          </div>
        </div>
      )}
      {(!renderGroup || renderGroup === 'quality') && defectTrendData && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, marginBottom: renderGroup === 'quality' ? 16 : 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>แนวโน้มของเสีย 6 วัน (Defect Trend)</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <i className="fas fa-chart-area" style={{ color: '#EF4444', fontSize: 10 }} />
              แยกตามประเภทของเสีย
            </span>
          </div>
          <div style={{ height: 220, width: '100%' }}>
            <canvas ref={defectTrend}></canvas>
          </div>
        </div>
      )}
      {(!renderGroup || renderGroup === 'analytics') && bedData && bedData.labels.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>ประสิทธิภาพรายโรงผลิต</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>6 วันย้อนหลัง</span>
          </div>
          <div style={{ height: Math.max(180, bedData.labels.length * 38), width: '100%' }}>
            <canvas ref={bed}></canvas>
          </div>
          {/* Legend: สีตามสถานะ */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            {[
              { color: '#10B981', label: 'ถอดแบบ / QC ตรวจสอบแล้ว' },
              { color: '#8B5CF6', label: 'กำลังบ่ม / พร้อมถอดแบบ' },
              { color: '#2563EB', label: 'กำลังเท' },
              { color: '#F59E0B', label: 'สั่งคอนกรีต' },
              { color: '#9CA3AF', label: 'รอเริ่ม' },
            ].map(l => (
              <div key={l.color} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color, flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
