"use client";
/**
 * เปิดดูไฟล์จาก "ที่อยู่ไฟล์กลาง" (ref) — ของกลาง · รูปแบบ ref: lib/file-ref.ts
 *   const urls = useFileRefUrls([d.bill_doc_r2_key, d.receipt_doc_r2_key]);   // { [ref]: url | null | undefined }
 *   undefined = กำลังขอลิงก์ · null = เปิดไม่ได้ (ไม่มีสิทธิ์/ไม่มีไฟล์) · string = ใช้ใน <img src> / <a href> ได้เลย
 *
 * R2 key → ลิงก์ /api/r2-image ทันที (ไม่ต้องรอ) · Supabase → ขอลิงก์ชั่วคราวจาก /api/files/sign (ตรวจสิทธิ์ตามหมวด)
 * จำลิงก์ไว้ในหน้า (ใช้ซ้ำจนใกล้หมดอายุ) และรวมคำขอหลายไฟล์เป็นครั้งเดียว
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { parseFileRef } from "@/lib/file-ref";

const SIGNED_REUSE_MS = 8 * 60 * 1000;   // ลิงก์อยู่ได้ 10 นาที — ใช้ซ้ำไม่เกิน 8 นาที
const cache = new Map<string, { url: string | null; at: number }>();
const inflight = new Map<string, Promise<void>>();

const r2Url = (key: string) => `/api/r2-image?key=${encodeURIComponent(key)}`;

/** ลิงก์ที่รู้ได้ทันที (R2 / มีในความจำ) — ไม่รู้ = undefined */
function knownUrl(ref: string): string | null | undefined {
  const p = parseFileRef(ref);
  if (!p) return null;
  if (p.provider === "r2") return r2Url(p.key);
  const hit = cache.get(ref);
  return hit && Date.now() - hit.at < SIGNED_REUSE_MS ? hit.url : undefined;
}

async function signRefs(refs: string[]): Promise<void> {
  const todo = refs.filter((r) => !inflight.has(r));
  if (todo.length) {
    const job = (async () => {
      try {
        const j = await apiFetch("/api/files/sign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refs: todo }) }).then((r) => r.json());
        const data = (j?.data ?? {}) as Record<string, string | null>;
        for (const r of todo) cache.set(r, { url: data[r] ?? null, at: Date.now() });
      } catch {
        for (const r of todo) cache.set(r, { url: null, at: Date.now() - SIGNED_REUSE_MS + 15_000 });   // ลองใหม่ได้ใน 15 วิ
      } finally { for (const r of todo) inflight.delete(r); }
    })();
    for (const r of todo) inflight.set(r, job);
  }
  await Promise.all(refs.map((r) => inflight.get(r)).filter(Boolean));
}

export function useFileRefUrls(refs: (string | null | undefined)[]): Record<string, string | null | undefined> {
  const list = useMemo(() => [...new Set(refs.map((r) => String(r ?? "").trim()).filter(Boolean))], [refs.join("\n")]); // eslint-disable-line react-hooks/exhaustive-deps
  const [, bump] = useState(0);

  useEffect(() => {
    const need = list.filter((r) => knownUrl(r) === undefined);
    if (!need.length) return;
    let alive = true;
    void signRefs(need).then(() => { if (alive) bump((n) => n + 1); });
    return () => { alive = false; };
  }, [list]);

  const out: Record<string, string | null | undefined> = {};
  for (const r of list) out[r] = knownUrl(r);
  return out;
}

/** ไฟล์เดียว */
export function useFileRefUrl(ref: string | null | undefined): string | null | undefined {
  const s = String(ref ?? "").trim();
  return useFileRefUrls([s])[s];
}

/**
 * ตัวแปลง ref → ลิงก์ แบบเรียกตอน render ได้เลย (ไม่ต้องรวบรวมรายการ ref ล่วงหน้า) — เหมาะกับหน้าที่ ref อยู่ลึกในข้อมูล
 *   const fileUrl = useFileRefResolver();
 *   <img src={fileUrl(k)} />   // R2 = ลิงก์ทันที · Supabase = undefined ระหว่างขอลิงก์ แล้ว render ใหม่เอง · เปิดไม่ได้ = undefined
 * ref ที่เรียกระหว่าง render ถูกรวมขอลิงก์ครั้งเดียวหลัง render (ใช้ความจำ/คำขอร่วมกับ useFileRefUrls)
 */
export function useFileRefResolver(): (ref: string | null | undefined) => string | undefined {
  const [, bump] = useState(0);
  const seen = useRef<Set<string>>(new Set());
  seen.current = new Set();   // เก็บใหม่ทุก render
  useEffect(() => {
    const need = [...seen.current].filter((r) => knownUrl(r) === undefined);
    if (!need.length) return;
    let alive = true;
    void signRefs(need).then(() => { if (alive) bump((n) => n + 1); });
    return () => { alive = false; };
  });
  return (ref) => {
    const s = String(ref ?? "").trim();
    if (!s) return undefined;
    const u = knownUrl(s);
    if (u === undefined) seen.current.add(s);
    return u ?? undefined;
  };
}

/** ขอลิงก์แบบ async (ใช้นอก render เช่น ดึงไฟล์ไปแปลงก่อนส่ง LINE) · เปิดไม่ได้ = null */
export async function getFileRefUrl(ref: string | null | undefined): Promise<string | null> {
  const s = String(ref ?? "").trim();
  if (!s) return null;
  const k = knownUrl(s);
  if (k !== undefined) return k;
  await signRefs([s]);
  return knownUrl(s) ?? null;
}

/** ดึงไฟล์จาก ref มาเป็น Blob (R2 ผ่าน /api/r2-image · Supabase ผ่านลิงก์ชั่วคราว) · ไม่ได้ = null */
export async function fetchFileRefBlob(ref: string | null | undefined): Promise<Blob | null> {
  const url = await getFileRefUrl(ref);
  if (!url) return null;
  try {
    const r = parseFileRef(String(ref))?.provider === "r2" ? await apiFetch(url) : await fetch(url);
    return r.ok ? await r.blob() : null;
  } catch { return null; }
}
