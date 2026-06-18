/**
 * ของใช้ร่วมของ MO API (แยกจาก route.ts — กัน Next.js error เรื่อง route export ของเกิน handler)
 */
import { supabaseAdmin } from "@/lib/supabase-admin";

export type SizeQty = { label: string; qty: number };

/**
 * กางสูตร: ดึง bom_lines ของ bomCode → insert mo_materials
 * - ไม่มีไซส์ (sizeBreakdown ว่าง): required = qty_per × moQty (เหมือนเดิม)
 * - มีไซส์ (กลุ่ม C): บรรทัดที่ "ผันตามไซส์" (size_variant) แตกเป็น 1 แถวต่อไซส์
 *   ใช้ค่ามิติของไซส์นั้น (size_values[label] ตาม size_dim) · required = qty_per(ของไซส์) × จำนวนไซส์นั้น
 *   บรรทัดที่ไม่ผันตามไซส์ → แถวเดียว required = qty_per × moQty(รวมทุกไซส์)
 */
export async function explodeBom(admin: ReturnType<typeof supabaseAdmin>, bomCode: string | null, moNo: string, moQty: number, sizeBreakdown: SizeQty[] | null = null) {
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

  const r4 = (n: number) => Math.round(n * 10000) / 10000;
  const sizes = (sizeBreakdown ?? []).filter((s) => s && s.label != null && (Number(s.qty) || 0) > 0);
  const useSize = sizes.length > 0;

  const mats: Array<Record<string, unknown>> = [];
  let seq = 0;
  for (const l of rows) {
    const qtyPer = Number(l.qty) || 0;
    const sku = (l.component_sku as string) ?? null;
    const base: Record<string, unknown> = {
      mo_no: moNo,
      component_sku:  sku,
      component_name: (l.component_name as string) ?? null,
      material_type:  (sku && typeMap.get(sku)) || (l.material_type as string) || null,
      uom:            (l.uom as string) ?? null,
      cut_block_code: (l.cut_block_code as string) ?? null,
      cut_width:      l.cut_width != null ? Number(l.cut_width) : null,
      cut_length:     l.cut_length != null ? Number(l.cut_length) : null,
      pieces:         l.pieces != null ? Number(l.pieces) : null,
      is_active:      true,
    };
    if (useSize && l.size_variant) {
      const dim = String(l.size_dim || "cut_length");   // cut_length | cut_width | pieces | qty
      const sv = (l.size_values ?? {}) as Record<string, number>;
      for (const s of sizes) {
        const Qs = Number(s.qty) || 0;
        const dimVal = sv[s.label] != null ? Number(sv[s.label]) : null;
        let effQtyPer = qtyPer;
        const row: Record<string, unknown> = { ...base, size_label: s.label, sequence: ++seq };
        if (dim === "qty") { if (dimVal != null) effQtyPer = dimVal; }
        else if (dimVal != null) { row[dim] = dimVal; }   // ปรับมิติ (ความยาว/กว้าง/ชิ้น) ของไซส์นั้น
        row.qty_per = effQtyPer;
        row.required_qty = r4(effQtyPer * Qs);
        mats.push(row);
      }
    } else {
      mats.push({ ...base, size_label: null, sequence: ++seq, qty_per: qtyPer, required_qty: r4(qtyPer * (moQty || 0)) });
    }
  }
  if (mats.length > 0) await admin.from("mo_materials").insert(mats);

  // สรุปต่อวัตถุดิบ (รวมทุกไซส์/ทุกบล็อก — สำหรับซื้อ ไม่ต้องแยกไซส์)
  const byKey = new Map<string, { sku: string | null; name: string | null; type: string | null; uom: string | null; required: number }>();
  for (const m of mats) {
    const k = (m.component_sku as string) ?? "∅";
    const e = byKey.get(k);
    if (e) e.required += (m.required_qty as number) || 0;
    else byKey.set(k, { sku: (m.component_sku as string) ?? null, name: (m.component_name as string) ?? null, type: (m.material_type as string) ?? null, uom: (m.uom as string) ?? null, required: (m.required_qty as number) || 0 });
  }
  const sumRows = [...byKey.values()].map((e, i) => ({
    mo_no: moNo, component_sku: e.sku, component_name: e.name, material_type: e.type, uom: e.uom,
    qty_per: moQty > 0 ? r4(e.required / moQty) : 0, required_qty: r4(e.required),
    on_hand_qty: 0, to_purchase_qty: r4(e.required), is_ready: false, sequence: i + 1, is_active: true,
  }));
  if (sumRows.length > 0) await admin.from("mo_material_summary").insert(sumRows);
}
