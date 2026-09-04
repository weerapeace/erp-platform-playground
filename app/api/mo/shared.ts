/**
 * ของใช้ร่วมของ MO API (แยกจาก route.ts — กัน Next.js error เรื่อง route export ของเกิน handler)
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { layFabric, type LayBlock, type LayLayout } from "@/lib/mo-fabric-lay";

export type SizeQty = { label: string; qty: number };
/** วิธีคิดผ้าต่อใบ: lay = วางผ้าให้คุ้มที่สุด (ค่าเริ่มต้น) · classic = สูตรเดิม พื้นที่ + เผื่อเสีย% */
export type FabricCalcMode = "lay" | "classic";
export const fabricModeOf = (v: unknown): FabricCalcMode => (v === "classic" ? "classic" : "lay");

/**
 * กางสูตร: ดึง bom_lines ของ bomCode → insert mo_materials
 * - ไม่มีไซส์ (sizeBreakdown ว่าง): required = qty_per × moQty (เหมือนเดิม)
 * - มีไซส์ (กลุ่ม C): บรรทัดที่ "ผันตามไซส์" (size_variant) แตกเป็น 1 แถวต่อไซส์
 *   ใช้ค่ามิติของไซส์นั้น (size_values[label] ตาม size_dim) · required = qty_per(ของไซส์) × จำนวนไซส์นั้น
 *   บรรทัดที่ไม่ผันตามไซส์ → แถวเดียว required = qty_per × moQty(รวมทุกไซส์)
 */
export async function explodeBom(admin: ReturnType<typeof supabaseAdmin>, bomCode: string | null, moNo: string, moQty: number, sizeBreakdown: SizeQty[] | null = null, preserve = false, fabricMode: FabricCalcMode = "lay") {
  // preserve = พยายามเก็บค่าที่เคยกรอก (จำนวนที่มี/เตรียม/ขอซื้อ + ตัดครบ) ของวัตถุดิบชิ้นเดิมที่ยังอยู่ในสูตรใหม่
  const prevSum = new Map<string, { on_hand: number; ready: boolean; to_purchase: number | null }>();
  const prevCut = new Map<string, boolean>();
  if (preserve) {
    const { data: oldSum } = await admin.from("mo_material_summary").select("component_sku, on_hand_qty, is_ready, to_purchase_qty").eq("mo_no", moNo);
    for (const s of (oldSum ?? []) as Record<string, unknown>[]) { const k = s.component_sku ? String(s.component_sku) : null; if (k) prevSum.set(k, { on_hand: Number(s.on_hand_qty) || 0, ready: !!s.is_ready, to_purchase: s.to_purchase_qty != null ? Number(s.to_purchase_qty) : null }); }
    const { data: oldMat } = await admin.from("mo_materials").select("component_sku, cut_block_code, cut_done").eq("mo_no", moNo);
    for (const m of (oldMat ?? []) as Record<string, unknown>[]) { if (m.cut_done) prevCut.set(`${m.component_sku ?? ""}|${m.cut_block_code ?? ""}`, true); }
  }
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
  // ข้อมูลไว้ "วางผ้าให้คุ้มที่สุด": กฎคิดของกลุ่ม + หน้ากว้าง/ขนาดผืนของผ้าตัวนั้น
  type SkuCalc = { calc: string; divisor: number; face: number; sheetW: number; sheetL: number };
  const calcMap = new Map<string, SkuCalc>();
  if (codes.length > 0) {
    const { data: skus } = await admin.from("skus_v2")
      .select("code, fabric_width_cm, sheet_width_cm, sheet_length_cm, grp:material_groups!material_group_id ( name, calc_method, divisor )")
      .in("code", codes).eq("is_active", true);
    for (const s of (skus ?? []) as Array<Record<string, unknown>>) {
      const g = (Array.isArray(s.grp) ? s.grp[0] : s.grp) as { name?: string; calc_method?: string; divisor?: number } | null;
      if (g?.name) typeMap.set(String(s.code), g.name);
      calcMap.set(String(s.code), {
        calc: g?.calc_method ?? "manual", divisor: Number(g?.divisor) || 90,
        face: Number(s.fabric_width_cm) || 0, sheetW: Number(s.sheet_width_cm) || 0, sheetL: Number(s.sheet_length_cm) || 0,
      });
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
      cut_done:       preserve ? (prevCut.get(`${sku ?? ""}|${(l.cut_block_code as string) ?? ""}`) ?? false) : false,
      is_active:      true,
    };
    // ข้อมูลชั่วคราวไว้วางผ้า (ลบก่อน insert): จำนวนที่คูณของแถว + ห้ามหมุน + หน้ากว้าง/ผืนของบรรทัด
    const lay = {
      no_rotate: !!l.no_rotate,
      face: Number(l.face_width_cm) || 0,
      sheetW: Number(l.sheet_width) || 0, sheetL: Number(l.sheet_length) || 0,
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
        row.__lay = { ...lay, rowQty: Qs };
        mats.push(row);
      }
    } else {
      mats.push({ ...base, size_label: null, sequence: ++seq, qty_per: qtyPer, required_qty: r4(qtyPer * (moQty || 0)), __lay: { ...lay, rowQty: moQty || 0 } });
    }
  }

  // ── วางผ้าให้คุ้มที่สุด (เจ้าของสั่ง 2026-09-04) ─────────────────────────────
  // ผ้า/ลายพิมพ์/PU/ตัวเสริม (คิดตามหน้ากว้าง) และผ้าผืน: เอาทุกบล็อกของผ้าตัวเดียวกันมาวางรวมกันบนหน้าผ้าจริง
  // ตามจำนวนที่สั่ง → ได้ความยาวที่ต้องใช้จริง ไม่บวกเผื่อเสีย (ทับค่าที่คิดจากสูตรต่อชุด)
  // บรรทัดที่ข้อมูลไม่พอ (ไม่มีขนาดตัด/ไม่รู้หน้ากว้าง) → คงสูตรเดิม
  type LayRow = Record<string, unknown> & { __lay?: { no_rotate: boolean; face: number; sheetW: number; sheetL: number; rowQty: number }; __layQty?: number; __classicQty?: number };
  const layNoteOf = new Map<string, { note: string; length_cm: number; eff: number }>();   // ต่อ component_sku (ไว้ใส่แถวสรุป)
  const layLayoutOf = new Map<string, LayLayout[]>();   // ผังการวางต่อ component_sku (ป๊อป "ดูผังการวาง")
  {   // คิดแบบวางผ้า "เสมอ" เพื่อเก็บตัวเลขทั้ง 2 วิธีคู่กัน (เจ้าของขอโชว์เทียบ) · ตัวที่ใช้จริงเลือกตาม fabricMode
    const groups = new Map<string, { rows: LayRow[]; face: number; sheetL: number | null; divisor: number }>();
    for (const m of mats as LayRow[]) {
      const sku = (m.component_sku as string) ?? null; const L = m.__lay; if (!sku || !L) continue;
      const c = calcMap.get(sku); if (!c) continue;
      const w = Number(m.cut_width) || 0, h = Number(m.cut_length) || 0;
      if (w <= 0 || h <= 0 || L.rowQty <= 0) continue;
      let face = 0, sheetL: number | null = null;
      if (c.calc === "area_face") { face = L.face > 0 ? L.face : c.face; }
      else if (c.calc === "area_sheet") { face = L.sheetW > 0 ? L.sheetW : c.sheetW; sheetL = L.sheetL > 0 ? L.sheetL : c.sheetL; if (!sheetL) continue; }
      else continue;
      if (face <= 0) continue;
      const key = `${sku}|${face}|${sheetL ?? ""}`;
      const g = groups.get(key) ?? groups.set(key, { rows: [], face, sheetL, divisor: c.divisor }).get(key)!;
      g.rows.push(m);
    }
    for (const g of groups.values()) {
      const blocks: LayBlock[] = g.rows.map((m, i) => ({
        key: `b${i}`, label: `${m.cut_width}×${m.cut_length}`,
        width_cm: Number(m.cut_width) || 0, length_cm: Number(m.cut_length) || 0,
        total_pieces: (Number(m.pieces) || 1) * (m.__lay?.rowQty ?? 0),
        no_rotate: !!m.__lay?.no_rotate,
      }));
      const res = layFabric({ blocks, face_width_cm: g.face, sheet_length_cm: g.sheetL, divisor: g.divisor, unit: (g.rows[0].uom as string) ?? null });
      if (!res.ok) continue;
      g.rows.forEach((m, i) => {
        const pb = res.per_block[`b${i}`]; if (!pb) return;
        const rowQty = m.__lay?.rowQty ?? 0;
        m.__classicQty = Number(m.required_qty) || 0;   // สูตรเดิม (พื้นที่+เผื่อเสีย) เก็บไว้เทียบ
        m.__layQty = pb.qty;
        m.lay_note = pb.note;
        if (fabricMode === "lay") {                       // ใบนี้ใช้แบบวางคุ้มสุด → ทับตัวเลขที่ใช้จริง
          m.required_qty = pb.qty;
          m.qty_per = rowQty > 0 ? r4(pb.qty / rowQty) : 0;
        }
      });
      const sku = String(g.rows[0].component_sku);
      if (res.layout) {
        (layLayoutOf.get(sku) ?? layLayoutOf.set(sku, []).get(sku)!).push({
          face_width_cm: g.face, sheet_length_cm: g.sheetL, note: res.note, result: res.layout,
          blocks: blocks.map((b) => ({ key: b.key, label: b.label, width_cm: b.width_cm, length_cm: b.length_cm, total_pieces: b.total_pieces, no_rotate: !!b.no_rotate })),
        });
      }
      const prev = layNoteOf.get(sku);
      layNoteOf.set(sku, { note: prev ? `${prev.note} · ${res.note}` : res.note, length_cm: (prev?.length_cm ?? 0) + res.length_cm, eff: res.efficiency_pct });
    }
  }
  // ตัวเลขทั้ง 2 วิธี รวมต่อวัตถุดิบ (ไว้โชว์คู่กันในแถวสรุป) — วัตถุดิบที่ไม่ได้วางผ้า = ตัวเลขเดียวกันทั้ง 2 วิธี
  const both = new Map<string, { lay: number; classic: number; hasLay: boolean }>();
  for (const m of mats as LayRow[]) {
    const k = (m.component_sku as string) ?? "∅";
    const req = Number(m.required_qty) || 0;
    const e = both.get(k) ?? both.set(k, { lay: 0, classic: 0, hasLay: false }).get(k)!;
    if (m.__layQty != null) { e.lay += m.__layQty; e.classic += m.__classicQty ?? req; e.hasLay = true; }
    else { e.lay += req; e.classic += req; }
    delete m.__lay; delete m.__layQty; delete m.__classicQty;
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
  const sumRows = [...byKey.values()].map((e, i) => {
    const prev = preserve && e.sku ? prevSum.get(e.sku) : undefined;   // เก็บค่าเดิมถ้าวัตถุดิบชิ้นนี้ยังอยู่
    const required = r4(e.required);
    return {
      mo_no: moNo, component_sku: e.sku, component_name: e.name, material_type: e.type, uom: e.uom,
      qty_per: moQty > 0 ? r4(e.required / moQty) : 0, required_qty: required,
      on_hand_qty: prev ? prev.on_hand : 0,
      to_purchase_qty: prev && prev.to_purchase != null ? prev.to_purchase : required,
      is_ready: prev ? prev.ready : false, sequence: i + 1, is_active: true,
      lay_note: e.sku ? (layNoteOf.get(e.sku)?.note ?? null) : null,
      lay_length_cm: e.sku ? (layNoteOf.get(e.sku)?.length_cm ?? null) : null,
      lay_efficiency_pct: e.sku ? (layNoteOf.get(e.sku)?.eff ?? null) : null,
      lay_layout: e.sku ? (layLayoutOf.get(e.sku) ?? null) : null,
      required_lay:     both.get(e.sku ?? "∅")?.hasLay ? r4(both.get(e.sku ?? "∅")!.lay) : null,
      required_classic: both.get(e.sku ?? "∅")?.hasLay ? r4(both.get(e.sku ?? "∅")!.classic) : null,
    };
  });
  if (sumRows.length > 0) await admin.from("mo_material_summary").insert(sumRows);
}
