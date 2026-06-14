// ============================================================
// ตัวเลือกที่ผู้ใช้จัดการได้ (ประเภทงาน/แพลตฟอร์ม) — โหลดจาก DB, มี fallback เป็นค่าในโค้ด
// label registry (singleton) ให้ cell ที่อยู่นอก component อ่านชื่อจาก key ได้
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { TASK_TYPES, PLATFORMS } from "@/lib/creative-tasks";

export type Option = { id: string; kind: string; key: string; label: string; sort_order: number; is_active?: boolean };
export type OptItem = { value: string; label: string };

// label maps (อัปเดตเมื่อโหลด DB เสร็จ) — เริ่มจากค่า fallback ในโค้ด
let taskTypeMap: Record<string, string> = Object.fromEntries(TASK_TYPES.map((t) => [t.value, t.label]));
let platformMap: Record<string, string> = Object.fromEntries(PLATFORMS.map((p) => [p.value, p.label]));
export const taskTypeLabel = (k?: string | null): string => (k ? (taskTypeMap[k] ?? k) : "");
export const platformLabel = (k?: string | null): string => (k ? (platformMap[k] ?? k) : "");

/** โหลดตัวเลือกทั้งสองชนิดสำหรับใช้ในฟอร์ม + อัปเดต label registry */
export function useCreativeOptions() {
  const [taskTypes, setTaskTypes] = useState<OptItem[]>(TASK_TYPES);
  const [platforms, setPlatforms] = useState<OptItem[]>(PLATFORMS);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const res = await apiFetch("/api/creative-options");
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      const opts = (j.data as Option[]) ?? [];
      const tt = opts.filter((o) => o.kind === "task_type").map((o) => ({ value: o.key, label: o.label }));
      const pf = opts.filter((o) => o.kind === "platform").map((o) => ({ value: o.key, label: o.label }));
      if (tt.length) { setTaskTypes(tt); taskTypeMap = Object.fromEntries(tt.map((o) => [o.value, o.label])); }
      if (pf.length) { setPlatforms(pf); platformMap = Object.fromEntries(pf.map((o) => [o.value, o.label])); }
    } catch { /* คงค่า fallback */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  return { taskTypes, platforms, loading, reload };
}

// ---- API client (สำหรับหน้าจัดการใน Settings) ----
export async function listOptions(kind: string): Promise<Option[]> {
  const res = await apiFetch(`/api/creative-options?kind=${kind}`);
  const j = await res.json();
  if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
  return (j.data as Option[]) ?? [];
}
export async function createOption(kind: string, label: string): Promise<Option> {
  const res = await apiFetch("/api/creative-options", { method: "POST", body: JSON.stringify({ kind, label }) });
  const j = await res.json();
  if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
  return j.data as Option;
}
export async function updateOption(id: string, patch: Record<string, unknown>): Promise<void> {
  const res = await apiFetch(`/api/creative-options/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  const j = await res.json();
  if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
}
export async function deleteOption(id: string): Promise<void> {
  const res = await apiFetch(`/api/creative-options/${id}`, { method: "DELETE" });
  const j = await res.json();
  if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
}
