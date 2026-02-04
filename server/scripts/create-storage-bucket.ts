import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

async function createBucket() {
  console.log("Creating 'public' bucket in Supabase Storage...");

  // Check if bucket exists
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();

  if (listError) {
    console.error("Error listing buckets:", listError);
    process.exit(1);
  }

  console.log("Existing buckets:", buckets?.map(b => b.name).join(", ") || "none");

  const publicBucket = buckets?.find(b => b.name === "public");

  if (publicBucket) {
    console.log("Bucket 'public' already exists!");
    return;
  }

  // Create the bucket
  const { data, error } = await supabase.storage.createBucket("public", {
    public: true,
    fileSizeLimit: 10 * 1024 * 1024, // 10 MB
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  });

  if (error) {
    console.error("Error creating bucket:", error);
    process.exit(1);
  }

  console.log("Bucket 'public' created successfully!", data);
}

createBucket().catch(console.error);
