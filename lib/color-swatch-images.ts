/**
 * ✂️ แหล่งรูปให้ครอปรูปลายจุดสี (ทะเบียนสี → ✂️ ครอปจากรูป SKU) — ใช้ใน /api/color-swatches?images=
 *   กลุ่ม SKU ที่ใช้ชื่อสีนี้ (ปก · แกลเลอรี · รูปเว็บรายสี · ตัวที่ขึ้นเว็บก่อน · สูงสุด 16 ตัว)
 *   + กลุ่ม "รูปของรุ่น" (kind parent: ปก/แกลเลอรี Parent + รูปเว็บของรุ่น · ไม่ซ้ำกับรูปของ SKU)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { toKeyList } from "@/lib/website-listing-patch";

const KEY_RE = /^[\w\-./%()]+$/; // r2 object key ที่ยอมรับ
type Sb = ReturnType<typeof supabaseAdmin>;

/** SKU ที่ใช้สีชื่อเหล่านี้ + รูปทั้งหมดของแต่ละตัว (ตัวที่ขึ้นเว็บก่อน · สูงสุด 16 ตัว) */
export async function swatchSourceImages(sb: Sb, names: string[]) {
  const esc = (s: string) => s.replace(/[\\%_]/g, (m) => "\\" + m);
  const res = await Promise.all(
    names.map((n) => sb.from("skus_v2").select("id, code, name_th, color, cover_image_r2_key, parent_sku_id").ilike("color", esc(n)).eq("is_active", true).order("code").limit(40)),
  );
  type K = { id: string; code: string | null; name_th: string | null; color: string | null; cover_image_r2_key: string | null; parent_sku_id: string | null };
  const kids = new Map<string, K>();
  for (const r of res) for (const k of (r.data ?? []) as K[]) kids.set(k.id, k);
  if (!kids.size) return [];
  const ids = [...kids.keys()];
  const parents = [...new Set([...kids.values()].map((k) => k.parent_sku_id).filter((x): x is string => !!x))];
  const [{ data: att }, { data: lst }] = await Promise.all([
    sb.from("erp_playground_attachments").select("entity_id, file_path, content_type").eq("entity_type", "skus_v2").in("entity_id", ids).order("is_primary", { ascending: false }).order("sort_order", { ascending: true }),
    parents.length ? sb.from("store_listings").select("parent_sku_id, is_published, web_sku_images, web_images").in("parent_sku_id", parents) : Promise.resolve({ data: [] }),
  ]);
  // 📦 รูปของรุ่น (Parent) — รูปรวม/รูปไลฟ์สไตล์มักเห็นลายชัดกว่ารูปปก SKU
  const [{ data: par }, { data: patt }] = parents.length
    ? await Promise.all([
        sb.from("parent_skus_v2").select("id, code, name_th, cover_image_r2_key").in("id", parents),
        sb.from("erp_playground_attachments").select("entity_id, file_path, content_type").eq("entity_type", "parent_skus_v2").in("entity_id", parents).order("is_primary", { ascending: false }).order("sort_order", { ascending: true }),
      ])
    : [{ data: [] }, { data: [] }];
  const pImgs = new Map<string, string[]>();
  const addP = (id: string, key: string | null | undefined) => {
    if (!key || !KEY_RE.test(key)) return;
    const arr = pImgs.get(id) ?? [];
    if (!arr.includes(key)) arr.push(key);
    pImgs.set(id, arr);
  };
  for (const p of (par ?? []) as { id: string; cover_image_r2_key: string | null }[]) addP(p.id, p.cover_image_r2_key);
  for (const a of (patt ?? []) as { entity_id: string; file_path: string | null; content_type: string | null }[]) {
    if (a.content_type && !a.content_type.startsWith("image/")) continue;
    addP(a.entity_id, a.file_path);
  }
  const imgs = new Map<string, string[]>();
  const add = (id: string, key: string | null | undefined) => {
    if (!key || !KEY_RE.test(key)) return;
    const arr = imgs.get(id) ?? [];
    if (!arr.includes(key)) arr.push(key);
    imgs.set(id, arr);
  };
  for (const k of kids.values()) add(k.id, k.cover_image_r2_key);
  for (const a of (att ?? []) as { entity_id: string; file_path: string | null; content_type: string | null }[]) {
    if (a.content_type && !a.content_type.startsWith("image/")) continue;
    add(a.entity_id, a.file_path);
  }
  const onWeb = new Set<string>();
  for (const l of (lst ?? []) as { parent_sku_id: string; is_published: boolean | null; web_sku_images: unknown }[]) {
    if (l.is_published) onWeb.add(l.parent_sku_id);
    const raw = l.web_sku_images && typeof l.web_sku_images === "object" && !Array.isArray(l.web_sku_images) ? (l.web_sku_images as Record<string, unknown>) : {};
    for (const [skuId, v] of Object.entries(raw)) if (kids.has(skuId)) for (const key of toKeyList(v)) add(skuId, key);
    for (const key of toKeyList((l as { web_images?: unknown }).web_images)) addP(l.parent_sku_id, key);
  }
  const skuGroups = [...kids.values()]
    .map((k) => ({ skuId: k.id, code: k.code ?? "", name: k.name_th ?? "", color: k.color ?? "", onWeb: !!k.parent_sku_id && onWeb.has(k.parent_sku_id), images: (imgs.get(k.id) ?? []).slice(0, 12), kind: "sku" as const }))
    .filter((g) => g.images.length > 0)
    .sort((a, b) => Number(b.onWeb) - Number(a.onWeb) || a.code.localeCompare(b.code))
    .slice(0, 16);
  // รูปของรุ่น: ตัดรูปที่อยู่ในกลุ่ม SKU ของรุ่นนั้นแล้วออก (ไม่ซ้ำ)
  const parentGroups = ((par ?? []) as { id: string; code: string | null; name_th: string | null }[])
    .map((p) => {
      const mine = new Set([...kids.values()].filter((k) => k.parent_sku_id === p.id).flatMap((k) => imgs.get(k.id) ?? []));
      return { skuId: `parent:${p.id}`, code: p.code ?? "", name: p.name_th ?? "", color: "", onWeb: onWeb.has(p.id), images: (pImgs.get(p.id) ?? []).filter((k) => !mine.has(k)).slice(0, 16), kind: "parent" as const };
    })
    .filter((g) => g.images.length > 0)
    .sort((a, b) => a.code.localeCompare(b.code))
    .slice(0, 8);
  return [...skuGroups, ...parentGroups];
}
