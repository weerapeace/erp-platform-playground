"use client";

/**
 * useSWRLite (ของกลาง) — stale-while-revalidate cache สำหรับข้อมูล list/detail
 *
 * แนวคิด: โชว์ข้อมูลที่เคยโหลดไว้ "ทันที" แล้วแอบโหลดใหม่เบื้องหลัง ถ้ามีอัปเดตค่อยเปลี่ยน
 * → สลับหน้า/กลับเข้าโมดูลใหม่ ไม่เห็นจอ "กำลังโหลด" กระพริบ = รู้สึกเร็วมาก
 *
 * - cache อยู่ระดับ module (ข้ามการสลับหน้าใน session เดียว)
 * - dedupe คำขอที่กำลังบินอยู่ (กันยิงซ้ำพร้อมกัน)
 * - revalidate อัตโนมัติเมื่อกลับมาที่แท็บ (เงียบ ไม่มี spinner)
 * - ไม่พึ่ง library ภายนอก (กัน Worker bundle เกิน)
 *
 * ใช้: const { data, loading, revalidate, mutate } = useSWRLite("key", () => listTasks())
 * หลังบันทึก/ลบ → เรียก revalidate(true) หรือ invalidateSWR("prefix")
 */
import { useCallback, useEffect, useRef, useState } from "react";

type Entry<T> = { data: T; at: number };
const cache = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
const listeners = new Map<string, Set<() => void>>();

function emit(key: string) { listeners.get(key)?.forEach((fn) => fn()); }

/** ใส่ค่าใหม่ลง cache เอง (เช่นหลัง mutate) แล้วแจ้งทุก component ที่ใช้ key นี้ */
export function mutateSWR<T>(key: string, data: T): void { cache.set(key, { data, at: Date.now() }); emit(key); }

/** อ่านค่าจาก cache แบบ sync (ไม่ trigger fetch) — ไว้ seed ค่าทันทีในโค้ดที่ fetch เองแบบ effect */
export function peekSWR<T>(key: string | null): T | undefined {
  return key ? (cache.get(key) as Entry<T> | undefined)?.data : undefined;
}

/** ล้าง cache (ทั้งหมด หรือเฉพาะ prefix) — ครั้งถัดไปที่ใช้จะโหลดสด */
export function invalidateSWR(prefix?: string): void {
  if (!prefix) { cache.clear(); for (const k of [...listeners.keys()]) emit(k); return; }
  for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k);
  for (const k of [...listeners.keys()]) if (k.startsWith(prefix)) emit(k);
}

export function useSWRLite<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  opts: { dedupeMs?: number; revalidateOnFocus?: boolean; focusStaleMs?: number } = {},
): { data: T | undefined; loading: boolean; error: Error | null; revalidate: (force?: boolean) => Promise<void>; mutate: (d: T) => void } {
  const dedupeMs = opts.dedupeMs ?? 2000;
  const revalidateOnFocus = opts.revalidateOnFocus ?? true;
  const focusStaleMs = opts.focusStaleMs ?? 30000; // สลับแท็บ → refetch เฉพาะข้อมูลที่เก่ากว่านี้ (ลดยิงซ้ำ/ประหยัด)
  const fetcherRef = useRef(fetcher); fetcherRef.current = fetcher;
  const [, force] = useState(0);
  const has = !!key && cache.has(key);
  const [loading, setLoading] = useState(!has);
  const [error, setError] = useState<Error | null>(null);

  const revalidate = useCallback(async (forceFetch = false) => {
    if (!key) return;
    const cur = cache.get(key);
    if (!forceFetch && cur && Date.now() - cur.at < dedupeMs) return; // ยังสดอยู่ → ข้าม
    if (inflight.has(key)) { try { await inflight.get(key); } catch { /* ignore */ } return; }
    if (!cur) setLoading(true);
    const p = fetcherRef.current();
    inflight.set(key, p);
    try { const data = await p; cache.set(key, { data, at: Date.now() }); setError(null); emit(key); }
    catch (e) { setError(e as Error); }
    finally { inflight.delete(key); setLoading(false); }
  }, [key, dedupeMs]);

  // subscribe การเปลี่ยนแปลง cache ของ key นี้ → re-render
  useEffect(() => {
    if (!key) return;
    const fn = () => force((x) => x + 1);
    let set = listeners.get(key); if (!set) { set = new Set(); listeners.set(key, set); }
    set.add(fn);
    return () => { set.delete(fn); if (set.size === 0) listeners.delete(key); };
  }, [key]);

  // โหลดครั้งแรก / เปลี่ยน key
  useEffect(() => { void revalidate(false); }, [revalidate]);

  // กลับมาที่แท็บ → revalidate เงียบ "เฉพาะเมื่อข้อมูลเก่าพอ" (กันยิงซ้ำทุกครั้งที่สลับแท็บ = ประหยัด request)
  useEffect(() => {
    if (!revalidateOnFocus || !key) return;
    const fn = () => {
      if (document.visibilityState !== "visible") return;
      const cur = cache.get(key);
      if (cur && Date.now() - cur.at < focusStaleMs) return; // ยังไม่เก่าพอ → ไม่ต้องโหลดใหม่
      void revalidate(false);
    };
    window.addEventListener("focus", fn);
    document.addEventListener("visibilitychange", fn);
    return () => { window.removeEventListener("focus", fn); document.removeEventListener("visibilitychange", fn); };
  }, [revalidate, revalidateOnFocus, key, focusStaleMs]);

  const data = key ? (cache.get(key) as Entry<T> | undefined)?.data : undefined;
  return { data, loading: loading && data === undefined, error, revalidate, mutate: (d: T) => key && mutateSWR(key, d) };
}
