import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

const avatarPaths: Record<string, string> = {
  'somchai.admin@pcc-erp.local': '/Users/necxa/.gemini/antigravity/brain/dac048b1-f275-4b32-8d2c-7963af4d011e/avatar_admin_1779559578782.png',
  'wiphada.plan@pcc-erp.local': '/Users/necxa/.gemini/antigravity/brain/dac048b1-f275-4b32-8d2c-7963af4d011e/avatar_planner_1779559593526.png',
  'prasit.work@pcc-erp.local': '/Users/necxa/.gemini/antigravity/brain/dac048b1-f275-4b32-8d2c-7963af4d011e/avatar_worker_1779559608159.png',
  'nongnuch.qc@pcc-erp.local': '/Users/necxa/.gemini/antigravity/brain/dac048b1-f275-4b32-8d2c-7963af4d011e/avatar_qc_1779559624483.png',
  'thanakorn.mat@pcc-erp.local': '/Users/necxa/.gemini/antigravity/brain/dac048b1-f275-4b32-8d2c-7963af4d011e/avatar_material_1779559651694.png',
  'rattana.conc@pcc-erp.local': '/Users/necxa/.gemini/antigravity/brain/dac048b1-f275-4b32-8d2c-7963af4d011e/avatar_concrete_1779559667788.png',
  'ekkachai.ware@pcc-erp.local': '/Users/necxa/.gemini/antigravity/brain/dac048b1-f275-4b32-8d2c-7963af4d011e/avatar_warehouse_1779559681978.png'
}

async function uploadAvatars() {
  for (const [email, filePath] of Object.entries(avatarPaths)) {
    try {
      const { data: userData } = await supabase.from('profiles').select('id, role').eq('email', email).single()
      if (!userData) {
        console.log(`User not found: ${email}`)
        continue
      }
      
      const fileExt = 'png'
      const fileName = `${userData.id}.${fileExt}`
      const fileBuffer = fs.readFileSync(filePath)
      
      console.log(`Uploading ${fileName}...`)
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, fileBuffer, {
          contentType: 'image/png',
          upsert: true
        })
        
      if (uploadError) {
        console.error(`Upload error for ${email}:`, uploadError)
        continue
      }
      
      const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(fileName)
      const publicUrl = publicUrlData.publicUrl
      
      console.log(`Updating profile for ${email} with url ${publicUrl}...`)
      const { error: updateError } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', userData.id)
      
      if (updateError) {
        console.error(`Update error for ${email}:`, updateError)
      } else {
        console.log(`Success: ${email}`)
      }
    } catch (e) {
      console.error(`Error processing ${email}:`, e)
    }
  }
  console.log('Done uploading avatars.')
}

uploadAvatars()
