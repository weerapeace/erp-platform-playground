/**
 * แก้ข้อมูลด่วนจากหน้าพิมพ์ใบรวมทั้งรุ่น — POST /api/mo/family-print/fix
 *
 * ค่าวัตถุดิบถูกคัดลอกไว้ 3 ชั้น แก้ชั้นเดียวใบพิมพ์ไม่เปลี่ยน → ปุ่มเดียวแก้ครบตามที่ติ๊ก:
 *   sku  ข้อมูลวัตถุดิบ/สินค้า (skus_v2: name_th · uom_id · material_group_id · color_th)
 *   bom  บรรทัดสูตรที่ใช้วัตถุดิบนี้ (bom_lines ในสูตรที่ส่งมา: component_name · uom · material_type)
 *   mo   สำเนาในใบสั่งผลิต (mo_material_summary + mo_materials ของใบที่ส่งมา) — แก้เฉพาะช่องคำอธิบาย
 *        ไม่กางสูตรใหม่ → ติ๊กเตรียม/ตัด จำนวน ใบขอซื้อ ไม่ถูกแตะ
 * body: { target: "material"|"product", code, fields: { uom?, name?, type?, color? }, layers: { sku, bom, mo }, bom_codes[], mo_nos[], dry_run? }
 *   dry_run = คืนสรุป "จะแก้อะไรกี่แถว" + คำเตือน (ใช้ในกล่องยืนยันก่อนบันทึก) ไม่แก้อะไร
 * ของกลาง: guardApi(products.edit) · writeAuditFor (บันทึกค่าเดิม → ใหม่ ทุกครั้ง)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
type Body = {
  target?: string; code?: string;
  fields?: { uom?: string; name?: string; type?: string; color?: string };
  layers?: { sku?: boolean; bom?: boolean; mo?: boolean };
  bom_codes?: string[]; mo_nos?: string[]; dry_run?: boolean;
};
const str = (v: unknown) => String(v ?? "").trim();
const list = (v: unknown, max = 300) => (Array.isArray(v) ? [...new Set(v.map(str).filter(Boolean))].slice(0, max) : []);

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  let body: Body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "ข้อมูลที่ส่งมาไม่ถูกต้อง" }, { status: 400 }); }

  const code = str(body.code);
  const target = body.target === "product" ? "product" : body.target === "material" ? "material" : null;
  if (!code || !target) return NextResponse.json({ error: "ต้องระบุรหัสและชนิดที่จะแก้" }, { status: 400 });
  const f = body.fields ?? {};
  const want = {
    uom: target === "material" ? str(f.uom) : "", name: target === "material" ? str(f.name) : "",
    type: target === "material" ? str(f.type) : "", color: target === "product" ? str(f.color) : "",
  };
  if (!want.uom && !want.name && !want.type && !want.color) return NextResponse.json({ error: "ยังไม่ได้กรอกค่าที่จะแก้" }, { status: 400 });
  // สินค้า (ชื่อสี) มีชั้นเดียว · วัตถุดิบเลือกชั้นได้ (ค่าเริ่ม = ครบ 3 ชั้น)
  const layers = target === "product" ? { sku: true, bom: false, mo: false }
    : { sku: body.layers?.sku !== false, bom: body.layers?.bom !== false, mo: body.layers?.mo !== false };
  const bomCodes = layers.bom ? list(body.bom_codes) : [];
  const moNos = layers.mo ? list(body.mo_nos) : [];
  const admin = supabaseAdmin();

  const { data: sku } = await admin.from("skus_v2").select("id, code, name_th, color_th, uom_id, material_group_id").eq("code", code).eq("is_active", true).limit(1).maybeSingle();
  if (!sku) return NextResponse.json({ error: `ไม่พบรหัส ${code} ในข้อมูลสินค้า/วัตถุดิบ` }, { status: 404 });
  const s = sku as Row;

  // ชื่อหน่วย / ชนิด ต้องมีอยู่จริงในระบบ (ไม่สร้างใหม่จากตรงนี้)
  let uomId: string | null = null, groupId: string | null = null;
  if (want.uom) {
    const { data } = await admin.from("uoms").select("id, active").eq("name", want.uom).order("active", { ascending: false }).limit(1).maybeSingle();
    if (!data) return NextResponse.json({ error: `ไม่พบหน่วย "${want.uom}" ในระบบ` }, { status: 400 });
    uomId = String((data as Row).id);
  }
  if (want.type) {
    const { data } = await admin.from("material_groups").select("id").eq("name", want.type).limit(1).maybeSingle();
    if (!data) return NextResponse.json({ error: `ไม่พบชนิดวัตถุดิบ "${want.type}" ในระบบ` }, { status: 400 });
    groupId = String((data as Row).id);
  }

  // ค่าเดิม (ไว้โชว์ในกล่องยืนยัน + จด audit)
  const [uomOld, grpOld, bomRows, sumRows, matRows, moves, prs] = await Promise.all([
    s.uom_id ? admin.from("uoms").select("name").eq("id", String(s.uom_id)).maybeSingle() : Promise.resolve({ data: null }),
    s.material_group_id ? admin.from("material_groups").select("name").eq("id", String(s.material_group_id)).maybeSingle() : Promise.resolve({ data: null }),
    bomCodes.length ? admin.from("bom_lines").select("id, bom_code, uom, component_name, material_type").eq("component_sku", code).in("bom_code", bomCodes) : Promise.resolve({ data: [] as Row[] }),
    moNos.length ? admin.from("mo_material_summary").select("id").eq("component_sku", code).in("mo_no", moNos).eq("is_active", true) : Promise.resolve({ data: [] as Row[] }),
    moNos.length ? admin.from("mo_materials").select("id").eq("component_sku", code).in("mo_no", moNos).eq("is_active", true) : Promise.resolve({ data: [] as Row[] }),
    // เปลี่ยนหน่วยของวัตถุดิบที่เคยมีสต๊อก/ใบขอซื้อ = เปลี่ยนแค่ชื่อหน่วย ตัวเลขเดิมไม่แปลง → ต้องเตือน
    want.uom && layers.sku ? admin.from("erp_playground_stock_movements").select("id", { count: "exact", head: true }).eq("product_id", String(s.id)) : Promise.resolve({ count: 0 }),
    want.uom && layers.sku ? admin.from("purchase_requests_v2").select("id", { count: "exact", head: true }).eq("item_sku_id", String(s.id)).eq("is_active", true) : Promise.resolve({ count: 0 }),
  ]);
  const before = {
    name: str(s.name_th) || null, color: str(s.color_th) || null,
    uom: str((uomOld.data as Row | null)?.name) || null, type: str((grpOld.data as Row | null)?.name) || null,
  };
  const bomList = (bomRows.data ?? []) as Row[];
  const sumIds = ((sumRows.data ?? []) as Row[]).map((r) => String(r.id));
  const matIds = ((matRows.data ?? []) as Row[]).map((r) => String(r.id));
  const nMoves = (moves as { count?: number | null }).count ?? 0, nPr = (prs as { count?: number | null }).count ?? 0;

  const fieldText = [
    want.uom && `หน่วย ${before.uom ?? "-"} → ${want.uom}`,
    want.name && `ชื่อ "${before.name ?? code}" → "${want.name}"`,
    want.type && `ชนิด ${before.type ?? "(ยังไม่ตั้ง)"} → ${want.type}`,
    want.color && `ชื่อสี "${before.color ?? "-"}" → "${want.color}"`,
  ].filter(Boolean).join(" · ");
  const changes = [
    layers.sku && { layer: "sku", label: `${target === "product" ? "ข้อมูลสินค้า" : "ข้อมูลวัตถุดิบ"} ${code}`, count: 1, detail: fieldText },
    layers.bom && { layer: "bom", label: `บรรทัดสูตร ${bomCodes.join(", ") || "-"}`, count: bomList.length, detail: bomList.length ? "หน่วย/ชื่อ/ชนิด ในบรรทัดสูตร" : "ไม่พบบรรทัดที่ใช้รหัสนี้" },
    layers.mo && { layer: "mo", label: `ใบสั่งผลิต ${moNos.join(", ") || "-"}`, count: sumIds.length + matIds.length, detail: "แก้เฉพาะหน่วย/ชื่อ/ชนิด — ติ๊กเตรียม/ตัด จำนวน ไม่เปลี่ยน" },
  ].filter(Boolean) as { layer: string; label: string; count: number; detail: string }[];
  const warnings = nMoves + nPr > 0
    ? [`รหัสนี้มีประวัติสต๊อก ${nMoves} ครั้ง / ใบขอซื้อ ${nPr} ใบ — เปลี่ยนแค่ชื่อหน่วย ตัวเลขเดิมไม่ถูกแปลง ตรวจให้แน่ใจว่าหน่วยเดิมนับแบบเดียวกัน`]
    : [];
  if (body.dry_run) return NextResponse.json({ data: { changes, warnings }, error: null });

  // ── แก้จริง ──
  const errors: string[] = [];
  if (layers.sku) {
    const patch: Row = {};
    if (want.name) patch.name_th = want.name;
    if (uomId) patch.uom_id = uomId;
    if (groupId) patch.material_group_id = groupId;
    if (want.color) patch.color_th = want.color;
    const { error } = await admin.from("skus_v2").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", String(s.id));
    if (error) errors.push(`ข้อมูลหลัก: ${error.message}`);
  }
  const copyPatch: Row = {};
  if (want.uom) copyPatch.uom = want.uom;
  if (want.name) copyPatch.component_name = want.name;
  if (want.type) copyPatch.material_type = want.type;
  if (layers.bom && bomList.length && Object.keys(copyPatch).length) {
    const { error } = await admin.from("bom_lines").update(copyPatch).in("id", bomList.map((r) => String(r.id)));
    if (error) errors.push(`สูตร BOM: ${error.message}`);
  }
  if (layers.mo && Object.keys(copyPatch).length) {
    if (sumIds.length) { const { error } = await admin.from("mo_material_summary").update(copyPatch).in("id", sumIds); if (error) errors.push(`สรุปวัตถุดิบในใบ: ${error.message}`); }
    if (matIds.length) { const { error } = await admin.from("mo_materials").update(copyPatch).in("id", matIds); if (error) errors.push(`บล็อกตัดในใบ: ${error.message}`); }
  }
  await writeAuditFor(request, admin, {
    action: "update", entityType: "skus_v2", entityId: String(s.id),
    metadata: {
      source: "family_print_fix", code, target, layers, before, after: want,
      bom_codes: bomCodes, bom_lines: bomList.length, mo_nos: moNos, mo_rows: sumIds.length + matIds.length, errors,
    },
  });
  if (errors.length) return NextResponse.json({ data: { changes, warnings }, error: `แก้ได้บางส่วน — ${errors.join(" · ")}` }, { status: 500 });
  return NextResponse.json({ data: { changes, warnings }, error: null });
}
