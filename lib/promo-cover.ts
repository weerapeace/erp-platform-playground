/**
 * 🖼 เปลี่ยนปกโปรทุกร้าน — กติกากลาง (pure · ใช้ทั้งหน้าเว็บและหลังบ้าน · เทสต์ lib/__tests__/promo-cover.test.ts)
 *   เจ้าของขอ 2026-11-20: "เปลี่ยนรูปปก ทีเดียวทุก Platforms … ทำ Promotion แล้วต้องแก้รูปปก"
 *   เลือกจาก widget: แบบตัวอย่าง (PC+มือถือ) + 1 กรอบโปรอัตโนมัติ + 2 TikTok/Lazada ส่งล่วงหน้า + 3 แจ้งเตือนเมื่อล้มเหลว
 *
 * ชุดโปร (campaign) = หลายรุ่น × หลายร้าน · ตั้งเวลาเริ่ม-จบ · จบแล้วย้อนเป็นปกเดิมอัตโนมัติ
 *   ปกโปร "แทนที่รูปแรก" ของสินค้าบนร้าน (รูปอื่นคงเดิม) · ตอนส่งจดชุดรูปเดิมไว้ (before_refs) → ย้อน = เอารูปแรกเดิมกลับ
 *   ย้อนเฉพาะเมื่อรูปแรกบนร้านยังเป็นปกโปรของเรา — มีคนเปลี่ยนเองระหว่างโปร = "conflict" ไม่ทับ (กดย้อนทับเองได้)
 * ร้านที่ต้องรอตรวจ (TikTok · Lazada) ส่งก่อนเวลาเริ่ม early_hours ชั่วโมง (ปกขึ้นทันเวลาโปร)
 * ฝั่งเซิร์ฟเวอร์ (ยิงร้านจริง) = lib/promo-cover-server.ts · หน้า = /master/promo-covers · คู่มือ docs/promo-covers.md
 */

export const PROMO_PLATFORMS = ["shopee", "lazada", "tiktok", "line_shopping", "website"] as const;
export type PromoPlatform = (typeof PROMO_PLATFORMS)[number];
export const isPromoPlatform = (v: unknown): v is PromoPlatform => typeof v === "string" && (PROMO_PLATFORMS as readonly string[]).includes(v);

export const PLATFORM_LABEL: Record<PromoPlatform, string> = {
  shopee: "Shopee", lazada: "Lazada", tiktok: "TikTok", line_shopping: "LINE SHOPPING", website: "เว็บเรา",
};
/** ร้านที่เปลี่ยนรูปแล้วต้องรอร้านตรวจก่อนขึ้นจริง → ส่งล่วงหน้า */
export const REVIEW_PLATFORMS: ReadonlySet<PromoPlatform> = new Set<PromoPlatform>(["tiktok", "lazada"]);
export const PLATFORM_NOTE: Record<PromoPlatform, string> = {
  shopee: "เปลี่ยนทันที",
  lazada: "Lazada ตรวจรูปใหม่ (QC) ไม่เกิน 24 ชม. — ส่งล่วงหน้า",
  tiktok: "TikTok ตรวจก่อนขึ้น (ระหว่างตรวจยังโชว์ปกเดิม) — ส่งล่วงหน้า",
  line_shopping: "เปลี่ยนทันที",
  website: "เปลี่ยนทันที",
};
/** FB/IG Shop ไม่มีทางส่งตรง — ดึงสินค้าจากเว็บเรา (feed) ปกเปลี่ยนตามเว็บเอง */
export const META_NOTE = "FB/IG Shop ดึงสินค้าจากเว็บเรา — ติ๊ก \"เว็บเรา\" แล้วปกบน FB/IG จะเปลี่ยนตามเมื่อ Meta ดึงรอบถัดไป (ร้าน FB/IG ยังไม่เปิด)";

export type CampaignStatus = "draft" | "scheduled" | "live" | "ended" | "cancelled";
export type TargetStatus = "pending" | "applied" | "review" | "failed" | "skipped" | "reverted" | "revert_failed" | "conflict";
export type Tone = "neutral" | "info" | "ok" | "warn" | "bad" | "muted";

export const CAMPAIGN_STATUS: Record<CampaignStatus, { label: string; tone: Tone }> = {
  draft: { label: "ร่าง", tone: "neutral" },
  scheduled: { label: "รอเริ่ม", tone: "info" },
  live: { label: "กำลังใช้", tone: "ok" },
  ended: { label: "จบแล้ว", tone: "muted" },
  cancelled: { label: "ยกเลิก", tone: "muted" },
};
export const TARGET_STATUS: Record<TargetStatus, { label: string; tone: Tone }> = {
  pending: { label: "รอส่ง", tone: "neutral" },
  applied: { label: "ขึ้นปกโปรแล้ว", tone: "ok" },
  review: { label: "รอร้านตรวจ", tone: "warn" },
  failed: { label: "ส่งไม่ผ่าน", tone: "bad" },
  skipped: { label: "ข้าม", tone: "muted" },
  reverted: { label: "ย้อนปกเดิมแล้ว", tone: "muted" },
  revert_failed: { label: "ย้อนไม่ผ่าน", tone: "bad" },
  conflict: { label: "มีคนเปลี่ยนปกเอง", tone: "warn" },
};
/** สถานะที่ "ปกโปรอยู่บนร้าน" (ต้องย้อนก่อนลบ/จบ) */
export const ON_SHOP: ReadonlySet<TargetStatus> = new Set<TargetStatus>(["applied", "review", "revert_failed"]);
/** สถานะที่ต้องแจ้งเตือน (ข้อเสนอ 3) */
export const ALERT_STATUS: ReadonlySet<TargetStatus> = new Set<TargetStatus>(["failed", "revert_failed", "conflict"]);
/** ย้อนตอนร้าน (TikTok/Lazada) ยังตรวจปกโปรไม่เสร็จ — บนร้านยังเป็นปกเดิม ถ้าถือว่า "ย้อนแล้ว" ปกโปรจะขึ้นค้างหลังตรวจเสร็จ → รอแล้วลองใหม่ */
export const STILL_IN_REVIEW = "ร้านยังตรวจปกโปรไม่เสร็จ (บนร้านยังเป็นปกเดิม) — ระบบจะลองย้อนใหม่ทุก 5 นาทีจนร้านตรวจเสร็จ · ถ้าร้านไม่ผ่านปกโปร กด \"ย้อนทับเลย\"";
/** เช็กซ้ำหลังย้อน (ร้านที่ต้องตรวจรูป) — รอกี่ชั่วโมงหลังย้อนค่อยดูบนร้าน · ตรวจนานเกินนี้ = แจ้งเตือน */
export const REVERT_CHECK_AFTER_H: Partial<Record<PromoPlatform, number>> = { tiktok: 1, lazada: 24 };
export const REVERT_CHECK_GIVE_UP_H = 72;
export function isRevertCheckDue(platform: PromoPlatform, revertedAt: string | null | undefined, now = Date.now()): boolean {
  const h = REVERT_CHECK_AFTER_H[platform];
  const t = revertedAt ? Date.parse(revertedAt) : NaN;
  return h != null && Number.isFinite(t) && now - t >= h * 3600_000;
}
export type RevertCheck = { verdict: "ok" | "wait" | "stuck" | "changed"; reason?: string };
/**
 * ผลบนร้านหลังย้อน: ok = ปกเดิมขึ้นแล้ว · wait = ร้านยังตรวจ (ดูใหม่รอบหน้า) · stuck = ร้านไม่ผ่าน/ปกโปรยังค้าง (แจ้งเตือน) · changed = มีคนเปลี่ยนรูปแรกเอง (จบ ไม่ทับ)
 */
export function checkReverted(i: { current: string | null | undefined; original: string | null | undefined; applied: string | null | undefined; reviewing: boolean; rejected: readonly string[]; revertedAt: string | null | undefined; now?: number; same?: (a: string, b: string) => boolean }): RevertCheck {
  const same = i.same ?? ((a: string, b: string) => sameImageRef(a, b));
  if (i.rejected.length) return { verdict: "stuck", reason: `ร้านไม่ผ่านรูปเดิม: ${i.rejected[0]}`.slice(0, 300) };
  if (i.reviewing) {
    const t = i.revertedAt ? Date.parse(i.revertedAt) : NaN;
    if (Number.isFinite(t) && (i.now ?? Date.now()) - t > REVERT_CHECK_GIVE_UP_H * 3600_000) return { verdict: "stuck", reason: `ร้านตรวจรูปเดิมนานเกิน ${REVERT_CHECK_GIVE_UP_H / 24} วัน — เข้าไปดูที่หลังร้าน` };
    return { verdict: "wait" };
  }
  if (!i.current) return { verdict: "stuck", reason: "บนร้านไม่มีรูปแรก — เข้าไปดูที่หลังร้าน" };
  if (i.original && same(i.current, i.original)) return { verdict: "ok" };
  if (i.applied && same(i.current, i.applied)) return { verdict: "stuck", reason: "ปกโปรยังอยู่บนร้าน (ร้านไม่เปลี่ยนกลับเป็นปกเดิม) — กดลองใหม่" };
  return { verdict: "changed" };
}
export const REVERT_CHECK_OK = "ร้านตรวจแล้ว — ปกเดิมขึ้นร้านแล้ว";
export const REVERT_CHECK_CHANGED = "หลังย้อน มีคนเปลี่ยนรูปแรกบนร้านเองแล้ว (ไม่ใช่ปกโปรของเรา)";

/** ร้านยังตรวจไม่เสร็จไหม: สถานะ review + รูปแรกบนร้านยังเป็นปกเดิม (ไม่ใช่ปกโปร) */
export function stillInReview(status: TargetStatus, current: string | null | undefined, applied: string | null | undefined, original: string | null | undefined, same: (a: string, b: string) => boolean = (a, b) => sameImageRef(a, b)): boolean {
  if (status !== "review" || !current || !original) return false;
  return same(current, original) && !(applied && same(current, applied));
}

export type CampaignTiming = {
  status: CampaignStatus;
  starts_at: string | null;
  ends_at: string | null;
  auto_revert: boolean;
  early_hours: number;
  confirmed_at: string | null;
  revert_requested_at: string | null;
  deleted_at?: string | null;
};

const ms = (iso: string | null | undefined): number | null => { if (!iso) return null; const t = Date.parse(iso); return Number.isFinite(t) ? t : null; };

/** เวลาที่ร้านนี้ "ควรส่ง" ปกโปร · null = ยังไม่ยืนยัน (ร่าง) */
export function applyDueAt(c: CampaignTiming, platform: PromoPlatform): number | null {
  if (c.status === "draft" || c.status === "cancelled" || !c.confirmed_at) return null;
  const start = ms(c.starts_at) ?? ms(c.confirmed_at);
  if (start == null) return null;
  return REVIEW_PLATFORMS.has(platform) ? start - Math.max(0, c.early_hours) * 3600_000 : start;
}

/** ถึงเวลาส่งปกโปรของร้านนี้หรือยัง (ยังไม่ถึงเวลาย้อน) */
export function isApplyDue(c: CampaignTiming, platform: PromoPlatform, now = Date.now()): boolean {
  if (c.deleted_at || (c.status !== "scheduled" && c.status !== "live")) return false;
  if (isRevertDue(c, now)) return false;
  const due = applyDueAt(c, platform);
  return due != null && now >= due;
}

/** ถึงเวลาย้อนปกเดิมหรือยัง: กดย้อนเอง · หรือ ตั้งย้อนอัตโนมัติ + ถึงเวลาจบ */
export function isRevertDue(c: CampaignTiming, now = Date.now()): boolean {
  if (c.status === "draft" || c.status === "ended") return false;
  if (c.revert_requested_at) return true;
  const end = ms(c.ends_at);
  return c.auto_revert && end != null && now >= end;
}

/** ปกโปรแทนที่รูปแรก (รูปอื่นคงเดิม · ไม่มีรูปเลย = ปกโปรรูปเดียว) */
export function swapCover<T>(list: readonly T[], promo: T): T[] {
  return [promo, ...list.slice(1)];
}

/** ลิงก์รูปแบบเทียบได้ (ตัด https/http · query · ขนาดต่อท้ายแบบ _tn) */
export function sameImageRef(a: string | null | undefined, b: string | null | undefined): boolean {
  const n = (s: string | null | undefined) => {
    const v = String(s ?? "").trim().replace(/^https?:\/\//i, "").replace(/[?#].*$/, "").replace(/_tn$/i, "").replace(/\/+$/, "");
    // Lazada: ไฟล์เดียวกันอยู่ได้หลายชื่อเซิร์ฟเวอร์ (sg-test-11 / th-live-01 / lazcdn) + ต่อท้ายขนาด _720x720q80 → เทียบชื่อไฟล์
    const laz = /^[^/]*(?:slatic\.net|lazcdn\.com|alicdn\.com)\/(?:.*\/)?p\/([^/]+?)\.(?:jpe?g|png|webp)/i.exec(v);
    return laz ? `lazada:${laz[1].toLowerCase()}` : v;
  };
  const x = n(a); const y = n(b);
  return !!x && x === y;
}

/**
 * ย้อนปกเดิม: รูปแรกบนร้านตอนนี้ต้องยังเป็นปกโปรของเรา (force = ทับเลย)
 *   ok → ชุดรูปที่จะส่ง (รูปแรกเดิม + รูปที่เหลือตามที่อยู่บนร้านตอนนี้ — ไม่ลบรูปที่คนเพิ่มทีหลัง)
 */
export function restoreCover(current: readonly string[], applied: string | null, original: string | null, opts: { force?: boolean; same?: (a: string, b: string) => boolean } = {}):
  { ok: true; list: string[]; already: boolean } | { ok: false; reason: string } {
  const same = opts.same ?? ((a: string, b: string) => sameImageRef(a, b));
  if (!original) return { ok: false, reason: "ไม่มีข้อมูลปกเดิม — ย้อนอัตโนมัติไม่ได้" };
  if (current[0] && same(current[0], original)) return { ok: true, list: [...current], already: true };
  if (!opts.force && (!applied || !current[0] || !same(current[0], applied))) {
    return { ok: false, reason: "รูปแรกบนร้านไม่ใช่ปกโปรของเราแล้ว (มีคนเปลี่ยนเองระหว่างโปร) — ไม่ย้อนทับ · ถ้าจะเอาปกเดิมกลับจริง กด \"ย้อนทับเลย\"" };
  }
  const rest = current.slice(1).filter((r) => !same(r, original));
  return { ok: true, list: [original, ...rest], already: false };
}

/** สถานะบนร้านที่นับว่า "เปิดขายอยู่" (ร้านที่ปิดขาย ไม่เปลี่ยนปก — ลดการยิงร้าน/ส่งตรวจโดยไม่จำเป็น) */
export function listingOnSale(platform: PromoPlatform, status: string | null | undefined): boolean {
  const s = String(status ?? "").trim().toLowerCase();
  if (s === "removed") return false;
  if (platform === "shopee") return s === "normal";
  if (platform === "lazada") return s === "active";
  if (platform === "tiktok") return s === "activate";
  return true;   // LINE (ไม่มีสถานะในสำเนา) · เว็บ (กรองที่ is_published แล้ว)
}

/** ปกเดิมจากสำเนาย่อของร้านในระบบ (ไว้โชว์ก่อน/หลัง · ของจริงดึงสดตอนส่ง) */
export function coverFromRaw(platform: PromoPlatform, raw: unknown): string | null {
  const r = raw && typeof raw === "object" ? raw as Record<string, unknown> : null;
  const key = platform === "line_shopping" ? "line" : platform;
  const o = r?.[key] && typeof r[key] === "object" ? r[key] as Record<string, unknown> : null;
  if (!o) return null;
  const first = (v: unknown) => (Array.isArray(v) && typeof v[0] === "string" ? v[0] as string : null);
  const img = typeof o.image === "string" ? o.image : first(o.images) ?? first(o.imageUrls);
  return img && img.trim() ? img.trim() : null;
}

export type CampaignInput = {
  name: string;
  starts_at: string | null;
  ends_at: string | null;
  auto_revert: boolean;
  early_hours: number;
  platforms: string[];
};

/** ตรวจค่าชุดโปรก่อนบันทึก (ข้อความภาษาคน) */
export function validateCampaign(c: CampaignInput, opts: { forConfirm?: boolean; now?: number } = {}): string[] {
  const e: string[] = [];
  if (!c.name.trim()) e.push("ตั้งชื่อชุดโปรก่อน");
  if (c.name.trim().length > 120) e.push("ชื่อชุดโปรยาวเกิน 120 ตัวอักษร");
  const s = ms(c.starts_at); const en = ms(c.ends_at);
  if (c.starts_at && s == null) e.push("เวลาเริ่มไม่ถูกต้อง");
  if (c.ends_at && en == null) e.push("เวลาจบไม่ถูกต้อง");
  if (s != null && en != null && en <= s) e.push("เวลาจบต้องหลังเวลาเริ่ม");
  if (!Number.isInteger(c.early_hours) || c.early_hours < 0 || c.early_hours > 168) e.push("ส่งล่วงหน้าได้ 0–168 ชั่วโมง");
  if (c.platforms.some((p) => !isPromoPlatform(p))) e.push("มีร้านที่ระบบไม่รู้จัก");
  if (opts.forConfirm) {
    if (!c.platforms.length) e.push("เลือกร้านอย่างน้อย 1 ร้าน");
    if (en != null && en <= (opts.now ?? Date.now())) e.push("เวลาจบผ่านไปแล้ว — แก้เวลาจบก่อน");
    if (c.auto_revert && en == null) e.push("ตั้งให้ย้อนอัตโนมัติ ต้องใส่เวลาจบโปร");
  }
  return e;
}

export type TargetCounts = Record<TargetStatus, number> & { total: number };
export function countTargets(list: readonly { status: TargetStatus }[]): TargetCounts {
  const out = { total: 0, pending: 0, applied: 0, review: 0, failed: 0, skipped: 0, reverted: 0, revert_failed: 0, conflict: 0 } as TargetCounts;
  for (const t of list) { out[t.status] = (out[t.status] ?? 0) + 1; out.total++; }
  return out;
}

/**
 * สถานะชุดโปรหลังรอบทำงาน (คำนวณจากผลรายร้าน)
 *   scheduled + มีร้านขึ้นปกแล้ว = live · ถึงเวลาย้อน + ไม่เหลือร้านที่ปกโปรยังอยู่/รอส่ง = ended
 */
export function nextCampaignStatus(c: CampaignTiming, targets: readonly { status: TargetStatus }[], now = Date.now()): CampaignStatus {
  if (c.status === "draft" || c.status === "cancelled" || c.status === "ended") return c.status;
  const n = countTargets(targets);
  if (isRevertDue(c, now)) {
    const left = n.pending + n.applied + n.review;
    return left === 0 ? "ended" : c.status === "scheduled" && n.applied + n.review === 0 ? "scheduled" : "live";
  }
  if (n.applied + n.review + n.failed + n.conflict + n.revert_failed > 0) return "live";
  return c.status;
}

/** เวลาไทยแบบอ่านง่าย เช่น "12 ธ.ค. 00:00" */
export function thTime(iso: string | null | undefined): string {
  const t = ms(iso);
  if (t == null) return "—";
  return new Date(t).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

/** r2 key ของปกโปรที่ระบบสร้างจากกรอบ */
export const framedKeyOf = (campaignId: string, parentId: string, stamp: number) => `promo-covers/${campaignId}/${parentId}-${stamp}.jpg`;
/** r2 key สำเนาปกเดิม (กันรูปบนร้านหาย) */
export const backupKeyOf = (campaignId: string, targetId: string) => `promo-covers/${campaignId}/backup/${targetId}.jpg`;

/** ตัวตั้งเวลาเช็กทุกกี่นาที (ต้องตรงกับรอบของ /api/cron/promo-covers ใน vercel.json — แก้ที่นั่นต้องแก้ตรงนี้ด้วย) */
export const TICK_MIN = 5;
/** ปกจะเปลี่ยนช้าสุดกี่โมง (เวลาที่ตั้ง + รอบเช็ก) · null = ไม่ได้ตั้ง */
export function changeBy(iso: string | null | undefined): string | null {
  const t = ms(iso);
  return t == null ? null : new Date(t + TICK_MIN * 60_000).toISOString();
}
/** ช่วงโปรสั้นกว่ารอบเช็ก → ปกอาจไม่ได้เปลี่ยนเลย (ไม่ตั้งเริ่ม = นับจากตอนนี้) */
export function windowTooShort(startsAt: string | null | undefined, endsAt: string | null | undefined, now = Date.now()): boolean {
  const e = ms(endsAt);
  if (e == null) return false;
  return e - (ms(startsAt) ?? now) < TICK_MIN * 60_000;
}
/** ชื่อชุดใช้ซ้ำ: "โปร 12.12" → "โปร 12.12 (รอบ 2)" · "… (รอบ 2)" → "… (รอบ 3)" */
export function reuseName(name: string): string {
  const m = name.trim().match(/^(.*?)\s*\(รอบ\s*(\d+)\)$/);
  return m ? `${m[1]} (รอบ ${Number(m[2]) + 1})` : `${name.trim() || "ชุดโปร"} (รอบ 2)`;
}
