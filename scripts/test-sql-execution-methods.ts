import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

async function testSqlMethods() {
  console.log("=== TESTING SUPABASE SQL EXECUTION METHODS ===");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const projectRef = url.replace("https://", "").replace(".supabase.co", "");

  console.log(`Project Ref: ${projectRef}`);
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Method 1: RPC exec_sql
  console.log("\n--- Method 1: RPC exec_sql ---");
  const { data: rpcData, error: rpcErr } = await supabase.rpc("exec_sql", {
    sql_query: "SELECT 1 as test;"
  });
  if (rpcErr) console.log("RPC exec_sql error:", rpcErr.message, rpcErr.code);
  else console.log("✓ RPC exec_sql success:", rpcData);

  // Method 2: Management API / SQL Query Endpoint
  console.log("\n--- Method 2: Supabase Management Query API ---");
  try {
    const res = await fetch(`${url}/rest/v1/rpc/sql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceKey,
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ query: "SELECT 1;" }),
    });
    console.log("RPC sql status:", res.status);
    const text = await res.text();
    console.log("RPC sql response:", text.slice(0, 200));
  } catch (e: any) {
    console.log("RPC sql fetch error:", e.message);
  }

  // Method 3: Supabase Management API via api.supabase.com
  console.log("\n--- Method 3: Management API endpoint ---");
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/db/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ query: "SELECT 1;" }),
    });
    console.log("Management API status:", res.status);
    const text = await res.text();
    console.log("Management API response:", text.slice(0, 200));
  } catch (e: any) {
    console.log("Management API fetch error:", e.message);
  }

  // Method 4: Test Postgres TCP Connection if pg module is present
  console.log("\n--- Method 4: Postgres DB Connection Attempt ---");
  try {
    // Check if pg is installed without dynamic module import check error
    const pg = require("module").createRequire(import.meta.url)("pg");
    console.log("pg package is installed!");
  } catch (e) {
    console.log("pg package is not installed.");
  }
}

testSqlMethods().catch(console.error);
