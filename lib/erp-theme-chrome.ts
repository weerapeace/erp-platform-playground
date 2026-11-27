// ============================================================
// ชิ้นส่วนย่อยของธีม (ป๊อปอัป · ลิ้นชัก · ตาราง · ช่องกรอก · ปุ่มรอง · ป้าย · ติ๊ก · เมนูลอย · แจ้งผล · แถบเลื่อน · ไอคอน · หัวข้อ)
//   ธีมกลาง · ปุ่ม "ชิ้นส่วน" ในแถบล่าง (เจ้าของเลือก 2026-11-27: แบบ A + ข้อ 1–4, 6–14, 16, 19–21)
//   ค่าเริ่มทุกช่อง = หน้าตาเดิมเป๊ะ (chromeEffects คืน attr ว่าง)
//   chromeEffects → attrs data-tm-* + ตัวแปร CSS · CSS อยู่ใน app/globals.css หัวข้อ "ชิ้นส่วนย่อย"
//   ชิ้นกลางที่ติดจุดเสียบ: ERPModal / ConfirmDialog / Drawer / DrawerShell / BottomSheet (data-tm-pop · data-tm-pop-head · data-tm-backdrop)
//   · DataTable (table[data-erp-table]) · StatusBadge (data-tm-badge) · Popover (data-tm-menu) · Toast (data-tm-toasts · data-tm-toast)
//   · ScrollTabs (data-tm-tablist) · ToggleSwitch (role=switch) · Icon (svg[data-icon])
// ไฟล์ pure — เทสต์ lib/__tests__/erp-theme-chrome.test.ts
// ============================================================
import type { ColorScale } from "./erp-theme";

export type ThemeChrome = {
  popup: {
    header: "plain" | "theme" | "gradient";
    backdrop: "dark" | "blur" | "tint";
    dim: 1 | 2 | 3;                         // ความเข้มฉากหลัง (2 = เดิม)
    radius: number | null;                  // null = เดิม (12px)
    shadow: "default" | "soft" | "float" | "theme";
    open: "none" | "fade" | "up" | "zoom";
    drawerBar: boolean;                     // แถบสีธีมขอบซ้ายลิ้นชัก
  };
  table: { head: "gray" | "soft" | "theme"; selected: "soft" | "strong" };
  input: { focus: "default" | "primary" | "accent"; ring: 0 | 1 | 2 | 3 };
  button2: "default" | "soft" | "ghost";    // ปุ่มรอง (ขาวมีขอบ)
  badgeShape: "pill" | "rounded" | "dot";
  checks: boolean;                          // ติ๊ก/วงกลมเลือก/สวิตช์ เป็นสีธีม
  menu: { selected: "default" | "soft" | "strong"; radius: number | null };
  toast: { position: "top-right" | "top-center" | "bottom-right" | "bottom-center"; style: "solid" | "white" };
  scrollbar: "default" | "thin" | "theme";
  icon: { stroke: "thin" | "normal" | "bold"; tint: boolean };
};

export const DEFAULT_CHROME: ThemeChrome = {
  popup: { header: "plain", backdrop: "dark", dim: 2, radius: null, shadow: "default", open: "none", drawerBar: false },
  table: { head: "gray", selected: "soft" },
  input: { focus: "default", ring: 2 },
  button2: "default",
  badgeShape: "pill",
  checks: false,
  menu: { selected: "default", radius: null },
  toast: { position: "top-right", style: "solid" },
  scrollbar: "default",
  icon: { stroke: "normal", tint: false },
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const pick = <T extends string | number>(v: unknown, opts: readonly T[], d: T): T => (opts.includes(v as T) ? (v as T) : d);
const radius = (v: unknown, max: number): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.round(v))) : null);

export function normalizeChrome(raw: unknown): ThemeChrome {
  const r = isObj(raw) ? raw : {};
  const D = DEFAULT_CHROME;
  const p = isObj(r.popup) ? r.popup : {}, t = isObj(r.table) ? r.table : {}, i = isObj(r.input) ? r.input : {};
  const m = isObj(r.menu) ? r.menu : {}, to = isObj(r.toast) ? r.toast : {}, ic = isObj(r.icon) ? r.icon : {};
  return {
    popup: {
      header: pick(p.header, ["plain", "theme", "gradient"] as const, D.popup.header),
      backdrop: pick(p.backdrop, ["dark", "blur", "tint"] as const, D.popup.backdrop),
      dim: pick(p.dim, [1, 2, 3] as const, D.popup.dim),
      radius: radius(p.radius, 28),
      shadow: pick(p.shadow, ["default", "soft", "float", "theme"] as const, D.popup.shadow),
      open: pick(p.open, ["none", "fade", "up", "zoom"] as const, D.popup.open),
      drawerBar: typeof p.drawerBar === "boolean" ? p.drawerBar : D.popup.drawerBar,
    },
    table: { head: pick(t.head, ["gray", "soft", "theme"] as const, D.table.head), selected: pick(t.selected, ["soft", "strong"] as const, D.table.selected) },
    input: { focus: pick(i.focus, ["default", "primary", "accent"] as const, D.input.focus), ring: pick(i.ring, [0, 1, 2, 3] as const, D.input.ring) },
    button2: pick(r.button2, ["default", "soft", "ghost"] as const, D.button2),
    badgeShape: pick(r.badgeShape, ["pill", "rounded", "dot"] as const, D.badgeShape),
    checks: typeof r.checks === "boolean" ? r.checks : D.checks,
    menu: { selected: pick(m.selected, ["default", "soft", "strong"] as const, D.menu.selected), radius: radius(m.radius, 20) },
    toast: {
      position: pick(to.position, ["top-right", "top-center", "bottom-right", "bottom-center"] as const, D.toast.position),
      style: pick(to.style, ["solid", "white"] as const, D.toast.style),
    },
    scrollbar: pick(r.scrollbar, ["default", "thin", "theme"] as const, D.scrollbar),
    icon: { stroke: pick(ic.stroke, ["thin", "normal", "bold"] as const, D.icon.stroke), tint: typeof ic.tint === "boolean" ? ic.tint : D.icon.tint },
  };
}

export const ICON_STROKE: Record<ThemeChrome["icon"]["stroke"], number> = { thin: 1.25, normal: 1.75, bold: 2.25 };
/** ความเข้มฉากหลังตอนเปิดป๊อป (ระดับ 1–3) */
export const BACKDROP_ALPHA: Record<1 | 2 | 3, number> = { 1: 0.25, 2: 0.45, 3: 0.65 };

const rgba = (hex: string, a: number) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`; };

/** ค่าที่ใช้ทั้งหน้าจริงและพรีวิว (สีหัวป๊อป ฉากหลัง เงา ฯลฯ) */
export function chromeLook(ch: ThemeChrome, p: ColorScale, accent: ColorScale, color2: string, angle: number, mobile = false) {
  const a = BACKDROP_ALPHA[ch.popup.dim];
  const backdrop = ch.popup.backdrop === "tint" ? rgba(p[900], a * 0.8) : rgba("#0f172a", ch.popup.backdrop === "blur" ? a * 0.55 : a);
  const blur = ch.popup.backdrop === "blur" && !mobile ? `blur(${2 + ch.popup.dim * 2}px)` : "none";
  const head = ch.popup.header === "gradient" ? `linear-gradient(${angle}deg, ${p[600]}, ${color2})` : ch.popup.header === "theme" ? p[600] : null;
  const shadow = ch.popup.shadow === "soft" ? "0 8px 24px -10px rgba(15, 23, 42, .3)"
    : ch.popup.shadow === "float" ? "0 30px 60px -20px rgba(15, 23, 42, .55)"
    : ch.popup.shadow === "theme" ? `0 24px 48px -16px ${rgba(p[600], 0.55)}` : null;
  const focus = ch.input.focus === "accent" ? accent[600] : p[600];
  return {
    backdrop, blur, head, shadow, focus, focusRing: rgba(ch.input.focus === "accent" ? accent[500] : p[500], 0.28),
    theadBg: ch.table.head === "theme" ? p[600] : ch.table.head === "soft" ? p[50] : null,
    theadTx: ch.table.head === "theme" ? "#ffffff" : ch.table.head === "soft" ? p[800] : null,
    rowSel: ch.table.selected === "strong" ? p[100] : null,
  };
}

/** ค่าตั้ง → attrs + ตัวแปร CSS ของหน้าจริง (ค่าเริ่ม = ว่างทั้งหมด) */
export function chromeEffects(ch: ThemeChrome, p: ColorScale, accent: ColorScale, color2: string, angle: number, env: { mobile: boolean; motionOff: boolean }) {
  const attrs: Record<string, string> = {}, vars: Record<string, string> = {};
  const L = chromeLook(ch, p, accent, color2, angle, env.mobile);
  if (L.head) { attrs["tm-pop-head"] = ch.popup.header; vars["--tm-pop-head"] = L.head; }
  if (ch.popup.backdrop !== "dark" || ch.popup.dim !== 2) { attrs["tm-backdrop"] = ch.popup.backdrop; vars["--tm-backdrop"] = L.backdrop; vars["--tm-backdrop-filter"] = L.blur; }
  if (ch.popup.radius !== null) { attrs["tm-pop-radius"] = "1"; vars["--tm-pop-radius"] = `${ch.popup.radius}px`; }
  if (L.shadow) { attrs["tm-pop-shadow"] = ch.popup.shadow; vars["--tm-pop-shadow"] = L.shadow; }
  if (ch.popup.open !== "none" && !env.motionOff) attrs["tm-pop-open"] = ch.popup.open;
  if (ch.popup.drawerBar) attrs["tm-drawer-bar"] = "1";
  if (L.theadBg) { attrs["tm-thead"] = ch.table.head; vars["--tm-thead-bg"] = L.theadBg; vars["--tm-thead-tx"] = L.theadTx!; }
  if (L.rowSel) { attrs["tm-rowsel"] = "strong"; vars["--tm-rowsel"] = L.rowSel; }
  if (ch.input.focus !== "default") { attrs["tm-focus"] = ch.input.focus; vars["--tm-focus"] = L.focus; vars["--tm-focus-ring"] = L.focusRing; vars["--tm-ring-w"] = `${ch.input.ring}px`; }
  if (ch.button2 !== "default") attrs["tm-btn2"] = ch.button2;
  if (ch.badgeShape !== "pill") attrs["tm-badge-shape"] = ch.badgeShape;
  if (ch.checks) attrs["tm-checks"] = "1";
  if (ch.menu.selected !== "default") attrs["tm-menu-sel"] = ch.menu.selected;
  if (ch.menu.radius !== null) { attrs["tm-menu-radius"] = "1"; vars["--tm-menu-radius"] = `${ch.menu.radius}px`; }
  if (ch.toast.position !== "top-right") attrs["tm-toast-pos"] = ch.toast.position;
  if (ch.toast.style !== "solid") attrs["tm-toast-style"] = ch.toast.style;
  if (ch.scrollbar !== "default") attrs["tm-scrollbar"] = ch.scrollbar;
  if (ch.icon.stroke !== "normal") { attrs["tm-icon-sw"] = ch.icon.stroke; vars["--tm-icon-sw"] = String(ICON_STROKE[ch.icon.stroke]); }
  if (ch.icon.tint) attrs["tm-icon-tint"] = "1";
  return { attrs, vars };
}

/** attr ทั้งหมดที่ chromeEffects + การผูกชิ้นส่วนเดิม (components.*) อาจตั้ง — รวมเข้า EFFECT_ATTRS */
export const CHROME_ATTRS = [
  "tm-pop-head", "tm-backdrop", "tm-pop-radius", "tm-pop-shadow", "tm-pop-open", "tm-drawer-bar", "tm-thead", "tm-rowsel",
  "tm-focus", "tm-btn2", "tm-badge-shape", "tm-checks", "tm-menu-sel", "tm-menu-radius", "tm-toast-pos", "tm-toast-style",
  "tm-scrollbar", "tm-icon-sw", "tm-icon-tint",
  "tm-btnstyle", "tm-table", "tm-input", "tm-tabs",
] as const;
