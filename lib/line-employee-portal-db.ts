import { writeAudit } from "@/lib/audit";
import { supabaseAdmin } from "@/lib/supabase-admin";

type Row = Record<string, unknown>;

export type LineMemberAction = "reset" | "block" | "unblock";

export type LineProfile = {
  user_id: string;
  display_name: string;
  picture_url: string;
};

const EMPLOYEE_SELECT = [
  "id",
  "employee_code",
  "first_name",
  "last_name",
  "nickname",
  "phone",
  "employment_status",
  "line_user_id",
  "line_display_name",
  "line_picture_url",
  "line_linked_at",
].join(",");

const MEMBER_SELECT = `id,employee_id,line_user_id,line_display_name,line_picture_url,status,linked_at,unlinked_at,blocked_at,created_at,updated_at,employees(${EMPLOYEE_SELECT})`;

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizePhone(value: unknown): string {
  return text(value).replace(/[^\d]/g, "").replace(/^66/, "0");
}

function employeeLabel(employee: Row | null | undefined): string {
  if (!employee) return "";
  const code = text(employee.employee_code);
  const name = [text(employee.first_name), text(employee.last_name)].filter(Boolean).join(" ") || text(employee.nickname);
  return [code, name].filter(Boolean).join(" · ");
}

function lineProfilePayload(profile: Row): LineProfile {
  return {
    user_id: text(profile.sub),
    display_name: text(profile.name),
    picture_url: text(profile.picture),
  };
}

function publicEmployee(employee: Row | null | undefined) {
  if (!employee) return null;
  return {
    id: text(employee.id),
    employee_code: text(employee.employee_code),
    full_name: [text(employee.first_name), text(employee.last_name)].filter(Boolean).join(" "),
    nickname: text(employee.nickname),
    employment_status: text(employee.employment_status),
    line_display_name: text(employee.line_display_name),
    line_picture_url: text(employee.line_picture_url),
    line_linked_at: text(employee.line_linked_at),
  };
}

function normalizeMember(row: Row) {
  const employee = (row.employees && typeof row.employees === "object" ? row.employees : null) as Row | null;
  return {
    id: text(row.id),
    employee_id: text(row.employee_id),
    employee_label: employeeLabel(employee),
    employee: publicEmployee(employee),
    line_user_id: text(row.line_user_id),
    line_display_name: text(row.line_display_name),
    line_picture_url: text(row.line_picture_url),
    employees: publicEmployee(employee),
    status: text(row.status),
    linked_at: text(row.linked_at),
    unlinked_at: text(row.unlinked_at),
    blocked_at: text(row.blocked_at),
    created_at: text(row.created_at),
    updated_at: text(row.updated_at),
  };
}

export async function verifyLineIdToken(idToken: unknown, nonce?: unknown): Promise<Row> {
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  if (!channelId) throw new Error("ยังไม่ได้ตั้งค่า LINE_LOGIN_CHANNEL_ID ฝั่ง server");
  const token = text(idToken);
  if (!token) throw new Error("ไม่พบ LINE ID token");

  const body = new URLSearchParams();
  body.set("id_token", token);
  body.set("client_id", channelId);
  if (nonce) body.set("nonce", text(nonce));

  const response = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await response.json().catch(() => ({}))) as Row;
  if (!response.ok || text(data.aud) !== channelId || !text(data.sub)) {
    throw new Error("ยืนยันบัญชี LINE ไม่สำเร็จ กรุณาเปิดผ่าน LINE อีกครั้ง");
  }
  return data;
}

async function activeLineMembership(lineUserId: string) {
  const { data, error } = await supabaseAdmin()
    .from("line_memberships")
    .select(MEMBER_SELECT)
    .eq("line_user_id", lineUserId)
    .in("status", ["linked", "blocked"])
    .limit(1);
  if (error) throw new Error(error.message);
  return (data?.[0] ?? null) as unknown as Row | null;
}

async function requireLinkedLineMembership(lineUserId: string) {
  const membership = await activeLineMembership(lineUserId);
  if (!membership) throw new Error("ยังไม่ได้สมัครสมาชิกพนักงาน");
  if (text(membership.status) === "blocked") throw new Error("บัญชี LINE นี้ถูกระงับ กรุณาติดต่อ HR");
  const employee = (membership.employees && typeof membership.employees === "object" ? membership.employees : {}) as Row;
  if (text(employee.employment_status) !== "active") throw new Error("บัญชีพนักงานนี้ไม่อยู่ในสถานะใช้งาน กรุณาติดต่อ HR");
  return membership;
}

export async function lineSession(input: { id_token?: unknown; nonce?: unknown }) {
  const profile = await verifyLineIdToken(input.id_token, input.nonce);
  const lineUserId = text(profile.sub);
  const membership = await activeLineMembership(lineUserId);

  if (!membership) {
    await writeAudit(supabaseAdmin(), {
      action: "line_session_not_registered",
      entityType: "line_memberships",
      metadata: { line_user_id: lineUserId, line_display_name: text(profile.name) },
    });
    return { status: "not_registered", line_profile: lineProfilePayload(profile) };
  }

  const employee = (membership.employees && typeof membership.employees === "object" ? membership.employees : null) as Row | null;
  if (text(membership.status) === "blocked") {
    await writeAudit(supabaseAdmin(), {
      action: "line_session_blocked",
      entityType: "line_memberships",
      entityId: text(membership.id),
      metadata: { employee_id: text(membership.employee_id), line_user_id: lineUserId },
    });
    return { status: "blocked", line_profile: lineProfilePayload(profile), employee: publicEmployee(employee) };
  }

  await writeAudit(supabaseAdmin(), {
    action: "line_session",
    entityType: "line_memberships",
    entityId: text(membership.id),
    metadata: { employee_id: text(membership.employee_id), line_user_id: lineUserId },
  });
  return { status: "registered", line_profile: lineProfilePayload(profile), employee: publicEmployee(employee) };
}

export async function registerLineMember(input: { id_token?: unknown; nonce?: unknown; employee_code?: unknown; phone?: unknown }) {
  const profile = await verifyLineIdToken(input.id_token, input.nonce);
  const lineUserId = text(profile.sub);
  const employeeCode = text(input.employee_code);
  const phone = normalizePhone(input.phone);
  if (!employeeCode || !phone) throw new Error("กรุณากรอกรหัสพนักงานและเบอร์โทร");

  const admin = supabaseAdmin();
  const { data: employees, error: employeeError } = await admin
    .from("employees")
    .select(EMPLOYEE_SELECT)
    .eq("employee_code", employeeCode)
    .limit(1);
  if (employeeError) throw new Error(employeeError.message);
  const employee = (employees?.[0] ?? null) as unknown as Row | null;
  if (!employee || normalizePhone(employee.phone) !== phone) {
    await writeAudit(admin, {
      action: "line_register_failed",
      entityType: "line_memberships",
      metadata: { reason: "employee_or_phone_mismatch", employee_code: employeeCode, line_user_id: lineUserId },
    });
    throw new Error("ไม่พบข้อมูลพนักงาน หรือรหัส/เบอร์โทรไม่ถูกต้อง");
  }
  if (text(employee.employment_status) !== "active") throw new Error("บัญชีพนักงานนี้ไม่อยู่ในสถานะใช้งาน กรุณาติดต่อ HR");

  const existingLine = await activeLineMembership(lineUserId);
  if (existingLine && text(existingLine.employee_id) !== text(employee.id)) throw new Error("บัญชี LINE นี้ถูกใช้กับพนักงานอื่นแล้ว");

  const { data: existingEmployees, error: existingEmployeeError } = await admin
    .from("line_memberships")
    .select("id,line_user_id,status")
    .eq("employee_id", text(employee.id))
    .in("status", ["linked", "blocked"])
    .limit(1);
  if (existingEmployeeError) throw new Error(existingEmployeeError.message);
  const existingEmployee = existingEmployees?.[0] as Row | undefined;
  if (existingEmployee && text(existingEmployee.line_user_id) !== lineUserId) throw new Error("บัญชีพนักงานนี้ถูกผูกกับ LINE อื่นแล้ว");
  if (text(existingEmployee?.status) === "blocked") throw new Error("บัญชีของคุณถูกระงับ กรุณาติดต่อ HR");

  const linkedAt = new Date().toISOString();
  const body = {
    employee_id: text(employee.id),
    line_user_id: lineUserId,
    line_display_name: text(profile.name) || null,
    line_picture_url: text(profile.picture) || null,
    status: "linked",
    linked_at: linkedAt,
    unlinked_at: null,
    blocked_at: null,
  };
  const query = existingLine
    ? admin.from("line_memberships").update(body).eq("id", text(existingLine.id))
    : admin.from("line_memberships").insert(body);
  const { data: saved, error: saveError } = await query.select(MEMBER_SELECT).limit(1);
  if (saveError) throw new Error(saveError.message);

  const { error: employeeUpdateError } = await admin
    .from("employees")
    .update({
      line_user_id: lineUserId,
      line_display_name: text(profile.name) || null,
      line_picture_url: text(profile.picture) || null,
      line_linked_at: linkedAt,
    })
    .eq("id", text(employee.id));
  if (employeeUpdateError) throw new Error(employeeUpdateError.message);

  const row = (saved?.[0] ?? null) as unknown as Row | null;
  await writeAudit(admin, {
    action: "line_register_success",
    entityType: "line_memberships",
    entityId: text(row?.id),
    metadata: { employee_id: text(employee.id), employee_code: employeeCode, line_user_id: lineUserId },
  });

  return { status: "registered", line_profile: lineProfilePayload(profile), employee: publicEmployee(employee), member: row ? normalizeMember(row) : null };
}

export async function employeeLineMe(input: { id_token?: unknown; nonce?: unknown }) {
  const profile = await verifyLineIdToken(input.id_token, input.nonce);
  const membership = await requireLinkedLineMembership(text(profile.sub));
  const employee = (membership.employees && typeof membership.employees === "object" ? membership.employees : null) as Row | null;
  await writeAudit(supabaseAdmin(), {
    action: "employee_line_me",
    entityType: "line_memberships",
    entityId: text(membership.id),
    metadata: { employee_id: text(membership.employee_id), line_user_id: text(profile.sub) },
  });
  return { status: "registered", line_profile: lineProfilePayload(profile), employee: publicEmployee(employee) };
}

export async function listLineMembers() {
  const admin = supabaseAdmin();
  const [membersResult, employeesResult] = await Promise.all([
    admin.from("line_memberships").select(MEMBER_SELECT).order("linked_at", { ascending: false }),
    admin
      .from("employees")
      .select(EMPLOYEE_SELECT)
      .eq("employment_status", "active")
      .order("employee_code", { ascending: true }),
  ]);
  if (membersResult.error) throw new Error(membersResult.error.message);
  if (employeesResult.error) throw new Error(employeesResult.error.message);

  const linked = ((membersResult.data ?? []) as unknown as Row[]).map(normalizeMember);
  const activeEmployeeIds = new Set(linked.filter((row) => ["linked", "blocked"].includes(row.status)).map((row) => row.employee_id));
  const notLinked = ((employeesResult.data ?? []) as unknown as Row[])
    .filter((employee) => !activeEmployeeIds.has(text(employee.id)))
    .map((employee) => ({
      id: text(employee.id),
      employee_code: text(employee.employee_code),
      full_name: [text(employee.first_name), text(employee.last_name)].filter(Boolean).join(" "),
      nickname: text(employee.nickname),
      phone: text(employee.phone),
    }));
  return { linked, not_linked: notLinked };
}

export async function updateLineMemberStatus(id: string, action: LineMemberAction, actor?: unknown) {
  const admin = supabaseAdmin();
  const { data: beforeRows, error: beforeError } = await admin.from("line_memberships").select(MEMBER_SELECT).eq("id", id).limit(1);
  if (beforeError) throw new Error(beforeError.message);
  const before = (beforeRows?.[0] ?? null) as unknown as Row | null;
  if (!before) throw new Error("ไม่พบรายการผูก LINE");

  const now = new Date().toISOString();
  const update = action === "reset"
    ? { status: "unlinked", unlinked_at: now }
    : action === "block"
      ? { status: "blocked", blocked_at: now }
      : { status: "linked", blocked_at: null, unlinked_at: null };
  const { data, error } = await admin.from("line_memberships").update(update).eq("id", id).select(MEMBER_SELECT).limit(1);
  if (error) throw new Error(error.message);

  if (action === "reset") {
    await admin.from("employees").update({
      line_user_id: null,
      line_display_name: null,
      line_picture_url: null,
      line_linked_at: null,
    }).eq("id", text(before.employee_id));
  }

  const updated = (data?.[0] ?? null) as unknown as Row | null;
  await writeAudit(admin, {
    action: `${action}_line_member`,
    entityType: "line_memberships",
    entityId: id,
    actorName: text(actor) || null,
    metadata: {
      employee_id: text(before.employee_id),
      line_user_id: text(before.line_user_id),
      previous_status: text(before.status),
      next_status: text(updated?.status),
    },
  });
  return updated ? normalizeMember(updated) : null;
}
