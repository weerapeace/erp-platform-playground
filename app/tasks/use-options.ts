// ============================================================
// ตัวเลือกที่ผู้ใช้จัดการได้ (ประเภทงาน/แพลตฟอร์ม) — โหลดจาก DB (ตารางจริง), มี fallback ในโค้ด
// รองรับ 2 ภาษา: label (ไทย) / label_en (อังกฤษ) — สลับตาม lang ปัจจุบัน
// label registry (singleton) ให้ cell ที่อยู่นอก component อ่านชื่อจาก key ได้
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { cachedJson, invalidateCache } from "@/lib/client-cache";
import { TASK_TYPES, PLATFORMS } from "@/lib/creative-tasks";
import { getLang, subscribeLang } from "@/lib/lang";

export type Option = { id: string; kind: string; key: string; label: string; label_en?: string | null; color?: string | null; icon?: string | null; icon_key?: string | null; sort_order: number; is_active?: boolean };
export type OptItem = { value: string; label: string };
// ตัวเลือกแพลตฟอร์มแบบมี meta (สี/ไอคอน) — ใช้เรนเดอร์ชิปแบบมีสีหรือรูปไอคอน
export type PlatformMeta = { color?: string | null; icon?: string | null; icon_key?: string | null };
export type PlatformOpt = OptItem & PlatformMeta;

// label maps แยกภาษา (อัปเดตเมื่อโหลด DB เสร็จ) — เริ่มจากค่า fallback ในโค้ด (ไทย; en ใช้ไทยไปก่อน)
let taskTypeMap: Record<string, string> = Object.fromEntries(TASK_TYPES.map((t) => [t.value, t.label]));
let taskTypeMapEn: Record<string, string> = { ...taskTypeMap };
let platformMap: Record<string, string> = Object.fromEntries(PLATFORMS.map((p) => [p.value, p.label]));
let platformMapEn: Record<string, string> = { ...platformMap };
// ทะเบียน meta แพลตฟอร์ม (สี/ไอคอน) อ่านได้นอก component เช่นชิปในการ์ด/ตาราง
let platformMetaMap: Record<string, PlatformMeta> = {};
const pick = (th: Record<string, string>, en: Record<string, string>, k: string) => (getLang() === "en" ? (en[k] ?? th[k]) : th[k]);
export const taskTypeLabel = (k?: string | null): string => (k ? (pick(taskTypeMap, taskTypeMapEn, k) ?? k) : "");
export const platformLabel = (k?: string | null): string => (k ? (pick(platformMap, platformMapEn, k) ?? k) : "");
/** meta (สี/ไอคอน) ของแพลตฟอร์มตาม key — undefined ถ้ายังไม่ตั้ง */
export const platformMeta = (k?: string | null): PlatformMeta | undefined => (k ? platformMetaMap[k] : undefined);

/** โหลดตัวเลือกทั้งสองชนิดสำหรับใช้ในฟอร์ม + อัปเดต label registry (สลับภาษาได้สด) */
let lastRaw: Option[] = []; // จำค่าล่าสุดข้ามการ mount → เปิด drawer ใหม่เห็นทันที

export function useCreativeOptions() {
  const [raw, setRaw] = useState<Option[]>(lastRaw);
  const [lang, setLangState] = useState(getLang());
  const [loading, setLoading] = useState(lastRaw.length === 0);
  useEffect(() => subscribeLang(setLangState), []);

  const reload = useCallback(async (force = false) => {
    try {
      const j = await cachedJson<{ data?: Option[]; error?: string }>("/api/creative-options", force ? 0 : 5 * 60 * 1000);
      if (j.error) throw new Error(j.error);
      const opts = (j.data as Option[]) ?? [];
      lastRaw = opts; setRaw(opts);
      const tt = opts.filter((o) => o.kind === "task_type");
      const pf = opts.filter((o) => o.kind === "platform");
      if (tt.length) { taskTypeMap = Object.fromEntries(tt.map((o) => [o.key, o.label])); taskTypeMapEn = Object.fromEntries(tt.map((o) => [o.key, o.label_en || o.label])); }
      if (pf.length) {
        platformMap = Object.fromEntries(pf.map((o) => [o.key, o.label]));
        platformMapEn = Object.fromEntries(pf.map((o) => [o.key, o.label_en || o.label]));
        platformMetaMap = Object.fromEntries(pf.map((o) => [o.key, { color: o.color ?? null, icon: o.icon ?? null, icon_key: o.icon_key ?? null }]));
      }
    } catch { /* คงค่า fallback */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const labelOf = (o: Option) => (lang === "en" ? (o.label_en || o.label) : o.label);
  const taskTypes = raw.filter((o) => o.kind === "task_type").map((o) => ({ value: o.key, label: labelOf(o) }));
  const platforms: PlatformOpt[] = raw.filter((o) => o.kind === "platform").map((o) => ({ value: o.key, label: labelOf(o), color: o.color ?? null, icon: o.icon ?? null, icon_key: o.icon_key ?? null }));

  return {
    taskTypes: taskTypes.length ? taskTypes : TASK_TYPES,
    platforms: (platforms.length ? platforms : PLATFORMS) as PlatformOpt[],
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
  invalidateCache("/api/creative-options");
  return j.data as Option;
}
export async function updateOption(id: string, patch: Record<string, unknown>): Promise<void> {
  const res = await apiFetch(`/api/creative-options/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  const j = await res.json();
  if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
  invalidateCache("/api/creative-options");
}
export async function deleteOption(id: string): Promise<void> {
  const res = await apiFetch(`/api/creative-options/${id}`, { method: "DELETE" });
  const j = await res.json();
  if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
  invalidateCache("/api/creative-options");
}
