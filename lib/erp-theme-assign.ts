// ============================================================
// แอปไหนใช้ธีมไหน (ธีมกลาง ERP เฟส 3 · pure) — docs/erp-theme.md
//   ลำดับ: ธีมของแอป → ธีมบริษัท → ไม่มี (= หน้าตาเดิมของระบบ ไม่ทาอะไร)
//   สีแถบบนเดิมของแอป (theme_color / รูป) ชนะธีมเฉพาะแถบบน (เจ้าของเลือก "คงสีเดิมไว้" 2026-11-24)
// เทสต์: lib/__tests__/erp-theme-assign.test.ts
// ============================================================
import type { CSSProperties } from "react";
import { isLightColor, primaryScale, type ErpThemeConfig } from "./erp-theme-config";

export const COMPANY_SCOPE = "company";
export const appScope = (appKey: string) => `app:${appKey}`;
export const appKeyOfScope = (scope: string) => (scope.startsWith("app:") ? scope.slice(4) : null);
export const isThemeScope = (s: unknown): s is string =>
  typeof s === "string" && (s === COMPANY_SCOPE || /^app:[a-z0-9_-]{1,60}$/i.test(s));

/** ธีมที่เผยแพร่แล้วซึ่งทุกคนโหลดไปใช้ (/api/themes/active) */
export type ActiveThemes = {
  company: { theme_id: string; config: ErpThemeConfig } | null;
  apps: Record<string, { theme_id: string; config: ErpThemeConfig }>;
};
export const EMPTY_ACTIVE: ActiveThemes = { company: null, apps: {} };

/** ธีมที่แอปนี้ควรใช้ (null = ไม่มีธีม → หน้าตาเดิม) */
export function themeForApp(active: ActiveThemes | null | undefined, appKey: string | null | undefined): ErpThemeConfig | null {
  if (!active) return null;
  if (appKey && active.apps[appKey]) return active.apps[appKey].config;
  return active.company?.config ?? null;
}

export type AppHeaderFields = {
  theme_color?: string | null; theme_color2?: string | null; header_style?: string | null; header_image?: string | null;
};

/** แอปนี้ตั้งสีแถบบน/รูปแถบบนไว้เองไหม (= ยังคุมแถบบนเอง ไม่ตามธีม) */
export function hasOwnHeader(a: AppHeaderFields | null | undefined): boolean {
  if (!a) return false;
  return !!a.theme_color || !!a.theme_color2 || (a.header_style === "image" && !!a.header_image);
}

/** ค่าที่ใช้ล้างสีแถบบนเดิม (ให้ตามธีม) */
export const CLEAR_HEADER: Required<AppHeaderFields> = { theme_color: null, theme_color2: null, header_style: "gradient", header_image: null };

/** สไตล์แถบบนตามธีม (สีหลักเข้ม หรือไล่สีถ้าเปิดไว้ที่แถบบน) */
export function themeTopbarStyle(cfg: ErpThemeConfig): CSSProperties {
  const base = cfg.colors.parts.topbar ?? primaryScale(cfg)[600];
  const color = isLightColor(base) && !cfg.gradient.spots.top ? "#0f172a" : undefined;
  return cfg.gradient.spots.top
    ? { backgroundImage: `linear-gradient(${cfg.gradient.angle}deg, ${base}, ${cfg.gradient.color2})` }
    : { backgroundColor: base, ...(color ? { color } : {}) };
}

export type AssignChange = { scope: string; theme_id: string | null };

/** เทียบค่าเดิมกับร่าง → รายการที่ต้องบันทึก (null = กลับไปตามธีมบริษัท/ไม่มี) */
export function diffAssignments(before: Record<string, string>, draft: Record<string, string | null>): AssignChange[] {
  const out: AssignChange[] = [];
  for (const [scope, id] of Object.entries(draft)) {
    const old = before[scope] ?? null;
    if ((id ?? null) !== old) out.push({ scope, theme_id: id ?? null });
  }
  return out;
}

/** นับว่าแต่ละธีมถูกใช้กี่ที่ (บริษัทนับเป็น 1) */
export function usageByTheme(rows: { scope: string; theme_id: string }[]): Record<string, { apps: string[]; company: boolean }> {
  const out: Record<string, { apps: string[]; company: boolean }> = {};
  for (const r of rows) {
    const u = (out[r.theme_id] ??= { apps: [], company: false });
    if (r.scope === COMPANY_SCOPE) u.company = true;
    else { const k = appKeyOfScope(r.scope); if (k) u.apps.push(k); }
  }
  return out;
}
