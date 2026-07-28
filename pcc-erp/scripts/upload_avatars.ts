import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)


const roleAvatarMap: Record<string, string> = {
  'admin': 'admin.png',
  'planner': 'planner.png',
  'worker': 'worker.png',
  'qc': 'qc.png',
  'material': 'material.png',
  'concrete': 'concrete.png',
  'warehouse': 'warehouse.png',
  'demolding': 'demolding.png',
  'engineer': 'engineer.png',
  'supervisor': 'supervisor.png',
}

const publicAvatarsDir = path.join(process.cwd(), 'public', 'avatars')

async function uploadAvatars() {
  console.log('Fetching profiles from Supabase...')
  const { data: profiles, error: fetchError } = await supabase.from('profiles').select('*')

  if (fetchError) {
    console.error('Error fetching profiles:', fetchError)
    return
  }

  console.log(`Found ${profiles?.length || 0} profiles in database.`)

  // First, upload all 10 avatar images to Supabase storage bucket 'avatars'
  const uploadedUrls: Record<string, string> = {}

  for (const [role, imageName] of Object.entries(roleAvatarMap)) {
    const localFilePath = path.join(publicAvatarsDir, imageName)
    if (!fs.existsSync(localFilePath)) {
      console.warn(`File not found: ${localFilePath}`)
      continue
    }

    const fileBuffer = fs.readFileSync(localFilePath)
    const storagePath = `role_avatars/${imageName}`

    console.log(`Uploading ${imageName} to Supabase Storage (${storagePath})...`)
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(storagePath, fileBuffer, {
        contentType: 'image/png',
        upsert: true
      })

    if (uploadError) {
      console.error(`Failed to upload ${imageName}:`, uploadError.message)
      // Fallback to relative public URL
      uploadedUrls[role] = `/avatars/${imageName}`
    } else {
      const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(storagePath)
      uploadedUrls[role] = publicUrlData.publicUrl
      console.log(`Uploaded ${imageName} -> ${publicUrlData.publicUrl}`)
    }
  }

  // Next, update each user's profile with their corresponding avatar URL
  if (profiles && profiles.length > 0) {
    for (const profile of profiles) {
      const role = profile.role || 'worker'
      // Determine avatar image based on role or employee code / name
      let avatarFileName = roleAvatarMap[role] || 'worker.png'
      
      // Special mapping for demolding, engineer, supervisor if specified in full_name or code
      if (profile.full_name?.includes('อนุพงษ์') || profile.employee_code === 'EMP-008') {
        avatarFileName = 'demolding.png'
      } else if (profile.full_name?.includes('สุรชัย') || profile.employee_code === 'EMP-009') {
        avatarFileName = 'engineer.png'
      } else if (profile.full_name?.includes('กานดา') || profile.employee_code === 'EMP-010') {
        avatarFileName = 'supervisor.png'
      }

      const avatarUrl = uploadedUrls[role] || `/avatars/${avatarFileName}`
      console.log(`Updating profile for ${profile.full_name} (${profile.email || profile.id}) [Role: ${role}] with ${avatarUrl}...`)

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', profile.id)

      if (updateError) {
        console.error(`Error updating profile for ${profile.id}:`, updateError.message)
      } else {
        console.log(`Successfully updated profile avatar for ${profile.full_name}!`)
      }
    }
  }

  console.log('\n✅ Done processing all profile avatars!')
}

uploadAvatars()

