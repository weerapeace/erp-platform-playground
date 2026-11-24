"use client";

/**
 * 🐾 ทะเบียนแมว — โหลดข้อมูล + สั่งเขียนผ่าน API กลาง /api/cats/* (หน้าไม่แตะฐานข้อมูลตรง)
 *   ทุกการเขียนมีทางย้อน: เพิ่ม → "ย้อนกลับ" = ย้ายเข้าถังขยะ · แก้ → "ย้อนกลับ" = คืนค่าเดิม · ลบ → "ย้อนกลับ" = กู้คืน
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import type { CatKind, CatsData } from "@/lib/cats";

const EMPTY: CatsData = { cats: [], clinics: [], vaccinations: [], treatments: [], weights: [], supplies: [], purchases: [], vet_visits: [], expenses: [] };
export type CatsSettings = { meal_plan?: unknown; notify?: unknown };

async function call(url: string, method: string, body?: unknown): Promise<{ data?: unknown; error?: string | null }> {
  const res = await apiFetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({ error: "เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง" }));
  if (!res.ok && !json.error) json.error = "บันทึกไม่ได้ ลองใหม่อีกครั้ง";
  return json;
}

export function useCatsData(trash = false) {
  const [data, setData] = useState<CatsData>(EMPTY);
  const [settings, setSettings] = useState<CatsSettings>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/cats${trash ? "?trash=1" : ""}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      const { settings: st, ...rest } = json.data ?? {};
      setData({ ...EMPTY, ...rest });
      setSettings(st ?? {});
      setError(null);
    } catch (e) {
      setError((e as Error).message || "โหลดข้อมูลไม่ได้");
    } finally {
      setLoading(false);
    }
  }, [trash]);

  useEffect(() => { void reload(); }, [reload]);
  return { data, settings, loading, error, reload };
}

/** บันทึกค่าตั้ง (ตารางมื้อ / แจ้งเตือน) · before = ค่าเดิม (ปุ่มย้อนกลับ) */
export function useCatsSettingsWrite(after: () => void | Promise<void>) {
  const toast = useToast();
  return useCallback(async (key: "meal_plan" | "notify", value: unknown, before: unknown, msg = "บันทึกค่าตั้งแล้ว"): Promise<boolean> => {
    const r = await call("/api/cats/settings", "PUT", { key, value });
    if (r.error) { toast.error(r.error); return false; }
    await after();
    toast.action(msg, "ย้อนกลับ", async () => {
      const u = await call("/api/cats/settings", "PUT", { key, value: before });
      if (u.error) toast.error(u.error); else { await after(); toast.info("คืนค่าเดิมแล้ว"); }
    });
    return true;
  }, [toast, after]);
}

export { call as catsCall };

/** ตัวสั่งเขียน + แจ้งผลพร้อมปุ่มย้อนกลับ (ของกลาง toast) · after = โหลดใหม่หลังเขียน */
export function useCatsWrite(after: () => void | Promise<void>) {
  const toast = useToast();

  const create = useCallback(async (kind: CatKind, body: Record<string, unknown>, msg = "บันทึกแล้ว"): Promise<Record<string, unknown> | null> => {
    const r = await call(`/api/cats/${kind}`, "POST", body);
    if (r.error) { toast.error(r.error); return null; }
    const row = r.data as Record<string, unknown>;
    await after();
    toast.undo(msg, async () => {
      const u = await call(`/api/cats/${kind}/${row.id}`, "DELETE");
      if (u.error) toast.error(u.error); else { await after(); toast.info("ย้อนกลับแล้ว (อยู่ในถังขยะ)"); }
    });
    return row;
  }, [toast, after]);

  const createMany = useCallback(async (kind: CatKind, items: Record<string, unknown>[], msg: string): Promise<boolean> => {
    const r = await call(`/api/cats/${kind}`, "POST", { items });
    if (r.error) { toast.error(r.error); return false; }
    const rows = (r.data as { id: string }[]) ?? [];
    await after();
    toast.undo(msg, async () => {
      for (const x of rows) await call(`/api/cats/${kind}/${x.id}`, "DELETE");
      await after(); toast.info("ย้อนกลับแล้ว (อยู่ในถังขยะ)");
    });
    return true;
  }, [toast, after]);

  /** before = แถวเดิม (ไว้คืนค่าตอนกดย้อนกลับ) */
  const update = useCallback(async (kind: CatKind, id: string, patch: Record<string, unknown>, before: Record<string, unknown>): Promise<boolean> => {
    const r = await call(`/api/cats/${kind}/${id}`, "PATCH", patch);
    if (r.error) { toast.error(r.error); return false; }
    await after();
    const old = Object.fromEntries(Object.keys(patch).map((k) => [k, before[k] ?? null]));
    toast.action("บันทึกการแก้ไขแล้ว", "ย้อนกลับ", async () => {
      const u = await call(`/api/cats/${kind}/${id}`, "PATCH", old);
      if (u.error) toast.error(u.error); else { await after(); toast.info("คืนค่าเดิมแล้ว"); }
    });
    return true;
  }, [toast, after]);

  const remove = useCallback(async (kind: CatKind, id: string, label: string): Promise<boolean> => {
    const r = await call(`/api/cats/${kind}/${id}`, "DELETE");
    if (r.error) { toast.error(r.error); return false; }
    await after();
    toast.undo(`ย้าย "${label}" ไปถังขยะแล้ว`, async () => {
      const u = await call(`/api/cats/${kind}/${id}`, "PATCH", { is_active: true });
      if (u.error) toast.error(u.error); else { await after(); toast.info("กู้คืนแล้ว"); }
    });
    return true;
  }, [toast, after]);

  const restore = useCallback(async (kind: CatKind, id: string, label: string): Promise<boolean> => {
    const r = await call(`/api/cats/${kind}/${id}`, "PATCH", { is_active: true });
    if (r.error) { toast.error(r.error); return false; }
    await after();
    toast.undo(`กู้คืน "${label}" แล้ว`, async () => {
      const u = await call(`/api/cats/${kind}/${id}`, "DELETE");
      if (u.error) toast.error(u.error); else await after();
    });
    return true;
  }, [toast, after]);

  const destroy = useCallback(async (kind: CatKind, id: string, label: string): Promise<boolean> => {
    const r = await call(`/api/cats/${kind}/${id}?hard=1`, "DELETE");
    if (r.error) { toast.error(r.error); return false; }
    await after();
    toast.success(`ลบ "${label}" ถาวรแล้ว`);
    return true;
  }, [toast, after]);

  return { create, createMany, update, remove, restore, destroy };
}

export const catPhotoUrl = (key: string | null | undefined, w = 800) => (key ? `/api/r2-image?key=${encodeURIComponent(key)}&w=${w}` : null);
export const fmtMoney = (n: number | null | undefined) => (n == null ? "" : `฿${Number(n).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`);
