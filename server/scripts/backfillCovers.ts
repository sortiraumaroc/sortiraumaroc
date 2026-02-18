/**
 * One-shot script to backfill cover_url and gallery_urls
 * from Supabase Storage for establishments that are missing them.
 *
 * Usage: npx tsx server/scripts/backfillCovers.ts
 */
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  // Get establishments with no cover_url
  const { data: ests, error } = await supabase
    .from("establishments")
    .select("id, name, cover_url")
    .or("cover_url.is.null,cover_url.eq.")
    .limit(500);

  if (error) {
    console.error("Fetch error:", error);
    return;
  }

  console.log(`Establishments without cover_url: ${ests.length}`);

  let updated = 0;
  let skipped = 0;

  for (const est of ests) {
    // Check if there are cover files in Storage
    const { data: files } = await supabase.storage
      .from("public")
      .list(`establishments/${est.id}/covers`, {
        limit: 10,
        sortBy: { column: "created_at", order: "desc" },
      });

    // Also check gallery
    const { data: galleryFiles } = await supabase.storage
      .from("public")
      .list(`establishments/${est.id}/gallery`, {
        limit: 50,
        sortBy: { column: "created_at", order: "desc" },
      });

    const updateData: Record<string, unknown> = {};

    if (files && files.length > 0) {
      const path = `establishments/${est.id}/covers/${files[0].name}`;
      const { data: urlData } = supabase.storage.from("public").getPublicUrl(path);
      updateData.cover_url = urlData.publicUrl;
    }

    if (galleryFiles && galleryFiles.length > 0) {
      updateData.gallery_urls = galleryFiles.map((f) => {
        const path = `establishments/${est.id}/gallery/${f.name}`;
        return supabase.storage.from("public").getPublicUrl(path).data.publicUrl;
      });
    }

    if (Object.keys(updateData).length > 0) {
      const { error: updateErr } = await supabase
        .from("establishments")
        .update(updateData)
        .eq("id", est.id);

      if (!updateErr) {
        updated++;
        const coverLabel = updateData.cover_url ? "cover" : "";
        const galleryLabel = updateData.gallery_urls
          ? `${(updateData.gallery_urls as string[]).length} gallery`
          : "";
        console.log(`  ✓ ${est.name} → ${coverLabel} ${galleryLabel}`);
      } else {
        console.log(`  ✗ ${est.name} → ${updateErr.message}`);
      }
    } else {
      skipped++;
    }
  }

  console.log(`\nDone! Updated: ${updated} | Skipped (no images in storage): ${skipped}`);
}

main();
