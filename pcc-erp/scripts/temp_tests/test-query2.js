const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase
    .from('plan_materials')
    .select(`
      *,
      raw_material:raw_materials(id, name, material_code, unit, qty_on_hand, category, weight_per_meter),
      plan:production_plans!inner(id, plan_date, status, total_concrete)
    `)
    .in('plan.status', ['confirmed'])
    .order('created_at', { ascending: false });

  console.log("Error:", error);
  console.log("Data count:", data ? data.length : 0);
  if (data && data.length > 0) {
    console.log(data[0].id, data[0].plan.status);
  }
}
run();
