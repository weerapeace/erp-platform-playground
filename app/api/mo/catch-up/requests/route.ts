/**
 * คำขออัปเดตงาน (โหมด "🔄 อัปเดตงาน" ของบอร์ดจ่ายงาน) — พนักงานที่ไม่มีสิทธิ์ "บันทึกได้เลย" ส่งคำขอ → หัวหน้ายืนยัน/แก้/ตีกลับ
 *   GET  ?mo_no=X              คำขอที่ยังไม่จบของใบนี้ + คำขอล่าสุดของฉันที่ถูกตีกลับ (ป๊อปใช้ตอนเปิด)
 *   GET  (ไม่มีพารามิเตอร์)     คิว: หัวหน้า = ที่รอยืนยันทั้งหมด · ทุกคน = ของฉัน 14 วันล่าสุด · open = ใบที่มีคำขอค้าง (ป้ายบนบอร์ด)
 *   POST {action:"submit"}      ส่ง/แก้คำขอ (1 ใบงาน มีคำขอค้างได้ทีละ 1)
 *   POST {action:"cancel"}      ผู้ส่งยกเลิกคำขอตัวเอง
 *   POST {action:"claim"}       หัวหน้าเริ่มบันทึก (กันสองคนยืนยันซ้อน) → ป๊อปรันขั้นต่าง ๆ ด้วยสิทธิ์หัวหน้า → "finish" เก็บผล
 *   POST {action:"release"}     ยกเลิกการ claim (ยังไม่ได้บันทึกอะไร)
 *   POST {action:"reject"}      ตีกลับพร้อมเหตุผล
 * ตาราง work_catch_up_requests (RLS เปิด ไม่มี policy — ผ่าน supabaseAdmin ที่นี่เท่านั้น) · แจ้งเตือนกระดิ่ง erp_notifications · audit_logs
 * กติกาบันทึกจริงอยู่ฝั่งป๊อป (app/master/work-board/catch-up.ts) — ที่นี่เก็บคำขอ + คุมว่าใครทำอะไรได้
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { apiCan } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { CU_PERM } from "@/app/master/work-board/catch-up";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Admin = ReturnType<typeof supabaseAdmin>;
export type CuRequestStatus = "pending" | "processing" | "approved" | "rejected" | "cancelled";
export type CuRequest = {
  id: string; mo_id: string; mo_no: string; product_sku: string | null; target: string;
  draft: unknown; summary: string[]; status: CuRequestStatus;
  requested_by: string; requested_name: string | null; requested_at: string;
  reviewed_by: string | null; reviewed_name: string | null; reviewed_at: string | null; review_note: string | null;
  result: { ok: boolean; steps: { label: string; ok: boolean; msg: string }[] } | null;
  /** คนที่ดูอยู่เป็นคนส่งเอง */
  mine?: boolean;
};
export type CuOpenTag = { id: string; mo_no: string; status: CuRequestStatus; requested_name: string | null; mine: boolean };

const COLS = "id, mo_id, mo_no, product_sku, target, draft, summary, status, requested_by, requested_name, requested_at, reviewed_by, reviewed_name, reviewed_at, review_note, result";
const OPEN = ["pending", "processing"];
/** claim ค้างเกินนี้ (ป๊อปหัวหน้าปิดกลางคัน) = ให้คนอื่นยืนยันต่อได้ */
const STALE_MS = 10 * 60 * 1000;
const DAYS_MINE = 14;
const BOARD = "/master/work-board?cu=requests";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

async function who(request: NextRequest, admin: Admin) {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return null;
  const { data: p } = await admin.from("user_profiles").select("display_name, email").eq("id", user.id).maybeSingle();
  const prof = p as { display_name: string | null; email: string | null } | null;
  return { id: user.id, name: prof?.display_name?.trim() || prof?.email || user.email || "ผู้ใช้" };
}

async function perms(request: NextRequest) {
  const [use, dispatch, direct, approve] = await Promise.all([
    apiCan(request, CU_PERM.use), apiCan(request, "work_board.dispatch"), apiCan(request, CU_PERM.direct), apiCan(request, CU_PERM.approve),
  ]);
  return { use: use || dispatch || direct || approve, direct, approve };
}

/** ผู้มีสิทธิ์ยืนยัน (ตามตำแหน่ง + ยกเว้นรายคน · แอดมินเสมอ) — ไว้ส่งกระดิ่ง */
async function approverIds(admin: Admin): Promise<string[]> {
  const [profs, rp, ov] = await Promise.all([
    admin.from("user_profiles").select("id, role").eq("active", true),
    admin.from("erp_role_permissions").select("role_key").eq("permission_key", CU_PERM.approve),
    admin.from("erp_user_permissions").select("user_id, mode").eq("permission_key", CU_PERM.approve),
  ]);
  const roles = new Set(((rp.data ?? []) as { role_key: string }[]).map((r) => r.role_key));
  const over = new Map(((ov.data ?? []) as { user_id: string; mode: string }[]).map((o) => [o.user_id, o.mode]));
  return ((profs.data ?? []) as { id: string; role: string | null }[])
    .filter((p) => (over.get(p.id) === "revoke" ? false : over.get(p.id) === "grant" || p.role === "admin" || roles.has(p.role ?? "")))
    .map((p) => p.id);
}

async function notify(admin: Admin, userIds: string[], row: { title: string; body: string; id: string; priority?: string }) {
  if (!userIds.length) return;
  const { error } = await admin.from("erp_notifications").insert(userIds.map((uid) => ({
    user_id: uid, event_type: "catch_up_request", title: row.title, body: row.body,
    link_url: BOARD, entity_type: "work_catch_up_requests", entity_id: row.id, priority: row.priority ?? "normal",
  })));
  if (error) console.error("[catch-up/requests] แจ้งเตือนไม่สำเร็จ:", error.message);
}

const clean = (r: Record<string, unknown>, me: string): CuRequest => ({ ...(r as unknown as CuRequest), summary: Array.isArray(r.summary) ? (r.summary as string[]) : [], mine: r.requested_by === me });

export async function GET(request: NextRequest) {
  const admin = supabaseAdmin();
  const me = await who(request, admin);
  if (!me) return bad("ต้องเข้าสู่ระบบ", 401);
  const can = await perms(request);
  if (!can.use) return bad("ไม่มีสิทธิ์ใช้โหมดอัปเดตงาน", 401);
  const moNo = request.nextUrl.searchParams.get("mo_no");

  if (moNo) {
    const [openQ, rejQ] = await Promise.all([
      admin.from("work_catch_up_requests").select(COLS).eq("mo_no", moNo).in("status", OPEN).maybeSingle(),
      admin.from("work_catch_up_requests").select(COLS).eq("mo_no", moNo).eq("requested_by", me.id).order("requested_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (openQ.error) return bad(openQ.error.message, 500);
    const open = openQ.data ? clean(openQ.data as Record<string, unknown>, me.id) : null;
    // คนอื่นที่ไม่ใช่หัวหน้า เห็นแค่ว่ามีคำขอค้าง (ไม่เห็นรายละเอียดที่กรอก)
    if (open && !open.mine && !can.approve) open.draft = null;
    const last = rejQ.data ? clean(rejQ.data as Record<string, unknown>, me.id) : null;
    return NextResponse.json({ data: { open, rejected: last?.status === "rejected" ? last : null }, perms: can });
  }

  const since = new Date(Date.now() - DAYS_MINE * 86400000).toISOString();
  const [openQ, mineQ] = await Promise.all([
    admin.from("work_catch_up_requests").select(can.approve ? COLS : "id, mo_no, status, requested_by, requested_name").in("status", OPEN).order("requested_at"),
    admin.from("work_catch_up_requests").select(COLS).eq("requested_by", me.id).gte("requested_at", since).order("requested_at", { ascending: false }).limit(100),
  ]);
  if (openQ.error || mineQ.error) return bad((openQ.error ?? mineQ.error)!.message, 500);
  const openRows = (openQ.data ?? []) as unknown as Record<string, unknown>[];
  const open: CuOpenTag[] = openRows.map((r) => ({ id: String(r.id), mo_no: String(r.mo_no), status: r.status as CuRequestStatus, requested_name: (r.requested_name as string | null) ?? null, mine: r.requested_by === me.id }));
  const queue = can.approve ? openRows.map((r) => clean(r, me.id)) : [];
  const mine = ((mineQ.data ?? []) as Record<string, unknown>[]).map((r) => clean(r, me.id));
  return NextResponse.json({ data: { queue, mine, open }, perms: can });
}

export async function POST(request: NextRequest) {
  const admin = supabaseAdmin();
  const me = await who(request, admin);
  if (!me) return bad("ต้องเข้าสู่ระบบ", 401);
  const can = await perms(request);
  if (!can.use) return bad("ไม่มีสิทธิ์ใช้โหมดอัปเดตงาน", 401);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "");
  const id = typeof body.id === "string" ? body.id : "";
  const now = new Date().toISOString();
  const summary = Array.isArray(body.summary) ? (body.summary as unknown[]).map((x) => String(x).slice(0, 300)).slice(0, 60) : null;

  const load = async () => {
    const { data } = await admin.from("work_catch_up_requests").select(COLS).eq("id", id).maybeSingle();
    return data ? clean(data as Record<string, unknown>, me.id) : null;
  };

  if (action === "submit") {
    const moNo = String(body.mo_no ?? "").trim();
    const target = String(body.target ?? "").trim();
    if (!moNo || !target || !body.draft || typeof body.draft !== "object") return bad("ข้อมูลคำขอไม่ครบ");
    if (JSON.stringify(body.draft).length > 200_000) return bad("ข้อมูลคำขอใหญ่เกินไป");
    const { data: mo } = await admin.from("manufacturing_orders").select("id, mo_no, product_sku, status").eq("mo_no", moNo).maybeSingle();
    const m = mo as { id: string; mo_no: string; product_sku: string | null; status: string } | null;
    if (!m) return bad("ไม่พบใบสั่งผลิตนี้", 404);
    if (m.status === "done" || m.status === "cancelled") return bad("ใบนี้ปิด/ยกเลิกไปแล้ว");
    const { data: openRow } = await admin.from("work_catch_up_requests").select("id, status, requested_by, requested_name").eq("mo_id", m.id).in("status", OPEN).maybeSingle();
    const o = openRow as { id: string; status: string; requested_by: string; requested_name: string | null } | null;
    let rowId = o?.id ?? "";
    if (o) {
      if (o.requested_by !== me.id) return bad(`ใบนี้มีคำขอรอยืนยันอยู่แล้ว (โดย ${o.requested_name ?? "คนอื่น"})`, 409);
      if (o.status !== "pending") return bad("หัวหน้ากำลังบันทึกคำขอนี้อยู่ — แก้ไม่ได้แล้ว", 409);
      const { error } = await admin.from("work_catch_up_requests").update({ target, draft: body.draft, summary: summary ?? [], requested_at: now, updated_at: now }).eq("id", o.id).eq("status", "pending");
      if (error) return bad(error.message, 500);
    } else {
      const { data: ins, error } = await admin.from("work_catch_up_requests").insert({
        mo_id: m.id, mo_no: m.mo_no, product_sku: m.product_sku, target, draft: body.draft, summary: summary ?? [],
        requested_by: me.id, requested_name: me.name, requested_at: now, updated_at: now,
      }).select("id").single();
      if (error) return error.code === "23505" ? bad("ใบนี้มีคำขอรอยืนยันอยู่แล้ว", 409) : bad(error.message, 500);
      rowId = (ins as { id: string }).id;
    }
    await writeAudit(admin, { action: o ? "catch_up.request_edit" : "catch_up.request", entityType: "work_catch_up_requests", entityId: rowId, actorId: me.id, actorName: me.name, metadata: { mo_no: m.mo_no, sku: m.product_sku, target, steps: summary ?? [] } });
    if (!o) {
      const ids = (await approverIds(admin)).filter((x) => x !== me.id);
      await notify(admin, ids, { id: rowId, title: `🔄 รอยืนยันอัปเดตงาน · ${m.product_sku ?? m.mo_no}`, body: `${me.name} ส่งอัปเดต ${m.mo_no}${summary?.length ? ` — ${summary.slice(0, 3).join(" · ")}${summary.length > 3 ? " …" : ""}` : ""}` });
    }
    return NextResponse.json({ data: { id: rowId, updated: !!o } });
  }

  if (!id) return bad("ไม่ระบุคำขอ");
  const row = await load();
  if (!row) return bad("ไม่พบคำขอนี้", 404);

  if (action === "cancel") {
    if (!row.mine) return bad("ยกเลิกได้เฉพาะคำขอของตัวเอง", 403);
    const { data, error } = await admin.from("work_catch_up_requests").update({ status: "cancelled", updated_at: now }).eq("id", id).eq("status", "pending").select("id");
    if (error) return bad(error.message, 500);
    if (!data?.length) return bad("คำขอนี้ไม่ได้รออยู่แล้ว (หัวหน้าอาจกำลังบันทึก)", 409);
    await writeAudit(admin, { action: "catch_up.request_cancel", entityType: "work_catch_up_requests", entityId: id, actorId: me.id, actorName: me.name, metadata: { mo_no: row.mo_no } });
    return NextResponse.json({ data: { id } });
  }

  // ── ฝั่งหัวหน้า
  if (!can.approve) return bad("ต้องมีสิทธิ์ยืนยันอัปเดตงาน", 403);
  if (row.mine && !can.direct) return bad("ยืนยันคำขอของตัวเองไม่ได้ — ให้หัวหน้าคนอื่นยืนยัน", 403);
  const staleBefore = new Date(Date.now() - STALE_MS).toISOString();

  if (action === "claim") {
    // pending → processing (หรือ processing ที่ค้างเกิน 10 นาที) · เก็บข้อมูลที่หัวหน้าแก้แล้ว
    const patch: Record<string, unknown> = { status: "processing", reviewed_by: me.id, reviewed_name: me.name, reviewed_at: now, updated_at: now };
    if (body.draft && typeof body.draft === "object") patch.draft = body.draft;
    if (summary) patch.summary = summary;
    const { data, error } = await admin.from("work_catch_up_requests").update(patch).eq("id", id)
      .or(`status.eq.pending,and(status.eq.processing,reviewed_at.lt.${staleBefore})`).select("id");
    if (error) return bad(error.message, 500);
    if (!data?.length) return bad(row.status === "processing" ? `${row.reviewed_name ?? "หัวหน้าอีกคน"} กำลังบันทึกคำขอนี้อยู่` : "คำขอนี้ไม่ได้รอยืนยันแล้ว", 409);
    return NextResponse.json({ data: { id } });
  }

  if (action === "release") {
    await admin.from("work_catch_up_requests").update({ status: "pending", reviewed_by: null, reviewed_name: null, reviewed_at: null, updated_at: now }).eq("id", id).eq("status", "processing").eq("reviewed_by", me.id);
    return NextResponse.json({ data: { id } });
  }

  if (action === "finish") {
    const r = body.result as { ok?: unknown; steps?: unknown } | undefined;
    const steps = Array.isArray(r?.steps) ? (r!.steps as Record<string, unknown>[]).slice(0, 60).map((s) => ({ label: String(s.label ?? "").slice(0, 300), ok: s.ok === true, msg: String(s.msg ?? "").slice(0, 300) })) : [];
    const ok = r?.ok === true;
    const { data, error } = await admin.from("work_catch_up_requests").update({ status: "approved", result: { ok, steps }, reviewed_at: now, updated_at: now })
      .eq("id", id).eq("status", "processing").eq("reviewed_by", me.id).select("id");
    if (error) return bad(error.message, 500);
    if (!data?.length) return bad("คำขอนี้ไม่ได้อยู่ระหว่างบันทึกโดยคุณ", 409);
    const done = steps.filter((s) => s.ok).length;
    await writeAudit(admin, { action: "catch_up.approve", entityType: "work_catch_up_requests", entityId: id, actorId: me.id, actorName: me.name, metadata: { mo_no: row.mo_no, sku: row.product_sku, requested_by: row.requested_name, ok, done, total: steps.length } });
    if (!row.mine) await notify(admin, [row.requested_by], { id, priority: ok ? "normal" : "high",
      title: `${ok ? "✅ ยืนยันอัปเดตงานแล้ว" : "⚠️ ยืนยันแล้ว แต่บันทึกได้บางขั้น"} · ${row.product_sku ?? row.mo_no}`,
      body: `${me.name} ยืนยัน ${row.mo_no}${ok ? "" : ` — สำเร็จ ${done}/${steps.length} ขั้น`}` });
    return NextResponse.json({ data: { id } });
  }

  if (action === "reject") {
    const note = String(body.note ?? "").trim().slice(0, 500);
    if (!note) return bad("ใส่เหตุผลที่ตีกลับด้วย");
    const { data, error } = await admin.from("work_catch_up_requests").update({ status: "rejected", review_note: note, reviewed_by: me.id, reviewed_name: me.name, reviewed_at: now, updated_at: now })
      .eq("id", id).or(`status.eq.pending,and(status.eq.processing,reviewed_at.lt.${staleBefore})`).select("id");
    if (error) return bad(error.message, 500);
    if (!data?.length) return bad("คำขอนี้ไม่ได้รอยืนยันแล้ว", 409);
    await writeAudit(admin, { action: "catch_up.reject", entityType: "work_catch_up_requests", entityId: id, actorId: me.id, actorName: me.name, metadata: { mo_no: row.mo_no, sku: row.product_sku, requested_by: row.requested_name, note } });
    await notify(admin, [row.requested_by], { id, priority: "high", title: `↩️ อัปเดตงานถูกตีกลับ · ${row.product_sku ?? row.mo_no}`, body: `${me.name}: ${note}` });
    return NextResponse.json({ data: { id } });
  }

  return bad("ไม่รู้จักคำสั่งนี้");
}
