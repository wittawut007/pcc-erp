'use client'

import React, { useEffect } from 'react'
import MaterialDocumentPrintClient from '@/app/(admin)/material/MaterialDocumentPrintClient'

interface MaterialDocumentModalProps {
  isOpen: boolean
  onClose: () => void
  orderNumber: string
  date: string
  time: string
  userFullName: string
  totalConcrete: number
  planItems: any[]
}

export default function MaterialDocumentModal({
  isOpen,
  onClose,
  ...printProps
}: MaterialDocumentModalProps) {
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
      <MaterialDocumentPrintClient onClose={onClose} {...printProps} />
    </div>
  )
}
