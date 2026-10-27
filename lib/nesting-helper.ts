"use client";

/**
 * คุยกับ "ตัวช่วยจัดเรียง" ที่ลงไว้ในเครื่องผู้ใช้ (โปรแกรมแยก tools/nesting-app) — http://127.0.0.1:8765
 *
 * ตัวคำนวณหนัก (หาเส้นขอบ/จัดเรียง/ทำ PDF-EPS) ทำในเครื่องผู้ใช้ ไม่ใช่บนเซิร์ฟเวอร์ ERP
 *   - ตัวช่วยยอมให้เฉพาะเว็บ ERP เรียก (OriginGuard ฝั่งตัวช่วย) · เว็บอื่นถูกปฏิเสธ
 *   - Chrome อาจถาม "อนุญาตให้เว็บนี้เข้าถึงอุปกรณ์ในเครือข่าย/ในเครื่อง" ครั้งแรก → ต้องกดอนุญาต
 *   - ข้อความผิดพลาดจากตัวช่วยมาตามภาษาที่ส่งใน X-Lang
 * ติดตั้ง: Z:\Assets\[99] Programs\Nesting Helper (อัปเดตตัวเองจากโฟลเดอร์ update ข้าง ๆ)
 */

// เปลี่ยนได้ตอนทดสอบในเครื่องนักพัฒนา (NEXT_PUBLIC_NESTING_HELPER_URL) — เว็บจริงใช้ 8765 เสมอ
export const HELPER_URL = process.env.NEXT_PUBLIC_NESTING_HELPER_URL || "http://127.0.0.1:8765";
export const HELPER_MIN_VERSION = "1.1.0";
/** ส่งไฟล์ขึ้น Drive เองจากเครื่อง (ปุ่ม "ส่งเข้าคลังงานพิมพ์") ได้ตั้งแต่รุ่นนี้ */
export const HELPER_DRIVE_VERSION = "1.2.0";
/** ล็อกลาย (กันช่องว่าง/มุมหมุนเฉพาะลาย) + แยกชิ้นในภาพ ได้ตั้งแต่รุ่นนี้ */
export const HELPER_SPLIT_VERSION = "1.3.0";
/** เรียงเป็นแถวเฉพาะลาย + แผ่นม้วนเติมช่องว่างไม่ยืดม้วน ได้ตั้งแต่รุ่นนี้ */
export const HELPER_ROWS_VERSION = "1.4.0";
/** ส่ง/โหลดไฟล์พิมพ์กับคลังกลาง (R2) ได้ตั้งแต่รุ่นนี้ */
export const HELPER_CLOUD_VERSION = "1.5.0";

/** ผลแยกชิ้นจากตัวช่วย (POST /api/files/<sha>/split) — box = pixel ในกรอบเนื้องาน · auto = เลขกลุ่มอัตโนมัติที่รวมกัน */
export type SplitGroup = { index: number; auto: number[]; color: string; box: [number, number, number, number]; w_mm: number; h_mm: number };
export type SplitPiece = {
  index: number; sha: string; name: string; w_mm: number; h_mm: number; error?: string;
  canvas_px: [number, number]; dpi: [number, number]; trim_box: [number, number, number, number];
};
export type SplitResult = { sha: string; gap_mm: number; natural_mm: [number, number]; groups: SplitGroup[]; overlay?: string; pieces?: SplitPiece[] };
export const HELPER_INSTALL_PATH = "Z:\\Assets\\[99] Programs\\Nesting Helper";

export type Lang = "th" | "en";

export type HelperState =
  | { state: "checking" }
  | { state: "ready"; version: string }
  | { state: "outdated"; version: string }
  | { state: "missing" };

/** "1.10.0" ≥ "1.9.2" — เทียบเป็นตัวเลขทีละส่วน */
export function versionAtLeast(v: string, min: string): boolean {
  const p = (s: string) => s.split(".").map((x) => parseInt(x, 10) || 0);
  const a = p(v), b = p(min);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return true;
}

/** เครื่องนี้มีตัวช่วยไหม (ไม่มี / ปิดอยู่ / ตัวเก่าที่ยังไม่ยอมให้ ERP เรียก = ตอบไม่ได้ → missing) */
export async function checkHelper(timeoutMs = 2500): Promise<HelperState> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${HELPER_URL}/api/health`, { signal: ctrl.signal, cache: "no-store" });
    const j = (await res.json()) as { app?: string; version?: string };
    if (j.app !== "nesting-helper" || !j.version) return { state: "missing" };
    return versionAtLeast(j.version, HELPER_MIN_VERSION) ? { state: "ready", version: j.version } : { state: "outdated", version: j.version };
  } catch {
    return { state: "missing" };
  } finally {
    clearTimeout(timer);
  }
}

const UNREACHABLE: Record<Lang, string> = {
  th: "ติดต่อตัวช่วยจัดเรียงในเครื่องนี้ไม่ได้ — ตัวช่วยเปิดอยู่ไหม (ไอคอนกรรไกรข้างนาฬิกา)",
  en: "Cannot reach the nesting helper on this computer — is it running? (scissors icon next to the clock)",
};

/** เรียก API ของตัวช่วย — body เป็น FormData (อัปไฟล์) หรือ object (JSON) · ผิดพลาด = throw Error พร้อมข้อความที่อ่านรู้เรื่อง */
export async function helperApi<T = unknown>(path: string, lang: Lang, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const init: RequestInit = { method: opts.method ?? "GET", headers: { "X-Lang": lang }, cache: "no-store" };
  if (opts.body instanceof FormData) init.body = opts.body;
  else if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    (init.headers as Record<string, string>)["Content-Type"] = "application/json";
  }
  let res: Response;
  try { res = await fetch(`${HELPER_URL}${path}`, init); } catch { throw new Error(UNREACHABLE[lang]); }
  let data: unknown = null;
  try { data = await res.json(); } catch { /* ไม่ใช่ JSON */ }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: unknown; detail?: unknown };
    const msg = typeof d.error === "string" ? d.error : typeof d.detail === "string" ? d.detail : `(${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

/** รูปย่อ / รูปเต็ม ของไฟล์ที่อยู่ในตัวช่วย (ใช้ใน <img>/<image> ได้ตรง ๆ) */
export const helperFileUrl = (sha: string, kind: "thumb" | "view") => `${HELPER_URL}/api/files/${sha}/${kind}.png`;

/** ลิงก์หน้ารายงาน (เปิดในแท็บใหม่) */
export const helperLink = (path: string, lang: Lang) => `${HELPER_URL}${path}${path.includes("?") ? "&" : "?"}lang=${lang}`;

/** ความคืบหน้าการส่งไฟล์ขึ้น Drive (ตัวช่วยส่งเองเบื้องหลัง — หน้าเว็บถามทุก ~1 วินาที) */
export type DrivePush = {
  state: "running" | "done" | "error"; error: string | null; sent: number; total: number;
  files: { file: string; size: number; sent: number; id: string | null; error: string | null }[];
};

/** ไฟล์ผลลัพธ์ในตัวช่วย (เช่นรูปตัวอย่าง preview_01.png) → File ไว้อัปต่อ */
export async function helperFile(path: string, lang: Lang, name: string): Promise<File> {
  let res: Response;
  try { res = await fetch(`${HELPER_URL}${path}`, { cache: "no-store", headers: { "X-Lang": lang } }); } catch { throw new Error(UNREACHABLE[lang]); }
  if (!res.ok) {
    let msg = `(${res.status})`;
    try { const j = await res.json(); if (typeof j.error === "string") msg = j.error; } catch { /* ไม่ใช่ JSON */ }
    throw new Error(msg);
  }
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || "application/octet-stream" });
}

/** ดาวน์โหลดไฟล์จากตัวช่วย (PDF/EPS/zip) ตั้งชื่อตามที่ตัวช่วยบอก — ผิดพลาด = throw (หน้าไม่หลุดไปหน้า error) */
export async function helperDownload(path: string, lang: Lang): Promise<string> {
  let res: Response;
  try { res = await fetch(helperLink(path, lang), { cache: "no-store" }); } catch { throw new Error(UNREACHABLE[lang]); }
  if (!res.ok) {
    let msg = `(${res.status})`;
    try { const j = await res.json(); if (typeof j.error === "string") msg = j.error; } catch { /* ไม่ใช่ JSON */ }
    throw new Error(msg);
  }
  const cd = res.headers.get("Content-Disposition") ?? "";
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  const plain = /filename="?([^";]+)"?/i.exec(cd);
  const name = star ? decodeURIComponent(star[1]) : plain ? plain[1] : "nesting.pdf";
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return name;
}
