/**
 * 📡 สถานะการดึงออเดอร์ของแต่ละร้าน — pure · มีเทสต์ · ใช้ทั้งหน้าสถานะ (/master/platform-orders/pull-status) และตัวส่งกระดิ่งเตือน
 * เจ้าของขอ 2026-11-20: "อยากได้หน้าสถานะมี Animation ให้ดูด้วย ที่หน้าจะได้รู้ว่าอะไรมีปัญหา"
 *
 *   ok      = ดึงอัตโนมัติ รอบล่าสุดสำเร็จ
 *   slow    = ออเดอร์เข้า แต่ทางสำรอง/ข้อมูลไม่ครบ (เช่น เข้าทางเมลเท่านั้น)
 *   stale   = ตัวดึงเงียบเกินเวลา (ไม่มีรอบใหม่) — ตัวตั้งเวลาอาจหยุด
 *   error   = รอบล่าสุดล้ม
 *   token   = กุญแจร้านเหลือ ≤ 7 วัน ต้องกดต่อร้านใหม่
 *   off     = ยังไม่ได้เชื่อมร้าน / ยังไม่มีทางดึง
 * ลำดับความหนัก: error > stale > token > slow > ok > off
 */

export const PULL_PLATFORMS = ["shopee", "tiktok", "lazada", "line_shopping", "website"] as const;
export type PullPlatform = (typeof PULL_PLATFORMS)[number];
export const isPullPlatform = (p: unknown): p is PullPlatform => (PULL_PLATFORMS as readonly string[]).includes(String(p));

export type PullState = "ok" | "slow" | "stale" | "error" | "token" | "off";
export const PULL_STATE_META: Record<PullState, { label: string; tone: "success" | "warning" | "danger" | "muted" }> = {
  ok: { label: "ปกติ", tone: "success" },
  slow: { label: "ต้องดู", tone: "warning" },
  token: { label: "กุญแจใกล้หมด", tone: "warning" },
  stale: { label: "หยุดดึง", tone: "danger" },
  error: { label: "มีปัญหา", tone: "danger" },
  off: { label: "ยังไม่ต่อ", tone: "muted" },
};
export const PULL_STATE_RANK: Record<PullState, number> = { error: 0, stale: 1, token: 2, slow: 3, ok: 4, off: 5 };

/** ผลรอบดึงล่าสุดของ 1 ร้าน (ui_config `order_pull:<platform>:<brand>`) */
export type PullRun = { at: string; ok: boolean; created?: number; updated?: number; error?: string | null; fails?: number; last_ok_at?: string | null; manual?: boolean };

export const pullRunKey = (platform: string, brandId: string | null) => `order_pull:${platform}:${brandId ?? "all"}`;
export const PULL_RUN_PREFIX = "order_pull:";

/** รอบปกติทุก 15 นาที · เกินนี้ถือว่าเงียบ */
export const PULL_STALE_MIN = 45;
export const TOKEN_WARN_DAYS = 7;
/** รอบล้มติดกันกี่ครั้งถึงเตือนกระดิ่ง (15 นาที × 3 = 45 นาที) */
export const ALERT_FAILS = 3;

export type ShopPullInput = {
  platform: PullPlatform;
  brand_id: string | null;
  /** api = ดึงจาก API ร้าน · email = มีแต่เมล · direct = เว็บเราเอง (ส่งต่อทุกรอบ) · none = ยังไม่มีทาง */
  mode: "api" | "email" | "direct" | "none";
  run: PullRun | null;
  /** วินาทีจริงที่ต้องต่อร้านใหม่ (ms) · ไม่มี/ไม่หมด = null */
  token_expires_at: number | null;
  /** เวลาเมลสำรองส่งเข้ามาล่าสุด (ร้านที่ไม่มี API) */
  email_last_at?: string | null;
};

export type ShopPullHealth = { state: PullState; headline: string; fix: string | null; token_days_left: number | null; minutes_since_run: number | null };

const MIN = 60_000;
const minutesSince = (iso: string | null | undefined, now: number) => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0, Math.round((now - t) / MIN)) : null;
};
export function agoText(min: number | null): string {
  if (min == null) return "ไม่เคย";
  if (min < 1) return "เมื่อกี้";
  if (min < 60) return `${min} นาทีก่อน`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} ชม.ก่อน`;
  return `${Math.round(h / 24)} วันก่อน`;
}

export function shopPullHealth(s: ShopPullInput, now = Date.now()): ShopPullHealth {
  const tokenDays = s.token_expires_at ? Math.floor((s.token_expires_at - now) / 86_400_000) : null;
  const sinceRun = minutesSince(s.run?.at, now);
  const base = { token_days_left: tokenDays, minutes_since_run: sinceRun };

  if (s.mode === "none") return { ...base, state: "off", headline: "ยังไม่ได้เชื่อมร้าน — ออเดอร์ยังไม่เข้าระบบ", fix: "ต่อร้านที่หน้าบัญชีแพลตฟอร์ม" };
  if (s.mode === "email") {
    const m = minutesSince(s.email_last_at, now);
    return { ...base, state: "slow", headline: `เข้าทางเมลอย่างเดียว (ไม่รู้ราคา/สี) · เมลล่าสุด ${agoText(m)}`, fix: "เชื่อม API ของร้านเพื่อให้ได้ข้อมูลครบ" };
  }
  if (tokenDays != null && tokenDays < 0) return { ...base, state: "error", headline: "กุญแจร้านหมดอายุแล้ว — ดึงออเดอร์ไม่ได้", fix: "กด ต่อร้านใหม่ ที่หน้าบัญชีแพลตฟอร์ม" };
  if (!s.run) return { ...base, state: "stale", headline: "ยังไม่มีรอบดึงที่บันทึกไว้ — รอรอบถัดไป (ทุก 15 นาที) หรือกด ดึงตอนนี้", fix: null };
  if (!s.run.ok) {
    const n = s.run.fails ?? 1;
    return { ...base, state: "error", headline: `ดึงไม่สำเร็จ${n > 1 ? ` ${n} รอบติด` : ""}: ${s.run.error || "ไม่ทราบสาเหตุ"}`, fix: "กด ดึงตอนนี้ เพื่อลองใหม่ · ยังล้มอยู่ให้แจ้งทีมพัฒนา" };
  }
  if (sinceRun != null && sinceRun > PULL_STALE_MIN && s.mode === "api") {
    return { ...base, state: "stale", headline: `ตัวดึงเงียบไป ${agoText(sinceRun).replace("ก่อน", "")} (ปกติทุก 15 นาที)`, fix: "ตัวตั้งเวลาอาจหยุด — กด ดึงตอนนี้ แล้วแจ้งทีมพัฒนา" };
  }
  if (tokenDays != null && tokenDays <= TOKEN_WARN_DAYS) {
    return { ...base, state: "token", headline: `กุญแจร้านเหลือ ${tokenDays} วัน — ต้องกดต่อร้านใหม่ก่อนหมด`, fix: "กด ต่อร้านใหม่ ที่หน้าบัญชีแพลตฟอร์ม" };
  }
  const got = (s.run.created ?? 0) > 0 ? ` · ใหม่ ${s.run.created}` : "";
  return { ...base, state: "ok", headline: `ดึงล่าสุด ${agoText(sinceRun)}${got}`, fix: null };
}

/** นับจำนวนร้านต่อสถานะ (การ์ดสรุปหัวหน้า) */
export function countPullStates(list: readonly { state: PullState }[]): Record<PullState, number> {
  const c: Record<PullState, number> = { ok: 0, slow: 0, stale: 0, error: 0, token: 0, off: 0 };
  for (const x of list) c[x.state]++;
  return c;
}

export type PullAlert = { key: string; title: string; body: string };
/**
 * เรื่องที่ควรเด้งกระดิ่ง (ส่งวันละครั้งต่อเรื่อง — ตัวส่งกันซ้ำเอง)
 *   รอบล้มติดกัน ≥ 3 · กุญแจเหลือ ≤ 7 วัน/หมดแล้ว · ตัวดึงเงียบเกิน 45 นาที
 */
export function pullAlerts(list: readonly (ShopPullInput & { label: string })[], now = Date.now()): PullAlert[] {
  const out: PullAlert[] = [];
  for (const s of list) {
    if (s.mode !== "api") continue;
    const h = shopPullHealth(s, now);
    const id = `${s.platform}:${s.brand_id ?? "all"}`;
    if (h.state === "error" && (h.token_days_left != null && h.token_days_left < 0)) out.push({ key: `token:${id}`, title: `${s.label}: กุญแจร้านหมดอายุ ดึงออเดอร์ไม่ได้`, body: "กด ต่อร้านใหม่ ที่หน้าบัญชีแพลตฟอร์ม" });
    else if (h.state === "error" && (s.run?.fails ?? 0) >= ALERT_FAILS) out.push({ key: `fail:${id}`, title: `${s.label}: ดึงออเดอร์ไม่สำเร็จ ${s.run?.fails} รอบติด`, body: s.run?.error || "ไม่ทราบสาเหตุ" });
    else if (h.state === "stale" && s.run) out.push({ key: `stale:${id}`, title: `${s.label}: ตัวดึงออเดอร์เงียบไป`, body: h.headline });
    if (h.token_days_left != null && h.token_days_left >= 0 && h.token_days_left <= TOKEN_WARN_DAYS) out.push({ key: `token:${id}`, title: `${s.label}: กุญแจร้านเหลือ ${h.token_days_left} วัน`, body: "กด ต่อร้านใหม่ ที่หน้าบัญชีแพลตฟอร์ม ก่อนหมด ไม่งั้นออเดอร์จะหยุดเข้า" });
  }
  return out;
}

/** ส่งซ้ำได้ไหม (กันกระดิ่งท่วม — เรื่องเดิมวันละครั้ง) */
export function alertDue(lastSentIso: string | null | undefined, now = Date.now(), everyHours = 24): boolean {
  if (!lastSentIso) return true;
  const t = Date.parse(lastSentIso);
  return !Number.isFinite(t) || now - t >= everyHours * 3600_000;
}
