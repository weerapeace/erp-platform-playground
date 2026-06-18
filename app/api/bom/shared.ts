/** ของใช้ร่วมของ BOM API (แยกจาก route.ts — route ต้อง export แค่ handler) */
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { BomLine, BomSize } from "./route";

/** แทนที่ไซส์ทั้งชุดของสูตร (bom_sizes) */
export async function saveBomSizes(admin: ReturnType<typeof supabaseAdmin>, bomCode: string, sizes: BomSize[]) {
  await admin.from("bom_sizes").delete().eq("bom_code", bomCode);
  const rows = sizes.filter((s) => (s.label ?? "").trim()).map((s, i) => ({ bom_code: bomCode, label: s.label.trim(), sort: s.sort ?? i }));
  if (rows.length) await admin.from("bom_sizes").insert(rows);
}

export function lineToRow(l: BomLine, bomCode: string, idx: number): Record<string, unknown> {
  return {
    bom_code:         bomCode,
    slot_code:        l.slot_code || null,
    component_sku:    l.component_sku || null,
    component_name:   l.component_name || null,
    qty:              Number(l.qty) || 0,
    uom:              l.uom || null,
    waste_percent:    l.waste_percent != null ? Number(l.waste_percent) : null,
    is_optional:      !!l.is_optional,
    sequence:         l.sequence ?? idx + 1,
    source:           l.source ?? "manual",
    odoo_bom_line_id: l.odoo_bom_line_id ?? null,
    // ชั้น 2: ฟิลด์คำนวณบล็อกตัด
    calc_mode:        l.calc_mode ?? "manual",
    cut_block_id:     l.cut_block_id ?? null,
    cut_block_code:   l.cut_block_code || null,
    pieces:           l.pieces != null ? Number(l.pieces) : null,
    cut_width:        l.cut_width != null ? Number(l.cut_width) : null,
    cut_length:       l.cut_length != null ? Number(l.cut_length) : null,
    face_width_cm:    l.face_width_cm != null ? Number(l.face_width_cm) : null,
    material_type:    l.material_type || null,
    size_variant:     !!l.size_variant,
    size_dim:         l.size_dim || "cut_length",
    size_values:      l.size_values && typeof l.size_values === "object" ? l.size_values : {},
    is_active:        true,
  };
}
