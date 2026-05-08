const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const { data: rawMaterials } = await supabase.from('raw_materials').select('*');
  const fallbackWire = rawMaterials.find(r => r.category === 'ลวด' || r.name.toLowerCase().includes('ลวด') || r.name.toLowerCase().includes('pc wire'));
  
  console.log("Fallback Wire:", fallbackWire);
  
  const product = {
    id: 'd27453b7-29e8-486c-9e25-1d9160a48f6c',
    bom_code: '[D1-003-004] ลวด PC-Wire 4 มม.(0.0989kg/m)',
    length: 20.35,
    wire_per_unit: 0,
  };
  
  const item = { qty: 72 };
  
  const materialReqs = {};
  const wireNeeded = (product.wire_per_unit || product.length || 0) * item.qty;
  console.log("Wire Needed:", wireNeeded);
  
  if (wireNeeded > 0) {
    const specificWire = rawMaterials.find(r => r.name === product.bom_code);
    console.log("Specific Wire:", specificWire);
    
    const wireId = specificWire?.id || fallbackWire?.id;
    console.log("Wire ID:", wireId);
    
    if (wireId) materialReqs[wireId] = (materialReqs[wireId] || 0) + wireNeeded;
  }
  
  console.log("Material Reqs:", materialReqs);
}
run();
