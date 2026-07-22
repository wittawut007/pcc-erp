'use client'

import React, { useEffect, useState, useTransition } from 'react'
import { getProductionOrderPrintData } from '@/app/actions/planner'
import ProductionOrderPrintClient from '@/app/(admin)/production-order/[planId]/ProductionOrderPrintClient'
import toast from 'react-hot-toast'

type ProductionOrderPrintData = Awaited<ReturnType<typeof getProductionOrderPrintData>>

interface PoDocumentModalProps {
  isOpen: boolean
  onClose: () => void
  planId: string | null
}

export default function PoDocumentModal({
  isOpen,
  onClose,
  planId
}: PoDocumentModalProps) {
  const [printData, setPrintData] = useState<ProductionOrderPrintData | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !planId) return

    let isCancelled = false
    startTransition(async () => {
      setPrintData(null)
      try {
        const data = await getProductionOrderPrintData(planId)
        if (!isCancelled) {
          setPrintData(data)
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'
          toast.error('ไม่สามารถโหลดข้อมูลเอกสารได้: ' + message)
          onClose()
        }
      }
    })

    return () => {
      isCancelled = true
    }
  }, [isOpen, planId, onClose])

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        backdropFilter: 'blur(4px)',
      }}
    >
      {isPending && (
        <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', gap: 12 }}>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: 32 }} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>กำลังเตรียมเอกสาร...</span>
        </div>
      )}
      {!isPending && printData && (
        <ProductionOrderPrintClient onClose={onClose} {...printData} />
      )}
    </div>
  )
}
