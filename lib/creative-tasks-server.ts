// ============================================================
// Creative Task Manager — helper ฝั่ง server (ใช้ supabaseAdmin)
// เลขรันงาน, แจ้งเตือน (erp_notifications), แปลง id พนักงาน → ชื่อ
// ============================================================
import { supabaseAdmin } from "@/lib/supabase-admin";

type Admin = ReturnType<typeof supabaseAdmin>;

/** เลขที่งาน CT-YYYYMM-#### (นับตามเดือน) — task_no มี unique constraint, ชนกันให้ผู้เรียก retry */
export async function nextTaskNo(admin: Admin): Promise<string> {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `CT-${ym}-`;
  const { data } = await admin
    .from("erp_creative_tasks")
    .select("task_no")
    .like("task_no", `${prefix}%`)
    .order("task_no", { ascending: false })
    .limit(1);
  const last = (data?.[0]?.task_no as string | undefined) ?? null;
  const seq = last ? parseInt(last.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(Number.isFinite(seq) ? seq : 1).padStart(4, "0")}`;
}

/** สร้างการแจ้งเตือนในระบบ (ไม่ throw — แจ้งเตือนพังห้ามทำให้ action หลักพัง) */
export async function notify(
  admin: Admin,
  n: {
    userId: string;
    eventType: string;
    title: string;
    body?: string | null;
    linkUrl?: string | null;
    entityId?: string | null;
    priority?: "low" | "normal" | "high";
  },
): Promise<void> {
  if (!n.userId) return;
  try {
    await admin.from("erp_notifications").insert({
      user_id: n.userId,
      event_type: n.eventType,
      title: n.title,
      body: n.body ?? null,
      link_url: n.linkUrl ?? "/tasks",
      entity_type: "creative_task",
      entity_id: n.entityId ?? null,
      priority: n.priority ?? "normal",
    });
  } catch {
    /* เงียบไว้ — การแจ้งเตือนไม่สำคัญพอจะทำให้งานหลักล้ม */
  }
}

type EmpRow = {
  id: string;
  first_name_th: string | null; last_name_th: string | null;
  first_name: string | null; last_name: string | null;
  nickname: string | null; employee_code: string | null;
};

/** ชื่อแสดงพนักงาน: ไทย > ชื่อเล่น > อังกฤษ > รหัส */
export function employeeLabel(e: Partial<EmpRow> | null | undefined): string {
  if (!e) return "";
  const th = [e.first_name_th, e.last_name_th].filter(Boolean).join(" ").trim();
  if (th) return th;
  if (e.nickname) return e.nickname;
  const en = [e.first_name, e.last_name].filter(Boolean).join(" ").trim();
  if (en) return en;
  return e.employee_code ?? "";
}

/** ดึงชื่อพนักงานหลายคนพร้อมกัน → Map<id, label> (เฉพาะ id ที่ส่งมา) */
export async function employeeLabelMap(admin: Admin, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean).map(String))];
  const map = new Map<string, string>();
  if (uniq.length === 0) return map;
  const { data } = await admin
    .from("employees")
    .select("id, first_name_th, last_name_th, first_name, last_name, nickname, employee_code")
    .in("id", uniq);
  for (const e of (data ?? []) as EmpRow[]) map.set(String(e.id), employeeLabel(e));
  return map;
}

/**
 * แปลง employee id → auth user id (user_profiles.id) ผ่าน email
 * ใช้ก่อนแจ้งเตือน เพราะ erp_notifications.user_id ต้องเป็น auth uid
 * คืน null ถ้าพนักงานไม่มีอีเมล หรือยังไม่มีบัญชีผู้ใช้ที่ผูกอีเมลนั้น → ผู้เรียกควรข้ามการแจ้งเตือน
 */
export async function employeeAuthId(admin: Admin, employeeId: string | null | undefined): Promise<string | null> {
  if (!employeeId) return null;
  const { data: emp } = await admin.from("employees").select("email").eq("id", employeeId).maybeSingle();
  const email = (emp?.email as string | null)?.trim();
  if (!email) return null;
  const { data: up } = await admin.from("user_profiles").select("id").ilike("email", email).eq("active", true).maybeSingle();
  return (up?.id as string | null) ?? null;
}
