/**
 * 🎓 ศูนย์เรียนรู้ — กติกากลาง (ใช้ทั้งหน้า /misc/learn และ API /api/learn)
 *   บทเรียน = แถวใน erp_help_guides ที่ kind = "lesson" (ต่อยอดตารางคู่มือวิธีใช้งานเดิม ไม่สร้างตารางที่ 2)
 *   ขั้นตอน = erp_help_guide_steps (ข้อความ · รูป · ลิงก์คลิป + นาทีเริ่ม · คลิปสั้นอัปเอง · เช็กลิสต์)
 *   สถานะ draft = "ร่าง รอตรวจ" (คนทั่วไปไม่เห็น) · published = เผยแพร่แล้ว
 * เทสต์ lib/__tests__/learn.test.ts · คู่มือ docs/learning-center.md
 */

export const LEARN_VIEW = "learn.view";
export const LEARN_MANAGE = "learn.manage";

export type LessonStatus = "draft" | "published";

export type LessonStep = {
  id?: string;
  title: string;
  body: string | null;
  image_r2_key: string | null;
  link_url: string | null;
  video_url: string | null;
  video_start_sec: number | null;
  video_r2_key: string | null;
  checklist: string[];
};

export type Lesson = {
  id: string;
  title: string;
  icon: string | null;
  description: string | null;
  category: string | null;
  status: LessonStatus;
  source_url: string | null;
  source_title: string | null;
  drive_folder_url: string | null;
  sort_order: number;
  is_active: boolean;
  deleted_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  steps: LessonStep[];
};

/** คอลัมน์ที่อ่าน (บทเรียน / ขั้นตอน) */
export const LESSON_COLS = "id, title, icon, description, category, status, source_url, source_title, drive_folder_url, sort_order, is_active, deleted_at, created_by, updated_by, created_at, updated_at";
export const STEP_COLS = "id, guide_id, step_no, title, body, image_r2_key, link_url, video_url, video_start_sec, video_r2_key, checklist, sort_order";

export const UNCATEGORIZED = "ทั่วไป";

const str = (v: unknown, max = 4000): string | null => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
};

/** "1:20" / "01:02:03" / "80" / "1m20s" → วินาที · อ่านไม่ออก/ว่าง = null */
export function parseTimeText(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;
  const s = String(v).trim().toLowerCase();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  const hms = s.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})$/);
  if (hms) return Number(hms[1] ?? 0) * 3600 + Number(hms[2]) * 60 + Number(hms[3]);
  const unit = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (unit && (unit[1] || unit[2] || unit[3])) return Number(unit[1] ?? 0) * 3600 + Number(unit[2] ?? 0) * 60 + Number(unit[3] ?? 0);
  return null;
}

/** วินาที → "1:20" / "1:02:03" */
export function formatTimeText(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec) || sec < 0) return "";
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

export type VideoLink = {
  kind: "youtube" | "tiktok" | "drive" | "file" | "other";
  /** ลิงก์ฝังเล่นในหน้า (iframe) · null = เปิดแท็บใหม่อย่างเดียว */
  embedUrl: string | null;
  /** ลิงก์เปิดดูที่ต้นทาง (มีนาทีเริ่มถ้ารองรับ) */
  watchUrl: string;
  label: string;
};

/** อ่านลิงก์คลิป → ฝังได้ไหม + ลิงก์เปิดตรงนาทีที่ตั้ง (YouTube) */
export function parseVideoLink(raw: string | null | undefined, startSec?: number | null): VideoLink | null {
  const url = String(raw ?? "").trim();
  if (!/^https?:\/\//i.test(url)) return null;
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, "").toLowerCase();
  const start = startSec && startSec > 0 ? Math.floor(startSec) : null;

  // YouTube: watch?v= · youtu.be/ · shorts/ · embed/ · live/
  let yt: string | null = null;
  if (host === "youtu.be") yt = u.pathname.slice(1).split("/")[0] || null;
  else if (host.endsWith("youtube.com")) {
    yt = u.searchParams.get("v") || u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/)?.[1] || null;
  }
  if (yt && /^[\w-]{6,20}$/.test(yt)) {
    const t = start ?? parseTimeText(u.searchParams.get("t") ?? u.searchParams.get("start"));
    return {
      kind: "youtube",
      embedUrl: `https://www.youtube-nocookie.com/embed/${yt}${t ? `?start=${t}` : ""}`,
      watchUrl: `https://www.youtube.com/watch?v=${yt}${t ? `&t=${t}s` : ""}`,
      label: "YouTube",
    };
  }

  // TikTok: /@user/video/<id>
  if (host.endsWith("tiktok.com")) {
    const id = u.pathname.match(/\/video\/(\d{8,})/)?.[1];
    return { kind: "tiktok", embedUrl: id ? `https://www.tiktok.com/embed/v2/${id}` : null, watchUrl: url, label: "TikTok" };
  }

  // Google Drive: /file/d/<id>/… (เปิดได้เฉพาะคนที่มีสิทธิ์ในไฟล์)
  if (host === "drive.google.com") {
    const id = u.pathname.match(/\/file\/d\/([\w-]{10,})/)?.[1] || u.searchParams.get("id");
    return { kind: "drive", embedUrl: id ? `https://drive.google.com/file/d/${id}/preview` : null, watchUrl: url, label: "Google Drive" };
  }

  if (/\.(mp4|webm|m4v|mov)(\?|$)/i.test(u.pathname)) return { kind: "file", embedUrl: null, watchUrl: url, label: "ไฟล์วิดีโอ" };
  return { kind: "other", embedUrl: null, watchUrl: url, label: host };
}

/** เช็กลิสต์: รับได้ทั้ง array หรือข้อความหลายบรรทัด → array ข้อความ (ตัดว่าง/ซ้ำ · สูงสุด 30 ข้อ) */
export function cleanChecklist(v: unknown): string[] {
  const arr = Array.isArray(v) ? v : typeof v === "string" ? v.split(/\r?\n/) : [];
  const out: string[] = [];
  for (const x of arr) {
    const s = String(x ?? "").replace(/^\s*[-•*☐□\d.)]+\s*/, "").trim().slice(0, 300);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= 30) break;
  }
  return out;
}

/** ตรวจ/ทำความสะอาดขั้นตอนทั้งชุด (บันทึกแบบแทนที่ทั้งชุด) · ขั้นที่ว่างทุกช่อง = ตัดทิ้ง */
export function cleanSteps(v: unknown): LessonStep[] {
  if (!Array.isArray(v)) return [];
  const out: LessonStep[] = [];
  for (const raw of v.slice(0, 80)) {
    const s = (raw ?? {}) as Record<string, unknown>;
    const step: LessonStep = {
      title: str(s.title, 300) ?? "",
      body: str(s.body, 8000),
      image_r2_key: str(s.image_r2_key, 500),
      link_url: str(s.link_url, 1000),
      video_url: str(s.video_url, 1000),
      video_start_sec: parseTimeText(s.video_start_sec),
      video_r2_key: str(s.video_r2_key, 500),
      checklist: cleanChecklist(s.checklist),
    };
    const empty = !step.title && !step.body && !step.image_r2_key && !step.link_url && !step.video_url && !step.video_r2_key && !step.checklist.length;
    if (empty) continue;
    if (!step.title) step.title = `ขั้นตอน ${out.length + 1}`;
    out.push(step);
  }
  return out;
}

export type LessonPatch = Partial<Pick<Lesson, "title" | "icon" | "description" | "category" | "status" | "source_url" | "source_title" | "drive_folder_url" | "sort_order" | "is_active">>;

/** ตรวจช่องของบทเรียน · partial = แก้บางช่อง (ไม่บังคับชื่อ) */
export function cleanLessonBody(b: Record<string, unknown>, partial = false): { ok: true; patch: LessonPatch } | { ok: false; error: string } {
  const p: LessonPatch = {};
  if ("title" in b || !partial) {
    const t = str(b.title, 200);
    if (!t) return { ok: false, error: "ต้องใส่ชื่อบทเรียน" };
    p.title = t;
  }
  if ("icon" in b) p.icon = str(b.icon, 80);
  if ("description" in b) p.description = str(b.description, 2000);
  if ("category" in b) p.category = str(b.category, 80);
  if ("status" in b || !partial) {
    const s = b.status ?? "draft";
    if (s !== "draft" && s !== "published") return { ok: false, error: "สถานะต้องเป็น ร่าง หรือ เผยแพร่" };
    p.status = s;
  }
  if ("source_url" in b) {
    const u = str(b.source_url, 1000);
    if (u && !/^https?:\/\//i.test(u)) return { ok: false, error: "ลิงก์ที่มาต้องขึ้นต้นด้วย http:// หรือ https://" };
    p.source_url = u;
  }
  if ("source_title" in b) p.source_title = str(b.source_title, 300);
  if ("drive_folder_url" in b) p.drive_folder_url = str(b.drive_folder_url, 1000);
  if ("sort_order" in b) { const n = Number(b.sort_order); if (Number.isFinite(n)) p.sort_order = Math.round(n); }
  if ("is_active" in b) p.is_active = b.is_active === true;
  return { ok: true, patch: p };
}

/** จัดกลุ่มตามหมวด (เรียงชื่อหมวด · หมวดว่าง = "ทั่วไป" ไว้ท้าย) */
export function groupLessons<T extends Pick<Lesson, "category" | "sort_order" | "title">>(list: T[]): { category: string; lessons: T[] }[] {
  const m = new Map<string, T[]>();
  for (const l of list) {
    const c = (l.category ?? "").trim() || UNCATEGORIZED;
    const a = m.get(c) ?? []; a.push(l); m.set(c, a);
  }
  return [...m.entries()]
    .sort(([a], [b]) => (a === UNCATEGORIZED ? 1 : b === UNCATEGORIZED ? -1 : a.localeCompare(b, "th")))
    .map(([category, lessons]) => ({ category, lessons: lessons.sort((x, y) => x.sort_order - y.sort_order || x.title.localeCompare(y.title, "th")) }));
}

/** ค้นบทเรียน: ทุกคำต้องเจอใน ชื่อ/หมวด/คำอธิบาย/ขั้นตอน/เช็กลิสต์ */
export function lessonMatches(l: Lesson, q: string): boolean {
  const toks = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!toks.length) return true;
  const hay = [l.title, l.category, l.description, l.source_title, ...l.steps.flatMap((s) => [s.title, s.body, ...s.checklist])]
    .filter(Boolean).join(" ").toLowerCase();
  return toks.every((t) => hay.includes(t));
}

/** เวลาโดยประมาณ (นาที) — อ่าน ~200 ตัวอักษร/นาที + ขั้นละ 1 นาที (ไม่นับความยาวคลิป) */
export function estimateMinutes(l: Pick<Lesson, "steps" | "description">): number {
  const chars = (l.description ?? "").length + l.steps.reduce((n, s) => n + (s.body ?? "").length + s.title.length + s.checklist.join("").length, 0);
  return Math.max(1, Math.round(chars / 200 + l.steps.length));
}
