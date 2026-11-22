/**
 * ไลน์บริษัท รอบ 3 — ดึงข้อมูลของพนักงาน "คนที่เปิดหน้าเล็ก" เท่านั้น (server) · กติกา lib/line-self-view.ts
 *
 * ทุกครั้งที่เปิด: ตรวจ id_token จาก LINE ใหม่ (ปลอมไม่ได้) → หาไลน์นี้ใน line_memberships (ผูกอยู่ + ยังทำงาน)
 *   → ต้อง HR ยืนยันตัวตนแล้ว → ดึงเฉพาะแถวของพนักงานคนนั้น → ลงประวัติการเปิดดู
 * ไม่รับ employee_id จากหน้าเว็บเด็ดขาด (กันแก้เลขดูของคนอื่น)
 * แอดมินที่ผูกรหัสพนักงานด้วย = ดูของตัวเองได้ (ไม่ใช้ลำดับแอดมินก่อนของตัวแยกคน)
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { APPROVE_CHANNEL_ID } from "@/lib/approval-token";
import { writeAudit } from "@/lib/audit";
import { verifyLineIdToken } from "@/lib/line-employee-portal-db";
import {
  isLineSelfPage, mySubmissionTotals, selfSlipDetail, wageThisMonth,
  type LineSelfGate, type LineSelfPage, type SelfSlipDetail, type SelfSlipSummary, type SelfSubmission, type SelfWarning, type SelfWorkOrder,
} from "@/lib/line-self-view";

type Admin = ReturnType<typeof supabaseAdmin>;
type Row = Record<string, unknown>;
const t = (v: unknown) => String(v ?? "").trim();
const n = (v: unknown) => Number(v) || 0;
const one = (v: unknown): Row | null => (Array.isArray(v) ? ((v[0] as Row) ?? null) : v && typeof v === "object" ? (v as Row) : null);

export type SelfMe = { employeeId: string; code: string; name: string; lang: "th" | "en"; membershipId: string };

export type LineSelfResult =
  | { gate: Exclude<LineSelfGate, "ok"> }
  | { gate: "ok"; page: "payslip"; me: Omit<SelfMe, "employeeId" | "membershipId">; slips: SelfSlipSummary[]; slip: SelfSlipDetail | null }
  | { gate: "ok"; page: "warning"; me: Omit<SelfMe, "employeeId" | "membershipId">; warnings: SelfWarning[] }
  | { gate: "ok"; page: "piecework"; me: Omit<SelfMe, "employeeId" | "membershipId">; orders: SelfWorkOrder[]; wage_this_month: number; open_count: number };

/** ไลน์นี้คือพนักงานคนไหน — ไม่ผูก / ถูกระงับ / รอ HR = คืนสถานะแทน */
async function selfOf(admin: Admin, lineUserId: string): Promise<{ gate: Exclude<LineSelfGate, "ok"> } | { gate: "ok"; me: SelfMe }> {
  const { data, error } = await admin.from("line_memberships")
    .select("id,status,employee_id,hr_confirmed_at,employees(employee_code,first_name,last_name,nickname,employment_status,payslip_language)")
    .eq("line_user_id", lineUserId).in("status", ["linked", "blocked"]).limit(1);
  if (error) throw new Error("โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่");
  const m = (data?.[0] ?? null) as Row | null;
  if (!m) return { gate: "not_linked" };
  const e = one(m.employees);
  if (t(m.status) === "blocked" || t(e?.employment_status) !== "active") return { gate: "blocked" };
  if (!m.hr_confirmed_at) return { gate: "wait_hr" };
  return {
    gate: "ok",
    me: {
      employeeId: t(m.employee_id), membershipId: t(m.id), code: t(e?.employee_code),
      name: t(e?.nickname) || [t(e?.first_name), t(e?.last_name)].filter(Boolean).join(" "),
      lang: t(e?.payslip_language) === "en" ? "en" : "th",
    },
  };
}

async function payslipPage(admin: Admin, me: SelfMe, slipId: string) {
  // งวดที่ HR เปิดให้ดูในไลน์แล้วเท่านั้น
  const { data: periods, error: pe } = await admin.from("payroll_periods")
    .select("id,period_name,start_date,end_date").not("line_visible_at", "is", null).order("end_date", { ascending: false }).limit(60);
  if (pe) throw new Error("โหลดสลิปไม่สำเร็จ กรุณาลองใหม่");
  const pById = new Map(((periods ?? []) as Row[]).map((p) => [t(p.id), p]));
  if (pById.size === 0) return { slips: [], slip: null };
  const { data: rows, error } = await admin.from("payroll_payslips")
    .select("id,payslip_no,payroll_period_id,payload,total_deduction,net_pay,voided_at")
    .eq("employee_id", me.employeeId).in("payroll_period_id", [...pById.keys()]).is("voided_at", null);
  if (error) throw new Error("โหลดสลิปไม่สำเร็จ กรุณาลองใหม่");
  const list = ((rows ?? []) as Row[]).map((r) => {
    const p = pById.get(t(r.payroll_period_id)) ?? {};
    return { row: r, sum: { id: t(r.id), payslip_no: t(r.payslip_no), period_name: t(p.period_name), start_date: t(p.start_date) || null, end_date: t(p.end_date) || null } as SelfSlipSummary };
  }).sort((a, b) => (b.sum.end_date ?? "").localeCompare(a.sum.end_date ?? "")).slice(0, 24);
  const pick = list.find((x) => x.sum.id === slipId) ?? list[0];
  const payload = (pick?.row.payload && typeof pick.row.payload === "object" ? pick.row.payload : {}) as Row;
  const slip = pick ? selfSlipDetail(pick.sum, {
    line: (payload.line && typeof payload.line === "object" ? payload.line : {}) as Row,
    total_deduction: pick.row.total_deduction, net_pay: pick.row.net_pay, lang: me.lang,
  }) : null;
  return { slips: list.map((x) => x.sum), slip };
}

async function warningPage(admin: Admin, me: SelfMe): Promise<SelfWarning[]> {
  const { data, error } = await admin.from("employee_warnings")
    .select("id,warning_date,title,detail,severity,status").eq("employee_id", me.employeeId)
    .order("warning_date", { ascending: false }).limit(50);
  if (error) throw new Error("โหลดใบเตือนไม่สำเร็จ กรุณาลองใหม่");
  return ((data ?? []) as Row[]).map((w) => ({
    id: t(w.id), warning_date: t(w.warning_date) || null, title: t(w.title), detail: t(w.detail), severity: t(w.severity), active: t(w.status) !== "revoked",
  }));
}

const WO_COLS = "id,wo_no,product_sku,product_name,stage,uom,qty,received_qty,status,dispatch_date,due_date,assignee_id,assignees,created_at";

async function pieceworkPage(admin: Admin, me: SelfMe) {
  // ใบที่ยังทำอยู่ (ทุกอายุ) + ใบที่สร้างใน 120 วัน · ใช้วันสร้างใบ (ใบจ่ายงานจริงส่วนใหญ่ไม่ได้กรอกวันจ่าย — เช็กแล้ว 141 ใบ)
  const since = new Date(Date.now() - 120 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const recent = `status.eq.dispatched,created_at.gte.${since}`;
  // ใบที่ฉันเป็นช่างหลัก + ใบที่มีชื่อฉันในรายชื่อช่างร่วม (2 คำค้น แล้วรวม — ไม่ประกอบ JSON ใส่ตัวกรอง or)
  const [a, b] = await Promise.all([
    admin.from("mo_work_orders").select(WO_COLS).eq("is_active", true).eq("assignee_id", me.employeeId).or(recent).limit(200),
    admin.from("mo_work_orders").select(WO_COLS).eq("is_active", true).contains("assignees", [{ id: me.employeeId }]).or(recent).limit(200),
  ]);
  if (a.error || b.error) throw new Error("โหลดงานเหมาไม่สำเร็จ กรุณาลองใหม่");
  const byId = new Map<string, Row>();
  for (const r of [...(a.data ?? []), ...(b.data ?? [])] as Row[]) byId.set(t(r.id), r);
  const wos = [...byId.values()];
  const people = new Map(wos.map((w) => [t(w.id), Math.max(1, Array.isArray(w.assignees) ? w.assignees.length : 1)]));
  let subs: SelfSubmission[] = [];
  if (wos.length) {
    const { data, error } = await admin.from("wo_submissions").select("wo_id,craftsman_id,qty,wage,submitted_at").in("wo_id", [...byId.keys()]).limit(2000);
    if (error) throw new Error("โหลดงานเหมาไม่สำเร็จ กรุณาลองใหม่");
    subs = ((data ?? []) as Row[]).map((s) => ({ wo_id: t(s.wo_id), craftsman_id: t(s.craftsman_id) || null, qty: n(s.qty), wage: s.wage == null ? null : n(s.wage), submitted_at: t(s.submitted_at) || null }));
  }
  const mine = mySubmissionTotals(me.employeeId, people, subs);
  const orders: SelfWorkOrder[] = wos.map((w) => ({
    id: t(w.id), wo_no: t(w.wo_no), product: t(w.product_name) || t(w.product_sku), stage: t(w.stage), uom: t(w.uom) || "ชิ้น",
    qty: n(w.qty), received_qty: n(w.received_qty), status: t(w.status), dispatch_date: t(w.dispatch_date) || t(w.created_at).slice(0, 10) || null, due_date: t(w.due_date) || null,
    my_sent_qty: mine.get(t(w.id))?.qty ?? 0, my_wage: mine.get(t(w.id))?.wage ?? 0, people: people.get(t(w.id)) ?? 1,
  })).sort((x, y) => (x.status === "dispatched" ? 0 : 1) - (y.status === "dispatched" ? 0 : 1) || (y.dispatch_date ?? "").localeCompare(x.dispatch_date ?? ""));
  return { orders, wage_this_month: wageThisMonth(me.employeeId, people, subs), open_count: orders.filter((o) => o.status === "dispatched").length };
}

/** เปิดหน้าเล็ก 1 หน้า (POST /api/employee-line/self) */
export async function lineSelfView(input: { id_token?: unknown; page?: unknown; slip_id?: unknown }): Promise<LineSelfResult> {
  if (!isLineSelfPage(input.page)) throw new Error("ไม่รู้จักหน้านี้");
  const page: LineSelfPage = input.page;
  const profile = await verifyLineIdToken(input.id_token, undefined, APPROVE_CHANNEL_ID);
  const lineUserId = t(profile.sub);
  const admin = supabaseAdmin();
  const who = await selfOf(admin, lineUserId);
  if (who.gate !== "ok") return { gate: who.gate };
  const { me } = who;
  const pub = { code: me.code, name: me.name, lang: me.lang };
  const slipId = t(input.slip_id);

  let result: LineSelfResult;
  if (page === "payslip") result = { gate: "ok", page, me: pub, ...(await payslipPage(admin, me, slipId)) };
  else if (page === "warning") result = { gate: "ok", page, me: pub, warnings: await warningPage(admin, me) };
  else result = { gate: "ok", page, me: pub, ...(await pieceworkPage(admin, me)) };

  // ลงประวัติว่าใครเปิดดูอะไร (ข้อมูลเงิน/ใบเตือน = ต้องตรวจย้อนได้)
  await writeAudit(admin, {
    action: "line_self_view", entityType: "employees", entityId: me.employeeId, actorName: me.name || me.code,
    metadata: { page, line_user_id: lineUserId, membership_id: me.membershipId, ...(result.page === "payslip" && result.slip ? { payslip_id: result.slip.id } : {}) },
  });
  return result;
}
