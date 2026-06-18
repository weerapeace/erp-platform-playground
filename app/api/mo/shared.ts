/**
 * ของใช้ร่วมของ MO API (แยกจาก route.ts — กัน Next.js error เรื่อง route export ของเกิน handler)
 */
import { supabaseAdmin } from "@/lib/supabase-admin";

/** กางสูตร: ดึง bom_lines ของ bomCode → insert mo_materials (required = qty_per × moQty) */
export async function explodeBom(admin: ReturnType<typeof supabaseAdmin>, bomCode: string | null, moNo: string, moQty: number) {
  await admin.from("mo_materials").delete().eq("mo_no", moNo);
  await admin.from("mo_material_summary").delete().eq("mo_no", moNo);
  if (!bomCode) return;
  const { data: lines } = await admin.from("bom_lines").select("*").eq("bom_code", bomCode).eq("is_active", true)
    .order("sequence", { ascending: true, nullsFirst: false }).order("id", { ascending: true });
  const rows = (lines ?? []) as Array<Record<string, unknown>>;
  if (rows.length === 0) return;

  // ดึง "ประเภท" (กลุ่มวัตถุดิบ) จาก SKU ของแต่ละ component
  const codes = [...new Set(rows.map((l) => l.component_sku).filter(Boolean) as string[])];
  const typeMap = new Map<string, string>();
  if (codes.length > 0) {
    const { data: skus } = await admin.from("skus_v2").select("code, grp:material_groups!material_group_id ( name )").in("code", codes);
    for (const s of (skus ?? []) as Array<Record<string, unknown>>) {
      const g = (Array.isArray(s.grp) ? s.grp[0] : s.grp) as { name?: string } | null;
      if (g?.name) typeMap.set(String(s.code), g.name);
    }
  }

  const mats = rows.map((l, i) => {
    const qtyPer = Number(l.qty) || 0;
    const sku = (l.component_sku as string) ?? null;
    return {
      mo_no: moNo,
      component_sku:  sku,
      component_name: (l.component_name as string) ?? null,
      material_type:  (sku && typeMap.get(sku)) || (l.material_type as string) || null,
      qty_per:        qtyPer,
      required_qty:   Math.round(qtyPer * (moQty || 0) * 10000) / 10000,
      uom:            (l.uom as string) ?? null,
      cut_block_code: (l.cut_block_code as string) ?? null,
      cut_width:      l.cut_width != null ? Number(l.cut_width) : null,
      cut_length:     l.cut_length != null ? Number(l.cut_length) : null,
      pieces:         l.pieces != null ? Number(l.pieces) : null,
      sequence:       (l.sequence as number) ?? i + 1,
      is_active:      true,
    };
  });
  await admin.from("mo_materials").insert(mats);

  // สรุปต่อวัตถุดิบ (รวมตัวเดียวกันจากหลายบล็อก)
  const r4 = (n: number) => Math.round(n * 10000) / 10000;
  const byKey = new Map<string, { sku: string | null; name: string | null; type: string | null; uom: string | null; qtyPer: number }>();
  for (const m of mats) {
    const k = m.component_sku ?? "∅";
    const e = byKey.get(k);
    if (e) e.qtyPer += m.qty_per || 0;
    else byKey.set(k, { sku: m.component_sku, name: m.component_name, type: m.material_type, uom: m.uom, qtyPer: m.qty_per || 0 });
  }
  const sumRows = [...byKey.values()].map((e, i) => ({
    mo_no: moNo, component_sku: e.sku, component_name: e.name, material_type: e.type, uom: e.uom,
    qty_per: r4(e.qtyPer), required_qty: r4(e.qtyPer * (moQty || 0)),
    on_hand_qty: 0, to_purchase_qty: r4(e.qtyPer * (moQty || 0)), is_ready: false, sequence: i + 1, is_active: true,
  }));
  if (sumRows.length > 0) await admin.from("mo_material_summary").insert(sumRows);
}
