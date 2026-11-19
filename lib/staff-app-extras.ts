/**
 * แอปพนักงาน รอบ 3 — ตัวเลขงานค้างบนปุ่ม · ประกาศจากหัวหน้า · สถิติการใช้ (ไฟล์ pure ห้ามใส่ "use client")
 * เอกสาร: docs/staff-apps.md §รอบ 3
 *
 * ตัวนับงานค้าง (แยกไฟล์ lib/staff-app-counters.ts — กันไฟล์แผนผังใหญ่หลุดเข้าหน้าแอป) = ใช้ทะเบียนตัวเลขสดของแผนผังการทำงาน (lib/flow-map FLOW_METRICS + app/api/flow-map/metrics countFlowMetric)
 *   → ไม่มีระบบนับตัวที่ 2 · ตัวเลขบนปุ่มตรงกับตัวเลขในแผนผังเสมอ · เพิ่มตัวนับใหม่ = เพิ่มใน FLOW_METRICS ที่เดียว
 * ประกาศ = ตาราง erp_app_announcements (soft delete · หมดอายุได้) · เขียนได้ด้วยสิทธิ์ staff_apps.announce
 * สถิติ = page_view_daily (บันทึกการเปิดหน้าที่มีอยู่แล้ว) จับคู่ path กับลิงก์ของเมนูในแอป
 */

export const ANNOUNCE_PERM = "staff_apps.announce";

// ── ประกาศ ──
export type Announcement = {
  id: string; app_key: string; title: string; body: string | null; level: "info" | "warn" | "urgent";
  starts_at: string | null; expires_at: string | null; pinned: boolean;
  created_by_name: string | null; created_at: string; updated_at: string | null; deleted_at: string | null;
};
export type AnnouncementInput = { title: string; body: string | null; level: Announcement["level"]; starts_at: string | null; expires_at: string | null; pinned: boolean };

const iso = (v: unknown): string | null => {
  if (v == null || v === "") return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** ตรวจค่าที่ส่งมา — ผิด = ข้อความภาษาคน */
export function cleanAnnouncement(raw: unknown): { ok: true; value: AnnouncementInput } | { ok: false; error: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const title = String(r.title ?? "").trim().slice(0, 120);
  if (!title) return { ok: false, error: "ใส่หัวข้อประกาศก่อน" };
  const body = String(r.body ?? "").trim().slice(0, 2000) || null;
  const level = r.level === "warn" || r.level === "urgent" ? r.level : "info";
  const starts_at = iso(r.starts_at);
  const expires_at = iso(r.expires_at);
  if (starts_at && expires_at && expires_at <= starts_at) return { ok: false, error: "วันหมดอายุต้องหลังวันเริ่มแสดง" };
  return { ok: true, value: { title, body, level, starts_at, expires_at, pinned: !!r.pinned } };
}

/** ประกาศนี้ต้องโชว์ตอนนี้ไหม (ไม่ถูกลบ · ถึงวันเริ่ม · ยังไม่หมดอายุ) */
export function announcementActive(a: Pick<Announcement, "deleted_at" | "starts_at" | "expires_at">, now: Date = new Date()): boolean {
  if (a.deleted_at) return false;
  const t = now.getTime();
  if (a.starts_at && new Date(a.starts_at).getTime() > t) return false;
  if (a.expires_at && new Date(a.expires_at).getTime() <= t) return false;
  return true;
}

/** เรียง: ปักหมุดก่อน → ด่วนก่อน → ใหม่ก่อน */
export function sortAnnouncements<T extends Pick<Announcement, "pinned" | "level" | "created_at">>(list: T[]): T[] {
  const rank = { urgent: 0, warn: 1, info: 2 } as const;
  return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || rank[a.level] - rank[b.level] || b.created_at.localeCompare(a.created_at));
}

// ── สถิติ ──
export type ViewRow = { path: string; user_id: string; views: number; last_at: string | null };
export type MenuUsage = { menu_id: string; views: number; users: number; last_at: string | null };

const base = (h: string) => h.split(/[?#]/)[0].replace(/\/+$/, "") || "/";

/**
 * รวมยอดเปิดหน้าเข้าเมนู — หน้าลึกใต้ลิงก์เมนู (เช่น /mo/:id) นับเข้าเมนูนั้น · ตรงหลายเมนู = เมนูที่ลิงก์ยาวสุด
 * onlyUsers = นับเฉพาะคนกลุ่มนี้ (เช่น คนที่เห็นแอป) · ไม่ส่ง = ทุกคน
 */
export function usageByMenu(rows: ViewRow[], menus: { id: string; href: string }[], onlyUsers?: Set<string> | null): MenuUsage[] {
  const ms = menus.map((m) => ({ id: m.id, b: base(m.href) })).filter((m) => m.b.startsWith("/") && m.b !== "/");
  const acc = new Map<string, { views: number; users: Set<string>; last: string | null }>();
  for (const m of ms) acc.set(m.id, { views: 0, users: new Set(), last: null });
  for (const r of rows) {
    if (onlyUsers && !onlyUsers.has(r.user_id)) continue;
    const p = base(r.path);
    let best: { id: string; b: string } | null = null;
    for (const m of ms) if ((p === m.b || p.startsWith(`${m.b}/`)) && (!best || m.b.length > best.b.length)) best = m;
    if (!best) continue;
    const a = acc.get(best.id)!;
    a.views += Number(r.views) || 0;
    a.users.add(r.user_id);
    if (r.last_at && (!a.last || r.last_at > a.last)) a.last = r.last_at;
  }
  return ms.map((m) => { const a = acc.get(m.id)!; return { menu_id: m.id, views: a.views, users: a.users.size, last_at: a.last }; })
    .sort((x, y) => y.views - x.views);
}
