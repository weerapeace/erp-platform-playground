// ============================================================
// CanvasSketch — ตัวช่วยล้วน ๆ (pure helpers) + ค่าคงที่ + types
// แยกจาก index.tsx เพื่อให้ไฟล์หลักสั้นลง · ไม่มี state/effect ที่นี่
// ============================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Scene = { elements?: unknown[]; files?: Record<string, unknown> } | null;
export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export const AUTOSAVE_MS = 1000;       // หยุดวาดกี่ ms แล้วค่อยบันทึก (เซฟไวขึ้น)
export const MAX_AUTOSAVE_MS = 8000;   // เซฟกันลืม: แม้แก้ต่อเนื่องไม่หยุด ก็เซฟทุก ~8 วิ
export const BROADCAST_MS = 200;       // realtime: ส่งให้คนอื่นทุก ~200ms (throttle)
export const BC_MAX_BYTES = 200_000;   // กันส่งก้อนใหญ่เกินลิมิต Supabase Broadcast (ของใหญ่ปล่อยให้ save+refresh sync)

// ลายเซ็นกระดานแบบเบา (count + version รวม + id) — ใช้เทียบว่าเปลี่ยนจริงไหม กัน loop realtime
export function sceneSig(els: { id?: string; version?: number }[]): string {
  let h = els.length | 0;
  for (const e of els) h = (Math.imul(h, 31) + (e.version ?? 0) + (e.id ? e.id.charCodeAt(0) + e.id.length : 0)) | 0;
  return `${els.length}:${h}`;
}

// รวมชิ้นงาน 2 ฝั่งต่อ id — เอาตัว version ใหม่กว่า (รองรับลบด้วย isDeleted) · เสมอกัน = เก็บฝั่ง a (ของเรา)
export function mergeById(a: any[], b: any[]): any[] {
  const map = new Map<string, any>();
  for (const e of a) if (e?.id) map.set(e.id, e);
  for (const e of b) { if (!e?.id) continue; const cur = map.get(e.id); if (!cur || (e.version ?? 0) > (cur.version ?? 0)) map.set(e.id, e); }
  return [...map.values()];
}

// ย่อรูป (จาก dataURL base64) ให้ด้านยาวสุด ≤ max px ก่อนอัป R2 — กันไฟล์ใหญ่เกินลิมิต + กระดานเบา (PNG คงโปร่งใส)
export async function resizeDataUrl(dataURL: string, mime: string, max = 1600): Promise<{ blob: Blob; type: string }> {
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataURL; });
  let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  if (w > max || h > max) { const r = Math.min(max / w, max / h); w = Math.round(w * r); h = Math.round(h * r); }
  const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
  canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
  const type = mime === "image/png" ? "image/png" : "image/jpeg";
  const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b as Blob), type, 0.85));
  return { blob, type };
}
