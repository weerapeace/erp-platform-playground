// ============================================================
// Creative statuses — โหลดสถานะ + เส้นทาง (transition) จาก DB (cache สั้น)
// ใช้ฝั่ง server ตรวจ transition + คำนวณ progress/flag
// ============================================================
import { supabaseAdmin } from "@/lib/supabase-admin";

type Admin = ReturnType<typeof supabaseAdmin>;
export type StatusRow = { key: string; label: string; color: string; sort_order: number; progress_percent: number; is_terminal: boolean; is_approval_gate: boolean; is_default: boolean };
export type TransitionRow = { from_key: string; to_key: string; label: string; kind: string; sort_order: number };

let cache: { statuses: StatusRow[]; transitions: TransitionRow[]; at: number } | null = null;
const TTL = 15_000;

async function load(admin: Admin): Promise<{ statuses: StatusRow[]; transitions: TransitionRow[] }> {
  if (cache && Date.now() - cache.at < TTL) return cache;
  const [{ data: st }, { data: tr }] = await Promise.all([
    admin.from("erp_creative_statuses").select("key,label,color,sort_order,progress_percent,is_terminal,is_approval_gate,is_default").eq("is_active", true).order("sort_order", { ascending: true }),
    admin.from("erp_creative_status_transitions").select("from_key,to_key,label,kind,sort_order").order("sort_order", { ascending: true }),
  ]);
  cache = { statuses: (st ?? []) as StatusRow[], transitions: (tr ?? []) as TransitionRow[], at: Date.now() };
  return cache;
}

export async function getStatusMeta(admin: Admin, key: string): Promise<StatusRow | null> {
  const { statuses } = await load(admin);
  return statuses.find((s) => s.key === key) ?? null;
}
export async function canTransition(admin: Admin, from: string, to: string): Promise<boolean> {
  const { transitions } = await load(admin);
  return transitions.some((t) => t.from_key === from && t.to_key === to);
}
export async function defaultStatusKey(admin: Admin): Promise<string> {
  const { statuses } = await load(admin);
  return (statuses.find((s) => s.is_default) ?? statuses[0])?.key ?? "backlog";
}
