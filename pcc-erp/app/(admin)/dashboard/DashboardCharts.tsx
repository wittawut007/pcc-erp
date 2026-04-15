'use client'

import { useEffect, useRef } from 'react'

export default function DashboardCharts() {
  const daily = useRef<HTMLCanvasElement>(null)
  const weekly = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const load = async () => {
      const { Chart, registerables } = await import('chart.js')
      Chart.register(...registerables)
      Chart.defaults.font.family = "'IBM Plex Sans Thai', sans-serif"
      Chart.defaults.color = '#6B6E85'

      if (daily.current) {
        const existing = Chart.getChart(daily.current)
        if (existing) existing.destroy()
        new Chart(daily.current.getContext('2d')!, {
          type: 'bar',
          data: {
            labels: ['A13 แผ่นพื้นตัน', 'A30 ผนังรั้ว', 'A35 รั้ว', 'A36 เสา/คาน', 'A41 เสาเข็ม', 'A42 กำแพง'],
            datasets: [
              { label: 'แผนการผลิต (Plan)', data: [120, 90, 50, 70, 30, 20], backgroundColor: '#DBEAFE', borderRadius: 4 },
              { label: 'ผลิตได้จริง (Actual)', data: [100, 90, 10, 60, 25, 10], backgroundColor: '#2563EB', borderRadius: 4 },
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

      if (weekly.current) {
        const existing = Chart.getChart(weekly.current)
        if (existing) existing.destroy()
        new Chart(weekly.current.getContext('2d')!, {
          type: 'line',
          data: {
            labels: ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'],
            datasets: [
              { label: 'A13 แผ่นพื้นตัน', data: [80, 85, 90, 85, 95, 100], borderColor: '#2563EB', backgroundColor: '#2563EB', tension: 0.3, borderWidth: 2, pointRadius: 3 },
              { label: 'A30 ผนังรั้ว', data: [60, 65, 60, 70, 65, 90], borderColor: '#10B981', backgroundColor: '#10B981', tension: 0.3, borderWidth: 2, pointRadius: 3 },
              { label: 'A35 รั้ว', data: [20, 25, 20, 30, 25, 10], borderColor: '#F59E0B', backgroundColor: '#F59E0B', tension: 0.3, borderWidth: 2, pointRadius: 3 },
              { label: 'A41 เสาเข็ม', data: [40, 45, 50, 45, 55, 60], borderColor: '#8B5CF6', backgroundColor: '#8B5CF6', tension: 0.3, borderWidth: 2, pointRadius: 3 },
            ],
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
    }
    load()
  }, [])

  return (
    <>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>แผนการผลิตรายวัน วันนี้ (แยกตามหมวดหมู่)</span>
        </div>
        <div style={{ height: 200, width: '100%', marginTop: 10 }}>
          <canvas ref={daily}></canvas>
        </div>
      </div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>ผลการผลิตย้อนหลัง 6 วัน (แยกตามหมวดหมู่)</span>
        </div>
        <div style={{ height: 250, width: '100%', marginTop: 10 }}>
          <canvas ref={weekly}></canvas>
        </div>
      </div>
    </>
  )
}
