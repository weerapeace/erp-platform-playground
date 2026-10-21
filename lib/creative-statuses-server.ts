// ============================================================
// Creative statuses — โหลดสถานะ + เส้นทาง (transition) จาก DB (cache สั้น)
// ใช้ฝั่ง server ตรวจ transition + คำนวณ progress/flag
// ============================================================
import { supabaseAdmin } from "@/lib/supabase-admin";

type Admin = ReturnType<typeof supabaseAdmin>;
export type StatusRow = { key: string; label: string; color: string; sort_order: number; progress_percent: number; is_terminal: boolean; is_approval_gate: boolean; is_default: boolean; is_active: boolean };
export type TransitionRow = { from_key: string; to_key: string; label: string; kind: string; sort_order: number };

// ชนิดเส้นทางที่ถือเป็น "การตัดสินผลงาน" — ต้องมีสิทธิ์ tasks.approve
export const REVIEW_KINDS = new Set(["approve", "reject", "revise"]);

// statuses = เฉพาะที่เปิดใช้ · allStatuses = รวมที่ปิดใช้แล้ว (ใช้ดูว่า "งานจบแล้วหรือยัง" ของงานเก่าที่ค้างสถานะปิดใช้)
let cache: { statuses: StatusRow[]; allStatuses: StatusRow[]; transitions: TransitionRow[]; at: number } | null = null;
const TTL = 15_000;

async function load(admin: Admin): Promise<{ statuses: StatusRow[]; allStatuses: StatusRow[]; transitions: TransitionRow[] }> {
  if (cache && Date.now() - cache.at < TTL) return cache;
  const [{ data: st }, { data: tr }] = await Promise.all([
    admin.from("erp_creative_statuses").select("key,label,color,sort_order,progress_percent,is_terminal,is_approval_gate,is_default,is_active").order("sort_order", { ascending: true }),
    admin.from("erp_creative_status_transitions").select("from_key,to_key,label,kind,sort_order").order("sort_order", { ascending: true }),
  ]);
  const all = (st ?? []) as StatusRow[];
  cache = { statuses: all.filter((s) => s.is_active), allStatuses: all, transitions: (tr ?? []) as TransitionRow[], at: Date.now() };
  return cache;
}

export async function getStatusMeta(admin: Admin, key: string): Promise<StatusRow | null> {
  const { statuses } = await load(admin);
  return statuses.find((s) => s.key === key) ?? null;
}
/** เส้นทาง from → to ที่ใช้ได้จริง (ปลายทางต้องเป็นสถานะที่เปิดใช้อยู่ — สถานะที่ปิดใช้ไปแล้วห้ามย้ายเข้า) */
export async function findTransition(admin: Admin, from: string, to: string): Promise<TransitionRow | null> {
  const { statuses, transitions } = await load(admin);
  if (!statuses.some((s) => s.key === to)) return null;
  return transitions.find((t) => t.from_key === from && t.to_key === to) ?? null;
}
export async function canTransition(admin: Admin, from: string, to: string): Promise<boolean> {
  return !!(await findTransition(admin, from, to));
}
export async function defaultStatusKey(admin: Admin): Promise<string> {
  const { statuses } = await load(admin);
  return (statuses.find((s) => s.is_default) ?? statuses[0])?.key ?? "backlog";
}
/** คีย์สถานะ "จบงาน" ทั้งหมด (รวมที่ปิดใช้แล้ว เช่น เผยแพร่) — ใช้กรองงานที่ปิดไปแล้ว */
export async function terminalStatusKeys(admin: Admin): Promise<Set<string>> {
  const { allStatuses } = await load(admin);
  return new Set(allStatuses.filter((s) => s.is_terminal).map((s) => s.key));
}
/** คีย์สถานะ "ผ่านการตรวจแล้ว" = ปลายทางของเส้นทางชนิดอนุมัติ (เช่น อนุมัติแล้ว) — งานเลยขั้นตรวจมาแล้ว */
export async function approvedStatusKeys(admin: Admin): Promise<Set<string>> {
  const { transitions } = await load(admin);
  return new Set(transitions.filter((t) => t.kind === "approve").map((t) => t.to_key));
}
