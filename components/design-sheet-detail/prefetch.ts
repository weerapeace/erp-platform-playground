/**
 * ⚡ โหลดใบงานออกแบบล่วงหน้า — เจ้าของบ่น 2026-11-07 "เปิดใบงานโหลดนาน อยากให้ < 1 วิ"
 *
 *   • เอาเมาส์ชี้การ์ดใบงาน (Design Dashboard) → เริ่มดึงรายละเอียดใบงาน (GET /api/design-sheets/[id]) ไว้ก่อน
 *     + โหลดโค้ดป๊อปใบงาน (chunk) ไว้ก่อน → กดเปิดแล้วข้อมูลมักมาถึงแล้ว
 *   • openEdit ในป๊อปหยิบผลที่โหลดไว้ (takePrefetchedSheet) — ใช้ได้ภายใน 15 วิ และใช้ได้ครั้งเดียว (กันข้อมูลเก่า)
 *   • ไฟล์นี้เล็ก (ไม่ import ป๊อปใบงาน) → หน้า dashboard import ได้โดยไม่ลากโค้ดใหญ่มาด้วย
 */
import { apiFetch } from "@/lib/api";

const TTL = 15000;
type Entry = { at: number; p: Promise<{ data?: unknown; error?: string | null }> };
const cache = new Map<string, Entry>();
let chunkLoaded = false;

/** เริ่มดึงใบงานไว้ก่อน (เรียกซ้ำภายใน 15 วิ = ไม่ยิงซ้ำ) */
export function prefetchDesignSheet(id: string | null | undefined): void {
  if (!id || typeof window === "undefined") return;
  if (!chunkLoaded) { chunkLoaded = true; void import("./index").catch(() => { chunkLoaded = false; }); }
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL) return;
  const p = apiFetch(`/api/design-sheets/${encodeURIComponent(id)}`).then((r) => r.json()).catch(() => ({ error: "prefetch" }));
  cache.set(id, { at: Date.now(), p });
  if (cache.size > 30) { const now = Date.now(); for (const [k, v] of cache) if (now - v.at > TTL) cache.delete(k); }
}

/** หยิบผลที่โหลดไว้ (ใช้ครั้งเดียว · เก่ากว่า 15 วิ = ไม่ใช้) — null = ต้องดึงเอง */
export function takePrefetchedSheet(id: string): Entry["p"] | null {
  const hit = cache.get(id);
  cache.delete(id);
  return hit && Date.now() - hit.at < TTL ? hit.p : null;
}
