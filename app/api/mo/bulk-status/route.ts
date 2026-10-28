/**
 * ปิดงาน / ยกเลิก ใบสั่งผลิตหลายใบพร้อมกัน — POST /api/mo/bulk-status
 *
 * body: { ids: string[], action: "close" | "cancel", reason?: string }
 *   · close  → status = done      (เฉพาะใบที่ช่างส่งคืนครบ + ไม่มีใบจ่ายงานค้าง)
 *   · cancel → status = cancelled (เฉพาะใบที่ยังไม่จ่ายงาน · ต้องมีเหตุผล)
 * กฎอยู่ที่ของกลาง lib/mo-workflow (checkMoTransition) — คำนวณข้อเท็จจริงจาก DB ใหม่ทุกครั้ง ไม่เชื่อหน้าจอ
 * ใบที่ไม่ผ่านกฎ = ข้าม (ไม่ล้มทั้งชุด) → คืนรายงานผล updated / skipped
 * แก้แค่ status + updated_at — ไม่แตะใบจ่ายงาน ค่าแรง สต็อก หรือใบขอซื้อ
 *   (ยกเลิก: คืนรายชื่อใบขอซื้อที่ยังผูกอยู่ให้หน้าจอเตือน — ฝ่ายจัดซื้อตัดสินเอง)
 * สิทธิ์: work_board.dispatch (คนคุมบอร์ดจ่ายงาน) · audit รายใบ (entity_type "mo")
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAuditMany } from "@/lib/audit";
import { checkMoTransition, MO_ACTION_META, type MoBulkStatusAction } from "@/lib/mo-workflow";
import { parseSkipped } from "@/lib/mo-skip";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = Record<string, unknown>;
const n = (v: unknown) => { const x = Number(v); return isFinite(x) ? x : 0; };
const MAX_IDS = 1000;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "work_board.dispatch"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: { ids?: unknown; action?: unknown; reason?: unknown; date?: unknown; source?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map((v) => String(v)).filter(Boolean))] : [];
  const action = body.action === "close" || body.action === "cancel" ? (body.action as MoBulkStatusAction) : null;
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  // โหมดอัปเดตงานย้อนหลัง: วันที่ปิด/ยกเลิกจริง (ไม่มีช่องในตาราง → เก็บในประวัติ)
  const actualDate = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null;
  const source = body.source === "catch_up" ? "catch_up" : "mo-backlog";
  if (!action) return NextResponse.json({ error: "ไม่รู้จักคำสั่งนี้" }, { status: 400 });
  if (!ids.length) return NextResponse.json({ error: "ไม่มีรายการที่เลือก" }, { status: 400 });
  if (ids.length > MAX_IDS) return NextResponse.json({ error: `เลือกได้ครั้งละไม่เกิน ${MAX_IDS} ใบ` }, { status: 400 });
  const meta = MO_ACTION_META[action];
  if (meta.needReason && !reason) return NextResponse.json({ error: "กรุณาใส่เหตุผลก่อน" }, { status: 400 });

  const admin = supabaseAdmin();
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));
  const moParts = await Promise.all(chunks.map((c) =>
    admin.from("manufacturing_orders").select("id, mo_no, status, qty, is_active, skipped_stages").in("id", c)));
  const mos = moParts.flatMap((p) => (p.data ?? []) as Row[]).filter((m) => m.is_active !== false);
  const moNos = [...new Set(mos.map((m) => String(m.mo_no)).filter(Boolean))];

  // ข้อเท็จจริงจากใบจ่ายงาน (ไม่นับใบที่ยกเลิก)
  const woParts = await Promise.all(Array.from({ length: Math.ceil(moNos.length / 200) }, (_, i) =>
    admin.from("mo_work_orders").select("mo_no, qty, received_qty, status").in("mo_no", moNos.slice(i * 200, i * 200 + 200)).eq("is_active", true)));
  const facts = new Map<string, { disp: number; recv: number; open: number }>();
  for (const w of woParts.flatMap((p) => (p.data ?? []) as Row[])) {
    if (w.status === "cancelled") continue;
    const k = String(w.mo_no);
    const f = facts.get(k) ?? { disp: 0, recv: 0, open: 0 };
    f.disp += n(w.qty); f.recv += n(w.received_qty); if (w.status !== "done") f.open += 1;
    facts.set(k, f);
  }

  const skipped: { id: string; mo_no: string | null; reason: string }[] = [];
  const found = new Set(mos.map((m) => String(m.id)));
  for (const id of ids) if (!found.has(id)) skipped.push({ id, mo_no: null, reason: "ไม่พบใบนี้ (อาจถูกลบไปแล้ว)" });
  const okMos: Row[] = [];
  for (const m of mos) {
    const f = facts.get(String(m.mo_no)) ?? { disp: 0, recv: 0, open: 0 };
    const why = checkMoTransition(action, { status: (m.status as string) ?? null, qty: n(m.qty), dispatched: f.disp, received: f.recv, openWorkOrders: f.open, receiveSkipped: !!parseSkipped(m.skipped_stages).receive });
    if (why) skipped.push({ id: String(m.id), mo_no: String(m.mo_no), reason: why });
    else okMos.push(m);
  }

  // อัปเดตเฉพาะใบที่ผ่านกฎ + ยังเปิดอยู่จริง ณ ตอนเขียน (กันชนกับคนอื่นที่กดพร้อมกัน)
  const updated: { id: string; mo_no: string; old_status: string }[] = [];
  const oldStatus = new Map(okMos.map((m) => [String(m.id), String(m.status ?? "draft")]));
  const okIds = okMos.map((m) => String(m.id));
  for (let i = 0; i < okIds.length; i += 200) {
    const { data, error } = await admin.from("manufacturing_orders")
      .update({ status: meta.to, updated_at: new Date().toISOString() })
      .in("id", okIds.slice(i, i + 200)).eq("is_active", true).not("status", "in", "(cancelled,done)")
      .select("id, mo_no");
    if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ กรุณาลองใหม่", updated, skipped }, { status: 500 });
    for (const r of (data ?? []) as Row[]) updated.push({ id: String(r.id), mo_no: String(r.mo_no), old_status: oldStatus.get(String(r.id)) ?? "draft" });
  }
  const updatedIds = new Set(updated.map((u) => u.id));
  for (const m of okMos) if (!updatedIds.has(String(m.id))) skipped.push({ id: String(m.id), mo_no: String(m.mo_no), reason: "สถานะเปลี่ยนไประหว่างทำ (มีคนแก้พร้อมกัน)" });

  // ยกเลิก → ใบขอซื้อที่ยังผูกกับใบเหล่านี้ (ไม่ยกเลิกให้อัตโนมัติ — แจ้งให้ฝ่ายจัดซื้อดู)
  let linkedPrs: { pr_no: string; status: string; mo_nos: string[] }[] = [];
  if (action === "cancel" && updated.length) {
    const cancelledNos = updated.map((u) => u.mo_no);
    const { data: prs } = await admin.from("purchase_requests_v2").select("pr_no, status, source_mo_nos")
      .overlaps("source_mo_nos", cancelledNos).eq("is_active", true).not("status", "in", "(rejected,cancelled)").limit(500);
    linkedPrs = ((prs ?? []) as Row[]).map((p) => ({
      pr_no: String(p.pr_no ?? ""), status: String(p.status ?? ""),
      mo_nos: (Array.isArray(p.source_mo_nos) ? (p.source_mo_nos as string[]) : []).filter((x) => cancelledNos.includes(x)),
    }));
  }

  await writeAuditMany(admin, updated.map((u) => ({
    action: meta.auditAction, entityType: "mo", entityId: u.id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { mo_no: u.mo_no, field: "status", old_value: u.old_status, new_value: meta.to, reason: reason || null,
      bulk: true, batch_count: updated.length, source, ...(actualDate ? { date: actualDate } : {}) },
  })));

  return NextResponse.json({ ok: true, action, updated: updated.map(({ id, mo_no }) => ({ id, mo_no })), skipped, linked_prs: linkedPrs, error: null });
}
