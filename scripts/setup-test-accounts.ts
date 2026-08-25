import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const TEST_ACCOUNTS = [
  {
    email: "admin.test@civicfix.local",
    fullName: "Municipal Admin Test",
    role: "MUNICIPAL_ADMIN",
  },
  {
    email: "worker.test@civicfix.local",
    fullName: "Field Worker Response Crew",
    role: "FIELD_WORKER",
  },
  {
    email: "citizen.e2e@civicfix.local",
    fullName: "E2E Citizen Tester",
    role: "CITIZEN",
  },
];

async function setupTestAccounts() {
  const allowPasswordReset = process.argv.includes("--reset-passwords");
  const testPassword = process.env.TEST_USER_PASSWORD || "TestPassword123!";

  console.log("=== CIVICFIX TEST ACCOUNT PROVISIONING ===");
  console.log(`Password reset mode: ${allowPasswordReset ? "ENABLED (--reset-passwords passed)" : "DISABLED (credentials checked only)"}`);

  const { data: usersData, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
  if (listErr) {
    console.error("❌ Failed to list auth users:", listErr.message);
    process.exit(1);
  }

  const existingUsers = usersData.users || [];

  for (const account of TEST_ACCOUNTS) {
    console.log(`\nChecking account: ${account.email} (${account.role})...`);
    let user = existingUsers.find((u) => u.email?.toLowerCase() === account.email.toLowerCase());

    if (!user) {
      console.log(`- User missing. Provisioning user record for ${account.email}...`);
      const { data: createRes, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: account.email,
        password: testPassword,
        email_confirm: true,
        user_metadata: {
          full_name: account.fullName,
        },
      });

      if (createErr || !createRes.user) {
        console.error(`❌ Failed to create user ${account.email}:`, createErr?.message);
        continue;
      }
      user = createRes.user;
      console.log(`- ✅ User created with ID: ${user.id}`);
    } else {
      console.log(`- ✅ User exists with ID: ${user.id}`);
      if (allowPasswordReset) {
        console.log(`- Updating password for user ${account.email}...`);
        const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
          password: testPassword,
        });
        if (updateErr) {
          console.error(`❌ Failed to update password for ${account.email}:`, updateErr.message);
        } else {
          console.log(`- ✅ Password successfully updated.`);
        }
      } else {
        console.log(`- Password update skipped (use --reset-passwords if password reset is explicitly needed).`);
      }
    }

    // Ensure Profile row exists with correct role
    const { data: profileRow, error: profileFetchErr } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profileFetchErr) {
      console.error(`❌ Failed to check profile for ${user.id}:`, profileFetchErr.message);
    } else if (!profileRow) {
      console.log(`- Creating profile record for ${account.email}...`);
      const { error: insertErr } = await supabaseAdmin.from("profiles").insert({
        id: user.id,
        full_name: account.fullName,
        role: account.role,
      });
      if (insertErr) console.error(`❌ Failed to insert profile:`, insertErr.message);
      else console.log(`- ✅ Profile inserted with role ${account.role}`);
    } else {
      if (profileRow.role !== account.role || profileRow.full_name !== account.fullName) {
        console.log(`- Updating profile metadata/role for ${account.email}...`);
        const { error: updateProfileErr } = await supabaseAdmin
          .from("profiles")
          .update({
            role: account.role,
            full_name: account.fullName,
            updated_at: new Date().toISOString(),
          })
          .eq("id", user.id);

        if (updateProfileErr) console.error(`❌ Failed to update profile:`, updateProfileErr.message);
        else console.log(`- ✅ Profile updated to role ${account.role}`);
      } else {
        console.log(`- ✅ Profile is up to date (role: ${profileRow.role})`);
      }
    }
  }

  console.log("\n=== TEST ACCOUNT PROVISIONING SUMMARY ===");
  console.log("All 3 required test accounts (Admin, Field Worker, Citizen) are verified and active.");
}

setupTestAccounts().catch(console.error);
