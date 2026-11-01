/**
 * 🔁 หารูปซ้ำในคลังกลาง (ฝั่งเซิร์ฟเวอร์) — ใช้โดย POST /api/assets/find-duplicates
 *   1) ไฟล์เดียวกันทุกจุด (checksum)  2) หน้าตาเหมือนกันแต่คนละไฟล์ (lib/image-hash: รูปทรงจาก RPC find_look_alike_assets + เทียบสี)
 * อ่านอย่างเดียว · ห้าม import จากไฟล์ "use client"
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAllPages } from "@/lib/fetch-all";
import { LOOK_MAX_BITS, LOOK_MAX_COARSE, LOOK_MAX_FINE, lookColorGap, type LookHash } from "@/lib/image-hash";

const MAX_USED_IN = 5;

export type DuplicateAsset = {
  id: string;
  r2_key: string;
  title: string | null;
  file_name: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  created_at: string | null;
  uploaded_by: string | null;
  /** แท็กในคลัง (บอกที่มา เช่น "รูปสินค้า (เว็บ)") */
  tags: string[];
  /** ถูกใช้อยู่ที่ไหน (ป้ายอ่านง่าย · สูงสุด 5) + จำนวนทั้งหมด */
  usedIn: string[];
  usedCount: number;
  /** มีเฉพาะรูป "หน้าตาเหมือนกันแต่คนละไฟล์" — ห่างกันกี่บิต / สีต่างกันเท่าไร (ยิ่งน้อยยิ่งเหมือน) */
  look?: { bits: number; color: number };
};

type Row = { id: string; r2_key: string; checksum: string | null; title: string | null; file_name: string | null; size_bytes: number | null; width: number | null; height: number | null; created_at: string | null; uploaded_by: string | null };
const COLS = "id, r2_key, checksum, title, file_name, size_bytes, width, height, created_at, uploaded_by";
type Admin = ReturnType<typeof supabaseAdmin>;

/** ค้นรูปซ้ำ — checksums = sha256 hex (ตรวจรูปแบบแล้ว) · looks = ลายนิ้วมือต่อไฟล์ (null = ไม่มี) · ตรวจไฟล์เดียวกันพัง = throw */
export async function findDuplicateAssets(admin: Admin, checksums: string[], looks: (LookHash | null)[]): Promise<{ data: Record<string, DuplicateAsset>; looks: (DuplicateAsset | null)[] }> {
  // 1) ไฟล์เดียวกันทุกจุด — checksum ละ 1 รายการ (ตัวที่อยู่ในคลังก่อนสุด)
  const byChecksum = new Map<string, Row>();
  if (checksums.length) {
    const { data: found, error } = await admin.from("assets").select(COLS)
      .in("checksum", checksums).eq("status", "active").not("r2_key", "is", null).order("created_at", { ascending: true });
    if (error) throw new Error("ตรวจรูปซ้ำในคลังไม่สำเร็จ");
    for (const r of (found ?? []) as Row[]) if (r.checksum && !byChecksum.has(r.checksum)) byChecksum.set(r.checksum, r);
  }

  // 2) หน้าตาเหมือนกันแต่คนละไฟล์ — รูปทรงใกล้กัน (RPC) แล้วเทียบสีต่อ · ไฟล์ละ 1 รายการ (สีใกล้สุด)
  //    เทียบสีสำคัญ: รูปสินค้าที่ถ่ายแบบเดียวกันคนละสี (ด้ายหลอด/ซิป) รูปทรงตรงกันเป๊ะเป็นร้อยรูป
  const lookPick = new Map<number, { id: string; bits: number; color: number }>();
  if (looks.some(Boolean)) {
    const { data: cand, error } = await admin.rpc("find_look_alike_assets", {
      p_hashes: looks.map((l) => l?.phash ?? ""), p_colors: looks.map((l) => l?.color ?? ""), p_max_bits: LOOK_MAX_BITS,
    });
    for (const h of error ? [] : ((cand ?? []) as { idx: number; asset_id: string; bits: number; phash_color: string | null }[])) {
      const q = looks[h.idx - 1];
      if (!q || !h.phash_color) continue;
      const gap = lookColorGap(q.color, h.phash_color);
      if (gap.coarse > LOOK_MAX_COARSE || gap.fine > LOOK_MAX_FINE) continue;
      const cur = lookPick.get(h.idx - 1);
      if (!cur || gap.coarse < cur.color || (gap.coarse === cur.color && h.bits < cur.bits)) lookPick.set(h.idx - 1, { id: h.asset_id, bits: h.bits, color: gap.coarse });
    }
  }
  const lookRows = new Map<string, Row>();
  if (lookPick.size) {
    const { data } = await admin.from("assets").select(COLS).in("id", [...new Set([...lookPick.values()].map((p) => p.id))]).not("r2_key", "is", null);
    for (const r of (data ?? []) as Row[]) lookRows.set(r.id, r);
  }

  const rows = [...new Map([...byChecksum.values(), ...lookRows.values()].map((r) => [r.id, r])).values()];
  const info = rows.length ? await describe(admin, rows) : new Map<string, DuplicateAsset>();

  const data: Record<string, DuplicateAsset> = {};
  for (const [sum, r] of byChecksum) data[sum] = info.get(r.id)!;
  const lookOut = looks.map((_, i) => {
    const p = lookPick.get(i);
    const d = p && info.get(p.id);
    return d ? { ...d, look: { bits: p.bits, color: Math.round(p.color * 10) / 10 } } : null;
  });
  return { data, looks: lookOut };
}

/** แท็ก + ใช้อยู่ที่ไหน ของรูปที่เจอ (ป้ายอ่านง่าย) */
async function describe(admin: Admin, rows: Row[]): Promise<Map<string, DuplicateAsset>> {
  const ids = rows.map((r) => r.id);
  const [{ data: tagRows }, { data: usageRows }] = await Promise.all([
    admin.from("asset_tag_map").select("asset_id, asset_tags(name)").in("asset_id", ids),
    admin.from("asset_usages").select("asset_id, module, record_label").in("asset_id", ids),
  ]);
  const tags = new Map<string, string[]>();
  for (const t of (tagRows ?? []) as { asset_id: string; asset_tags: { name: string } | { name: string }[] | null }[]) {
    const names = (Array.isArray(t.asset_tags) ? t.asset_tags : t.asset_tags ? [t.asset_tags] : []).map((x) => x.name).filter(Boolean);
    tags.set(t.asset_id, [...(tags.get(t.asset_id) ?? []), ...names]);
  }
  const usedIn = new Map<string, string[]>();
  const pushUse = (id: string, label: string) => usedIn.set(id, [...(usedIn.get(id) ?? []), label]);
  for (const u of (usageRows ?? []) as { asset_id: string; module: string; record_label: string | null }[]) pushUse(u.asset_id, u.record_label || u.module);

  // รูปเว็บร้าน (แถวสี / รูปบนเว็บ) ไม่ได้ลง asset_usages → หาจากหน้าสินค้าเว็บที่ใช้ key นี้
  // ทำเฉพาะตอน "เจอรูปซ้ำ" ที่มาจากโฟลเดอร์เว็บ (นาน ๆ ครั้ง) · ตาราง store_listings หลักร้อยแถว
  const webIds = new Map(rows.filter((r) => r.r2_key.startsWith("storefront-")).map((r) => [r.r2_key, r.id]));
  if (webIds.size) {
    const listings = await fetchAllPages<{ parent_sku_id: string | null; shop_id: string | null; web_images: unknown; web_sku_images: unknown }>((from, to) =>
      admin.from("store_listings").select("parent_sku_id, shop_id, web_images, web_sku_images").order("id").range(from, to));
    const hits: { assetId: string; parentId: string | null; shopId: string | null; skuId: string | null }[] = [];
    for (const l of listings) {
      for (const k of Array.isArray(l.web_images) ? l.web_images : []) {
        const id = webIds.get(String(k));
        if (id) hits.push({ assetId: id, parentId: l.parent_sku_id, shopId: l.shop_id, skuId: null });
      }
      const sku = l.web_sku_images && typeof l.web_sku_images === "object" && !Array.isArray(l.web_sku_images) ? (l.web_sku_images as Record<string, unknown>) : {};
      for (const [skuId, v] of Object.entries(sku)) {
        for (const k of Array.isArray(v) ? v : [v]) {
          const id = webIds.get(String(k));
          if (id) hits.push({ assetId: id, parentId: l.parent_sku_id, shopId: l.shop_id, skuId });
        }
      }
    }
    if (hits.length) {
      const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))];
      const [{ data: parents }, { data: skus }, { data: shops }] = await Promise.all([
        admin.from("parent_skus_v2").select("id, code").in("id", uniq(hits.map((h) => h.parentId))),
        admin.from("skus_v2").select("id, code").in("id", uniq(hits.map((h) => h.skuId))),
        admin.from("shops").select("id, name").in("id", uniq(hits.map((h) => h.shopId))),
      ]);
      const name = (list: unknown, id: string | null, f: "code" | "name") => (id ? ((list ?? []) as Record<string, string>[]).find((x) => x.id === id)?.[f] : undefined);
      for (const h of hits) {
        const where = h.skuId ? (name(skus, h.skuId, "code") ?? name(parents, h.parentId, "code") ?? "SKU") : `${name(parents, h.parentId, "code") ?? "สินค้า"} · รูปบนเว็บ`;
        const shop = name(shops, h.shopId, "name");
        pushUse(h.assetId, shop ? `${where} (${shop})` : where);
      }
    }
  }

  const out = new Map<string, DuplicateAsset>();
  for (const r of rows) {
    const uses = [...new Set(usedIn.get(r.id) ?? [])];
    out.set(r.id, {
      id: r.id, r2_key: r.r2_key, title: r.title, file_name: r.file_name, size_bytes: r.size_bytes,
      width: r.width, height: r.height, created_at: r.created_at, uploaded_by: r.uploaded_by,
      tags: [...new Set(tags.get(r.id) ?? [])], usedIn: uses.slice(0, MAX_USED_IN), usedCount: uses.length,
    });
  }
  return out;
}
