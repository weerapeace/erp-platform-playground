// ============================================================
// CanvasSketch — ตัวช่วยล้วน ๆ (pure helpers) + ค่าคงที่ + types
// แยกจาก index.tsx เพื่อให้ไฟล์หลักสั้นลง · ไม่มี state/effect ที่นี่
// ============================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
import { fetchR2Blob, r2ImagePath } from "@/lib/r2-image";

export type Scene = { elements?: unknown[]; files?: Record<string, unknown> } | null;
export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export const AUTOSAVE_MS = 5000;       // หยุดแก้กี่ ms แล้วค่อยบันทึก (debounce — ไม่ไล่เซฟตอนแก้นิด ๆ)
export const MAX_AUTOSAVE_MS = 30000;  // เซฟกันลืม: เฉพาะถ้าแก้ต่อเนื่องไม่หยุดเลย ก็เซฟทุก ~30 วิ
export const BROADCAST_MS = 200;       // realtime: ส่งให้คนอื่นทุก ~200ms (throttle)
export const BC_MAX_BYTES = 200_000;   // กันส่งก้อนใหญ่เกินลิมิต Supabase Broadcast (ของใหญ่ปล่อยให้ save+refresh sync)

// สีประจำคน (คงที่ต่อ user id) — ใช้ทั้งวงกลม presence และกรอบโน้ตคอมเมนต์ ให้สีตรงกัน
export function userColor(id: string): string {
  let h = 0; for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 62% 45%)`;
}

// ชื่อย่อสำหรับวงกลม avatar — คำแรกของ 2 คำ (อังกฤษ) หรือ 1–2 ตัวอักษรแรก (ไทย/คำเดียว)
export function initials(name: string): string {
  const s = (name || "?").trim();
  if (!s) return "?";
  const parts = s.split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (s.charCodeAt(0) > 0x0e00 ? s.slice(0, 1) : s.slice(0, 2)).toUpperCase();
}

// ลายเซ็นกระดานแบบเบา (count + version รวม + id) — ใช้เทียบว่าเปลี่ยนจริงไหม กัน loop realtime
export function sceneSig(els: { id?: string; version?: number }[]): string {
  let h = els.length | 0;
  for (const e of els) h = (Math.imul(h, 31) + (e.version ?? 0) + (e.id ? e.id.charCodeAt(0) + e.id.length : 0)) | 0;
  return `${els.length}:${h}`;
}

/** ความสูงกระดานที่ทำให้ "จบพอดีขอบล่างจอ" (หน้าไม่ต้องเลื่อน) — นับของที่อยู่เหนือกระดาน (ตำแหน่งบนจริง) + ของที่อยู่ใต้กระดานทุกชั้น
 *  (พี่น้องที่อยู่ "ใต้" กรอบ + ขอบล่างของกล่องแม่) · ไม่ขึ้นกับความสูงกระดานเอง → วัดซ้ำได้ค่าเดิม ไม่แกว่ง
 *  ⚠️ สูตรเดิม (scrollHeight − สูงกระดาน) ใช้ไม่ได้ตอนกระดานเตี้ยกว่าจอ: scrollHeight ถูกปัดขึ้นเท่าจอ → กระดานหดได้อย่างเดียว ไม่เคยยืดกลับ
 *  (เจอ 2026-11-23: กดเต็มจอเบราว์เซอร์ / ขยายหน้าต่าง → เหลือที่ว่างล่าง ~220px) */
export function boardHeightToViewportBottom(el: HTMLElement, minH = 360): number {
  const r = el.getBoundingClientRect();
  let bottom = r.bottom;
  let n: HTMLElement = el;
  while (n !== document.body && n.parentElement) {
    const p: HTMLElement = n.parentElement;
    const nb = n.getBoundingClientRect().bottom;
    for (let s = n.nextElementSibling; s; s = s.nextElementSibling) {
      const cs = getComputedStyle(s);
      if (cs.position === "fixed" || cs.position === "absolute" || cs.display === "none") continue;
      const sr = s.getBoundingClientRect();
      if (sr.height <= 0 || sr.top < nb - 1) continue; // อยู่ข้าง ๆ (แถวเดียวกัน) ไม่ใช่ข้างใต้
      bottom = Math.max(bottom, sr.bottom + (parseFloat(cs.marginBottom) || 0));
    }
    const pcs = getComputedStyle(p);
    bottom += (parseFloat(pcs.paddingBottom) || 0) + (parseFloat(pcs.borderBottomWidth) || 0);
    n = p;
  }
  const above = r.top + window.scrollY;
  const below = Math.max(0, bottom - r.bottom);
  return Math.max(minH, Math.round(window.innerHeight - above - below - 4));
}

/** Esc ตอนกระดานเต็มจอ (Esc 2 จังหวะ):
 *  "pass" = กำลังพิมพ์/วาด/เปิดเมนู/ถือเครื่องมืออื่น → ปล่อยให้ Excalidraw ยกเลิกเอง · "deselect" = มีของถูกเลือก → เราล้างการเลือก
 *  (Excalidraw เองไม่ล้างการเลือกตอนกด Esc) · "exit" = ว่างแล้ว → ออกเต็มจอ */
export function fullscreenEscAction(st: any): "pass" | "deselect" | "exit" {
  if (!st) return "pass";
  if (st.editingTextElement || st.newElement || st.multiElement || st.editingLinearElement || st.selectedLinearElement?.isEditing) return "pass";
  if (st.openDialog || st.openMenu || st.openPopup || st.contextMenu) return "pass";
  const tool = st.activeTool?.type;
  if (tool && tool !== "selection" && tool !== "hand") return "pass";
  const sel = st.selectedElementIds || {};
  if (Object.keys(sel).some((k) => sel[k])) return "deselect";
  return "exit";
}

// กล่องฝัง (วิดีโอ Pinterest/TikTok/YouTube) ต้องมี "พื้นทึบ" ไม่งั้น Excalidraw ถือว่าโปร่ง (ทะลุได้)
// → ลากปลายเส้นไปวางกลางกล่องแล้วไม่ผูก ต้องเล็งขอบเป๊ะ ๆ (ขอบมองไม่เห็นเพราะวิดีโอบังอยู่) · พื้นขาวอยู่ใต้วิดีโอ มองไม่เห็น
export const EMBED_FILL = { backgroundColor: "#ffffff", fillStyle: "solid" } as const;
const isClearColor = (c: string) => c === "transparent" || /^#[0-9a-f]{6}00$/i.test(c) || /^#[0-9a-f]{3}0$/i.test(c);
/** กล่องฝังที่ยังโปร่ง → ใส่พื้นทึบ (ไม่แตะ version: ใช้ตอนโหลดกระดาน ก่อน Excalidraw เปิด — ไม่เข้าประวัติย้อนกลับ) · ชิ้นอื่นคืนตัวเดิม */
export function bindableEmbed<T extends Record<string, unknown>>(el: T): T {
  if (el?.type !== "embeddable" && el?.type !== "iframe") return el;
  if (el.fillStyle === "solid" && !isClearColor(String(el.backgroundColor ?? "transparent"))) return el;
  return { ...el, ...EMBED_FILL };
}

// รวมชิ้นงาน 2 ฝั่งต่อ id — "การลบชนะ" ก่อน (กันลบแล้วเด้งกลับ) ไม่งั้นเอา version ใหม่กว่า · เสมอกัน = เก็บฝั่ง a (ของเรา)
export function mergeById(a: any[], b: any[]): any[] {
  const map = new Map<string, any>();
  const put = (e: any) => {
    if (!e?.id) return;
    const cur = map.get(e.id);
    if (!cur) { map.set(e.id, e); return; }
    if (cur.isDeleted && !e.isDeleted) return;                       // ตัวใน map ลบแล้ว → คงลบไว้ (การลบชนะ)
    if (e.isDeleted && !cur.isDeleted) { map.set(e.id, e); return; } // ตัวใหม่ลบ → ลบตาม
    if ((e.version ?? 0) > (cur.version ?? 0)) map.set(e.id, e);     // สถานะลบเท่ากัน → เลือก version ใหม่กว่า
  };
  for (const e of a) put(e);
  for (const e of b) put(e);
  return [...map.values()];
}

// ย่อรูป (จาก dataURL base64) ให้ด้านยาวสุด ≤ max px ก่อนอัป R2 — กันไฟล์ใหญ่เกินลิมิต + กระดานเบา (PNG คงโปร่งใส)
/** opts.type = บังคับชนิดไฟล์ผลลัพธ์ (เช่น "image/webp" — เล็กกว่า png มาก คงพื้นใส) · เบราว์เซอร์ทำไม่ได้จะได้ png แทน (ดู type ที่คืน) */
export async function resizeDataUrl(dataURL: string, mime: string, max = 1600, opts?: { type?: string; quality?: number }): Promise<{ blob: Blob; type: string }> {
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataURL; });
  let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  if (w > max || h > max) { const r = Math.min(max / w, max / h); w = Math.round(w * r); h = Math.round(h * r); }
  const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
  canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
  const type = opts?.type ?? (mime === "image/png" ? "image/png" : "image/jpeg");
  const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b as Blob), type, opts?.quality ?? 0.85));
  return { blob, type: blob?.type || type };
}

/**
 * ไฟล์รูปของกระดานสำหรับ "ส่งออกเป็นรูป" (exportToBlob) — รูปบน R2 ถูกเก็บเป็นลิงก์ /api/r2-image
 * ซึ่งเบราว์เซอร์โหลดจากตัวเสิร์ฟรูปคนละโดเมน → Excalidraw วาดแล้วอ่านกลับไม่ได้ (ส่งออกพัง · ใส่ crossOrigin ให้ไม่ได้)
 * → ดึงเฉพาะรูปที่ใช้ในชิ้นงานที่ส่งออกมาเป็น blob: URL (โดเมนเดียวกัน) · ดึงไม่ได้ = ใช้ลิงก์เดิม
 * เรียก release() เมื่อส่งออกเสร็จ (คืนหน่วยความจำ)
 */
export async function exportableFiles(files: Record<string, any> | undefined, elements: readonly any[]): Promise<{ files: Record<string, any>; release: () => void }> {
  const out: Record<string, any> = { ...(files ?? {}) };
  const made: string[] = [];
  const used = new Set<string>();
  for (const el of elements ?? []) if (el?.type === "image" && !el.isDeleted && el.fileId) used.add(String(el.fileId));
  await Promise.all([...used].map(async (id) => {
    const f = out[id];
    const url = typeof f?.dataURL === "string" ? (f.dataURL as string) : "";
    if (!r2ImagePath(url)) return;
    try {
      const u = URL.createObjectURL(await fetchR2Blob(url));
      made.push(u);
      out[id] = { ...f, dataURL: u };
    } catch { /* ใช้ลิงก์เดิม */ }
  }));
  return { files: out, release: () => made.forEach((u) => URL.revokeObjectURL(u)) };
}
