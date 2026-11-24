/**
 * 🧱 บล็อกพิมพ์ — ของใช้ร่วมของหน้าจอ (รายการงาน + หน้าทำงาน)
 */
import { apiFetch } from "@/lib/api";
import type { BlockPaper, BlockPiece, BlockUnit } from "@/lib/block-print";
import type { BlockLayout } from "@/lib/block-print-layout";

export const LIST_HREF = "/master/block-print";
export const jobHref = (id: string) => `${LIST_HREF}/${id}`;
export const API = "/api/block-print/jobs";

export type JobRow = {
  id: string; code: string; name: string; note: string | null; source_file_name: string | null;
  unit: BlockUnit; paper: BlockPaper; is_active: boolean;
  piece_count: number; piece_on: number; created_at: string; updated_at: string; deleted_at: string | null;
};
export type Job = JobRow & { pieces: BlockPiece[]; layouts?: BlockLayout[] };

/** เรียก API แล้วคืน data · error → โยนข้อความภาษาคน */
export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await apiFetch(url, json === undefined ? rest : { ...rest, method: rest.method ?? "POST", headers: { "Content-Type": "application/json", ...(rest.headers ?? {}) }, body: JSON.stringify(json) });
  let j: { data?: T; error?: string | null } = {};
  try { j = await res.json(); } catch { /* ตอบไม่ใช่ JSON */ }
  if (!res.ok || j.error) throw new Error(j.error || (res.status === 403 ? "คุณไม่มีสิทธิ์ทำรายการนี้" : res.status === 413 ? "ไฟล์ใหญ่เกินไป ลองลดจุดเส้นใน Illustrator" : "เกิดข้อผิดพลาด กรุณาลองใหม่"));
  return j.data as T;
}

export const thaiDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

/** ชื่องานตั้งต้นจากชื่อไฟล์ (ตัดนามสกุล) */
export const nameFromFile = (fileName: string) => fileName.replace(/\.(ai|pdf)$/i, "").trim().slice(0, 120) || "งานบล็อกใหม่";

/** ข้อความสรุปสิ่งที่ข้ามตอนเปิดไฟล์ */
export function skippedNote(s: { strokes: number; texts: number; images: number; whites: number; backgrounds?: number }): string[] {
  const out: string[] = [];
  if (s.backgrounds) out.push(`พื้นหลังสีเต็มอาร์ตบอร์ด ${s.backgrounds} ชิ้น (นำเข้าไว้แต่ไม่ติ๊กส่งออก — ติ๊กเองได้ถ้าต้องการ)`);
  if (s.texts) out.push(`ตัวหนังสือที่ยังไม่แปลงเป็นเส้น ${s.texts} จุด (ยังไม่ได้นำเข้า — ใน Illustrator กด Type › Create Outlines แล้วเปิดใหม่)`);
  if (s.strokes) out.push(`เส้นขอบ/เส้นไกด์ ${s.strokes} เส้น (ไม่นำเข้า — ระบบวาดเส้นบอกขนาดให้ใหม่)`);
  if (s.images) out.push(`รูปภาพ ${s.images} รูป (ไม่นำเข้า — ทำบล็อกได้เฉพาะเวกเตอร์)`);
  if (s.whites) out.push(`พื้นสีขาว ${s.whites} ชิ้น (ไม่นำเข้า)`);
  return out;
}
