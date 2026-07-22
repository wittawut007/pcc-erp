const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: items } = await supabase.from('production_plan_items').select('*').eq('plan_id', '11fab48f-4f2c-4bf5-9431-dec575239570');
  console.log("Total items:", items ? items.length : 0);
  console.log("Distinct products:", new Set(items.map(i => i.product_id)).size);
}
run();
