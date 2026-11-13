"use client";

/**
 * คลังแพ็กเกจในหน้าจอ — โหลดครั้งเดียวต่อการเปิดหน้า (แคชไว้ระดับโมดูล ใช้ร่วมทุกฟอร์ม/หน้า)
 * เพิ่ม/แก้/หาจากเว็บ → อัปเดตแคชทันที (ไม่ต้องโหลดใหม่ทั้งชุด)
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { catalogKey, type CatalogApp, type CatalogInput } from "@/lib/subscription-catalog";

let cache: CatalogApp[] | null = null;
let inflight: Promise<CatalogApp[]> | null = null;
const listeners = new Set<(list: CatalogApp[]) => void>();

function publish(list: CatalogApp[]) {
  cache = list;
  listeners.forEach((fn) => fn(list));
}

async function fetchCatalog(): Promise<CatalogApp[]> {
  if (!inflight) {
    inflight = apiFetch("/api/subscriptions/catalog")
      .then((r) => r.json())
      .then((j) => { if (j.error) throw new Error(j.error); const list = (j.data ?? []) as CatalogApp[]; publish(list); return list; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

/** แทนที่/เพิ่มแอป 1 ตัวในแคช (จับด้วย id) */
function upsertLocal(app: CatalogApp) {
  const list = cache ?? [];
  const i = list.findIndex((a) => a.id === app.id);
  publish(i >= 0 ? list.map((a) => (a.id === app.id ? app : a)) : [...list, app].sort((a, b) => a.name.localeCompare(b.name)));
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error((j.error as string) || `HTTP ${res.status}`);
  return j;
}

export type LookupResponse = { app: CatalogApp | null; found: boolean; note: string; citations: { url: string; title: string }[]; merged: boolean };

export function useSubscriptionCatalog(enabled = true) {
  const [catalog, setCatalog] = useState<CatalogApp[]>(cache ?? []);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    listeners.add(setCatalog);
    return () => { listeners.delete(setCatalog); };
  }, []);

  useEffect(() => {
    if (!enabled || cache) return;
    setLoading(true);
    fetchCatalog().catch(() => { /* โหลดไม่ได้ = ใช้งานแบบไม่มีคลัง (กรอกเอง) */ }).finally(() => setLoading(false));
  }, [enabled]);

  /** เพิ่มแอปใหม่ หรือแก้แอปเดิม (มี id = แก้) */
  const saveApp = useCallback(async (input: CatalogInput & { id?: string }): Promise<CatalogApp> => {
    const { id, ...body } = input;
    const res = id
      ? await apiFetch(`/api/subscriptions/catalog/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      : await apiFetch("/api/subscriptions/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const app = (await readJson(res)).data as CatalogApp;
    upsertLocal(app);
    return app;
  }, []);

  const deleteApp = useCallback(async (id: string): Promise<void> => {
    await readJson(await apiFetch(`/api/subscriptions/catalog/${id}`, { method: "DELETE" }));
    publish((cache ?? []).filter((a) => a.id !== id));
  }, []);

  /** ให้ AI ค้นเว็บ (เสียค่า AI ต่อครั้ง) → ได้แอปที่บันทึกเข้าคลังแล้ว */
  const lookup = useCallback(async (name: string): Promise<LookupResponse> => {
    const j = await readJson(await apiFetch("/api/subscriptions/catalog/lookup", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
    }));
    const app = (j.data ?? null) as CatalogApp | null;
    if (app) upsertLocal(app);
    return { app, found: !!j.found, note: String(j.note ?? ""), citations: (j.citations ?? []) as LookupResponse["citations"], merged: !!j.merged };
  }, []);

  return { catalog, loading, saveApp, deleteApp, lookup, has: (name: string) => catalog.some((a) => catalogKey(a.name) === catalogKey(name)) };
}
