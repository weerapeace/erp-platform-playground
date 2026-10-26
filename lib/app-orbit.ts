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
import type { OrbitStyle } from "@/lib/app-orbit-style";

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
    const homeHref = appHomeHref(all.filter((r) => r.href !== "/apps"), a);   // เปิดแอปจากหน้า /apps ไม่วนกลับมาหน้าเดิม (เช่น "หน้าหลัก" เมนูแรก = App Launcher)
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

// ===== ท่าทางการ์ดตามรูปแบบวง (lib/app-orbit-style) =====
type PoseStyle = Pick<OrbitStyle, "mode" | "radius" | "tilt" | "depth" | "intro" | "size" | "shape" | "labels">;
export type OrbitPose = { x: number; y: number; s: number; z: number; o: number; ry: number };
/** แถวเอียง: เลื่อนกี่ px ต่อการหมุน 1 เรเดียน */
export const ROW_PX_PER_RAD = 300;

/** ขนาดการ์ด (กล่องไอคอน + กล่องรวมชื่อ) ตามขนาด/ทรง */
export function orbitCardBox(st: Pick<OrbitStyle, "size" | "shape" | "labels">): { tileW: number; tileH: number; w: number; h: number } {
  const por = st.shape === "portrait";
  const tileW = por ? Math.round(st.size * 0.8) : st.size;
  const tileH = por ? Math.round(st.size * 1.2) : st.size;
  return { tileW, tileH, w: Math.max(tileW, 84), h: tileH + (st.labels ? 20 : 0) };
}

function rowSpan(n: number, size: number) { const gap = size * 1.9; return { gap, total: Math.max(n * gap, 1000) }; }

/**
 * ตำแหน่ง/ขนาด/ความจางของการ์ดใบที่ i (จุดศูนย์กลาง เทียบมุมซ้ายบนของเวที W×H)
 *   rot = มุมหมุนวง · sel = ใบที่เลือก (แกลเลอรีใช้เป็นใบกลาง) · e = ความคืบหน้าลูกเล่นตอนเปิด 0→1
 *   compact = แกลเลอรีมือถือ (เวทีเตี้ย)
 */
export function orbitPose(i: number, n: number, rot: number, sel: number, W: number, H: number, st: PoseStyle, e = 1, compact = false): OrbitPose {
  const k = st.radius / 100, cx = W / 2, cy = H / 2;
  const box = orbitCardBox(st);
  const ang = rot + (i * TAU) / Math.max(n, 1) - Math.PI / 2 + (st.intro === "spin" ? -(1 - e) * 2.4 : 0);
  let p: OrbitPose;
  if (compact || st.mode === "gallery") {
    const kk = gallerySlot(i, sel, n), a = Math.abs(kk);
    p = compact
      ? { x: cx + Math.sign(kk) * (a ? st.size * 1.6 + (a - 1) * st.size * 1.17 : 0), y: cy, s: a === 0 ? 1.25 : a === 1 ? 0.88 : 0.74, z: 100 - a, o: a > 2 ? 0 : 1, ry: 0 }
      : { x: cx + Math.sign(kk) * (a ? st.size * 1.9 + (a - 1) * st.size * 1.08 : 0), y: H * 0.46, s: a === 0 ? 2 : a === 1 ? 1.2 : 0.85, z: 100 - a, o: a > 5 ? 0 : 1 - a * 0.08, ry: 0 };
  } else if (st.mode === "ellipse") {
    p = { x: cx + (W / 2 - box.w / 2 - 8) * k * Math.cos(ang), y: cy + (H / 2 - box.h / 2 - 6) * k * Math.sin(ang), s: 1, z: 10, o: 1, ry: 0 };
  } else if (st.mode === "circle") {
    const R = Math.min(H / 2 - box.h / 2 - 6, W / 2 - box.w / 2 - 8) * k;
    p = { x: cx + R * Math.cos(ang), y: cy + R * Math.sin(ang), s: 1, z: 10, o: 1, ry: 0 };
  } else if (st.mode === "ring") {
    const R = (W / 2 - box.w / 2 - 16) * k, tl = (st.tilt * Math.PI) / 180, th = ang + Math.PI, d = (Math.sin(th) + 1) / 2;
    const vy = Math.min(R * Math.cos(tl), H / 2 - box.h * 0.6);
    p = { x: cx + R * Math.cos(th), y: H * 0.48 + vy * Math.sin(th), s: 1 - (st.depth / 100) * (1 - d) * Math.sin(tl) * 1.2, z: Math.round(d * 100), o: 1 - 0.5 * (1 - d) * Math.sin(tl), ry: 0 };
  } else {
    const { gap, total } = rowSpan(n, st.size);
    const x = ((((i * gap + rot * ROW_PX_PER_RAD) % total) + total) % total) - total / 2;
    p = { x: cx + x, y: H * 0.46 + Math.sin(i * 1.7) * st.size * 0.55, s: 1.3, z: 10, o: Math.abs(x) > W / 2 + 50 ? 0 : 1, ry: (-x / W) * st.tilt };
  }
  if (st.intro === "burst") { p.x = cx + (p.x - cx) * e; p.y = cy + (p.y - cy) * e; p.o *= e; }
  if (st.intro === "drop") { p.y += (1 - e) * 130; p.o *= e; }
  return p;
}

/** มุมหมุนเป้าหมายเมื่อเลือกใบ i (วง = ขึ้นบนสุด/มาหน้าสุด · แถว = มากลาง · แกลเลอรี = ไม่ต้องหมุน → null) */
export function orbitSnapTarget(mode: OrbitStyle["mode"], rot: number, i: number, n: number, size: number): number | null {
  if (mode === "gallery") return null;
  if (mode === "row") {
    const { gap, total } = rowSpan(n, size), period = total / ROW_PX_PER_RAD;
    const want = (total / 2 - i * gap) / ROW_PX_PER_RAD;
    let d = (((want - rot) % period) + period) % period;
    if (d > period / 2) d -= period;
    return rot + d;
  }
  return snapRotation(rot, i, n);
}
