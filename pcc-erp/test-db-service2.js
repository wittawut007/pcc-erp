const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: mats } = await supabase.from('plan_materials').select('*').eq('plan_id', '11fab48f-4f2c-4bf5-9431-dec575239570');
  console.log("Materials for latest plan:", mats ? mats.length : 0);
  console.log(mats);
}
run();
