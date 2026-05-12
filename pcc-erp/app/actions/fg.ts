'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function saveErpReference(orderId: string, erpReference: string) {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('production_orders')
    .update({ 
      erp_reference: erpReference,
      status: 'erp_synced' 
    })
    .eq('id', orderId)

  if (error) throw new Error(error.message)

  revalidatePath('/inventory/fg')
  return { success: true }
}
