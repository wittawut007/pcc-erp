const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase.rpc('get_enum_values', { enum_name: 'plan_status' });
  console.log("Enum values:", data, "Error:", error);
  
  // if rpc doesn't exist, we can use raw sql via rest by querying pg_type or just check the schema
  const { data: plans } = await supabase.from('production_plans').select('status').limit(10);
  const statuses = [...new Set(plans.map(p => p.status))];
  console.log("Found statuses:", statuses);
}
run();
