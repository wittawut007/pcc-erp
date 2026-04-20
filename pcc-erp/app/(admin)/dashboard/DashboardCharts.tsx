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
}

export default function DashboardCharts({ dailyData, weeklyData }: DashboardChartsProps) {
  const daily = useRef<HTMLCanvasElement>(null)
  const weekly = useRef<HTMLCanvasElement>(null)

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
    }
    load()
  }, [dailyData, weeklyData])

  return (
    <>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>แผนการผลิตรายวัน วันนี้ (แยกตามหมวดหมู่)</span>
        </div>
        <div style={{ height: 200, width: '100%' }}>
          <canvas ref={daily}></canvas>
        </div>
      </div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>ผลการผลิตย้อนหลัง 6 วัน (แยกตามหมวดหมู่)</span>
        </div>
        <div style={{ height: 250, width: '100%' }}>
          <canvas ref={weekly}></canvas>
        </div>
      </div>
    </>
  )
}
