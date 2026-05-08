const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: mats } = await supabase.from('plan_materials').select('*');
  console.log("Total plan_materials:", mats ? mats.length : 0);
  if (mats && mats.length > 0) {
    console.log("Sample:", mats[0]);
  }
}
run();
