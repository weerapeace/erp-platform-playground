"use client";

// ============================================================
// อ่านของบนกระดานบรีฟของงาน (อ่านอย่างเดียว) — ใช้สร้างคอนเทนต์ "จากกระดานบรีฟ" ในแท็บคอนเทนต์ · เจ้าของขอ 2026-11-21
//  • รูป = ไฟล์รูปบนกระดานที่เก็บบน R2 แล้ว (คืน r2 key → แนบเข้าคอนเทนต์ได้เลย ไม่อัปซ้ำ · ไม่เปลือง R2 เพิ่ม)
//    รูปที่ยังไม่ขึ้น R2 (base64 ค้าง) / ลิงก์ Pinterest/TikTok ไม่นับ
//  • โน้ต = ข้อความบนกระดาน (รวมข้อความในกล่อง) ไม่นับการ์ดสินค้า/งานที่ระบบวาง
// ข้อมูลจาก GET /api/canvas-sketch (สิทธิ์ tasks.view ฝั่ง server)
// ============================================================
import { apiFetch } from "@/lib/api";
import { TASK_BRIEF_ENTITY } from "./task-reference-board";

export type BriefImage = { fileId: string; r2_key: string; url: string };
export type BriefNote = { id: string; text: string };

type El = { id: string; type: string; isDeleted?: boolean; fileId?: string; text?: string; originalText?: string; customData?: { kind?: string } | null; y?: number; x?: number };

/** r2 key จาก URL รูปของกระดาน (/api/r2-image?key=...) */
function keyOf(url: string): string | null {
  const m = /[?&]key=([^&]+)/.exec(url);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return null; }
}

export async function loadBriefBoardItems(taskId: string): Promise<{ images: BriefImage[]; notes: BriefNote[] }> {
  const r = await apiFetch(`/api/canvas-sketch?entity_type=${TASK_BRIEF_ENTITY}&entity_id=${encodeURIComponent(taskId)}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || "โหลดกระดานบรีฟไม่สำเร็จ");
  const scene = (j.data?.scene ?? {}) as { elements?: El[]; files?: Record<string, { dataURL?: string }> };
  // เรียงตามตำแหน่งบนกระดาน (บน→ล่าง ซ้าย→ขวา) ให้ลำดับรูป/โน้ตตรงกับที่วาง
  const els = (scene.elements ?? []).filter((e) => !e.isDeleted && !e.customData?.kind)
    .sort((a, b) => (Math.round((a.y ?? 0) / 40) - Math.round((b.y ?? 0) / 40)) || ((a.x ?? 0) - (b.x ?? 0)));
  const files = scene.files ?? {};
  const images: BriefImage[] = [];
  const seen = new Set<string>();
  for (const e of els) {
    if (e.type !== "image" || !e.fileId) continue;
    const url = files[e.fileId]?.dataURL ?? "";
    const key = url.startsWith("/api/r2-image") ? keyOf(url) : null;
    if (!key || seen.has(key)) continue;
    seen.add(key); images.push({ fileId: e.fileId, r2_key: key, url });
  }
  const notes: BriefNote[] = els
    .filter((e) => e.type === "text")
    .map((e) => ({ id: e.id, text: String(e.originalText ?? e.text ?? "").trim() }))
    .filter((n) => n.text && !/^https?:\/\//i.test(n.text));
  return { images, notes };
}
