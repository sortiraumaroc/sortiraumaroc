/**
 * Script pour retrouver les photos perdues des créneaux Ftour.
 *
 * Scanne le bucket Supabase Storage pour chaque établissement
 * ayant des slots Ftour sans cover_url, et restaure les photos trouvées.
 *
 * Usage: npx tsx server/scripts/restoreFtourCovers.ts
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
  console.log("=== Restauration des photos Ftour ===\n");

  // 1. Get all Ftour slots grouped by establishment, without cover_url
  const PAGE_SIZE = 1000;
  let allSlots: any[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("pro_slots")
      .select("id, establishment_id, cover_url, moderation_status")
      .eq("service_label", "Ftour")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error || !data || data.length === 0) {
      hasMore = false;
    } else {
      allSlots = allSlots.concat(data);
      offset += PAGE_SIZE;
      if (data.length < PAGE_SIZE) hasMore = false;
    }
  }

  console.log(`Total Ftour slots: ${allSlots.length}`);

  // Group by establishment
  const byEstab = new Map<string, any[]>();
  for (const s of allSlots) {
    if (!byEstab.has(s.establishment_id)) byEstab.set(s.establishment_id, []);
    byEstab.get(s.establishment_id)!.push(s);
  }

  console.log(`Unique establishments: ${byEstab.size}`);

  // Find establishments whose slots have NO cover_url
  const estabsWithoutCover: string[] = [];
  const estabsWithCover: string[] = [];
  for (const [eid, slots] of byEstab) {
    const hasCover = slots.some((s: any) => s.cover_url);
    if (hasCover) {
      estabsWithCover.push(eid);
    } else {
      estabsWithoutCover.push(eid);
    }
  }

  console.log(`Establishments with cover: ${estabsWithCover.length}`);
  console.log(`Establishments without cover: ${estabsWithoutCover.length}`);
  console.log();

  // 2. For each establishment without cover, check storage for photos
  let restored = 0;
  let noPhotos = 0;

  for (const eid of estabsWithoutCover) {
    // Check gallery folder
    const { data: galleryFiles } = await supabase.storage
      .from("public")
      .list(`establishments/${eid}/gallery`, {
        limit: 50,
        sortBy: { column: "created_at", order: "desc" },
      });

    // Check covers folder
    const { data: coverFiles } = await supabase.storage
      .from("public")
      .list(`establishments/${eid}/covers`, {
        limit: 10,
        sortBy: { column: "created_at", order: "desc" },
      });

    // Filter out empty files and .emptyFolderPlaceholder
    const validGallery = (galleryFiles ?? []).filter(
      (f) => f.name !== ".emptyFolderPlaceholder" && (f.metadata?.size ?? 0) > 0,
    );
    const validCovers = (coverFiles ?? []).filter(
      (f) => f.name !== ".emptyFolderPlaceholder" && (f.metadata?.size ?? 0) > 0,
    );

    // Pick the best photo: prefer cover, then gallery
    let photoUrl: string | null = null;

    if (validCovers.length > 0) {
      const path = `establishments/${eid}/covers/${validCovers[0].name}`;
      photoUrl = supabase.storage.from("public").getPublicUrl(path).data.publicUrl;
    } else if (validGallery.length > 0) {
      const path = `establishments/${eid}/gallery/${validGallery[0].name}`;
      photoUrl = supabase.storage.from("public").getPublicUrl(path).data.publicUrl;
    }

    if (photoUrl) {
      // Update all Ftour slots for this establishment
      const slotIds = byEstab.get(eid)!.map((s: any) => s.id);
      const { error: updateErr } = await supabase
        .from("pro_slots")
        .update({ cover_url: photoUrl })
        .in("id", slotIds);

      if (!updateErr) {
        restored++;
        // Get establishment name for logging
        const { data: estab } = await supabase
          .from("establishments")
          .select("name")
          .eq("id", eid)
          .maybeSingle();
        console.log(`  ✓ ${estab?.name ?? eid} → ${validCovers.length} covers, ${validGallery.length} gallery → restored ${slotIds.length} slots`);
      } else {
        console.log(`  ✗ ${eid} → ${updateErr.message}`);
      }
    } else {
      noPhotos++;
    }
  }

  // 3. Also check establishments that already have cover but gallery_urls might be missing
  // Update gallery_urls on establishments table too
  let estabGalleryUpdated = 0;
  for (const eid of [...estabsWithCover, ...estabsWithoutCover]) {
    const { data: galleryFiles } = await supabase.storage
      .from("public")
      .list(`establishments/${eid}/gallery`, {
        limit: 50,
        sortBy: { column: "created_at", order: "desc" },
      });

    const validGallery = (galleryFiles ?? []).filter(
      (f) => f.name !== ".emptyFolderPlaceholder" && (f.metadata?.size ?? 0) > 0,
    );

    if (validGallery.length > 0) {
      const galleryUrls = validGallery.map((f) => {
        const path = `establishments/${eid}/gallery/${f.name}`;
        return supabase.storage.from("public").getPublicUrl(path).data.publicUrl;
      });

      const { error: gErr } = await supabase
        .from("establishments")
        .update({ gallery_urls: galleryUrls })
        .eq("id", eid);

      if (!gErr) estabGalleryUpdated++;
    }
  }

  console.log(`\n=== Résumé ===`);
  console.log(`Photos restaurées sur slots: ${restored} établissements`);
  console.log(`Aucune photo dans le storage: ${noPhotos} établissements`);
  console.log(`Gallery URLs mises à jour sur établissements: ${estabGalleryUpdated}`);
}

main().catch(console.error);
