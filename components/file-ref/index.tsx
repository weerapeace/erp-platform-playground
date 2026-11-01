"use client";
/**
 * เปิดดูไฟล์จาก "ที่อยู่ไฟล์กลาง" (ref) — ของกลาง · รูปแบบ ref: lib/file-ref.ts
 *   const urls = useFileRefUrls([d.bill_doc_r2_key, d.receipt_doc_r2_key]);   // { [ref]: url | null | undefined }
 *   undefined = กำลังขอลิงก์ · null = เปิดไม่ได้ (ไม่มีสิทธิ์/ไม่มีไฟล์) · string = ใช้ใน <img src> / <a href> ได้เลย
 *
 * R2 key → ลิงก์ /api/r2-image ทันที (ไม่ต้องรอ) · Supabase → ขอลิงก์ชั่วคราวจาก /api/files/sign (ตรวจสิทธิ์ตามหมวด)
 * จำลิงก์ไว้ในหน้า (ใช้ซ้ำจนใกล้หมดอายุ) และรวมคำขอหลายไฟล์เป็นครั้งเดียว
 */
import { useEffect, useMemo, useState } from "react";
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
