"use client";

/**
 * Phase 3a — in-memory cache สำหรับ GET JSON ฝั่ง client (อยู่ข้ามการสลับหน้า/โมดูล)
 * ใช้กับข้อมูล "ตั้งค่าหน้า" ที่แทบไม่เปลี่ยน (field registry, relations, families)
 * → สลับ table/module ไปมา ไม่ต้องยิง network ใหม่ = เกือบทันที
 *
 * ข้อมูลในตาราง (rows) ไม่ผ่านตัวนี้ — ยังดึงสดเสมอ
 */
import { apiFetch } from "@/lib/api";

const store = new Map<string, { at: number; data: unknown }>();

export async function cachedJson<T = unknown>(url: string, ttlMs = 5 * 60 * 1000): Promise<T> {
  const hit = store.get(url);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data as T;
  const data = await apiFetch(url).then((r) => r.json());
  store.set(url, { at: Date.now(), data });
  return data as T;
}

/** อัปเดต cache ด้วยค่าใหม่ (เช่นหลัง admin แก้ทะเบียน field ใน Studio) */
export function primeCache(url: string, data: unknown): void {
  store.set(url, { at: Date.now(), data });
}

/** ล้าง cache ทั้งหมด หรือเฉพาะที่ขึ้นต้นด้วย prefix */
export function invalidateCache(prefix?: string): void {
  if (!prefix) { store.clear(); return; }
  for (const k of [...store.keys()]) if (k.startsWith(prefix)) store.delete(k);
}
