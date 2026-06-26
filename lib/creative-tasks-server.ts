// ============================================================
// Creative Task Manager — helper ฝั่ง server (ใช้ supabaseAdmin)
// เลขรันงาน, แจ้งเตือน (erp_notifications), แปลง id ผู้ใช้ → ชื่อ
// หมายเหตุ: ผู้รับผิดชอบงาน creative = user จริง (user_profiles) ไม่ใช่ employees แล้ว
// ============================================================
import { supabaseAdmin } from "@/lib/supabase-admin";

type Admin = ReturnType<typeof supabaseAdmin>;

/** เลขที่งาน CT-YYYYMM-#### (นับตามเดือน) */
export async function nextTaskNo(admin: Admin): Promise<string> {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `CT-${ym}-`;
  const { data } = await admin.from("erp_creative_tasks").select("task_no").like("task_no", `${prefix}%`).order("task_no", { ascending: false }).limit(1);
  const last = (data?.[0]?.task_no as string | undefined) ?? null;
  const seq = last ? parseInt(last.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(Number.isFinite(seq) ? seq : 1).padStart(4, "0")}`;
}

/** เลขที่คอนเทนต์ CN-YYYYMM-#### (นับตามเดือน) */
export async function nextContentNo(admin: Admin): Promise<string> {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `CN-${ym}-`;
  const { data } = await admin.from("erp_creative_content").select("content_no").like("content_no", `${prefix}%`).order("content_no", { ascending: false }).limit(1);
  const last = (data?.[0]?.content_no as string | undefined) ?? null;
  const seq = last ? parseInt(last.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(Number.isFinite(seq) ? seq : 1).padStart(4, "0")}`;
}

/** สร้างการแจ้งเตือนในระบบ (ไม่ throw) — userId = user_profiles.id (auth uid) */
export async function notify(
  admin: Admin,
  n: { userId: string; eventType: string; title: string; body?: string | null; linkUrl?: string | null; entityId?: string | null; priority?: "low" | "normal" | "high" },
): Promise<void> {
  if (!n.userId) return;
  try {
    await admin.from("erp_notifications").insert({
      user_id: n.userId, event_type: n.eventType, title: n.title, body: n.body ?? null,
      link_url: n.linkUrl ?? "/tasks", entity_type: "creative_task", entity_id: n.entityId ?? null, priority: n.priority ?? "normal",
    });
  } catch { /* เงียบ */ }
}

/** ตั้งผู้รับผิดชอบ subtask (m2m) แบบแทนที่ทั้งชุด — เก็บ user_id */
export async function setSubtaskAssignees(admin: Admin, subtaskId: string, userIds: (string | null | undefined)[]): Promise<void> {
  await admin.from("erp_creative_subtask_assignees").delete().eq("subtask_id", subtaskId);
  const clean = [...new Set(userIds.filter(Boolean).map(String))];
  if (clean.length) await admin.from("erp_creative_subtask_assignees").insert(clean.map((user_id) => ({ subtask_id: subtaskId, user_id })));
}

/** ผู้รับผิดชอบของหลาย subtask → Map<subtask_id, {id,label,color,avatar_url}[]> */
export async function subtaskAssigneesMap(admin: Admin, subtaskIds: string[]): Promise<Map<string, { id: string; label: string; color: string | null; avatar_url: string | null }[]>> {
  const map = new Map<string, { id: string; label: string; color: string | null; avatar_url: string | null }[]>();
  if (subtaskIds.length === 0) return map;
  const { data } = await admin.from("erp_creative_subtask_assignees").select("subtask_id, user_id").in("subtask_id", subtaskIds);
  const rows = (data ?? []) as { subtask_id: string; user_id: string }[];
  const userIds = rows.map((r) => r.user_id);
  const labels = await userLabelMap(admin, userIds);
  // ธีมพนักงาน (user_profiles.color) + รูป (avatar_url) — ใช้ระบาย/แสดง avatar
  const colorMap = new Map<string, string | null>();
  const avatarMap = new Map<string, string | null>();
  if (userIds.length) {
    const { data: cs } = await admin.from("user_profiles").select("id, color, avatar_url").in("id", [...new Set(userIds.map(String))]);
    for (const c of (cs ?? []) as { id: string; color: string | null; avatar_url: string | null }[]) { colorMap.set(String(c.id), c.color); avatarMap.set(String(c.id), c.avatar_url); }
  }
  for (const r of rows) {
    const arr = map.get(r.subtask_id) ?? [];
    arr.push({ id: r.user_id, label: labels.get(String(r.user_id)) ?? "", color: colorMap.get(String(r.user_id)) ?? null, avatar_url: avatarMap.get(String(r.user_id)) ?? null });
    map.set(r.subtask_id, arr);
  }
  return map;
}

type UserRow = { id: string; display_name: string | null; username: string | null; email: string | null };

/** ชื่อแสดงผู้ใช้: display_name > username > email */
export function userLabel(u: Partial<UserRow> | null | undefined): string {
  if (!u) return "";
  return (u.display_name || u.username || u.email || "").trim();
}

/** ดึงชื่อผู้ใช้หลายคนพร้อมกัน → Map<id, label> (จาก user_profiles) */
export async function userLabelMap(admin: Admin, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean).map(String))];
  const map = new Map<string, string>();
  if (uniq.length === 0) return map;
  const { data } = await admin.from("user_profiles").select("id, display_name, username, email").in("id", uniq);
  for (const u of (data ?? []) as UserRow[]) map.set(String(u.id), userLabel(u));
  return map;
}

// alias เดิม (เลี่ยงแก้ import หลายไฟล์) — ตอนนี้ resolve จาก user_profiles
export { userLabelMap as employeeLabelMap };

/**
 * แปลง assignee → auth user id สำหรับแจ้งเตือน
 * ตอนนี้ assignee_id = user_profiles.id อยู่แล้ว → คืน id ถ้าเป็นผู้ใช้ที่ active
 */
export async function employeeAuthId(admin: Admin, userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const { data } = await admin.from("user_profiles").select("id").eq("id", userId).eq("active", true).maybeSingle();
  return (data?.id as string | null) ?? null;
}
