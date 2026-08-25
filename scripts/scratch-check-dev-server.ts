import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

async function checkServer() {
  try {
    const res = await fetch("http://localhost:3000/api/stats");
    console.log("Dev server /api/stats status:", res.status);
    const data = await res.json().catch(() => ({}));
    console.log("Dev server /api/stats response:", data);
  } catch (e: any) {
    console.log("Dev server check failed:", e.message);
  }
}

checkServer().catch(console.error);
