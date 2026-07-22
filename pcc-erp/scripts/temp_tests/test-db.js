const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const { data: plans } = await supabase.from('production_plans').select('*').order('created_at', {ascending: false}).limit(1);
  console.log("Latest Plan:", plans);
  if (plans && plans.length > 0) {
    const { data: mats } = await supabase.from('plan_materials').select('*').eq('plan_id', plans[0].id);
    console.log("Materials for plan:", mats);
  }
}
run();
