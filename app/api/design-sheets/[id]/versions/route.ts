/**
 * Design Sheets — จัดการ "เวอร์ชัน/แท็บตีราคา" (เปลี่ยนชื่อ · ลบ)
 *
 * POST /api/design-sheets/[id]/versions  body: { action: "rename", from, to } | { action: "delete", from }
 *
 * แท็บตีราคา 1 แท็บ = ค่า parent_code เดียวกันที่กระจายอยู่หลายตาราง:
 *   design_sheet_cost_lines.parent_code       (บรรทัดวัสดุ)
 *   design_sheet_supplier_lines.parent_code   (ตีราคาสั่งจากร้าน)
 *   design_sheet_quotes.parent_code           (รอบเสนอราคา — เปลี่ยนชื่อตาม · ลบแท็บไม่ลบประวัติรอบ)
 *   design_sheets.cost_extra[key]             (ค่าใช้จ่ายเพิ่ม)
 *   design_sheets.profit_splits[key]          (แบ่งกำไรทั้งใบ)
 *   design_sheets.parent_sku_drafts[]         (ชื่อเวอร์ชัน/ร่าง Parent)
 * → ทำที่เดียวตรงนี้ให้ครบทุกตาราง หน้าจอแค่รีโหลด
 *
 * กติกา: แตะได้เฉพาะแท็บที่เป็น "ชื่อ" (ร่าง/เวอร์ชัน/orphan) — รหัส Parent SKU จริง (parent_sku_codes) ห้ามผ่านเส้นนี้
 * (รหัสจริงไปเพิ่ม/เอาออกที่แท็บข้อมูลงาน) · แท็บ "ทั่วไป" (parent_code ว่าง) ห้ามเปลี่ยนชื่อ/ลบ
 * สิทธิ์: products.edit · audit → audit_logs (version_rename / version_delete)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../../../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Body = { action?: "rename" | "delete"; from?: string; to?: string };

const moveKey = (obj: unknown, from: string, to: string | null): Record<string, unknown> => {
  const src = obj && typeof obj === "object" && !Array.isArray(obj) ? (obj as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    if (k === from) { if (to != null) out[to] = v; }
    else out[k] = v;
  }
  return out;
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: Body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const action = body.action;
  const from = String(body.from ?? "").trim();
  const to = String(body.to ?? "").trim().slice(0, 200);
  if (action !== "rename" && action !== "delete") return NextResponse.json({ error: "action ไม่ถูกต้อง" }, { status: 400 });
  if (!from) return NextResponse.json({ error: "แท็บ \"ทั่วไป\" เปลี่ยนชื่อ/ลบไม่ได้" }, { status: 400 });
  if (action === "rename") {
    if (!to) return NextResponse.json({ error: "ตั้งชื่อใหม่ก่อน" }, { status: 400 });
    if (to === from) return NextResponse.json({ error: "ชื่อใหม่เหมือนชื่อเดิม" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: sheet, error: sErr } = await admin.from("design_sheets")
    .select("id, code, parent_sku_codes, parent_sku_drafts, cost_extra, profit_splits").eq("id", id).maybeSingle();
  if (sErr) return NextResponse.json({ error: friendlyDbError(sErr.message) }, { status: 500 });
  if (!sheet) return NextResponse.json({ error: "ไม่พบใบงาน" }, { status: 404 });

  const codes = (Array.isArray(sheet.parent_sku_codes) ? sheet.parent_sku_codes : []).map((c) => String(c ?? "").trim()).filter(Boolean);
  const drafts = (Array.isArray(sheet.parent_sku_drafts) ? sheet.parent_sku_drafts : []).map((d) => String(d ?? "").trim()).filter(Boolean);
  const upper = (s: string) => s.toUpperCase();
  if (codes.some((c) => upper(c) === upper(from))) {
    return NextResponse.json({ error: `"${from}" เป็นรหัส Parent SKU จริง — เปลี่ยน/เอาออกได้ที่แท็บ "ข้อมูลงาน" (ช่อง Parent SKU)` }, { status: 400 });
  }
  if (action === "rename") {
    // ชื่อใหม่ต้องไม่ชนกับแท็บที่มีอยู่ (รหัสจริง / ร่าง / parent_code ที่มีบรรทัดค้าง)
    const { data: used } = await admin.from("design_sheet_cost_lines").select("parent_code").eq("sheet_id", id).eq("parent_code", to).limit(1);
    const taken = codes.some((c) => upper(c) === upper(to)) || drafts.includes(to) || (used ?? []).length > 0;
    if (taken) return NextResponse.json({ error: `มีแท็บชื่อ "${to}" อยู่แล้ว — ตั้งชื่ออื่น` }, { status: 400 });
  }

  const newParent = action === "rename" ? to : null;
  const counts: Record<string, number> = {};

  // 1) บรรทัดวัสดุ + สั่งจากร้าน: เปลี่ยนชื่อ = update · ลบ = delete
  for (const table of ["design_sheet_cost_lines", "design_sheet_supplier_lines"] as const) {
    const q = newParent
      ? admin.from(table).update({ parent_code: newParent }).eq("sheet_id", id).eq("parent_code", from).select("id")
      : admin.from(table).delete().eq("sheet_id", id).eq("parent_code", from).select("id");
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
    counts[table] = (data ?? []).length;
  }
  // 2) รอบเสนอราคา: เปลี่ยนชื่อตามเท่านั้น (ลบแท็บ = เก็บประวัติรอบไว้ ป้ายจะโชว์ชื่อเดิม)
  if (newParent) {
    const { data, error } = await admin.from("design_sheet_quotes").update({ parent_code: newParent })
      .eq("sheet_id", id).eq("parent_code", from).select("id");
    if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
    counts.design_sheet_quotes = (data ?? []).length;
  }
  // 3) ตัวใบงาน: ชื่อเวอร์ชัน + ค่าใช้จ่ายเพิ่ม + แบ่งกำไร
  let nextDrafts = drafts.filter((d) => d !== from);
  if (newParent && !nextDrafts.includes(newParent)) nextDrafts = [...nextDrafts, newParent];   // orphan ที่เปลี่ยนชื่อ → กลายเป็นเวอร์ชันปกติ
  const patch: Record<string, unknown> = {
    parent_sku_drafts: nextDrafts,
    profit_splits: moveKey(sheet.profit_splits, from, newParent),
    updated_at: new Date().toISOString(),
  };
  // cost_extra แบบ array (ใบเก่ามาก) = ของแท็บทั่วไปทั้งก้อน ไม่มี key ให้ย้าย → ปล่อยไว้
  if (sheet.cost_extra && typeof sheet.cost_extra === "object" && !Array.isArray(sheet.cost_extra)) {
    patch.cost_extra = moveKey(sheet.cost_extra, from, newParent);
  }
  const { error: uErr } = await admin.from("design_sheets").update(patch).eq("id", id);
  if (uErr) return NextResponse.json({ error: friendlyDbError(uErr.message) }, { status: 400 });

  await writeAudit(admin, {
    action: action === "rename" ? "version_rename" : "version_delete", entityType: "design_sheet", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { code: sheet.code, from, to: newParent, ...counts },
  });
  return NextResponse.json({ ok: true, from, to: newParent, counts, error: null });
}
