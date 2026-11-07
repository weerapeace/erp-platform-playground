/**
 * บันทึกการเข้าใช้หน้า (ของกลาง · ใช้ได้ทั้งหน้าจอและเซิร์ฟเวอร์) — "ขั้น 3" ของหน้าประวัติการใช้งาน
 *
 * เก็บแบบ "ยอดรวมรายวัน": 1 แถว = วัน × คน × หน้า (เปิดกี่ครั้ง · ครั้งแรก/ล่าสุดกี่โมง) · เก็บ 90 วัน
 * ไม่เก็บว่า "ดูข้อมูลอะไรในหน้า" — ตัดคำค้น/ตัวกรอง (?q=…) ทิ้ง และแทนรหัสรายการในลิงก์ด้วย :id
 *
 * ผู้บันทึก = components/page-view-recorder (วางใน app/layout ครั้งเดียว) → POST /api/page-views
 * ผู้อ่าน   = แท็บ "การเข้าใช้หน้า" ใน /admin/audit-log → GET /api/page-views (สิทธิ์ admin.audit_log)
 * เอกสาร: docs/audit-log.md
 */

export const PAGE_VIEW_RETENTION_DAYS = 90;
/** ส่งขึ้นเซิร์ฟเวอร์ครั้งละไม่เกิน (กันคำขอใหญ่ผิดปกติ) */
export const PAGE_VIEW_MAX_ITEMS = 300;

/** 1 ก้อนที่หน้าจอสะสมไว้ก่อนส่ง (รวมตามวัน+หน้า) */
export type PageViewItem = { day: string; path: string; views: number; first_at: string; last_at: string };

const UUID_SEG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUM_SEG = /^\d{3,}$/;
/** หน้าที่ไม่นับ: ล็อกอิน/หน้าทดลอง/ไฟล์ระบบ */
const SKIP_PATH = /^\/(login|logout|auth|signup|reset-password|_next|api)(\/|$)|^\/(zz-|favicon|robots|sitemap)/i;

/**
 * ทำ path ให้เป็นมาตรฐาน: ตัด ?query / #hash · รหัสรายการ (uuid / เลขยาว) → :id · ตัด / ท้าย · ยาวไม่เกิน 200
 * คืน null = ไม่นับหน้านี้
 */
export function normalizePagePath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let p = String(raw).split(/[?#]/)[0].trim();
  if (!p.startsWith("/")) return null;
  try { p = decodeURI(p); } catch { /* ปล่อยตามเดิม */ }
  if (SKIP_PATH.test(p)) return null;
  const segs = p.split("/").filter(Boolean).map((s) => (UUID_SEG.test(s) || NUM_SEG.test(s) ? ":id" : s));
  const out = `/${segs.join("/")}`.slice(0, 200);
  return out;
}

/** วันที่ตามเวลาไทย (YYYY-MM-DD) ของเวลาที่ให้ */
export function bangkokDay(at: Date | string | number = new Date()): string {
  const d = new Date(at);
  return new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

/** รวมการเปิดหน้าเข้าก้อนที่ค้างส่ง (หน้าเดียวกันวันเดียวกัน = บวกจำนวน) */
export function addPageView(buf: Map<string, PageViewItem>, path: string, at: Date = new Date()): void {
  const day = bangkokDay(at);
  const key = `${day}|${path}`;
  const iso = at.toISOString();
  const cur = buf.get(key);
  if (cur) { cur.views += 1; cur.last_at = iso; }
  else buf.set(key, { day, path, views: 1, first_at: iso, last_at: iso });
}

/**
 * ตรวจ/ทำความสะอาดก้อนที่ส่งมาจากหน้าจอ (ฝั่งเซิร์ฟเวอร์) — ไม่เชื่อค่าจากเครื่องผู้ใช้ตรง ๆ
 * - path ทำมาตรฐานซ้ำ · จำนวนต่อก้อน 1–500 · เวลาอนาคตตัดเป็นตอนนี้ · เก่ากว่า 2 วันทิ้ง
 * - วันที่คิดใหม่จากเวลาล่าสุด (เวลาไทย)
 */
export function cleanPageViewItems(raw: unknown, now: Date = new Date()): PageViewItem[] {
  if (!Array.isArray(raw)) return [];
  const out: PageViewItem[] = [];
  const minMs = now.getTime() - 2 * 86_400_000;
  for (const r of raw.slice(0, PAGE_VIEW_MAX_ITEMS)) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const path = normalizePagePath(typeof o.path === "string" ? o.path : null);
    if (!path) continue;
    const views = Math.min(500, Math.max(1, Math.floor(Number(o.views) || 1)));
    const lastMs = Math.min(now.getTime(), Date.parse(String(o.last_at ?? "")) || now.getTime());
    if (lastMs < minMs) continue;
    const firstMs = Math.min(lastMs, Math.max(minMs, Date.parse(String(o.first_at ?? "")) || lastMs));
    out.push({ day: bangkokDay(lastMs), path, views, first_at: new Date(firstMs).toISOString(), last_at: new Date(lastMs).toISOString() });
  }
  return out;
}

export type MenuLabelItem = { href: string | null; label: string | null; section?: string | null };

/**
 * path → ชื่อหน้าจากทะเบียนเมนู (erp_menu_items) — ตรงตัวก่อน แล้วค่อยเมนูที่ยาวที่สุดที่เป็นต้นทางของ path
 * เช่น /master/skus/:id → เมนู "SKU" (/master/skus) · ไม่เจอ = null (หน้าจอโชว์ path แทน)
 */
export function matchMenuLabel(path: string, items: MenuLabelItem[]): { label: string; section: string | null } | null {
  let best: { label: string; section: string | null; len: number } | null = null;
  for (const it of items) {
    if (!it.href || !it.label) continue;
    const h = normalizePagePath(it.href);
    if (!h || h === "/") continue;
    const exact = h === path;
    if (!exact && !path.startsWith(`${h}/`)) continue;
    const len = exact ? Number.MAX_SAFE_INTEGER : h.length;
    if (!best || len > best.len) best = { label: it.label, section: it.section ?? null, len };
  }
  return best ? { label: best.label, section: best.section } : null;
}
