/**
 * แก้ "วันกำหนด" ของใบสั่งผลิตหลายใบพร้อมกัน — /api/mo/bulk-due-date
 *
 * PATCH { ids: string[], due_date: string|null, field?: "due" | "internal", only_empty?: boolean }
 *   · field = "due" (ค่าเริ่มต้น) → 📦 นัดส่งลูกค้า (due_date)
 *   · field = "internal"          → 🪑 กำหนดส่งงานภายใน (internal_due_date)
 *                                   + ไล่ตั้งวันให้ใบจ่ายงานที่ยังทำอยู่ของใบเหล่านั้นด้วย
 *   · only_empty = true → เติมเฉพาะใบที่ช่องนี้ยังว่าง (ใบที่มีวันอยู่แล้วไม่ถูกทับ)
 * แก้เฉพาะฟิลด์วันที่ ไม่แตะฟิลด์อื่น
 * ของกลาง: guardApi (products.edit) + supabaseAdmin + audit รายใบ (entity_type "mo" เก็บค่าเดิม/ค่าใหม่)
 *   (เดิมเขียน audit แถวเดียวโดยเอา id มาต่อกัน → ไม่ใช่ uuid ระบบเก็บเป็นค่าว่าง = ดูไม่ได้ว่าใบไหนถูกแก้)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAuditMany } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = Record<string, unknown>;

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { ids?: unknown; due_date?: unknown; field?: unknown; only_empty?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map((v) => String(v)).filter(Boolean))] : [];
  const due = body.due_date ? String(body.due_date).slice(0, 10) : null;
  const internal = body.field === "internal";
  const onlyEmpty = body.only_empty === true;
  const col = internal ? "internal_due_date" : "due_date";
  if (!ids.length) return NextResponse.json({ error: "ไม่มีรายการที่เลือก" }, { status: 400 });
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return NextResponse.json({ error: "รูปแบบวันที่ไม่ถูกต้อง" }, { status: 400 });

  const admin = supabaseAdmin();
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));

  // ค่าเดิมของแต่ละใบ — ใช้ทั้งตัดใบที่มีวันอยู่แล้ว (only_empty) และเก็บลงประวัติ
  const before = (await Promise.all(chunks.map((c) => admin.from("manufacturing_orders").select(`id, mo_no, ${col}`).in("id", c))))
    .flatMap((p) => (p.data ?? []) as unknown as Row[]);
  const oldOf = new Map(before.map((r) => [String(r.id), ((r[col] as string | null) ?? null)?.slice(0, 10) ?? null]));
  const target = before.filter((r) => {
    const old = oldOf.get(String(r.id)) ?? null;
    if (onlyEmpty && old) return false;   // มีวันอยู่แล้ว → ไม่ทับ
    return old !== due;                    // ค่าเดิมเท่ากับค่าใหม่ → ไม่ต้องเขียน
  }).map((r) => String(r.id));
  const keptFilled = onlyEmpty ? before.filter((r) => !!oldOf.get(String(r.id))).length : 0;

  const rows: Row[] = [];
  for (let i = 0; i < target.length; i += 200) {
    let q = admin.from("manufacturing_orders").update({ [col]: due, updated_at: new Date().toISOString() }).in("id", target.slice(i, i + 200));
    if (onlyEmpty) q = q.is(col, null);   // กันทับวันที่คนอื่นเพิ่งตั้งระหว่างนี้
    const { data, error } = await q.select("id, mo_no");
    if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ กรุณาลองใหม่" }, { status: 400 });
    rows.push(...((data ?? []) as Row[]));
  }

  // วันภายใน = ใบจ่ายงานที่ยังทำอยู่ต้องขยับตามด้วย (ไม่แตะใบที่เสร็จ/ยกเลิก)
  let cascaded = 0;
  const moNos = rows.map((r) => String(r.mo_no)).filter(Boolean);
  if (internal && moNos.length) {
    for (let i = 0; i < moNos.length; i += 200) {
      const { data: wos } = await admin.from("mo_work_orders")
        .update({ due_date: due, updated_at: new Date().toISOString() })
        .in("mo_no", moNos.slice(i, i + 200)).eq("is_active", true)
        .not("status", "in", "(done,cancelled)").select("id");
      cascaded += (wos ?? []).length;
    }
  }

  await writeAuditMany(admin, rows.map((r) => ({
    action: "update", entityType: "mo", entityId: String(r.id),
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { mo_no: r.mo_no, field: col, old_value: oldOf.get(String(r.id)) ?? null, new_value: due,
      bulk: true, batch_count: rows.length, only_empty: onlyEmpty, work_orders_updated: cascaded },
  })));
  return NextResponse.json({ ok: true, updated: rows.length, kept_filled: keptFilled, cascaded, error: null });
}
