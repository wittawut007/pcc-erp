'use client'

import React, { useEffect, useState, useTransition } from 'react'
import { getFgPrintData } from '@/app/actions/fg'
import FgPrintClient from '@/app/(admin)/inventory/fg/print/[orderId]/FgPrintClient'
import toast from 'react-hot-toast'

interface FgDocumentModalProps {
  isOpen: boolean
  onClose: () => void
  orderId: string | null
}

export default function FgDocumentModal({
  isOpen,
  onClose,
  orderId
}: FgDocumentModalProps) {
  const [printData, setPrintData] = useState<any | null>(null)
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
    if (!isOpen || !orderId) {
      setPrintData(null)
      return
    }

    startTransition(async () => {
      try {
        const data = await getFgPrintData(orderId)
        setPrintData(data)
      } catch (err: any) {
        toast.error('ไม่สามารถโหลดข้อมูลเอกสารได้: ' + err.message)
        onClose()
      }
    })
  }, [isOpen, orderId, onClose])

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
        <FgPrintClient onClose={onClose} {...printData} />
      )}
    </div>
  )
}
