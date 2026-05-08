const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const { data: rm } = await supabase.from('raw_materials').select('*');
  console.log("Raw materials count:", rm ? rm.length : 0);
  console.log("Some raw materials:", rm ? rm.slice(0, 3).map(r => r.category + ' - ' + r.name) : []);
}
run();
