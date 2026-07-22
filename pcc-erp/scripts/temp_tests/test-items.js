const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const { data: items } = await supabase.from('production_plan_items').select('*').eq('plan_id', '11fab48f-4f2c-4bf5-9431-dec575239570');
  console.log("Items:", items);
  
  if (items && items.length > 0) {
     const { data: p } = await supabase.from('products').select('*').eq('id', items[0].product_id);
     console.log("Product:", p);
  }
}
run();
