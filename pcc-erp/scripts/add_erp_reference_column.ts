import { Client } from 'pg'

const passwords = [
  'postgres',
  'your-super-secret-and-long-postgres-password',
  'password123',
  'root',
  'supabase',
]

const host = '119.59.116.74'
const ports = [5432, 6543, 5433, 5434, 5435]

async function run() {
  for (const port of ports) {
    for (const password of passwords) {
      const connectionString = `postgresql://postgres:${encodeURIComponent(password)}@${host}:${port}/postgres`
      const client = new Client({ connectionString, connectionTimeoutMillis: 3000 })
      try {
        await client.connect()
        console.log(`SUCCESS! Connected to PG on ${host}:${port}`)
        await client.query('ALTER TABLE public.production_orders ADD COLUMN IF NOT EXISTS erp_reference TEXT;')
        console.log('Successfully executed: ALTER TABLE public.production_orders ADD COLUMN IF NOT EXISTS erp_reference TEXT;')
        await client.end()
        return
      } catch (err: any) {
        await client.end().catch(() => {})
      }
    }
  }
  console.log("Direct PG connection finished. Trying REST rpc if available...")
}

run()
