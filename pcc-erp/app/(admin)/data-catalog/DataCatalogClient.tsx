'use client'

import React, { useState } from 'react'
import { 
  Database, 
  Table, 
  Key, 
  Link as LinkIcon, 
  Info, 
  Search, 
  Layers, 
  Code2, 
  ChevronRight,
  Hash,
  Clock,
  CheckCircle2,
  AlertCircle
} from 'lucide-react'
import { DATABASE_CATALOG, TableDefinition, EnumDefinition } from '@/lib/constants/database-catalog'

export default function DataCatalogClient() {
  const [activeTab, setActiveTab] = useState<'tables' | 'enums' | 'erd'>('tables')
  const [selectedTable, setSelectedTable] = useState<TableDefinition | null>(DATABASE_CATALOG.tables[0])
  const [searchTerm, setSearchTerm] = useState('')

  const filteredTables = DATABASE_CATALOG.tables.filter(t => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    t.description.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const renderTablesTab = () => (
    <div className="flex flex-col lg:flex-row h-full gap-5">
      {/* Sidebar List */}
      <div className="w-full lg:w-72 flex flex-col gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-erp-text-muted" />
          <input
            type="text"
            placeholder="ค้นหาชื่อตาราง..."
            className="w-full pl-9 pr-4 py-2 bg-white border border-erp-border rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-erp-accent/10 transition-all shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="bg-white rounded-xl border border-erp-border overflow-hidden shadow-sm flex flex-col">
          <div className="p-3 bg-erp-bg border-b border-erp-border">
            <span className="text-[10px] font-bold text-erp-text-secondary uppercase tracking-widest">Database Tables</span>
          </div>
          <div className="max-h-[calc(100vh-340px)] overflow-y-auto">
            {filteredTables.map((table) => (
              <button
                key={table.name}
                onClick={() => setSelectedTable(table)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all border-b border-erp-border last:border-b-0 ${
                  selectedTable?.name === table.name 
                    ? 'bg-erp-accent-light text-erp-accent border-l-4 border-l-erp-accent font-bold' 
                    : 'hover:bg-erp-bg text-erp-text-secondary'
                }`}
              >
                <Table className={`w-3.5 h-3.5 ${selectedTable?.name === table.name ? 'text-erp-accent' : 'text-erp-text-muted'}`} />
                <span className="text-xs truncate">{table.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col gap-5">
        {selectedTable ? (
          <div className="fade-in flex flex-col gap-5">
            {/* Table Header Section */}
            <div className="bg-white p-5 rounded-xl border border-erp-border shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-erp-accent/10 rounded-xl flex items-center justify-center text-erp-accent">
                  <Table className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-erp-text-primary">{selectedTable.name}</h2>
                  <p className="text-xs text-erp-text-secondary mt-1 max-w-xl leading-relaxed">
                    {selectedTable.description}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <span className="px-3 py-1 bg-erp-bg rounded-lg border border-erp-border text-[10px] font-bold text-erp-text-muted uppercase tracking-wider">PGSQL</span>
                <span className="px-3 py-1 bg-erp-bg rounded-lg border border-erp-border text-[10px] font-bold text-erp-text-muted uppercase tracking-wider">Supabase</span>
              </div>
            </div>

            {/* Columns Table */}
            <div className="bg-white rounded-xl border border-erp-border shadow-sm overflow-hidden min-h-[400px]">
              <div className="px-5 py-4 border-b border-erp-border bg-erp-bg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-erp-accent" />
                  <h3 className="text-xs font-bold text-erp-text-primary uppercase tracking-wider">รายละเอียดคอลัมน์ (Column Definitions)</h3>
                </div>
                <span className="text-[10px] font-bold text-erp-text-muted bg-white px-2 py-1 rounded-md border border-erp-border">
                  {selectedTable.columns.length} COLUMNS
                </span>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left font-sans">
                  <thead>
                    <tr className="bg-erp-bg/50 border-b border-erp-border">
                      <th className="px-5 py-3 text-[10px] font-bold text-erp-text-secondary uppercase tracking-widest">Name</th>
                      <th className="px-5 py-3 text-[10px] font-bold text-erp-text-secondary uppercase tracking-widest">Data Type</th>
                      <th className="px-5 py-3 text-[10px] font-bold text-erp-text-secondary uppercase tracking-widest text-center">Constraints</th>
                      <th className="px-5 py-3 text-[10px] font-bold text-erp-text-secondary uppercase tracking-widest">Description</th>
                      <th className="px-5 py-3 text-[10px] font-bold text-erp-text-secondary uppercase tracking-widest">Relationship</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-erp-border/60">
                    {selectedTable.columns.map((column) => (
                      <tr key={column.name} className="hover:bg-erp-bg/40 transition-colors group">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-bold text-erp-text-primary group-hover:text-erp-accent transition-colors">{column.name}</span>
                            {column.name === 'id' && <Key className="w-3 h-3 text-amber-500 fill-amber-500/20" />}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 italic">
                          <span className="px-2 py-1 bg-erp-accent-light/50 text-[11px] font-mono font-bold text-erp-accent rounded-md border border-erp-accent/10 uppercase">
                            {column.type}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex flex-wrap gap-1.5 justify-center">
                            {!column.nullable && (
                              <span className="px-2 py-0.5 bg-red-50 text-red-500 rounded text-[9px] font-black border border-red-100 uppercase tracking-tighter">NN</span>
                            )}
                            {column.default && (
                              <span className="px-2 py-0.5 bg-green-50 text-green-600 rounded text-[9px] font-black border border-green-100 uppercase tracking-tighter">DEF</span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="text-xs text-erp-text-secondary font-medium leading-relaxed">
                            {column.description || '-'}
                          </p>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1">
                            {column.references ? (
                              <>
                                <LinkIcon className="w-3 h-3 text-erp-indigo opacity-60" />
                                <span className="text-[10px] font-bold text-erp-indigo bg-erp-indigo-light/30 px-2 py-1 rounded-md border border-erp-indigo/10">
                                  {column.references.table}.{column.references.column}
                                </span>
                              </>
                            ) : (
                              <span className="text-[10px] font-bold text-erp-text-muted bg-erp-bg px-2 py-1 rounded-md border border-erp-border">NONE</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-erp-text-muted py-20 grayscale opacity-40 bg-white rounded-xl border border-dashed border-erp-border">
            <Database className="w-16 h-16 mb-4 stroke-[1]" />
            <p className="text-sm font-bold uppercase tracking-widest text-erp-text-muted/60">เลือกตารางเพื่อดูรายละเอียดโครงสร้าง</p>
          </div>
        )}
      </div>
    </div>
  )

  const renderEnumsTab = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 fade-in">
      {DATABASE_CATALOG.enums.map((enm) => (
        <div key={enm.name} className="bg-white rounded-xl border border-erp-border shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-erp-border bg-erp-bg">
            <div className="flex items-center gap-2 mb-1.5">
              <Hash className="w-4 h-4 text-erp-accent" />
              <h3 className="font-bold text-xs text-erp-text-primary uppercase tracking-tight">{enm.name}</h3>
            </div>
            <p className="text-[11px] text-erp-text-secondary leading-normal font-medium">{enm.description}</p>
          </div>
          <div className="p-4 flex-1 bg-white">
            <div className="flex flex-wrap gap-1.5">
              {enm.values.map(val => (
                <span key={val} className="px-2.5 py-1 bg-erp-bg rounded-md border border-erp-border font-mono text-[11px] font-bold text-erp-text-primary hover:border-erp-accent hover:bg-erp-accent-light transition-all cursor-default">
                  {val}
                </span>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )

  const renderErdTab = () => (
    <div className="bg-white rounded-xl border border-erp-border shadow-sm p-10 min-h-[600px] flex flex-col items-center justify-center fade-in">
      <div className="max-w-4xl w-full text-center mb-12">
        <div className="w-14 h-14 bg-erp-accent/10 rounded-2xl flex items-center justify-center text-erp-accent mx-auto mb-4">
          <Layers className="w-6 h-6 stroke-[1.5]" />
        </div>
        <h2 className="text-xl font-extrabold text-erp-text-primary mb-2 text-center">Entity Relationship Architecture</h2>
        <p className="text-xs text-erp-text-secondary font-medium italic text-center">
          โมเดลความสัมพันธ์เชิงตรรกะของระบบข้อมูลภาคสนาม (Field Logic Architecture)
        </p>
      </div>

      <div className="w-full max-w-5xl overflow-x-auto pb-8">
        <div className="flex flex-col gap-14 items-center">
            <div className="flex gap-10 items-center justify-center">
                <ERDNode title="profiles" icon={<Info className="w-4 h-4"/>} color="bg-erp-accent" />
                <div className="h-[1px] w-10 bg-erp-border relative">
                    <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-2 text-[9px] font-black text-erp-text-muted">1:N</span>
                </div>
                <ERDNode title="production_plans" icon={<Table className="w-4 h-4"/>} color="bg-erp-indigo" />
                <div className="h-[1px] w-10 bg-erp-border relative">
                    <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-2 text-[9px] font-black text-erp-text-muted">1:N</span>
                </div>
                <ERDNode title="production_plan_items" icon={<Layers className="w-4 h-4"/>} color="bg-erp-purple" />
            </div>

            <div className="flex gap-16">
                <div className="flex flex-col items-center gap-8">
                    <div className="w-[1px] h-8 bg-erp-border border-dashed"></div>
                    <ERDNode title="products" icon={<Layers className="w-4 h-4"/>} color="bg-erp-green" />
                </div>
                <div className="flex flex-col items-center gap-8">
                    <div className="w-[1px] h-8 bg-erp-border border-dashed"></div>
                    <ERDNode title="production_orders" icon={<Code2 className="w-4 h-4"/>} color="bg-erp-amber" />
                </div>
                <div className="flex flex-col items-center gap-8">
                    <div className="w-[1px] h-8 bg-erp-border border-dashed"></div>
                    <ERDNode title="job_orders" icon={<Clock className="w-4 h-4"/>} color="bg-erp-red" />
                </div>
            </div>
        </div>
      </div>

      <div className="mt-12 p-3 bg-erp-bg rounded-xl border border-erp-border inline-flex items-center gap-6 text-[10px] font-bold text-erp-text-secondary uppercase tracking-widest">
        <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-erp-accent"></div> Auth / Profiles</div>
        <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-erp-indigo"></div> Production Planning</div>
        <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-erp-green"></div> Master Data</div>
        <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-erp-red"></div> Field Operations</div>
      </div>
    </div>
  )

  return (
    <div className="flex-1 overflow-y-auto bg-erp-bg">
      <div className="max-w-[1600px] mx-auto p-6 md:p-8 flex flex-col gap-8 min-h-full">
        {/* Page Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 bg-erp-accent rounded-xl flex items-center justify-center text-white shadow-lg shadow-erp-accent/20">
                <Database className="w-6 h-6" />
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-erp-text-primary tracking-tight">Data Catalog</h1>
            </div>
            <p className="text-sm font-medium text-erp-text-secondary">โครงสร้างฐานข้อมูล ความสัมพันธ์ และมาตราฐานสถาปัตยกรรมข้อมูล</p>
          </div>

          <div className="flex bg-white p-1 rounded-xl border border-erp-border shadow-sm self-start md:self-center">
            <button
              onClick={() => setActiveTab('tables')}
              className={`px-5 py-2 rounded-lg text-xs md:text-sm font-bold transition-all ${
                activeTab === 'tables' ? 'bg-erp-accent text-white shadow-md' : 'text-erp-text-secondary hover:text-erp-accent'
              }`}
            >
              รายชื่อตาราง (Tables)
            </button>
            <button
              onClick={() => setActiveTab('enums')}
              className={`px-5 py-2 rounded-lg text-xs md:text-sm font-bold transition-all ${
                activeTab === 'enums' ? 'bg-erp-accent text-white shadow-md' : 'text-erp-text-secondary hover:text-erp-accent'
              }`}
            >
              ข้อมูลตัวเลือก (Enums)
            </button>
            <button
              onClick={() => setActiveTab('erd')}
              className={`px-5 py-2 rounded-lg text-xs md:text-sm font-bold transition-all ${
                activeTab === 'erd' ? 'bg-erp-accent text-white shadow-md' : 'text-erp-text-secondary hover:text-erp-accent'
              }`}
            >
              ผังความสัมพันธ์ (ERD)
            </button>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1">
          {activeTab === 'tables' && renderTablesTab()}
          {activeTab === 'enums' && renderEnumsTab()}
          {activeTab === 'erd' && renderErdTab()}
        </main>

        <footer className="mt-8 pt-8 border-t border-erp-border text-center text-erp-text-muted text-[11px] md:text-xs space-y-2 pb-8">
          <p>© 2026 PCC Postention ERP - System Documentation Engine</p>
          <div className="flex items-center justify-center gap-4">
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-erp-green" /> Ver: DB-MOD-V2.0</span>
            <span className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-erp-amber" /> อัปเดตล่าสุด: 21 เมษายน 2026</span>
          </div>
        </footer>
      </div>
    </div>
  )
}

function ERDNode({ title, icon, color }: { title: string, icon: React.ReactNode, color: string }) {
  return (
    <div className="p-4 rounded-xl border-2 border-erp-border bg-white shadow-md min-w-[170px] hover:scale-105 transition-transform cursor-default group">
      <div className="flex flex-col items-center gap-3">
        <div className={`${color} p-2 rounded-lg text-white shadow-sm`}>
          {icon}
        </div>
        <span className="font-bold text-erp-text-primary text-[11px] tracking-tight uppercase">{title}</span>
      </div>
      <div className="mt-3 space-y-1">
        <div className="h-0.5 bg-erp-bg rounded-full overflow-hidden">
          <div className={`${color} h-full w-2/3 opacity-30`}></div>
        </div>
        <div className="h-0.5 bg-erp-bg rounded-full overflow-hidden">
          <div className={`${color} h-full w-1/2 opacity-30`}></div>
        </div>
      </div>
    </div>
  )
}
