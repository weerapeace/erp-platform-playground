/**
 * 🖼 อัลบั้มปกโปร (ฝั่งเซิร์ฟเวอร์) — ทุกชุดเปลี่ยนปก เก็บรูปปกโปรที่ใช้ลงอัลบั้มในคลังรูปกลาง (asset_collections) ชื่อตามชื่อชุดโปร
 *  - สร้างเองตอนชุดมีปกโปรรูปแรก · มีอัลบั้มชื่อเดียวกันอยู่แล้ว = ใช้อันเดิม (ไม่สร้างซ้ำ)
 *  - อัลบั้มที่ระบบสร้างจดไว้ใน note ว่า "promo-cover:<id ชุด>" → แก้ชื่ออัลบั้มในคลังรูปแล้วยังหาเจอ (ไม่ต้องเพิ่มคอลัมน์)
 *  - เปลี่ยนชื่อชุดโปร → อัลบั้มที่ระบบสร้าง + ชื่อยังตรงชื่อเดิม = เปลี่ยนตาม (ถ้าแก้ชื่ออัลบั้มเองไว้ จะไม่ทับ)
 *  - เอาปกออกจากรุ่น / ลบชุด = รูปยังอยู่ในอัลบั้ม (อัลบั้ม = ที่เก็บปกโปรที่เคยใช้)
 *  - รูปที่ยังไม่อยู่ในคลัง (เช่น ปกที่แปะกรอบอัตโนมัติ) → ลงคลังให้ (ชี้ r2 key เดิม ไม่ก๊อปไฟล์)
 * ใช้ที่: app/api/promo-covers/[id] (GET/PATCH) · app/api/promo-covers/[id]/frame
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";

type Admin = ReturnType<typeof supabaseAdmin>;
export type PromoAlbum = { id: string; name: string; count: number; own: boolean };

const marker = (campaignId: string) => `promo-cover:${campaignId}`;
const CHUNK = 200;

async function countOf(admin: Admin, albumId: string): Promise<number> {
  const { count } = await admin.from("asset_collection_map").select("asset_id", { count: "exact", head: true }).eq("collection_id", albumId);
  return count ?? 0;
}

/** หาอัลบั้มของชุดนี้ (ที่ระบบสร้าง ก่อน · ไม่งั้นอัลบั้มชื่อตรงชื่อชุด) — ไม่สร้าง */
export async function findPromoAlbum(admin: Admin, campaign: { id: string; name: string }, withCount = true): Promise<PromoAlbum | null> {
  const { data: own } = await admin.from("asset_collections").select("id, name").ilike("note", `%${marker(campaign.id)}%`).limit(1).maybeSingle();
  let row = own ? { ...(own as { id: string; name: string }), own: true } : null;
  if (!row && campaign.name.trim()) {
    const { data: same } = await admin.from("asset_collections").select("id, name").eq("name", campaign.name.trim()).order("created_at").limit(1).maybeSingle();
    if (same) row = { ...(same as { id: string; name: string }), own: false };
  }
  if (!row) return null;
  return { ...row, count: withCount ? await countOf(admin, row.id) : 0 };
}

async function ensureAlbum(admin: Admin, campaign: { id: string; name: string }, name?: string): Promise<PromoAlbum> {
  const found = await findPromoAlbum(admin, campaign, false);
  if (found) {
    // ใช้อัลบั้มชื่อเดียวกันที่มีอยู่แล้ว → จดไว้ใน note ด้วย (เปลี่ยนชื่อชุดภายหลังยังหาอัลบั้มนี้เจอ)
    if (!found.own) {
      const { data: cur } = await admin.from("asset_collections").select("note").eq("id", found.id).maybeSingle();
      const note = String((cur as { note?: string | null } | null)?.note ?? "").trim();
      await admin.from("asset_collections").update({ note: `${note}${note ? " · " : ""}${marker(campaign.id)}` }).eq("id", found.id);
    }
    return { ...found, own: true };
  }
  const nm = (name ?? campaign.name).trim() || "ปกโปร";
  const { data, error } = await admin.from("asset_collections")
    .insert({ name: nm, description: `ปกโปรของชุด "${campaign.name}" (หน้าเปลี่ยนปกโปร)`, note: marker(campaign.id) })
    .select("id, name").single();
  if (error || !data) throw new Error(`สร้างอัลบั้มไม่สำเร็จ: ${error?.message ?? ""}`);
  return { id: data.id as string, name: data.name as string, count: 0, own: true };
}

/**
 * เก็บปกโปรของชุดลงอัลบั้ม (ทำซ้ำได้ ไม่ลงซ้ำ) · ยังไม่มีปกเลย + ยังไม่มีอัลบั้ม = ไม่สร้าง (คืน null)
 * prevName = ชื่อชุดก่อนแก้ (ไว้เปลี่ยนชื่ออัลบั้มตาม) · best-effort: ผิดพลาดไม่ทำให้การบันทึกชุดล้ม (คืน null)
 */
export async function syncPromoAlbum(
  admin: Admin,
  campaign: { id: string; name: string },
  items: { promo_key: string | null; code?: string }[],
  opts: { prevName?: string } = {},
): Promise<PromoAlbum | null> {
  try {
    const keys = [...new Set(items.map((i) => i.promo_key).filter((k): k is string => !!k))];
    let album = await findPromoAlbum(admin, campaign, false);
    // ชื่อชุดเปลี่ยน → อัลบั้มที่ระบบสร้าง (ชื่อยังเป็นชื่อเดิม) เปลี่ยนตาม
    if (album?.own && opts.prevName && opts.prevName !== campaign.name && album.name === opts.prevName && campaign.name.trim()) {
      await admin.from("asset_collections").update({ name: campaign.name.trim() }).eq("id", album.id);
      album = { ...album, name: campaign.name.trim() };
    }
    if (!keys.length) return album ? { ...album, count: await countOf(admin, album.id) } : null;
    if (!album) album = await ensureAlbum(admin, campaign);

    // รูปในคลังกลาง ตาม r2 key · ที่ยังไม่มี → ลงคลังให้ (ชี้ไฟล์เดิม)
    const assetOf = new Map<string, { id: string; collection_id: string | null }>();
    for (let i = 0; i < keys.length; i += CHUNK) {
      const { data } = await admin.from("assets").select("id, r2_key, collection_id").in("r2_key", keys.slice(i, i + CHUNK)).eq("status", "active");
      for (const a of (data ?? []) as { id: string; r2_key: string; collection_id: string | null }[]) if (!assetOf.has(a.r2_key)) assetOf.set(a.r2_key, a);
    }
    const codeOf = new Map(items.filter((i) => i.promo_key).map((i) => [i.promo_key as string, i.code ?? ""]));
    const missing = keys.filter((k) => !assetOf.has(k));
    if (missing.length) {
      const rows = missing.map((k) => {
        const file = k.split("/").pop() || k;
        const ext = (file.split(".").pop() || "").toLowerCase();
        return {
          title: `${codeOf.get(k) || ""} ปกโปร ${campaign.name}`.trim(), file_name: file, r2_key: k, asset_type: "image",
          content_type: ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg", ext: ext || null,
          status: "active", source: "upload", collection_id: album.id,
        };
      });
      const { data: ins } = await admin.from("assets").insert(rows).select("id, r2_key, collection_id");
      for (const a of (ins ?? []) as { id: string; r2_key: string; collection_id: string | null }[]) assetOf.set(a.r2_key, a);
    }
    const all = [...assetOf.values()];
    if (all.length) {
      await admin.from("asset_collection_map").upsert(all.map((a) => ({ asset_id: a.id, collection_id: album!.id })), { onConflict: "asset_id,collection_id", ignoreDuplicates: true });
      // อัลบั้มหลักของรูปที่ยังไม่อยู่อัลบั้มไหน (ให้ตัวกรอง "ไม่อยู่อัลบั้ม" ในคลังรูปถูก)
      const noHome = all.filter((a) => !a.collection_id).map((a) => a.id);
      if (noHome.length) await admin.from("assets").update({ collection_id: album.id }).in("id", noHome).is("collection_id", null);
    }
    return { ...album, count: await countOf(admin, album.id) };
  } catch {
    return null;
  }
}

/** แก้ชื่ออัลบั้มของชุด (ยังไม่มี = สร้างด้วยชื่อนี้) · คืน { album, before } ไว้ลง audit */
export async function renamePromoAlbum(admin: Admin, campaign: { id: string; name: string }, name: string): Promise<{ album: PromoAlbum; before: string | null }> {
  const nm = name.trim();
  if (!nm) throw new Error("ต้องมีชื่ออัลบั้ม");
  if (nm.length > 120) throw new Error("ชื่ออัลบั้มยาวเกิน 120 ตัวอักษร");
  const prev = await findPromoAlbum(admin, campaign, false);
  if (!prev) {
    const album = await ensureAlbum(admin, campaign, nm);
    return { album: { ...album, count: await countOf(admin, album.id) }, before: null };
  }
  const found = await ensureAlbum(admin, campaign);   // จด note ถ้าเป็นอัลบั้มชื่อซ้ำที่ยังไม่ได้จด
  if (found.name !== nm) {
    const { error } = await admin.from("asset_collections").update({ name: nm }).eq("id", found.id);
    if (error) throw new Error(`แก้ชื่ออัลบั้มไม่สำเร็จ: ${error.message}`);
  }
  return { album: { ...found, name: nm, count: await countOf(admin, found.id) }, before: found.name };
}
