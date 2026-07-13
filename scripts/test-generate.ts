import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const adminAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
).auth;

async function testGenerate() {
  const { data, error } = await adminAuth.admin.generateLink({
    type: 'recovery',
    email: 'rm2006.rodrigo@gmail.com',
    options: {
      redirectTo: 'http://localhost:3001/auth/callback?next=/reset-password',
    }
  });
  console.log("Error:", error);
  console.log("Data:", data);
  if (data?.properties?.action_link) {
    console.log("Action Link:", data.properties.action_link);
  }
}
testGenerate();
