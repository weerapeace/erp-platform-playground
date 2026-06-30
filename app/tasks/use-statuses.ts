// ============================================================
// Creative statuses (client) — โหลดสถานะ+เส้นทางจาก DB + registry (singleton)
// ให้ badge/คอลัมน์/ปุ่ม อ่านได้แม้อยู่นอก component (fallback = ค่าในโค้ด)
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { cachedJson, invalidateCache } from "@/lib/client-cache";
import { statusColor } from "@/lib/creative-status-colors";
import { STATUS_META as FALLBACK_META } from "@/lib/creative-tasks";
import { tr } from "@/lib/lang";

export type Status = { id?: string; key: string; label: string; label_en?: string | null; color: string; sort_order: number; progress_percent: number; is_terminal: boolean; is_approval_gate: boolean; is_default: boolean };
export type Transition = { id?: string; from_key: string; to_key: string; label: string; kind: string; sort_order: number };

// ป้ายสถานะตามภาษาปัจจุบัน (DB → tr(label, label_en) · fallback อังกฤษ = ไทย ถ้ายังไม่กรอก EN)
export function statusLabel(key?: string | null): string {
  if (!key) return "—";
  const s = byKey[key];
  if (s) return tr(s.label, s.label_en || s.label);
  const f = (FALLBACK_META as Record<string, { label: string; label_en?: string }>)[key];
  return f ? tr(f.label, f.label_en || f.label) : key;
}

let STATUSES: Status[] = [];
let TRANSITIONS: Transition[] = [];
let byKey: Record<string, Status> = {};

export function statusMeta(key?: string | null): { label: string; cls: string; dot: string } {
  if (!key) { const c = statusColor("slate"); return { label: "—", cls: c.cls, dot: c.dot }; }
  const s = byKey[key];
  if (s) { const c = statusColor(s.color); return { label: tr(s.label, s.label_en || s.label), cls: c.cls, dot: c.dot }; }
  const f = (FALLBACK_META as Record<string, { label: string; label_en?: string; cls: string; dot: string }>)[key];
  if (f) return { label: tr(f.label, f.label_en || f.label), cls: f.cls, dot: f.dot };
  const c = statusColor("slate"); return { label: key, cls: c.cls, dot: c.dot };
}
export function transitionsFrom(key: string): Transition[] { return TRANSITIONS.filter((t) => t.from_key === key); }
export function transitionBetween(from: string, to: string): Transition | null { return TRANSITIONS.find((t) => t.from_key === from && t.to_key === to) ?? null; }
export function canTransitionTo(from: string, to: string): boolean { return TRANSITIONS.some((t) => t.from_key === from && t.to_key === to); }
export function isTerminal(key?: string | null): boolean { return !!(key && byKey[key]?.is_terminal); }
export function isApprovalGate(key?: string | null): boolean { return !!(key && byKey[key]?.is_approval_gate); }

function setRegistry(statuses: Status[], transitions: Transition[]) {
  STATUSES = statuses; TRANSITIONS = transitions; byKey = Object.fromEntries(statuses.map((s) => [s.key, s]));
}

export function useCreativeStatuses() {
  const [statuses, setStatuses] = useState<Status[]>(STATUSES);
  const [transitions, setTransitions] = useState<Transition[]>(TRANSITIONS);
  const [loading, setLoading] = useState(STATUSES.length === 0);
  const reload = useCallback(async (force = false) => {
    try {
      const j = await cachedJson<{ statuses?: Status[]; transitions?: Transition[]; error?: string }>("/api/creative-statuses", force ? 0 : 5 * 60 * 1000);
      if (j.error) throw new Error(j.error);
      const st = (j.statuses as Status[]) ?? [], tr = (j.transitions as Transition[]) ?? [];
      setRegistry(st, tr); setStatuses(st); setTransitions(tr);
    } catch { /* คงค่า fallback */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { statuses, transitions, loading, reload };
}

// ---- API client (หน้าตั้งค่า) ----
async function ok(res: Response): Promise<Record<string, unknown>> { const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`); return j; }
// หลังแก้สถานะ/เส้นทาง → ล้างแคชเพื่อให้ทุกหน้าเห็นค่าใหม่รอบถัดไป
function bust<T>(v: T): T { invalidateCache("/api/creative-statuses"); return v; }
export async function listStatuses(): Promise<{ statuses: Status[]; transitions: Transition[] }> {
  const j = await ok(await apiFetch("/api/creative-statuses"));
  return { statuses: (j.statuses as Status[]) ?? [], transitions: (j.transitions as Transition[]) ?? [] };
}
export async function createStatus(body: { label: string; label_en?: string; color?: string; progress_percent?: number; is_terminal?: boolean; is_approval_gate?: boolean }): Promise<Status> {
  const j = await ok(await apiFetch("/api/creative-statuses", { method: "POST", body: JSON.stringify(body) })); return bust(j.data as Status);
}
export async function updateStatus(id: string, patch: Record<string, unknown>): Promise<void> { await ok(await apiFetch(`/api/creative-statuses/${id}`, { method: "PATCH", body: JSON.stringify(patch) })); bust(0); }
export async function deleteStatus(id: string): Promise<void> { await ok(await apiFetch(`/api/creative-statuses/${id}`, { method: "DELETE" })); bust(0); }
export async function setTransition(body: { from_key: string; to_key: string; label?: string; kind?: string }): Promise<void> { await ok(await apiFetch("/api/creative-statuses/transitions", { method: "POST", body: JSON.stringify(body) })); bust(0); }
export async function deleteTransition(id: string): Promise<void> { await ok(await apiFetch(`/api/creative-statuses/transitions?id=${id}`, { method: "DELETE" })); bust(0); }
