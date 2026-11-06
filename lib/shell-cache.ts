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
 *
 * แคชแยกตามคนที่ login (2026-11-06): คำตอบขึ้นกับสิทธิ์ (RLS) — ยังไม่ login ได้รายการว่าง
 *   เดิมแคชตาม URL อย่างเดียว → ค่าว่างตอนยังไม่ login ค้างต่อหลัง login ได้ถึง 60 วิ (เมนูหาย) · สลับบัญชีก็เห็นของคนก่อน
 *   ตอนนี้: key = ผู้ใช้ + URL · ยังไม่ login = ไม่จำ · ตอบไม่สำเร็จ (ไม่ ok) = ไม่จำ (ครั้งหน้าถามใหม่)
 */
import { apiFetch } from "@/lib/api";
import { supabaseBrowser } from "@/lib/supabase-browser";

type Entry = { at: number; data: unknown };
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
const DEFAULT_TTL = 60_000; // 60 วินาที
const SEP = "\u0000";

export async function cachedGetJson<T = unknown>(url: string, ttl = DEFAULT_TTL): Promise<T> {
  let uid = "";
  try { uid = (await supabaseBrowser.auth.getSession()).data.session?.user.id ?? ""; } catch { /* ถือว่ายังไม่ login */ }
  if (!uid) return apiFetch(url).then((r) => r.json()) as Promise<T>;   // ยังไม่ login = ไม่จำ
  const key = `${uid}${SEP}${url}`;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.data as T;

  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const p = apiFetch(url)
    .then(async (r) => { const j = await r.json(); if (r.ok) cache.set(key, { at: Date.now(), data: j }); inflight.delete(key); return j; })
    .catch((e) => { inflight.delete(key); throw e; });
  inflight.set(key, p);
  return p as Promise<T>;
}

/** ล้างแคช (เรียกหลังแก้เมนู/โมดูลใน admin เพื่อให้เห็นผลทันที) — ใส่ url = ล้างเฉพาะ URL นั้น (ทุกผู้ใช้) */
export function invalidateShellCache(url?: string) {
  if (!url) { cache.clear(); return; }
  for (const k of [...cache.keys()]) if (k.endsWith(`${SEP}${url}`)) cache.delete(k);
}
