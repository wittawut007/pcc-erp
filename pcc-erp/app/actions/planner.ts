'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function deleteProductionPlan(planId: string) {
  try {
    const supabase = await createClient()

    // Get auth to ensure caller is actually admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') throw new Error('Forbidden: Only admin can delete plans')

    // Find the production_orders for this plan
    const { data: orders } = await supabase
      .from('production_orders')
      .select('id')
      .eq('plan_id', planId)

    const orderIds = orders?.map(o => o.id) || []

    // 1. Delete Job Orders
    if (orderIds.length > 0) {
      const { error: joError } = await supabase
        .from('job_orders')
        .delete()
        .in('order_id', orderIds)
      
      if (joError) {
        if (joError.code === '23503') { // Foreign key constraint violation
          throw new Error('ไม่สามารถลบแผนได้ เนื่องจากรายการนี้ได้ถูกดำเนินการส่งมอบไปยังขั้นตอนอื่นแล้ว')
        }
        throw joError
      }
    }

    // 2. Delete Production Orders
    if (orderIds.length > 0) {
      const { error: poError } = await supabase
        .from('production_orders')
        .delete()
        .in('id', orderIds)
        
      if (poError) throw poError
    }

    // 3. Delete Production Plan Items
    const { error: ppiError } = await supabase
      .from('production_plan_items')
      .delete()
      .eq('plan_id', planId)
      
    if (ppiError) throw ppiError

    // 4. Delete Production Plan
    const { error: ppError } = await supabase
      .from('production_plans')
      .delete()
      .eq('id', planId)
      
    if (ppError) throw ppError

    revalidatePath('/production-order')
    revalidatePath('/planner')
    return { success: true }
  } catch (err: any) {
    console.error('deleteProductionPlan error:', err)
    return { success: false, error: err.message || 'Failed to delete plan' }
  }
}
