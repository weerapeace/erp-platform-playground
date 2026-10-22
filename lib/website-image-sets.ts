/**
 * 🖼 ชุดรูปกลาง (Image sets) — เปลี่ยนรูปครั้งเดียว ทุกที่ที่ผูกไว้เปลี่ยนตาม (คอม + มือถือ) · กฎ + ตัวแทนรูป (pure · ทดสอบได้)
 * ส่วน DB: lib/website-image-sets-db.ts · แผง: components/website-image-sets-panel.tsx · ช่องรูปกลาง ImageUploadField มีปุ่ม "🔗 ชุดรูป"
 *
 * ผูก = ช่องรูปเก็บค่า "imgset/<id>" (หน้าตาเหมือน r2 key → ผ่านตัวกรองช่องรูปเดิมทุกตัวโดยไม่ต้องแก้)
 * ส่งให้เว็บร้าน: API สาธารณะ (site/page) แทนค่าด้วยรูปปัจจุบันของชุด (resolveImageSets) —
 *   รูปคอม = ช่องนั้น · รูปมือถือ = ช่องคู่ (เช่น imageKey ↔ mobileImageKey) ถ้าที่นั้นมี · ลิงก์ของชุด = ช่อง href/link/url/target ข้าง ๆ
 *   จุดสำคัญของรูป = แผนที่ focus {r2key: {x,y}} → เว็บร้าน LoadImg ใส่ object-position ให้เอง
 * กันพลาด: ค่า imgset/ ที่หลุดไปถึงเว็บร้าน → /api/r2-image ส่งต่อไปรูปปัจจุบันของชุด (คอม)
 * ⏰ ตั้งเวลา: queue [{at, until?}] — ถึงเวลา = ใช้รูปนั้น · มี until = ใช้ชั่วคราวแล้วกลับรูปเดิม · เว็บร้านแคช 60 วิ (ไม่ต้องมี cron)
 * 📝 ร่าง: แก้รูป/จุดสำคัญในแท็บ = เก็บที่ draft (เว็บจริงยังเห็นรูปเดิม) · พรีวิว (?preview=1) เห็นร่าง · กด "ใช้รูปนี้" = ร่างขึ้นเว็บ (publishImageSetDraft)
 */

/** ค่าในช่องรูปที่แปลว่า "ใช้ชุดรูปนี้" */
export const IMGSET_RE = /^imgset\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
export const imgSetRef = (id: string) => `imgset/${id}`;
export const imgSetIdOf = (v: unknown): string | null => (typeof v === "string" ? IMGSET_RE.exec(v.trim())?.[1]?.toLowerCase() ?? null : null);

export const IMAGE_SET_MAX = 40;
export const IMAGE_SET_QUEUE_MAX = 10;
export const IMAGE_SET_HISTORY_MAX = 10;

/** รูป 1 ชุด ณ ช่วงเวลาหนึ่ง: คอม/มือถือ + จุดสำคัญ (%) ของแต่ละรูป */
export interface ImageSetVersion {
  desk: string | null;
  mob: string | null;
  fx: number;
  fy: number;
  mfx: number;
  mfy: number;
}
/** รูปที่ตั้งเวลาไว้ — at = เริ่มใช้ · until = กลับรูปเดิมเมื่อถึงเวลานี้ (null = ใช้ถาวร) */
export interface ImageSetScheduled extends ImageSetVersion {
  id: string;
  at: string;
  until: string | null;
}
export interface ImageSetHistory extends ImageSetVersion {
  at: string;
}
export interface ImageSet {
  id: string;
  name: string;
  /** ลิงก์ของชุด (ว่าง = ที่นั้นใช้ลิงก์ของตัวเอง) — /หน้าในเว็บ หรือ https:// */
  link: string;
  /** คำอธิบายรูป (alt · ช่วย SEO) — เติมให้ที่ที่ยังไม่ได้ใส่เอง */
  alt: string;
  cur: ImageSetVersion;
  /** 📝 ร่างที่ยังไม่ขึ้นเว็บ (พรีวิวเห็น · เว็บจริงยังใช้ cur/ตั้งเวลา) — null = ไม่มีร่าง */
  draft: ImageSetVersion | null;
  queue: ImageSetScheduled[];
  history: ImageSetHistory[];
}

const R2_KEY = /^[\w\-./%()]{3,300}$/;
const keyOf = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return R2_KEY.test(s) && !s.includes("..") && !IMGSET_RE.test(s) ? s : null;
};
const pct = (v: unknown, fb = 50) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : fb;
};
const isoOf = (v: unknown): string | null => {
  if (typeof v !== "string" || !v.trim()) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

export const EMPTY_VERSION: ImageSetVersion = { desk: null, mob: null, fx: 50, fy: 50, mfx: 50, mfy: 50 };

export function cleanVersion(raw: unknown): ImageSetVersion {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { desk: keyOf(o.desk), mob: keyOf(o.mob), fx: pct(o.fx), fy: pct(o.fy), mfx: pct(o.mfx), mfy: pct(o.mfy) };
}

/** ลิงก์ของชุด: หน้าในเว็บ (/...) หรือ http(s) เท่านั้น (กัน javascript:) */
export function cleanSetLink(v: unknown): string {
  const s = typeof v === "string" ? v.trim().slice(0, 500) : "";
  return /^(\/(?!\/)|https?:\/\/)/i.test(s) ? s : "";
}

export function cleanScheduled(raw: unknown, i = 0): ImageSetScheduled | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const at = isoOf(o.at);
  if (!at) return null;
  const until = isoOf(o.until);
  const v = cleanVersion(o);
  if (!v.desk && !v.mob) return null;
  const id = typeof o.id === "string" && /^[\w-]{1,40}$/.test(o.id) ? o.id : `q${Date.parse(at).toString(36)}${i}`;
  return { ...v, id, at, until: until && Date.parse(until) > Date.parse(at) ? until : null };
}

/** แถวจาก DB → ชุดรูป (ค่าแปลกถูกตัด) */
export function rowToImageSet(r: Record<string, unknown>): ImageSet {
  const queue = (Array.isArray(r.queue) ? r.queue : []).map((q, i) => cleanScheduled(q, i)).filter((q): q is ImageSetScheduled => !!q);
  const history = (Array.isArray(r.history) ? r.history : [])
    .map((h) => {
      const o = (h && typeof h === "object" ? h : {}) as Record<string, unknown>;
      const v = cleanVersion(o);
      return v.desk || v.mob ? { ...v, at: isoOf(o.at) ?? new Date(0).toISOString() } : null;
    })
    .filter((h): h is ImageSetHistory => !!h);
  return {
    id: String(r.id ?? ""),
    name: typeof r.name === "string" ? r.name.trim().slice(0, 60) : "",
    link: cleanSetLink(r.link),
    alt: typeof r.alt === "string" ? r.alt.trim().slice(0, 160) : "",
    cur: cleanVersion(r.cur),
    draft: ((d) => (d.desk || d.mob ? d : null))(cleanVersion(r.draft)),
    queue: queue.sort((a, b) => a.at.localeCompare(b.at)).slice(0, IMAGE_SET_QUEUE_MAX),
    history: history.slice(0, IMAGE_SET_HISTORY_MAX),
  };
}

/** รูปที่ใช้จริง ณ เวลา now: รูปตั้งเวลาที่ถึงเวลาแล้ว (ยังไม่หมดช่วง) ตัวล่าสุด · ไม่มี = รูปหลัก */
export function effectiveVersion(set: Pick<ImageSet, "cur" | "queue">, now = Date.now()): ImageSetVersion {
  let best: ImageSetScheduled | null = null;
  for (const q of set.queue) {
    const a = Date.parse(q.at);
    if (a > now || (q.until && Date.parse(q.until) <= now)) continue;
    if (!best || a >= Date.parse(best.at)) best = q;
  }
  return best ? { desk: best.desk ?? set.cur.desk, mob: best.mob, fx: best.fx, fy: best.fy, mfx: best.mfx, mfy: best.mfy } : set.cur;
}

/** ตั้งรูปหลักใหม่ → รูปเดิมเข้าประวัติ (ย้อนได้) */
export function withNewCurrent(set: ImageSet, next: ImageSetVersion, now = Date.now()): ImageSet {
  const same = set.cur.desk === next.desk && set.cur.mob === next.mob;
  const history = same || (!set.cur.desk && !set.cur.mob) ? set.history : [{ ...set.cur, at: new Date(now).toISOString() }, ...set.history].slice(0, IMAGE_SET_HISTORY_MAX);
  return { ...set, cur: next, history };
}

/** จัดคิวที่ถึงเวลาแล้ว: รูปถาวร (ไม่มี until) → กลายเป็นรูปหลัก (เดิมเข้าประวัติ) · ช่วงเวลาที่จบแล้ว → ทิ้ง */
export function settleImageSet(set: ImageSet, now = Date.now()): { set: ImageSet; changed: boolean } {
  let out = set;
  let changed = false;
  const keep: ImageSetScheduled[] = [];
  for (const q of [...set.queue].sort((a, b) => a.at.localeCompare(b.at))) {
    const started = Date.parse(q.at) <= now;
    if (started && !q.until) {
      out = withNewCurrent(out, { desk: q.desk ?? out.cur.desk, mob: q.mob, fx: q.fx, fy: q.fy, mfx: q.mfx, mfy: q.mfy }, Date.parse(q.at));
      changed = true;
    } else if (q.until && Date.parse(q.until) <= now) changed = true;
    else keep.push(q);
  }
  return { set: changed ? { ...out, queue: keep } : set, changed };
}

/** 📝 ใช้ร่างขึ้นเว็บ: เปลี่ยนรูป = รูปเดิมเข้าประวัติ · แค่ขยับจุดสำคัญ = ไม่นับเป็นประวัติ · ไม่มีร่าง = null */
export function publishImageSetDraft(set: ImageSet, now = Date.now()): ImageSet | null {
  const d = set.draft;
  if (!d) return null;
  const base = { ...set, draft: null };
  return d.desk === set.cur.desk && d.mob === set.cur.mob ? { ...base, cur: d } : withNewCurrent(base, d, now);
}

/** ย้อนไปรูปก่อนหน้า (ประวัติตัวแรก) — รูปปัจจุบันเข้าประวัติแทน */
export function undoImageSet(set: ImageSet, now = Date.now()): ImageSet | null {
  const [prev, ...rest] = set.history;
  if (!prev) return null;
  const { at: _at, ...v } = prev;
  void _at;
  return { ...set, cur: v, history: [{ ...set.cur, at: new Date(now).toISOString() }, ...rest].slice(0, IMAGE_SET_HISTORY_MAX) };
}

/* ─────────── แทนค่าให้เว็บร้าน ─────────── */

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** ช่องรูปมือถือคู่ของช่อง k (imageKey → mobileImageKey · bannerKey → mobileBannerKey · image → mobileImage/imageMobile) */
export function mobileSiblings(k: string): string[] {
  if (/Key$/.test(k)) {
    const base = k.slice(0, -3);
    return [`mobile${cap(base)}Key`, `${base}MobileKey`, `${k}Mobile`];
  }
  return [`mobile${cap(k)}`, `${k}Mobile`];
}
/** ช่องนี้เป็นรูปมือถือเอง (ผูกช่องมือถือตรง ๆ = ใช้รูปมือถือของชุด) */
const isMobileField = (k: string) => /^mobile[A-Z]|Mobile(Key)?$|^m[A-Z]\w*Key$/.test(k);
const LINK_KEYS = ["href", "link", "url", "target"];

export interface FocusMap {
  [r2key: string]: { x: number; y: number };
}

/**
 * แทน "imgset/<id>" ทั้งก้อนข้อมูล (โครงหน้า/ธีม) ด้วยรูปปัจจุบันของชุด — คืนก้อนใหม่ (ของเดิมไม่ถูกแก้) + แผนที่จุดสำคัญ
 * ชุดที่ไม่มีแล้ว = ไม่มีรูป (null) · ลิงก์ของชุดทับลิงก์ของที่นั้น (เฉพาะชุดที่ตั้งลิงก์)
 */
export function resolveImageSets<T>(data: T, sets: Map<string, ImageSet>, now = Date.now(), opts: { draft?: boolean } = {}): { data: T; focus: FocusMap; used: Set<string> } {
  const focus: FocusMap = {};
  const used = new Set<string>();
  // พรีวิว (draft) = เห็นร่างของชุดก่อนขึ้นเว็บ · เว็บจริง = รูปตามเวลาที่ตั้ง
  const versionOf = (set: ImageSet) => (opts.draft && set.draft ? set.draft : effectiveVersion(set, now));
  // รายการรูปล้วน (เช่น รูปแกลเลอรี ["key", "imgset/…"]) = ใช้รูปคอมของชุด
  const inList = (s: string): string | null => {
    const id = imgSetIdOf(s);
    const set = id ? sets.get(id) : undefined;
    if (!id) return s;
    if (!set) return null;
    used.add(id);
    const ver = versionOf(set);
    if (ver.desk) focus[ver.desk] = { x: ver.fx, y: ver.fy };
    return ver.desk ?? ver.mob;
  };
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map((x) => (typeof x === "string" ? inList(x) : walk(x)));
    if (!node || typeof node !== "object") return node;
    const src = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(src)) out[k] = typeof v === "string" ? v : walk(v);
    for (const [k, v] of Object.entries(src)) {
      const id = imgSetIdOf(v);
      if (!id) continue;
      const set = sets.get(id);
      if (!set) {
        out[k] = null;
        continue;
      }
      used.add(id);
      const ver = versionOf(set);
      const mobileField = isMobileField(k);
      out[k] = mobileField ? ver.mob ?? ver.desk : ver.desk ?? ver.mob;
      if (!mobileField && ver.mob) {
        const sibs = mobileSiblings(k).filter((sib) => Object.prototype.hasOwnProperty.call(src, sib));
        for (const sib of sibs) if (!imgSetIdOf(src[sib])) out[sib] = ver.mob;
        // ช่อง imageKey ที่ไม่มีช่องมือถือคู่ (เช่น รูปในผืนผ้าใบ) → ส่ง mobileImageKey ไปด้วย (ที่ที่ไม่รู้จักช่องนี้ = ไม่สนใจ)
        if (!sibs.length && k === "imageKey") out.mobileImageKey = ver.mob;
      }
      if (set.link) {
        for (const lk of LINK_KEYS) if (typeof src[lk] === "string") out[lk] = set.link;
        const lo = src.link;
        if (lo && typeof lo === "object" && !Array.isArray(lo) && "href" in (lo as object)) out.link = { ...(out.link as object), href: set.link };
      }
      if (set.alt && Object.prototype.hasOwnProperty.call(src, "alt") && !String(src.alt ?? "").trim()) out.alt = set.alt;
      if (ver.desk) focus[ver.desk] = { x: ver.fx, y: ver.fy };
      if (ver.mob) focus[ver.mob] = { x: ver.mfx, y: ver.mfy };
    }
    return out;
  };
  return { data: walk(data) as T, focus, used };
}

/* ─────────── ใช้อยู่ที่ไหนบ้าง ─────────── */

export interface ImageSetUse {
  setId: string;
  /** ป้ายภาษาคน เช่น "หน้าแรก › สไลด์โชว์" */
  where: string;
  /** เผยแพร่แล้ว / ร่าง */
  state: "live" | "draft";
  /** หน้าเว็บที่ต้องเปิดดูที่นี้ (ใช้ทำพรีวิว เช่น "/#s-<block>" · "/shop" · "/checkout?pv=thanks") */
  path: string;
}

/** หาว่าชุดไหนถูกใช้ที่ไหน — docs = [{label, state, data}] · labelOf(path) แปลงตำแหน่งในก้อนข้อมูลเป็นป้าย */
export function findImageSetUses(
  docs: { label: string; state: "live" | "draft"; data: unknown; labelOf?: (path: (string | number)[], root: unknown) => string; pathOf?: (path: (string | number)[], root: unknown) => string }[],
): ImageSetUse[] {
  const out: ImageSetUse[] = [];
  const seen = new Set<string>();
  for (const doc of docs) {
    const walk = (node: unknown, path: (string | number)[]) => {
      if (typeof node === "string") {
        const id = imgSetIdOf(node);
        if (!id) return;
        const sub = doc.labelOf ? doc.labelOf(path, doc.data) : "";
        const where = sub ? `${doc.label} › ${sub}` : doc.label;
        const k = `${id}|${where}|${doc.state}`;
        if (!seen.has(k)) {
          seen.add(k);
          out.push({ setId: id, where, state: doc.state, path: doc.pathOf ? doc.pathOf(path, doc.data) : "/" });
        }
        return;
      }
      if (Array.isArray(node)) node.forEach((x, i) => walk(x, [...path, i]));
      else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) walk(v, [...path, k]);
    };
    walk(doc.data, []);
  }
  return out;
}
