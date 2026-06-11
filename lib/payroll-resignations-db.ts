import { writeAudit } from "@/lib/audit";
import type { ResignationAction } from "@/lib/payroll-resignations-copy";
import { supabaseAdmin } from "@/lib/supabase-admin";

export { getResignationTransitionCopy, type ResignationAction } from "@/lib/payroll-resignations-copy";

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
  if (targetStatus === "approved") {
    const updates = buildResignationApprovalUpdates(payload.last_working_date);
    const employeeId = text(row.employee_id);
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
    },
  });
  return (await decorate([updatedRow]))[0];
}
