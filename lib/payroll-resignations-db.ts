import { writeAudit } from "@/lib/audit";
import type { ResignationAction } from "@/lib/payroll-resignations-copy";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { syncUserAccountOnEmploymentChange } from "@/lib/payroll-employees-db";

export { getResignationTransitionCopy, type ResignationAction, type ResignationPageAction } from "@/lib/payroll-resignations-copy";

const TABLE = "employee_portal_requests";
const PORTAL_REQUEST_TYPE = "profile_update";
const RESIGNATION_KIND = "resignation";

export type ResignationStatus = "pending" | "approved" | "rejected" | "cancelled";

export type ResignationPayload = {
  request_kind?: "resignation";
  notice_date: string;
  last_working_date: string;
  reason: string;
  handover_note: string;
};

export type ResignationRow = Record<string, unknown> & {
  id: string;
  employee_id: string;
  employee_label: string;
  notice_date: string;
  last_working_date: string;
  reason: string;
  handover_note: string;
  status: ResignationStatus;
};

type DraftInput = {
  employee_id?: unknown;
  notice_date?: unknown;
  last_working_date?: unknown;
  reason?: unknown;
  handover_note?: unknown;
};

type TransitionInput = {
  action: ResignationAction;
  review_note?: unknown;
  actor?: unknown;
};

const SELECT = "id, employee_id, request_type, note, payload, status, review_note, reviewed_by, reviewed_at, created_at, updated_at";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function text(v: unknown): string {
  return String(v ?? "").trim();
}

function isIsoDate(v: string): boolean {
  return ISO_DATE.test(v);
}

export function normalizeResignationPayload(input: DraftInput): ResignationPayload {
  return {
    notice_date: text(input.notice_date) || todayIso(),
    last_working_date: text(input.last_working_date),
    reason: text(input.reason),
    handover_note: text(input.handover_note),
  };
}

export function validateResignationDraft(input: DraftInput): string | null {
  const employeeId = text(input.employee_id);
  const payload = normalizeResignationPayload(input);
  if (!employeeId) return "ต้องเลือกพนักงาน";
  if (!payload.last_working_date) return "ต้องระบุวันทำงานวันสุดท้าย";
  if (!isIsoDate(payload.notice_date)) return "รูปแบบวันที่แจ้งไม่ถูกต้อง";
  if (!isIsoDate(payload.last_working_date)) return "รูปแบบวันทำงานวันสุดท้ายไม่ถูกต้อง";
  if (payload.notice_date > payload.last_working_date) return "วันที่แจ้งต้องไม่หลังวันทำงานวันสุดท้าย";
  return null;
}

export function canTransitionResignation(current: string, target: ResignationStatus): boolean {
  return current === "pending" && ["approved", "rejected", "cancelled"].includes(target);
}

export function buildResignationApprovalUpdates(lastWorkingDate: string) {
  return {
    employee: { employment_status: "resigned", resign_date: lastWorkingDate },
    currentContract: { end_date: lastWorkingDate, status: "ended", is_current: false },
  };
}

export function buildResignationRequestInsert(input: DraftInput) {
  const payload = normalizeResignationPayload(input);
  return {
    employee_id: text(input.employee_id),
    request_type: PORTAL_REQUEST_TYPE,
    target_field: null,
    old_value: null,
    new_value: payload.last_working_date,
    note: payload.reason,
    payload: { request_kind: RESIGNATION_KIND, ...payload },
    status: "pending",
  };
}

function toTargetStatus(action: TransitionInput["action"]): ResignationStatus {
  if (action === "approve") return "approved";
  if (action === "reject") return "rejected";
  return "cancelled";
}

function payloadFromRow(row: Record<string, unknown>): ResignationPayload {
  const payload = (row.payload && typeof row.payload === "object" ? row.payload : {}) as Record<string, unknown>;
  return normalizeResignationPayload({
    notice_date: payload.notice_date,
    last_working_date: payload.last_working_date,
    reason: payload.reason ?? row.note,
    handover_note: payload.handover_note,
  });
}

function employeeLabel(row: Record<string, unknown>): string {
  const first = text(row.first_name);
  const last = text(row.last_name);
  const nick = text(row.nickname);
  const name = [first, last].filter(Boolean).join(" ") || nick;
  return `${text(row.employee_code)}${name ? " · " + name : ""}`.trim();
}

async function employeeLabels(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const { data, error } = await supabaseAdmin()
    .from("employees")
    .select("id, employee_code, first_name, last_name, nickname")
    .in("id", ids);
  if (error) throw new Error(error.message);
  const labels: Record<string, string> = {};
  (data ?? []).forEach((row) => {
    labels[String(row.id)] = employeeLabel(row as Record<string, unknown>);
  });
  return labels;
}

async function decorate(rows: Record<string, unknown>[]): Promise<ResignationRow[]> {
  const ids = [...new Set(rows.map((row) => text(row.employee_id)).filter(Boolean))];
  const labels = await employeeLabels(ids);
  return rows.map((row) => {
    const payload = payloadFromRow(row);
    const employeeId = text(row.employee_id);
    return {
      ...row,
      id: text(row.id),
      employee_id: employeeId,
      employee_label: labels[employeeId] ?? "",
      notice_date: payload.notice_date,
      last_working_date: payload.last_working_date,
      reason: payload.reason,
      handover_note: payload.handover_note,
      status: text(row.status) as ResignationStatus,
    };
  });
}

export async function listResignations(limit = 1000): Promise<ResignationRow[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 2000);
  const { data, error } = await supabaseAdmin()
    .from(TABLE)
    .select(SELECT)
    .eq("request_type", PORTAL_REQUEST_TYPE)
    .contains("payload", { request_kind: RESIGNATION_KIND })
    .order("created_at", { ascending: false })
    .limit(safeLimit);
  if (error) throw new Error(error.message);
  return decorate((data ?? []) as Record<string, unknown>[]);
}

export async function createResignation(input: DraftInput & { actor?: unknown }): Promise<ResignationRow> {
  const validation = validateResignationDraft(input);
  if (validation) throw new Error(validation);
  const payload = normalizeResignationPayload(input);
  const insert = buildResignationRequestInsert(input);
  const { data, error } = await supabaseAdmin().from(TABLE).insert(insert).select(SELECT).limit(1);
  if (error) throw new Error(error.message);
  const row = (data?.[0] ?? null) as Record<string, unknown> | null;
  if (!row) throw new Error("สร้างคำขอแจ้งลาออกไม่สำเร็จ");
  await writeAudit(supabaseAdmin(), {
    action: "create_resignation_request",
    entityType: TABLE,
    entityId: text(row.id),
    actorName: text(input.actor) || null,
    metadata: { employee_id: insert.employee_id, last_working_date: payload.last_working_date, reason: payload.reason },
  });
  return (await decorate([row]))[0];
}

export async function transitionResignation(id: string, input: TransitionInput): Promise<ResignationRow> {
  const targetStatus = toTargetStatus(input.action);
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from(TABLE)
    .select(SELECT)
    .eq("id", id)
    .eq("request_type", PORTAL_REQUEST_TYPE)
    .contains("payload", { request_kind: RESIGNATION_KIND })
    .limit(1);
  if (error) throw new Error(error.message);
  const row = (data?.[0] ?? null) as Record<string, unknown> | null;
  if (!row) throw new Error("ไม่พบคำขอแจ้งลาออก");

  const currentStatus = text(row.status);
  if (!canTransitionResignation(currentStatus, targetStatus)) {
    throw new Error("คำขอนี้ดำเนินการไปแล้ว ไม่สามารถเปลี่ยนสถานะซ้ำได้");
  }

  const payload = payloadFromRow(row);
  // จดสัญญา/สถานะก่อนอนุมัติ → ใช้คืนค่าตอน "ย้อนการอนุมัติ"
  let before: { contract: Record<string, unknown> | null; employee: Record<string, unknown> | null } | null = null;
  if (targetStatus === "approved") {
    const updates = buildResignationApprovalUpdates(payload.last_working_date);
    const employeeId = text(row.employee_id);
    const [{ data: cBefore }, { data: eBefore }] = await Promise.all([
      admin.from("employee_contracts").select("id, end_date, status, is_current").eq("employee_id", employeeId).eq("is_current", true).eq("status", "active").limit(1),
      admin.from("employees").select("employment_status, resign_date").eq("id", employeeId).limit(1),
    ]);
    before = { contract: (cBefore?.[0] as Record<string, unknown>) ?? null, employee: (eBefore?.[0] as Record<string, unknown>) ?? null };
    const { error: contractError } = await admin
      .from("employee_contracts")
      .update(updates.currentContract)
      .eq("employee_id", employeeId)
      .eq("is_current", true)
      .eq("status", "active");
    if (contractError) throw new Error(contractError.message);

    const { error: employeeError } = await admin
      .from("employees")
      .update(updates.employee)
      .eq("id", employeeId);
    if (employeeError) throw new Error(employeeError.message);
    // อนุมัติลาออกแล้ว → ปิดบัญชีผู้ใช้ระบบที่ผูกกับพนักงานคนนี้ (กันลาออกแล้วยังล็อกอินได้)
    await syncUserAccountOnEmploymentChange(employeeId, updates.employee.employment_status);
  }

  const reviewedAt = new Date().toISOString();
  const update = {
    status: targetStatus,
    review_note: text(input.review_note) || null,
    reviewed_by: text(input.actor) || null,
    reviewed_at: reviewedAt,
    updated_at: reviewedAt,
  };
  const { data: updated, error: updateError } = await admin
    .from(TABLE)
    .update(update)
    .eq("id", id)
    .select(SELECT)
    .limit(1);
  if (updateError) throw new Error(updateError.message);
  const updatedRow = (updated?.[0] ?? null) as Record<string, unknown> | null;
  if (!updatedRow) throw new Error("อัปเดตคำขอแจ้งลาออกไม่สำเร็จ");

  await writeAudit(admin, {
    action: `${targetStatus}_resignation_request`,
    entityType: TABLE,
    entityId: id,
    actorName: text(input.actor) || null,
    metadata: {
      employee_id: text(row.employee_id),
      last_working_date: payload.last_working_date,
      review_note: update.review_note,
      previous_status: currentStatus,
      next_status: targetStatus,
      ...(before ? { before } : {}),
    },
  });
  return (await decorate([updatedRow]))[0];
}

/** โหลดคำขอแจ้งลาออก 1 ใบ (ไม่เจอ = โยน Error) */
async function loadResignationRow(id: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabaseAdmin()
    .from(TABLE).select(SELECT).eq("id", id)
    .eq("request_type", PORTAL_REQUEST_TYPE).contains("payload", { request_kind: RESIGNATION_KIND }).limit(1);
  if (error) throw new Error(error.message);
  const row = (data?.[0] ?? null) as Record<string, unknown> | null;
  if (!row) throw new Error("ไม่พบคำขอแจ้งลาออก");
  return row;
}

/** ✏️ แก้คำขอที่ยัง "รอตรวจ" (ลงวันที่/เหตุผลผิด) — อนุมัติแล้วแก้ไม่ได้ ต้องย้อนการอนุมัติก่อน */
export async function updateResignationDraft(id: string, input: DraftInput & { actor?: unknown }): Promise<ResignationRow> {
  const admin = supabaseAdmin();
  const row = await loadResignationRow(id);
  if (text(row.status) !== "pending") throw new Error("แก้ได้เฉพาะคำขอที่ยังรอตรวจ");
  const old = payloadFromRow(row);
  const next = normalizeResignationPayload({
    notice_date: input.notice_date ?? old.notice_date,
    last_working_date: input.last_working_date ?? old.last_working_date,
    reason: input.reason ?? old.reason,
    handover_note: input.handover_note ?? old.handover_note,
  });
  const validation = validateResignationDraft({ employee_id: row.employee_id, ...next });
  if (validation) throw new Error(validation);

  const { data, error } = await admin.from(TABLE).update({
    new_value: next.last_working_date, note: next.reason,
    payload: { request_kind: RESIGNATION_KIND, ...next },
    updated_at: new Date().toISOString(),
  }).eq("id", id).select(SELECT).limit(1);
  if (error) throw new Error(error.message);
  const updatedRow = (data?.[0] ?? null) as Record<string, unknown> | null;
  if (!updatedRow) throw new Error("แก้คำขอไม่สำเร็จ");
  await writeAudit(admin, {
    action: "update_resignation_request", entityType: TABLE, entityId: id, actorName: text(input.actor) || null,
    metadata: { employee_id: text(row.employee_id), old, new: next },
  });
  return (await decorate([updatedRow]))[0];
}

/**
 * ↩ ย้อนการอนุมัติลาออก — คืนสถานะพนักงาน + เปิดสัญญาที่ถูกปิดตอนอนุมัติ · คำขอปิดเป็น "ยกเลิก"
 * กันพลาด: พนักงานต้องยังเป็น "ลาออก" และยังไม่มีสัญญาใหม่ (ถ้ามีสัญญาใหม่ = รับกลับเข้าทำงานแล้ว ไม่ต้องย้อน)
 * บัญชีเข้าระบบไม่เปิดคืนอัตโนมัติ (ตั้งใจ — ดู syncUserAccountOnEmploymentChange)
 */
export async function revertResignationApproval(id: string, input: { review_note?: unknown; actor?: unknown }): Promise<ResignationRow> {
  const admin = supabaseAdmin();
  const row = await loadResignationRow(id);
  if (text(row.status) !== "approved") throw new Error("ย้อนได้เฉพาะคำขอที่อนุมัติแล้ว");
  const note = text(input.review_note);
  if (!note) throw new Error("ต้องระบุเหตุผลที่ย้อนการอนุมัติ");

  const employeeId = text(row.employee_id);
  const payload = payloadFromRow(row);
  const { data: empRows } = await admin.from("employees").select("id, employment_status, resign_date").eq("id", employeeId).limit(1);
  const emp = (empRows?.[0] ?? null) as Record<string, unknown> | null;
  if (!emp) throw new Error("ไม่พบพนักงานของคำขอนี้");
  if (text(emp.employment_status) !== "resigned") throw new Error(`สถานะพนักงานตอนนี้คือ “${text(emp.employment_status)}” ไม่ใช่ลาออก — มีคนแก้ไปแล้ว ไม่ต้องย้อน`);

  const { data: activeNow } = await admin.from("employee_contracts").select("id").eq("employee_id", employeeId).eq("is_current", true).eq("status", "active").limit(1);
  if (activeNow?.[0]) throw new Error("พนักงานมีสัญญาจ้างใหม่ที่ใช้อยู่แล้ว — ไม่ต้องย้อนการอนุมัติ");

  // ค่าก่อนอนุมัติ (จดไว้ในประวัติ) — คำขอเก่าที่อนุมัติก่อนมีระบบจด จะไม่มี
  const { data: logs } = await admin.from("audit_logs").select("metadata")
    .eq("entity_type", TABLE).eq("entity_id", id).eq("action", "approved_resignation_request").order("created_at", { ascending: false }).limit(1);
  const before = ((logs?.[0] as { metadata?: Record<string, unknown> } | undefined)?.metadata?.before ?? null) as
    { contract?: { id?: string; end_date?: string | null } | null; employee?: { employment_status?: string; resign_date?: string | null } | null } | null;

  // สัญญาที่ถูกปิดตอนอนุมัติ: ใช้ id ที่จดไว้ ไม่งั้นหาใบที่ "จบวันเดียวกับวันทำงานวันสุดท้าย"
  let contractId = text(before?.contract?.id);
  if (!contractId) {
    const { data: ended } = await admin.from("employee_contracts").select("id")
      .eq("employee_id", employeeId).eq("status", "ended").eq("end_date", payload.last_working_date)
      .order("updated_at", { ascending: false }).limit(1);
    contractId = text((ended?.[0] as { id?: string } | undefined)?.id);
  }
  let contractRestored = false;
  if (contractId) {
    const { error: cErr } = await admin.from("employee_contracts")
      .update({ status: "active", is_current: true, end_date: before?.contract?.end_date ?? null })
      .eq("id", contractId).eq("employee_id", employeeId);
    if (cErr) throw new Error("เปิดสัญญาจ้างคืนไม่สำเร็จ: " + cErr.message);
    contractRestored = true;
  }

  const prevStatus = text(before?.employee?.employment_status) || "active";
  const { error: eErr } = await admin.from("employees")
    .update({ employment_status: prevStatus === "resigned" ? "active" : prevStatus, resign_date: before?.employee?.resign_date ?? null })
    .eq("id", employeeId);
  if (eErr) throw new Error("คืนสถานะพนักงานไม่สำเร็จ: " + eErr.message);

  const now = new Date().toISOString();
  const { data: updated, error: uErr } = await admin.from(TABLE).update({
    status: "cancelled",
    review_note: `ย้อนการอนุมัติ: ${note}`,
    reviewed_by: text(input.actor) || null, reviewed_at: now, updated_at: now,
  }).eq("id", id).select(SELECT).limit(1);
  if (uErr) throw new Error(uErr.message);
  const updatedRow = (updated?.[0] ?? null) as Record<string, unknown> | null;
  if (!updatedRow) throw new Error("อัปเดตคำขอไม่สำเร็จ");

  await writeAudit(admin, {
    action: "revert_resignation_approval", entityType: TABLE, entityId: id, actorName: text(input.actor) || null,
    metadata: { employee_id: employeeId, last_working_date: payload.last_working_date, reason: note, contract_id: contractId || null, contract_restored: contractRestored, had_snapshot: !!before },
  });
  const out = (await decorate([updatedRow]))[0];
  return { ...out, contract_restored: contractRestored };
}
