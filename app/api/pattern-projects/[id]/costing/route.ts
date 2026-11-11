/**
 * POST /api/pattern-projects/[id]/costing — ส่งชิ้นของแพทเทิร์นไป "ตีราคา" ของใบงานออกแบบ
 *   body { sheet_id, parent_code?: string | null, dry?: boolean }
 *   สิทธิ์: pattern_studio.edit + ดูต้นทุน (products.cost.view — ตัวเดียวกับที่ใช้บันทึกตีราคา)
 *
 *   dry = true → ไม่เขียนอะไร คืนสรุปว่าจะเพิ่ม/อัปเดตกี่บรรทัด (ให้ผู้ใช้เห็นก่อนกดยืนยัน)
 *   ส่งจริง  → เพิ่มบรรทัดใหม่ + อัปเดตบรรทัดของชิ้นที่เคยส่ง (จับคู่ด้วยรหัสชิ้น + วัสดุ) — **ไม่ลบบรรทัดเดิมของใบงาน**
 *   ใช้ข้อมูลแพทเทิร์นที่ "บันทึกแล้ว" · สูตรจับคู่/คิดเงิน = lib/pattern-costing (สูตรเดียวกับหน้าตีราคา)
 *   + ซิปและอะไหล่ของแพทเทิร์น (template.trims) → 1 วัสดุ = 1 บรรทัด ไม่มีรูปทรง จับคู่ตอนส่งซ้ำด้วย วัสดุ + ป้าย "[แพทเทิร์น <เลขที่>]" ในหมายเหตุ (lib/pattern-trims)
 *   จำเป้าหมายล่าสุดไว้ในช่อง template.costing ของแพทเทิร์น · จดประวัติทั้งฝั่งใบงานและฝั่งแพทเทิร์น
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { apiCan, guardApi } from "@/lib/api-auth";
import { COST_PERM } from "@/lib/cost-access";
import { writeAudit } from "@/lib/audit";
import { cleanProjectPieces } from "@/lib/pattern-project";
import { planCostingSend, type ExistingCostLine } from "@/lib/pattern-costing";
import { cleanTrims, openSlits, planTrimsSend, trimRows } from "@/lib/pattern-trims";
import type { CostItemLike } from "@/lib/design-sheet-cost-row";
import { PROJECT_PERM, PROJECT_TABLE, loadProjectActor } from "@/lib/pattern-project-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LINE_COLS = "id, parent_code, sort_order, item_id, item_name, item_sku_code, group_code, group_name, calc_method, width_cm, length_cm, pieces, face_width_cm, waste_percent, divisor, qty, uom, unit_price, amount, note, shape";
const n = (v: unknown): number | null => (v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, PROJECT_PERM.edit); if (denied) return denied;
  if (!(await apiCan(request, COST_PERM))) return NextResponse.json({ error: "คุณไม่มีสิทธิ์แก้ตีราคา (ต้องมีสิทธิ์ดูต้นทุน) — ให้หัวหน้าหรือผู้ดูแลระบบส่งให้" }, { status: 403 });
  const { id } = await params;
  let body: { sheet_id?: unknown; parent_code?: unknown; dry?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const sheetId = typeof body.sheet_id === "string" ? body.sheet_id : "";
  const parent = typeof body.parent_code === "string" ? body.parent_code.trim() : "";
  if (!UUID.test(id) || !UUID.test(sheetId)) return NextResponse.json({ error: "เลือกใบงานออกแบบก่อน" }, { status: 400 });

  const admin = supabaseAdmin();
  const [{ data: proj }, { data: sheet }, { data: lines, error: lineErr }, actor] = await Promise.all([
    admin.from(PROJECT_TABLE).select("id, pattern_no, name, pieces, basis, template").eq("id", id).eq("is_active", true).maybeSingle(),
    admin.from("design_sheets").select("id, code, name, parent_sku_codes, parent_sku_drafts").eq("id", sheetId).maybeSingle(),
    admin.from("design_sheet_cost_lines").select(LINE_COLS).eq("sheet_id", sheetId),
    loadProjectActor(request, admin),
  ]);
  if (!proj) return NextResponse.json({ error: "ไม่พบแพทเทิร์นนี้ (อาจถูกลบไปแล้ว)" }, { status: 404 });
  if (!sheet) return NextResponse.json({ error: "ไม่พบใบงานออกแบบนี้" }, { status: 404 });
  if (lineErr) return NextResponse.json({ error: "โหลดตีราคาของใบงานไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  const tabs = ["", ...((sheet.parent_sku_codes as string[] | null) ?? []), ...((sheet.parent_sku_drafts as string[] | null) ?? [])];
  if (!tabs.includes(parent)) return NextResponse.json({ error: "ไม่พบแท็บตีราคานี้ในใบงาน ลองเลือกใหม่" }, { status: 400 });
  const pieces = cleanProjectPieces(proj.pieces);
  if (!pieces.length) return NextResponse.json({ error: "แพทเทิร์นนี้ยังไม่มีชิ้น — วาดชิ้นแล้วกดบันทึกก่อน" }, { status: 400 });

  // วัสดุตีราคาที่ชิ้นอ้างถึง (ไว้ตั้งชนิด/ราคาของบรรทัดใหม่)
  const trims = cleanTrims((proj.template as { trims?: unknown } | null)?.trims);
  const rows = trimRows(trims, pieces);
  const matIds = [...new Set([...pieces.flatMap((p) => (p.mats ?? []).map((m) => m.id)), ...trims.map((x) => x.mat.id)].filter((x) => UUID.test(x)))];
  const items = new Map<string, CostItemLike>();
  if (matIds.length) {
    const { data: its } = await admin.from("design_price_items")
      .select("id, name, price_per_unit, uom, face_width_cm, width_cm, length_cm, grp:material_groups!material_group_id ( code, name, calc_method, loss_percent, divisor, uom_default )")
      .in("id", matIds).eq("is_active", true);
    for (const r of (its ?? []) as Array<Record<string, unknown>>) {
      const g = (Array.isArray(r.grp) ? r.grp[0] : r.grp) as Record<string, unknown> | null;
      items.set(String(r.id), {
        id: String(r.id), name: String(r.name), price_per_unit: n(r.price_per_unit), uom: (r.uom as string) ?? null,
        face_width_cm: n(r.face_width_cm), width_cm: n(r.width_cm), length_cm: n(r.length_cm),
        group_name: (g?.name as string) ?? null, group_code: (g?.code as string) ?? null, calc_method: (g?.calc_method as string) ?? null,
        loss_percent: n(g?.loss_percent), divisor: n(g?.divisor), uom_default: (g?.uom_default as string) ?? null,
      });
    }
  }

  const existing = ((lines ?? []) as Array<Record<string, unknown>>).map((r) => ({
    ...r, id: String(r.id), sort_order: n(r.sort_order),
    width_cm: n(r.width_cm), length_cm: n(r.length_cm), pieces: n(r.pieces), face_width_cm: n(r.face_width_cm),
    waste_percent: n(r.waste_percent), divisor: n(r.divisor), qty: n(r.qty), unit_price: n(r.unit_price), amount: n(r.amount),
  })) as ExistingCostLine[];
  const plan = planCostingSend(pieces, proj.basis === "area" ? "area" : "box", existing, parent || null, items);
  // ซิปและอะไหล่ — ต่อท้ายบรรทัดของชิ้น
  const patternNo = (proj.pattern_no as string | null) || id.slice(0, 8);
  const sortEnd = existing.reduce((m, r) => Math.max(m, r.sort_order ?? 0), 0) + plan.inserts.length;
  const tp = planTrimsSend(rows, existing, parent || null, items, patternNo, sortEnd);
  const summary = {
    sheet: { id: sheet.id as string, code: sheet.code as string, name: sheet.name as string }, parent_code: parent || null,
    added: plan.inserts.length, updated: plan.updates.length, stale: plan.stale, no_material: plan.noMaterial, missing_items: plan.missingItems,
    amount: Math.round((plan.amount + tp.amount) * 100) / 100,
    trims: {
      added: tp.inserts.length, updated: tp.updates.length, lines: tp.lines, stale: tp.stale, skipped: tp.skipped, missing_items: tp.missingItems,
      no_qty: tp.noQty, gone: rows.filter((r) => r.gone).length, open_slits: openSlits(trims, pieces).length,
    },
  };
  if (body.dry === true) return NextResponse.json({ data: summary, error: null });

  const inserts = [...plan.inserts, ...tp.inserts], updates = [...plan.updates, ...tp.updates];
  if (inserts.length) {
    const { error } = await admin.from("design_sheet_cost_lines").insert(inserts.map((r) => ({ ...r, sheet_id: sheetId })));
    if (error) return NextResponse.json({ error: "เพิ่มบรรทัดตีราคาไม่สำเร็จ ยังไม่มีอะไรเปลี่ยนในใบงาน กรุณาลองใหม่" }, { status: 500 });
  }
  let failed = 0, failedTrims = 0;
  for (const [i, u] of updates.entries()) {
    const { error } = await admin.from("design_sheet_cost_lines").update(u.patch).eq("id", u.id).eq("sheet_id", sheetId);
    if (error) { failed++; if (i >= plan.updates.length) failedTrims++; }
  }

  const at = new Date().toISOString();
  const tpl = { ...((proj.template as Record<string, unknown> | null) ?? {}), costing: { sheet_id: sheetId, code: sheet.code, name: sheet.name, parent_code: parent || null, at } };
  await admin.from(PROJECT_TABLE).update({ template: tpl, updated_at: at, updated_by_name: actor.name }).eq("id", id);
  await Promise.all([
    writeAudit(admin, {
      action: "cost_update", entityType: "design_sheet", entityId: sheetId, actorId: actor.userId, actorName: actor.name,
      metadata: { source: "pattern_project", pattern_id: id, pattern_no: proj.pattern_no, parent_code: parent || null, lines_added: inserts.length, lines_updated: updates.length - failed, trim_lines: tp.lines.length, amount: summary.amount },
    }),
    writeAudit(admin, {
      action: "send_costing", entityType: PROJECT_TABLE, entityId: id, actorId: actor.userId, actorName: actor.name,
      metadata: { pattern_no: proj.pattern_no, name: proj.name, sheet_id: sheetId, sheet_code: sheet.code, parent_code: parent || null, lines_added: inserts.length, lines_updated: updates.length - failed, trim_lines: tp.lines.length },
    }),
  ]);
  if (failed) return NextResponse.json({ data: { ...summary, updated: plan.updates.length - (failed - failedTrims), trims: { ...summary.trims, updated: tp.updates.length - failedTrims }, template: tpl }, error: `อัปเดตไม่สำเร็จ ${failed} บรรทัด — เปิดตีราคาของใบงานตรวจดู แล้วลองส่งใหม่` }, { status: 207 });
  return NextResponse.json({ data: { ...summary, template: tpl }, error: null });
}
