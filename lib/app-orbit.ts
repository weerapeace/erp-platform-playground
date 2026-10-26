/**
 * ◎ วงแอป (App Orbit) — กฎกลางของหน้ารวมแอปแบบ "การ์ดล้อมเป็นวง"
 * (ไฟล์ pure ห้ามใส่ "use client" — เทสต์/เชลล์ import ได้)
 *
 *   - แอปไหนโชว์ / เมนูไหนอยู่ในแอป → ใช้กฎเดียวกับแถบเมนูของเชลล์ (สิทธิ์ล็อกแอป, permission_key รายเมนู,
 *     👁 ใครเห็นเมนูไหน lib/menu-audience, ↕️ ซ่อน/ชื่อ/ลำดับต่อแอป lib/app-menu-layout)
 *   - กด "เปิดแอป" ไปหน้าไหน → appHomeHref (ตัวเดียวกับแท็บแอปด้านบนของ PlaygroundShell)
 *   - ตำแหน่งการ์ด: orbitPoint (วงรีรอบแผงกลาง) · gallerySlot (แถบเลื่อนมือถือ ใบกลางใหญ่)
 * ใช้ที่: components/app-orbit (หน้า /apps) · components/playground-shell (firstHrefForApp)
 */
import { menuVisibleTo } from "@/lib/menu-audience";
import { applyAppOverrides, menuPlace } from "@/lib/app-menu-layout";

/** แถวเมนูขั้นต่ำที่ต้องใช้ (ตรงกับ MenuRow ของเชลล์) */
export type OrbitMenuRow = {
  id?: string; href: string; label: string; icon: string | null; icon_url?: string | null;
  sort_order: number; section?: string | null; is_active: boolean; show_in_sidebar: boolean;
  permission_key: string | null; app_keys?: string[]; app_overrides?: unknown; audience?: unknown;
  parent_id?: string | null; search_keywords?: string[];
};
/** แอปขั้นต่ำ (ตรงกับ AppGroup ของเชลล์ + theme_color) */
export type OrbitAppRow = {
  key: string; label: string; icon: string | null; icon_url?: string | null; sort_order: number;
  permission_key: string | null; is_active: boolean; default_href?: string | null; theme_color?: string | null;
};
export type OrbitViewer = { can: (perm: string) => boolean; user: { id?: string | null; role?: string | null } | null | undefined };

export type OrbitMenu = { href: string; label: string; icon: string | null; iconUrl: string | null; keywords: string[] };
export type OrbitApp = {
  key: string; label: string; icon: string | null; iconUrl: string | null; color: string | null;
  homeHref: string; menus: OrbitMenu[];
};

/** หน้าแรกสำรองของบางแอป (เมื่อยังไม่ได้ตั้ง "หน้าแรก" ใน ⚙️ ตั้งค่าแอป) */
export const APP_DEFAULT_HREF: Record<string, string> = { production: "/master/manufacturing-orders" };

/** เมนูทั้งหมดที่ผู้ใช้คนนี้เห็นในแอปนี้ — ชื่อ/ลำดับตามที่แอปตั้งไว้ · เมนูที่ซ่อนในแอป (และลูกของมัน) ไม่เอา */
export function visibleAppMenus<T extends OrbitMenuRow>(rows: T[], appKey: string, viewer: OrbitViewer): T[] {
  const inApp = rows.filter((r) => r.is_active && r.show_in_sidebar && (r.app_keys ?? []).includes(appKey)
    && (!r.permission_key || viewer.can(r.permission_key)) && menuVisibleTo(r.audience, viewer.user));
  const hid = new Set(inApp.filter((r) => menuPlace(r, appKey) === "hidden").map((r) => r.id));
  return applyAppOverrides(inApp.filter((r) => !hid.has(r.id) && !(r.parent_id && hid.has(r.parent_id))), appKey);
}

/** หน้าแรกของแอป: "หน้าแรก" ที่ตั้งไว้ (ถ้าผู้ใช้เห็นเมนูนั้น) → หน้าสำรองในโค้ด → เมนูตัวบนสุด */
export function appHomeHref(menus: { href: string }[], app: { key: string; default_href?: string | null } | undefined): string | null {
  const home = app?.default_href;
  if (home && menus.some((r) => r.href === home)) return home;
  const pref = app ? APP_DEFAULT_HREF[app.key] : undefined;
  if (pref && menus.some((r) => r.href === pref)) return pref;
  return menus[0]?.href ?? null;
}

/** แอปที่โชว์ในวง: เปิดใช้ + ไม่ล็อก/มีสิทธิ์ + มีเมนูที่เห็นอย่างน้อย 1 อัน · ตัดลิงก์หน้า /apps เอง */
export function buildOrbitApps(rows: OrbitMenuRow[], apps: OrbitAppRow[], viewer: OrbitViewer): OrbitApp[] {
  const out: OrbitApp[] = [];
  for (const a of [...apps].sort((x, y) => x.sort_order - y.sort_order)) {
    if (!a.is_active || (a.permission_key && !viewer.can(a.permission_key))) continue;
    const all = visibleAppMenus(rows, a.key, viewer);
    const ids = new Set(all.map((r) => r.id).filter(Boolean));
    const top = all.filter((r) => r.href !== "/apps" && !(r.parent_id && ids.has(r.parent_id)));   // เมนูย่อยอยู่ใต้แม่ ไม่ต้องโชว์ซ้ำ
    const homeHref = appHomeHref(all, a);
    if (!top.length || !homeHref) continue;
    out.push({
      key: a.key, label: a.label, icon: a.icon, iconUrl: a.icon_url ?? null, color: a.theme_color ?? null, homeHref,
      menus: top.map((r) => ({ href: r.href, label: r.label, icon: r.icon, iconUrl: r.icon_url ?? null, keywords: r.search_keywords ?? [] })),
    });
  }
  return out;
}

/** ค้นหาเมนูข้ามแอป (ชื่อเมนู / คำค้นเพิ่ม / ชื่อแอป) — href ซ้ำหลายแอปเอาแอปแรก */
export function searchOrbit(apps: OrbitApp[], query: string, limit = 8): { app: OrbitApp; menu: OrbitMenu }[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const seen = new Set<string>();
  const hits: { app: OrbitApp; menu: OrbitMenu; score: number }[] = [];
  for (const app of apps) for (const menu of app.menus) {
    if (seen.has(menu.href)) continue;
    const label = menu.label.toLowerCase();
    const score = label.startsWith(q) ? 0 : label.includes(q) ? 1
      : menu.keywords.some((k) => k.toLowerCase().includes(q)) ? 2 : app.label.toLowerCase().includes(q) ? 3 : -1;
    if (score < 0) continue;
    seen.add(menu.href);
    hits.push({ app, menu, score });
  }
  return hits.sort((a, b) => a.score - b.score).slice(0, limit).map(({ app, menu }) => ({ app, menu }));
}

/** แอปนี้มีอะไรตรงคำค้นไหม (ไว้หรี่การ์ดที่ไม่เกี่ยว) */
export function orbitAppMatches(app: OrbitApp, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return app.label.toLowerCase().includes(q) || app.menus.some((m) => m.label.toLowerCase().includes(q) || m.keywords.some((k) => k.toLowerCase().includes(q)));
}

const TAU = Math.PI * 2;

/** จุดศูนย์กลางการ์ดใบที่ i บนวงรี (ใบที่ i=0 อยู่บนสุดเมื่อ rot=0, เรียงตามเข็มนาฬิกา) */
export function orbitPoint(i: number, n: number, rot: number, rx: number, ry: number): { x: number; y: number } {
  const t = rot + (i * TAU) / Math.max(n, 1) - Math.PI / 2;
  return { x: rx * Math.cos(t), y: ry * Math.sin(t) };
}

/** มุมหมุนที่ทำให้ใบที่ i ขึ้นไปอยู่บนสุด — เลือกทางที่หมุนสั้นที่สุดจากมุมปัจจุบัน */
export function snapRotation(current: number, i: number, n: number): number {
  const want = (-i * TAU) / Math.max(n, 1);
  let d = (((want - current) % TAU) + TAU) % TAU;
  if (d > Math.PI) d -= TAU;
  return current + d;
}

/** ใบที่อยู่บนสุดตอนนี้ (ใกล้มุม 12 นาฬิกาที่สุด) */
export function topIndex(rot: number, n: number): number {
  if (n <= 0) return 0;
  const k = Math.round((-rot * n) / TAU);
  return ((k % n) + n) % n;
}

/** ตำแหน่งในแถบเลื่อนมือถือ: k = ห่างจากใบกลางกี่ใบ (ลบ = ซ้าย) วนรอบได้ */
export function gallerySlot(i: number, focus: number, n: number): number {
  let k = (((i - focus) % n) + n) % n;
  if (k > n / 2) k -= n;
  return k;
}
