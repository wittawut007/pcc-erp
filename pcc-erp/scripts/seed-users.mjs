import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const ROLES = [
  'admin',
  'planner',
  'material',
  'concrete',
  'warehouse',
  'qc',
  'worker',
];

const DEFAULT_PASSWORD = 'password123';

async function seedUsers() {
  console.log('Seeding Test Users...');

  for (const role of ROLES) {
    const email = `${role}@example.com`;
    const fullName = `Test ${role.charAt(0).toUpperCase() + role.slice(1)}`;

    try {
      console.log(`\nCreating ${role} user...`);

      // 1. Create or get user in Auth
      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: DEFAULT_PASSWORD,
        email_confirm: true,
        user_metadata: { role, full_name: fullName },
      });

      let userId;

      if (authError) {
        if (authError.message.includes('already registered')) {
          console.log(`  - Auth User ${email} already exists. Fetching id...`);
          // Note: listing users requires pagination, simplified fetch here for small setup:
          const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
          if (listError) throw listError;
          const existingUser = users.find(u => u.email === email);
          if (existingUser) {
             userId = existingUser.id;
          } else {
             throw new Error("Could not find user after registration error.");
          }
        } else {
          throw authError;
        }
      } else {
        console.log(`  - Created Auth User: ${authUser.user.id}`);
        userId = authUser.user.id;
      }

      // 2. Update/Insert Profile
      const workerToken = role === 'worker' ? `test-worker-token-${Date.now()}` : null;
      
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert({
          id: userId,
          email: email,
          full_name: fullName,
          role: role,
          worker_token: workerToken,
          is_active: true,
        }, { onConflict: 'id' });

      if (profileError) {
        throw profileError;
      }
      
      console.log(`  - Profile updated successfully.`);
      if (role === 'worker') {
         console.log(`  - Worker Token: ${workerToken}`);
      }

    } catch (err) {
      console.error(`Error processing ${role}:`, err);
    }
  }

  console.log('\n✅ Seeding complete!');
}

seedUsers();
