/**
 * กติกา "ดึงสินค้าจากร้านเฉพาะตัวที่เปลี่ยน" (pure + เทสต์ lib/__tests__/catalog-refresh-plan.test.ts)
 * --------------------------------------------------------------------------
 * เจ้าของเลือก 2026-11-21 (บั๊ก LY22 ลง Lazada แล้วแต่ระบบไม่รู้ · ข้อ 1-3):
 *   รายการสินค้าบนร้าน (platform_catalog_listings) ของ Lazada/Shopee เดิมอัปเดตเฉพาะตอนกด "ดึงสินค้าจากร้าน"
 *   → ลงสินค้าทางอื่น (BigSeller / Seller Center) แล้วระบบไม่รู้ → แท็บแพลตฟอร์มขึ้น "พร้อมลง" + เสี่ยงลงซ้ำ
 *   แก้: ดึงเฉพาะตัวที่แก้/สร้างหลังรอบก่อน (ทุกชั่วโมง + ก่อนลงจริง + ปุ่ม "เช็กกับร้านตอนนี้") — ตัวดึง app/api/platform-catalog/refresh-changed
 *
 * สถานะต่อร้าน เก็บใน ui_config `catalog_refresh:<platform>:<brand_id>` (ไม่มีตารางใหม่):
 *   last_done_at = "ข้อมูลครบถึงเวลานี้" (เวลาเริ่มของรอบล่าสุดที่ดึงครบ) — รอบถัดไปเริ่มจากตรงนี้ (ถอยเผื่อ OVERLAP_MS)
 *   run = รอบที่ยังดึงไม่ครบ (หมดเวลากลางทาง) → รอบถัดไปทำต่อจาก cursor เดิม ด้วยช่วงเวลาเดิม
 * ห้าม import "@/..." (ใช้ได้ทั้งหน้าเว็บ/หลังบ้าน/เทสต์)
 */

export const CATALOG_REFRESH_PREFIX = "catalog_refresh:";
export const catalogRefreshKey = (platform: string, brandId: string): string => `${CATALOG_REFRESH_PREFIX}${platform}:${brandId}`;

/** ถอยเวลาเริ่มเผื่อ (นาฬิการ้านเหลื่อม / ตัวที่แก้ระหว่างรอบ) */
export const OVERLAP_MS = 10 * 60_000;
/** ข้อมูลร้านเก่ากว่านี้ = "เก่า" (เตือนในแถว · ก่อนลงจริงถ้าเช็กกับร้านไม่สำเร็จ = ไม่ให้ลง) */
export const CATALOG_STALE_MS = 2 * 3600_000;
/** รอบค้างเก่ากว่านี้ = ทิ้ง เริ่มใหม่จาก last_done_at */
export const RUN_MAX_AGE_MS = 6 * 3600_000;

export type CatalogRefreshRun = { since: string; started_at: string; cursor: string };
export type CatalogRefreshState = {
  last_done_at: string | null;
  run: CatalogRefreshRun | null;
  last_at: string | null;
  ok: boolean;
  error: string | null;
  saved?: number;
};

const ms = (iso: string | null | undefined): number | null => { const t = Date.parse(String(iso ?? "")); return Number.isFinite(t) ? t : null; };

export function normalizeRefreshState(v: unknown): CatalogRefreshState {
  const o = (v && typeof v === "object" && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
  const run = o.run && typeof o.run === "object" ? o.run as Record<string, unknown> : null;
  return {
    last_done_at: ms(o.last_done_at as string) != null ? String(o.last_done_at) : null,
    run: run && ms(run.since as string) != null && ms(run.started_at as string) != null
      ? { since: String(run.since), started_at: String(run.started_at), cursor: String(run.cursor ?? "") } : null,
    last_at: ms(o.last_at as string) != null ? String(o.last_at) : null,
    ok: o.ok !== false,
    error: o.error == null ? null : String(o.error),
    ...(typeof o.saved === "number" ? { saved: o.saved } : {}),
  };
}

/**
 * รอบนี้ดึงตั้งแต่เมื่อไร · ต่อจาก cursor ไหน
 * fallbackSinceMs = ไม่เคยมีรอบ (ใช้เวลาที่ดึงแบบเต็มครั้งล่าสุด) · null = ไม่รู้เลย → ไม่ดึง (ให้กดดึงแบบเต็มก่อน 1 ครั้ง)
 */
export function planRefreshWindow(state: CatalogRefreshState, nowMs: number, fallbackSinceMs: number | null):
  { sinceMs: number; startedAtMs: number; cursor: string; resumed: boolean } | null {
  const run = state.run;
  const runStarted = ms(run?.started_at);
  if (run && runStarted != null && nowMs - runStarted < RUN_MAX_AGE_MS) {
    return { sinceMs: ms(run.since) as number, startedAtMs: runStarted, cursor: run.cursor, resumed: true };
  }
  const base = ms(state.last_done_at) ?? fallbackSinceMs;
  if (base == null) return null;
  return { sinceMs: Math.min(base, nowMs) - OVERLAP_MS, startedAtMs: nowMs, cursor: "", resumed: false };
}

/** สถานะใหม่หลังจบรอบ (ครบ / ค้าง / พลาด) */
export function finishRefreshState(prev: CatalogRefreshState, r: {
  sinceMs: number; startedAtMs: number; cursor: string; done: boolean; error: string | null; saved: number;
}, nowMs: number): CatalogRefreshState {
  const at = new Date(nowMs).toISOString();
  if (r.done && !r.error) return { last_done_at: new Date(r.startedAtMs).toISOString(), run: null, last_at: at, ok: true, error: null, saved: r.saved };
  return {
    last_done_at: prev.last_done_at,
    run: { since: new Date(r.sinceMs).toISOString(), started_at: new Date(r.startedAtMs).toISOString(), cursor: r.cursor },
    last_at: at, ok: !r.error, error: r.error, saved: r.saved,
  };
}

/** ข้อมูลร้านเก่าไหม (ไม่รู้เวลา = เก่า) */
export const isCatalogStale = (atIso: string | null | undefined, nowMs: number, staleMs = CATALOG_STALE_MS): boolean => {
  const t = ms(atIso); return t == null || nowMs - t > staleMs;
};

/** "20 นาทีก่อน" / "3 ชม.ก่อน" / "8 วันก่อน" / "ยังไม่เคยดึง" */
export function catalogAgeText(atIso: string | null | undefined, nowMs: number): string {
  const t = ms(atIso);
  if (t == null) return "ยังไม่เคยดึง";
  const min = Math.max(0, Math.round((nowMs - t) / 60_000));
  if (min < 2) return "เมื่อสักครู่";
  if (min < 60) return `${min} นาทีก่อน`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} ชม.ก่อน`;
  return `${Math.round(h / 24)} วันก่อน`;
}
