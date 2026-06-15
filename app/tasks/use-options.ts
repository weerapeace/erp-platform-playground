// ============================================================
// ตัวเลือกที่ผู้ใช้จัดการได้ (ประเภทงาน/แพลตฟอร์ม) — โหลดจาก DB (ตารางจริง), มี fallback ในโค้ด
// รองรับ 2 ภาษา: label (ไทย) / label_en (อังกฤษ) — สลับตาม lang ปัจจุบัน
// label registry (singleton) ให้ cell ที่อยู่นอก component อ่านชื่อจาก key ได้
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { TASK_TYPES, PLATFORMS } from "@/lib/creative-tasks";
import { getLang, subscribeLang } from "@/lib/lang";

export type Option = { id: string; kind: string; key: string; label: string; label_en?: string | null; sort_order: number; is_active?: boolean };
export type OptItem = { value: string; label: string };

// label maps แยกภาษา (อัปเดตเมื่อโหลด DB เสร็จ) — เริ่มจากค่า fallback ในโค้ด (ไทย; en ใช้ไทยไปก่อน)
let taskTypeMap: Record<string, string> = Object.fromEntries(TASK_TYPES.map((t) => [t.value, t.label]));
let taskTypeMapEn: Record<string, string> = { ...taskTypeMap };
let platformMap: Record<string, string> = Object.fromEntries(PLATFORMS.map((p) => [p.value, p.label]));
let platformMapEn: Record<string, string> = { ...platformMap };
const pick = (th: Record<string, string>, en: Record<string, string>, k: string) => (getLang() === "en" ? (en[k] ?? th[k]) : th[k]);
export const taskTypeLabel = (k?: string | null): string => (k ? (pick(taskTypeMap, taskTypeMapEn, k) ?? k) : "");
export const platformLabel = (k?: string | null): string => (k ? (pick(platformMap, platformMapEn, k) ?? k) : "");

/** โหลดตัวเลือกทั้งสองชนิดสำหรับใช้ในฟอร์ม + อัปเดต label registry (สลับภาษาได้สด) */
export function useCreativeOptions() {
  const [raw, setRaw] = useState<Option[]>([]);
  const [lang, setLangState] = useState(getLang());
  const [loading, setLoading] = useState(true);
  useEffect(() => subscribeLang(setLangState), []);

  const reload = useCallback(async () => {
    try {
      const res = await apiFetch("/api/creative-options");
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      const opts = (j.data as Option[]) ?? [];
      setRaw(opts);
      const tt = opts.filter((o) => o.kind === "task_type");
      const pf = opts.filter((o) => o.kind === "platform");
      if (tt.length) { taskTypeMap = Object.fromEntries(tt.map((o) => [o.key, o.label])); taskTypeMapEn = Object.fromEntries(tt.map((o) => [o.key, o.label_en || o.label])); }
      if (pf.length) { platformMap = Object.fromEntries(pf.map((o) => [o.key, o.label])); platformMapEn = Object.fromEntries(pf.map((o) => [o.key, o.label_en || o.label])); }
    } catch { /* คงค่า fallback */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const labelOf = (o: Option) => (lang === "en" ? (o.label_en || o.label) : o.label);
  const taskTypes = raw.filter((o) => o.kind === "task_type").map((o) => ({ value: o.key, label: labelOf(o) }));
  const platforms = raw.filter((o) => o.kind === "platform").map((o) => ({ value: o.key, label: labelOf(o) }));

  return {
    taskTypes: taskTypes.length ? taskTypes : TASK_TYPES,
    platforms: platforms.length ? platforms : PLATFORMS,
    loading, reload,
  };
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
