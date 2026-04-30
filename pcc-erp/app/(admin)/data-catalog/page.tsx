import { Metadata } from 'next'
import DataCatalogClient from './DataCatalogClient'

export const metadata: Metadata = {
  title: 'Data Catalog | PCC ERP',
  description: 'โครงสร้างฐานข้อมูลและความสัมพันธ์ในระบบ PCC ERP',
}

export default function DataCatalogPage() {
  return <DataCatalogClient />
}
