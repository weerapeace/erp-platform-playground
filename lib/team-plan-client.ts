/**
 * แผนงานทีม — เรียก API จากหน้าเว็บ (/api/team-plan) · ใช้ร่วมกับปุ่ม "ใส่แผนงาน" จากโมดูลอื่น (รอบถัดไป)
 * ผิดพลาด = throw Error ข้อความภาษาคนจาก API
 */
import { apiFetch } from "@/lib/api";
import type { PlanItem, PlanWatcher, Priority, RemindMode, RepeatRule } from "@/lib/team-plan";

export type PlanDraft = {
  title: string; note?: string | null; priority?: Priority; due_at?: string | null; assigned_to?: string | null;
  important?: boolean; remind?: RemindMode; repeat?: RepeatRule | null; waiting_note?: string | null;
  source?: { label: string; href: string } | null;
};
export type PlanPatch = Partial<{
  title: string; note: string | null; priority: Priority; due_at: string | null; assigned_to: string | null;
  status: "open" | "resolved"; important: boolean; star: boolean; waiting: { note: string } | null;
  repeat: RepeatRule | null; remind: RemindMode;
  tags: string[]; watchers: PlanWatcher[]; estimate_min: number | null;
  /** เตือนอีกครั้ง (กำหนดส่งไม่เปลี่ยน): "1h" = อีก 1 ชม. · "tomorrow" = พรุ่งนี้ 09:00 */
  snooze: "1h" | "tomorrow";
}>;

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await apiFetch(url, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || "ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง");
  return j as T;
}
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const listPlanItems = () => call<{ data: PlanItem[] }>("/api/team-plan").then((j) => j.data ?? []);
/** เฉพาะงานของฉัน (แท็บแผนงานในศูนย์แจ้งเตือน) */
export const listMyPlanItems = () => call<{ data: PlanItem[] }>("/api/team-plan?mine=1").then((j) => j.data ?? []);
export const createPlanItem = (d: PlanDraft) => call<{ data: PlanItem }>("/api/team-plan", json("POST", d)).then((j) => j.data);
export const patchPlanItem = (id: string, p: PlanPatch) =>
  call<{ data: PlanItem; next: PlanItem | null }>(`/api/team-plan/${encodeURIComponent(id)}`, json("PATCH", p)).then((j) => ({ item: j.data, next: j.next }));
/** ทำสำเนางาน (เช็กลิสต์ชุดเดิมแบบยังไม่ติ๊ก · ไม่รวมไฟล์แนบ/คอมเมนต์) → งานใหม่ */
export const duplicatePlanItem = (id: string) => call<{ data: PlanItem }>(`/api/team-plan/${encodeURIComponent(id)}/duplicate`, { method: "POST" }).then((j) => j.data);
export const deletePlanItem = (id: string) => call<{ ok: boolean }>(`/api/team-plan/${encodeURIComponent(id)}`, { method: "DELETE" });
