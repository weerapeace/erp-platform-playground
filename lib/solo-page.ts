/**
 * 📲 แอปหน้าเดียว (ของกลาง · pure ใช้ได้ทั้งหน้าจอ/API/เทสต์)
 *
 * เจ้าของขอ 2026-11-05: ติดตั้ง "หน้าใดหน้าหนึ่ง" เป็นแอปแยกบนคอม/แท็บเล็ต/มือถือ — เปิดมาเจอหน้านั้นหน้าเดียว ไปหน้าอื่นไม่ได้
 *   ที่อยู่แอป   = /solo<path ของหน้า>   เช่น /solo/design/pattern-tickets
 *   manifest    = /api/page-manifest<path>   (scope = /solo<path> → ติดตั้งได้หลายหน้า แยกเป็นคนละแอป)
 *   ไอคอน       = /api/page-icon<path>?s=192   (รูปเมนูที่อัปโหลด หรือวาดจากไอคอนเส้นของเมนู)
 *   เชลล์       = app/solo/[...path] — แถบบาง + หน้าจริงใน iframe (?embed=1) · ลิงก์ออกนอกหน้า = ไม่พาไป เด้งถามเปิดในเบราว์เซอร์
 * ⚠️ ล็อกหน้าเดียว = ซ่อนทางไป ไม่ใช่กันสิทธิ์ — กันจริงใช้สิทธิ์ของบัญชี (permission)
 */

export const SOLO_PREFIX = "/solo";

/** หน้าที่ห้ามทำเป็นแอปหน้าเดียว (ระบบ/ล็อกอิน/แอปเดิม) */
const BLOCKED = /^\/(solo|app|api|login|auth|_next|print|embed)(\/|$)/;

/** ทำความสะอาด path ของหน้า → "/design/pattern-tickets" · ใช้ไม่ได้ = null */
export function cleanPagePath(raw: string | null | undefined): string | null {
  let p = String(raw ?? "").trim();
  if (!p) return null;
  p = p.split("#")[0].split("?")[0];
  try { p = decodeURIComponent(p); } catch { return null; }
  if (!p.startsWith("/")) p = `/${p}`;
  p = p.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  if (!p || p === "/") return null;
  if (!/^\/[A-Za-z0-9\-_/.\[\]]+$/.test(p) || p.includes("..")) return null;
  if (BLOCKED.test(p)) return null;
  return p;
}

/** path จาก segment ของ [...path] */
export function pagePathFromSegments(segs: string[] | string | undefined): string | null {
  const arr = Array.isArray(segs) ? segs : segs ? [segs] : [];
  return cleanPagePath(`/${arr.join("/")}`);
}

/** ที่อยู่แอปหน้าเดียวของหน้านี้ · search = query ของหน้า (เช่น ?id=) · install = เด้งการ์ดติดตั้ง */
export function soloUrl(pagePath: string, opts: { search?: string; install?: boolean } = {}): string {
  const q = new URLSearchParams(stripSearch(opts.search ?? ""));
  if (opts.install) q.set("install", "1");
  const s = q.toString();
  return `${SOLO_PREFIX}${pagePath}${s ? `?${s}` : ""}`;
}

/** ตัดพารามิเตอร์ของระบบออกจาก query (embed/install/device) เหลือแค่ของหน้า */
export function stripSearch(search: string): string {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  for (const k of ["embed", "install", "device"]) q.delete(k);
  return q.toString();
}

/** หน้านี้ยังอยู่ในแอปหน้าเดียวไหม — หน้าเดียวกัน หรือหน้าย่อยของมัน (เช่น /x/123 ของ /x) */
export function isInsideSolo(currentPath: string, pagePath: string): boolean {
  const c = currentPath.replace(/\/+$/, "") || "/";
  return c === pagePath || c.startsWith(`${pagePath}/`);
}

/** เมนูที่ตรงกับหน้านี้ที่สุด (href ตรง > ขึ้นต้นยาวสุด) */
export function matchMenuForPath<T extends { href: string }>(items: T[], pagePath: string): T | null {
  let best: T | null = null;
  for (const it of items) {
    const h = (it.href ?? "").split("?")[0].replace(/\/+$/, "");
    if (!h || h === "/") continue;
    if (h === pagePath) return it;
    if (pagePath.startsWith(`${h}/`) && (!best || h.length > best.href.split("?")[0].length)) best = it;
  }
  return best;
}

/** ชื่อแอปสำรองจาก path (ไม่มีเมนู) — "/design/pattern-tickets" → "Pattern Tickets" */
export function labelFromPath(pagePath: string): string {
  const last = pagePath.split("/").filter(Boolean).pop() ?? "ERP";
  return last.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** id ของแอปใน manifest (คงที่ต่อหน้า → ติดตั้งซ้ำ = อัปเดตตัวเดิม) */
export const soloAppId = (pagePath: string) => `${SOLO_PREFIX}${pagePath}`;
