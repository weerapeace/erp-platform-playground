/**
 * Parent SKU แบบดูอย่างเดียว — โหลดข้อมูลฝั่งเซิร์ฟเวอร์ (ใช้ใน API เท่านั้น · ชนิดข้อมูล lib/parent-sku-view)
 *   loadParentCard = การ์ดเล็ก · loadParentView = รูป + สเปค + BOM ต่อ SKU ลูก
 *   ⚠️ select เฉพาะคอลัมน์ที่ไม่ใช่ราคา/ต้นทุน — ห้ามเพิ่ม *_cost / *_price / costs ในไฟล์นี้
 * รูป = erp_playground_attachments (parent_skus_v2 → ถ้าไม่มีใช้รูป SKU ลูก) + cover_image_r2_key
 * BOM = bom_headers.product_sku = รหัส SKU ลูก (สูตรหลัก is_default → เวอร์ชันล่าสุด) · bom_lines ผูกด้วย bom_code
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import type { ParentSkuBomLine, ParentSkuCard, ParentSkuChild, ParentSkuView } from "@/lib/parent-sku-view";

type Db = ReturnType<typeof supabaseAdmin>;

const SPEC_COLS = "id, code, name_th, name_en, sku_name, cover_image_r2_key, size_summary, size_length_cm, size_height_cm, size_thickness_cm, materials, zipper, lining, strap, thread, logo, spares, work_instruction_notes";
const r2Url = (key: string) => `/api/r2-image?key=${encodeURIComponent(key)}`;
const num = (v: unknown) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const txt = (v: unknown) => (typeof v === "string" ? v.trim() : "");

type ParentRow = Record<string, unknown> & { id: string; code: string };

async function childSkus(admin: Db, parentId: string) {
  const { data } = await admin.from("skus_v2").select("id, code, color, name_th, is_active").eq("parent_sku_id", parentId).order("code").limit(200);
  return ((data ?? []) as Array<{ id: string; code: string; color: string | null; name_th: string | null; is_active: boolean | null }>).filter((s) => s.is_active !== false);
}

/** สูตรหลักต่อ SKU (is_default ก่อน → เวอร์ชันล่าสุด) */
async function mainBoms(admin: Db, codes: string[]) {
  const out = new Map<string, { bom_code: string; version: string | null }>();
  if (!codes.length) return out;
  const { data } = await admin.from("bom_headers").select("bom_code, product_sku, version, is_default, is_active, updated_at").in("product_sku", codes).limit(2000);
  const rows = ((data ?? []) as Array<{ bom_code: string; product_sku: string; version: string | null; is_default: boolean | null; is_active: boolean | null; updated_at: string | null }>)
    .filter((h) => h.is_active !== false)
    .sort((a, b) => Number(!!b.is_default) - Number(!!a.is_default) || String(b.version ?? "").localeCompare(String(a.version ?? ""), undefined, { numeric: true }) || String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")));
  for (const h of rows) if (!out.has(h.product_sku)) out.set(h.product_sku, { bom_code: h.bom_code, version: h.version });
  return out;
}

const parentName = (p: ParentRow) => txt(p.name_th) || txt(p.sku_name) || txt(p.name_en) || p.code;

export async function loadParentCard(admin: Db, parentId: string | null | undefined): Promise<ParentSkuCard | null> {
  if (!parentId) return null;
  const { data: p } = await admin.from("parent_skus_v2").select("id, code, name_th, name_en, sku_name, cover_image_r2_key").eq("id", parentId).maybeSingle();
  if (!p) return null;
  const row = p as ParentRow;
  const [kids, { data: att }] = await Promise.all([
    childSkus(admin, parentId),
    row.cover_image_r2_key ? Promise.resolve({ data: null }) : admin.from("erp_playground_attachments").select("public_url, content_type")
      .eq("entity_type", "parent_skus_v2").eq("entity_id", parentId).order("is_primary", { ascending: false }).order("sort_order", { ascending: true }).limit(5),
  ]);
  const boms = await mainBoms(admin, kids.map((k) => k.code));
  const firstImg = ((att ?? []) as Array<{ public_url: string; content_type: string | null }>).find((a) => String(a.content_type ?? "").startsWith("image/"));
  return {
    id: row.id, code: row.code, name: parentName(row),
    cover_url: row.cover_image_r2_key ? r2Url(String(row.cover_image_r2_key)) : firstImg?.public_url ?? null,
    sku_count: kids.length, bom_count: boms.size,
  };
}

export async function loadParentView(admin: Db, parentId: string): Promise<ParentSkuView | null> {
  const { data: p } = await admin.from("parent_skus_v2").select(SPEC_COLS).eq("id", parentId).maybeSingle();
  if (!p) return null;
  const row = p as unknown as ParentRow;
  const kids = await childSkus(admin, parentId);
  const [boms, { data: pAtt }] = await Promise.all([
    mainBoms(admin, kids.map((k) => k.code)),
    admin.from("erp_playground_attachments").select("public_url, content_type")
      .eq("entity_type", "parent_skus_v2").eq("entity_id", parentId).order("is_primary", { ascending: false }).order("sort_order", { ascending: true }).order("created_at", { ascending: true }).limit(40),
  ]);

  // รูป: ปก → แกลเลอรี Parent → (ไม่มี) รูป SKU ลูก
  const images: string[] = [];
  const push = (u: string | null | undefined) => { if (u && !images.includes(u)) images.push(u); };
  if (row.cover_image_r2_key) push(r2Url(String(row.cover_image_r2_key)));
  for (const a of (pAtt ?? []) as Array<{ public_url: string; content_type: string | null }>) if (String(a.content_type ?? "").startsWith("image/")) push(a.public_url);
  if (images.length <= 1 && kids.length) {
    const { data: kAtt } = await admin.from("erp_playground_attachments").select("public_url, content_type")
      .eq("entity_type", "skus_v2").in("entity_id", kids.map((k) => k.id)).order("is_primary", { ascending: false }).order("sort_order", { ascending: true }).limit(24);
    for (const a of (kAtt ?? []) as Array<{ public_url: string; content_type: string | null }>) if (String(a.content_type ?? "").startsWith("image/")) push(a.public_url);
  }

  // สเปค — เฉพาะช่องที่มีข้อมูล
  const dims = [num(row.size_length_cm), num(row.size_height_cm), num(row.size_thickness_cm)];
  const size = txt(row.size_summary) || (dims.some((d) => d !== null) ? `${dims.map((d) => d ?? "–").join(" × ")} ซม.` : "");
  const specs = ([
    ["ขนาด", "Size", size], ["วัสดุ", "Materials", txt(row.materials)], ["ซิป", "Zipper", txt(row.zipper)],
    ["ซับใน", "Lining", txt(row.lining)], ["สาย", "Strap", txt(row.strap)], ["ด้าย", "Thread", txt(row.thread)],
    ["โลโก้", "Logo", txt(row.logo)], ["อะไหล่", "Hardware / spares", txt(row.spares)], ["หมายเหตุการผลิต", "Production notes", txt(row.work_instruction_notes)],
  ] as const).filter(([, , v]) => v).map(([th, en, value]) => ({ th, en, value }));

  // BOM ต่อ SKU ลูก
  const bomCodes = [...new Set([...boms.values()].map((b) => b.bom_code))];
  const linesBy = new Map<string, ParentSkuBomLine[]>();
  if (bomCodes.length) {
    const { data: lines } = await admin.from("bom_lines")
      .select("bom_code, component_sku, component_name, qty, uom, cut_width, cut_length, pieces, material_type, is_optional, is_active, sequence")
      .in("bom_code", bomCodes).order("sequence", { ascending: true }).limit(5000);
    for (const l of (lines ?? []) as Array<Record<string, unknown>>) {
      if (l.is_active === false) continue;
      const k = String(l.bom_code);
      linesBy.set(k, [...(linesBy.get(k) ?? []), {
        name: txt(l.component_name) || txt(l.component_sku) || "—", code: txt(l.component_sku) || null,
        qty: num(l.qty), uom: txt(l.uom) || null, cut_width: num(l.cut_width), cut_length: num(l.cut_length),
        pieces: num(l.pieces), material_type: txt(l.material_type) || null, optional: l.is_optional === true,
      }]);
    }
  }
  const children: ParentSkuChild[] = kids.map((k) => {
    const b = boms.get(k.code);
    return { id: k.id, code: k.code, label: txt(k.color) || txt(k.name_th) || k.code, bom: b ? { code: b.bom_code, version: b.version, lines: linesBy.get(b.bom_code) ?? [] } : null };
  });

  return {
    id: row.id, code: row.code, name: parentName(row), name_en: txt(row.name_en) || null,
    cover_url: images[0] ?? null, sku_count: kids.length, bom_count: boms.size,
    images, specs, children,
  };
}
