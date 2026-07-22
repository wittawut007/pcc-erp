import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

async function test() {
  const { data: user } = await supabase.from('profiles').select('id').limit(1).single()
  const today = '2026-04-20'
  
  const res = await supabase.from('production_plans').upsert({
    plan_date: today,
    created_by: user.id,
    status: 'draft',
    total_qty: 10,
    total_concrete: 10
  }).select().single()
  
  console.log("Upsert plan:", res.error || res.data.id)
  
  if (res.data) {
     const delRes = await supabase.from('production_plan_items').delete().eq('plan_id', res.data.id)
     console.log("Delete items:", delRes.error || "Success")
     
     const logRes = await supabase.from('activity_logs').insert({
        user_id: user.id,
        action_type: 'บันทึกแผนการผลิต (Draft)',
        entity_type: 'production_plan',
        entity_id: res.data.id,
        detail: `test`,
      })
      console.log("Activity logs insert:", logRes.error || "Success")
  }
}
test()
