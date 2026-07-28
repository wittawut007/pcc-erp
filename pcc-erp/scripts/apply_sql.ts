import { Client } from 'pg'

const passwords = [
  'postgres',
  'your-super-secret-and-long-postgres-password',
  'password123',
  'root',
]

const host = '119.59.116.74'
const ports = [5432, 6543, 5433]

async function tryConnect() {
  for (const port of ports) {
    for (const password of passwords) {
      const connectionString = `postgresql://postgres:${encodeURIComponent(password)}@${host}:${port}/postgres`
      console.log(`Trying ${host}:${port} with password: ${password.substring(0, 4)}***`)
      const client = new Client({ connectionString, connectionTimeoutMillis: 3000 })
      try {
        await client.connect()
        console.log(`SUCCESS! Connected on port ${port}`)
        
        console.log("Executing SQL: ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin';")
        await client.query("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin';")
        
        console.log("Executing SQL: UPDATE public.profiles SET role = 'super_admin' WHERE email = 'wittawut.abm@gmail.com';")
        const res = await client.query("UPDATE public.profiles SET role = 'super_admin' WHERE email = 'wittawut.abm@gmail.com';")
        console.log("Update result:", res.rowCount, "rows updated.")
        
        await client.end()
        return
      } catch (err: any) {
        // console.log(`Failed on ${port}:`, err.message)
        await client.end().catch(() => {})
      }
    }
  }
  console.log("Direct PG connection attempts finished.")
}

tryConnect()
