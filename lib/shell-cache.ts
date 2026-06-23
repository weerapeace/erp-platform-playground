"use client";

/**
 * แคชข้อมูล "เปลือกแอป" (เมนู/แอป/โมดูล) แบบ in-memory ฝั่ง client
 *
 * ปัญหา: PlaygroundShell ถูก mount ใหม่ทุกครั้งที่เปลี่ยนหน้า → ยิง /api/menu,
 * /api/menu/apps, /api/admin/modules ซ้ำทุกหน้า (ช้า + แย่ง Worker↔Supabase)
 *
 * วิธีแก้: แคชผลลัพธ์ไว้ใน module singleton (อยู่ข้ามการเปลี่ยนหน้าใน SPA)
 * - ภายใน TTL → คืนค่าทันที ไม่ยิงเน็ต
 * - ยิงซ้อนพร้อมกัน → dedup เป็น request เดียว
 * ข้อมูลพวกนี้แทบไม่เปลี่ยนระหว่างใช้งาน TTL สั้น ๆ จึงปลอดภัย
 */
import { apiFetch } from "@/lib/api";

type Entry = { at: number; data: unknown };
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
const DEFAULT_TTL = 60_000; // 60 วินาที

export async function cachedGetJson<T = unknown>(url: string, ttl = DEFAULT_TTL): Promise<T> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < ttl) return hit.data as T;

  const existing = inflight.get(url);
  if (existing) return existing as Promise<T>;

  const p = apiFetch(url)
    .then((r) => r.json())
    .then((j) => { cache.set(url, { at: Date.now(), data: j }); inflight.delete(url); return j; })
    .catch((e) => { inflight.delete(url); throw e; });
  inflight.set(url, p);
  return p as Promise<T>;
}

/** ล้างแคช (เรียกหลังแก้เมนู/โมดูลใน admin เพื่อให้เห็นผลทันที) */
export function invalidateShellCache(url?: string) {
  if (url) cache.delete(url);
  else cache.clear();
}
