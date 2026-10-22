/**
 * ⏰ ตั้งเวลาเผยแพร่ธีม + 🎪 ธีมแคมเปญ (แท็บดีไซน์ ชุด 5) — ของกลาง ฟังก์ชันล้วน ใช้ได้ทั้ง API และหน้าจอ
 *
 * ตาราง store_theme_schedules (migration 202610300200):
 *   publish  = ถึงเวลา starts_at → เผยแพร่ธีมที่เก็บไว้ (+ หน้าแรก ถ้าติ๊ก) · เก็บ "สิ่งที่เห็นในพรีวิวตอนกดตั้งเวลา"
 *   campaign = ช่วง starts_at–ends_at → ทับหน้าตาด้วยธีมที่บันทึกไว้ (look) + ของตกแต่ง (festive) · หมดช่วงกลับธีมปกติเอง
 * ตัวทำงานจริง (DB) = lib/website-theme-schedule-db.ts · เวลาในหน้าจอ = เวลาไทยเสมอ (thaiLocalToIso / isoToThaiLocal)
 */
import { applySavedTheme, cleanSavedThemeScope, type SavedThemeScope } from "@/lib/website-saved-themes";
import { normalizeFestive, type FestiveLook } from "@/lib/website-site-design";
import type { SiteTheme } from "@/lib/website-theme";

export type ScheduleKind = "publish" | "campaign";
export type ScheduleStatus = "pending" | "done" | "cancelled" | "failed";

/** สำเนาธีมที่บันทึกไว้ ณ ตอนตั้งแคมเปญ (ลบธีมต้นทางแล้วแคมเปญยังใช้ได้) */
export interface CampaignLook {
  savedThemeId: string | null;
  name: string;
  scope: SavedThemeScope;
  theme: Record<string, unknown>;
}

export interface ThemeSchedule {
  id: string;
  shopId: string;
  kind: ScheduleKind;
  name: string;
  status: ScheduleStatus;
  startsAt: string;
  endsAt: string | null;
  /** publish: เผยแพร่หน้าแรกพร้อมกัน */
  includeHome: boolean;
  look: CampaignLook | null;
  festive: FestiveLook | null;
  note: string;
  versionNo: number | null;
  createdByName: string | null;
  createdAt: string;
  doneAt: string | null;
}

export const SCHEDULE_TABLE = "store_theme_schedules";
/** คอลัมน์ที่หน้าจอใช้ (ไม่ดึง theme/layout ก้อนใหญ่มาโชว์รายการ) */
export const SCHEDULE_LIST_SELECT = "id, shop_id, kind, name, status, starts_at, ends_at, look, festive, note, version_no, created_by_name, created_at, done_at, has_layout:layout->0->>id";

const str = (v: unknown) => (typeof v === "string" ? v : "");

export function scheduleFromRow(r: Record<string, unknown>): ThemeSchedule {
  const look = r.look && typeof r.look === "object" ? (r.look as Record<string, unknown>) : null;
  const scope = look ? cleanSavedThemeScope(look.scope) : null;
  return {
    id: str(r.id),
    shopId: str(r.shop_id),
    kind: r.kind === "campaign" ? "campaign" : "publish",
    name: str(r.name),
    status: (["pending", "done", "cancelled", "failed"] as const).find((s) => s === r.status) ?? "pending",
    startsAt: str(r.starts_at),
    endsAt: r.ends_at ? str(r.ends_at) : null,
    includeHome: r.has_layout != null || (Array.isArray(r.layout) && r.layout.length > 0),
    look: look && scope ? { savedThemeId: look.savedThemeId ? str(look.savedThemeId) : null, name: str(look.name), scope, theme: (look.theme ?? {}) as Record<string, unknown> } : null,
    festive: r.festive && typeof r.festive === "object" ? normalizeFestive(r.festive) : null,
    note: str(r.note),
    versionNo: typeof r.version_no === "number" ? r.version_no : null,
    createdByName: r.created_by_name ? str(r.created_by_name) : null,
    createdAt: str(r.created_at),
    doneAt: r.done_at ? str(r.done_at) : null,
  };
}

/* ─────────── เวลาไทย ↔ ISO ─────────── */

const TH_OFFSET = 7 * 3600e3;
/** "YYYY-MM-DDTHH:mm" (เวลาไทย จาก ERPDateTime24) → ISO · ผิดรูปแบบ = null */
export function thaiLocalToIso(v: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const t = Date.UTC(y, mo - 1, d, h, mi) - TH_OFFSET;
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
/** ISO → "YYYY-MM-DDTHH:mm" เวลาไทย (ใส่ช่อง ERPDateTime24) */
export function isoToThaiLocal(iso: string | null | undefined): string {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? new Date(t + TH_OFFSET).toISOString().slice(0, 16) : "";
}
/** "11 พ.ย. 2569 00:00" (เวลาไทย) */
export function fmtThaiDateTime(iso: string | null | undefined): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return "-";
  const d = new Date(t);
  const date = d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" });
  const time = d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" });
  return `${date} ${time}`;
}

/* ─────────── ตรวจค่าที่ส่งมา ─────────── */

type Ok<T> = { ok: true; value: T } | { ok: false; error: string };
const MIN_AHEAD = 60e3;
const MAX_AHEAD = 366 * 864e5;
const MAX_CAMPAIGN = 120 * 864e5;

const isoOf = (v: unknown): string | null => {
  const t = typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

export interface PublishInput {
  at: string;
  includeHome: boolean;
  note: string;
}
export function sanitizePublishInput(raw: unknown, now = Date.now()): Ok<PublishInput> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const at = isoOf(r.at);
  if (!at) return { ok: false, error: "เลือกวันและเวลาที่จะเผยแพร่" };
  const t = Date.parse(at);
  if (t < now + MIN_AHEAD) return { ok: false, error: "เวลาต้องอยู่ในอนาคตอย่างน้อย 1 นาที" };
  if (t > now + MAX_AHEAD) return { ok: false, error: "ตั้งล่วงหน้าได้ไม่เกิน 1 ปี" };
  return { ok: true, value: { at, includeHome: r.includeHome === true, note: str(r.note).trim().slice(0, 300) } };
}

export interface CampaignInput {
  name: string;
  startsAt: string;
  endsAt: string;
  savedThemeId: string | null;
  festive: FestiveLook | null;
  note: string;
}
export function sanitizeCampaignInput(raw: unknown, now = Date.now()): Ok<CampaignInput> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const name = str(r.name).replace(/\s+/g, " ").trim().slice(0, 80);
  if (!name) return { ok: false, error: "ตั้งชื่อแคมเปญก่อน" };
  const startsAt = isoOf(r.startsAt);
  const endsAt = isoOf(r.endsAt);
  if (!startsAt || !endsAt) return { ok: false, error: "เลือกวันเริ่มและวันจบ" };
  const s = Date.parse(startsAt);
  const e = Date.parse(endsAt);
  if (e <= s) return { ok: false, error: "วันจบต้องอยู่หลังวันเริ่ม" };
  if (e <= now) return { ok: false, error: "วันจบผ่านไปแล้ว" };
  if (e - s > MAX_CAMPAIGN) return { ok: false, error: "แคมเปญยาวได้ไม่เกิน 120 วัน" };
  if (s > now + MAX_AHEAD) return { ok: false, error: "ตั้งล่วงหน้าได้ไม่เกิน 1 ปี" };
  const savedThemeId = /^[0-9a-f-]{36}$/i.test(str(r.savedThemeId)) ? str(r.savedThemeId) : null;
  const festive = r.festive && typeof r.festive === "object" ? normalizeFestive(r.festive) : null;
  if (!savedThemeId && !festive) return { ok: false, error: "เลือกธีมหรือของตกแต่งอย่างน้อย 1 อย่าง" };
  return { ok: true, value: { name, startsAt, endsAt, savedThemeId, festive, note: str(r.note).trim().slice(0, 300) } };
}

/* ─────────── สถานะแคมเปญ ─────────── */

export type CampaignState = "upcoming" | "active" | "ended" | "cancelled";
export function campaignState(c: Pick<ThemeSchedule, "status" | "startsAt" | "endsAt">, now = Date.now()): CampaignState {
  if (c.status === "cancelled") return "cancelled";
  const s = Date.parse(c.startsAt);
  const e = Date.parse(c.endsAt ?? "");
  if (Number.isFinite(e) && now >= e) return "ended";
  return now >= s ? "active" : "upcoming";
}
export const CAMPAIGN_STATE_LABEL: Record<CampaignState, string> = { upcoming: "รอเริ่ม", active: "กำลังทำงาน", ended: "จบแล้ว", cancelled: "ยกเลิก" };

/** แคมเปญที่ทำงานอยู่ตอนนี้ — ทับกัน = อันที่เริ่มทีหลังชนะ */
export function activeCampaign<T extends Pick<ThemeSchedule, "kind" | "status" | "startsAt" | "endsAt">>(list: T[], now = Date.now()): T | null {
  return (
    list
      .filter((c) => c.kind === "campaign" && c.status === "pending" && campaignState(c, now) === "active")
      .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))[0] ?? null
  );
}

/** แคมเปญอื่นที่ช่วงเวลาทับกัน (เตือนในหน้าจอ) */
export function overlappingCampaigns<T extends Pick<ThemeSchedule, "id" | "kind" | "status" | "name" | "startsAt" | "endsAt">>(list: T[], c: { id?: string; startsAt: string; endsAt: string }): T[] {
  const s = Date.parse(c.startsAt);
  const e = Date.parse(c.endsAt);
  return list.filter((o) => o.kind === "campaign" && o.status === "pending" && o.id !== c.id && Date.parse(o.startsAt) < e && Date.parse(o.endsAt ?? "") > s);
}

/** ค่าใน theme.page ที่เป็น "การทำงานของร้าน" ไม่ใช่หน้าตา — แคมเปญแบบทั้งชุดไม่ทับ (ป้าย/ป๊อปอัป/แถบล่าง/คุกกี้ ฯลฯ คงตามธีมปกติ) */
const CAMPAIGN_KEEP_PAGE = ["priceFormat", "mobileNav", "chat", "searchEmpty", "cookie", "notFound", "thanks", "popup", "share", "login", "festive", "proof"] as const;

/** ใส่หน้าตาแคมเปญทับธีม: ธีมที่บันทึกไว้ (สี/ทั้งชุด) + ของตกแต่ง · เนื้อหาร้าน (โลโก้ เมนู ท้ายเว็บ) และการทำงานของร้านคงเดิม */
export function applyCampaign(theme: SiteTheme, c: Pick<ThemeSchedule, "look" | "festive">): SiteTheme {
  let t = c.look ? applySavedTheme(theme, c.look) : theme;
  if (c.look?.scope === "full") {
    const keep = Object.fromEntries(CAMPAIGN_KEEP_PAGE.map((k) => [k, theme.page[k]]));
    t = { ...t, page: { ...t.page, ...keep } };
  }
  if (c.festive) t = { ...t, page: { ...t.page, festive: c.festive } };
  return t;
}
