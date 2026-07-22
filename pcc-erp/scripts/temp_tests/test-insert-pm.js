const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const pmPayload = {
    plan_id: '11fab48f-4f2c-4bf5-9431-dec575239570',
    raw_material_id: '67644602-b348-4299-93e9-9d01678ad031',
    qty_required: 1465.2,
    status: 'pending'
  };
  console.log("Inserting:", pmPayload);
  const { data, error } = await supabase.from('plan_materials').insert(pmPayload).select();
  console.log("Result:", data, "Error:", error);
}
run();
