const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: plans } = await supabase.from('production_plans').select('*').eq('plan_date', new Date().toISOString().split('T')[0]);
  console.log("Plans for today:", plans);
  
  const { data: info } = await supabase.rpc('get_table_info', { table_name: 'production_plans' }).catch(() => ({}));
  console.log(info);
}
run();
