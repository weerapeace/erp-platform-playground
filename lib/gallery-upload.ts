/**
 * อัปรูป 1 รูปเข้า "แกลเลอรีรูป" ของระเบียน (ตาราง erp_playground_attachments ผ่าน POST /api/attachments) — ของกลาง
 *   ใช้ร่วมกัน: กล่องรูปในลิ้นชัก (components/image-manager) · ลากรูปลงการ์ด/แถว SKU (components/sku-tag-browser)
 *   กติกาเดียวกันทุกที่: ย่อด้านกว้าง ≤ 1500px · เช็กขนาดหลังย่อ · จำกัดจำนวนรูป (API เช็กซ้ำ)
 *   รูปแรกของระเบียน = รูปหลัก → DB trigger ตั้งรูปปก (cover_image_r2_key) ให้เอง · ลบรูปหลัก → เลื่อนรูปถัดไปขึ้นแทน
 * เอกสาร: docs/gallery-upload.md
 */
import { apiFetch } from "@/lib/api";
import { downscaleImageWidth } from "@/lib/image-resize";

export const GALLERY_MAX_ITEMS = 9;
export const GALLERY_MAX_BYTES = 2 * 1024 * 1024;

export type GalleryUploadOpts = {
  entityType: string;
  entityId: string;
  actor?: string | null;
  /** true (ค่าเริ่ม) = รับเฉพาะรูป + ย่อรูป */
  imageOnly?: boolean;
  maxItems?: number;
  maxSizeBytes?: number;
};

/** อัป 1 ไฟล์ → คืน id ของรูปที่เพิ่ม (null = API ไม่คืน id) · พลาด = throw Error ข้อความภาษาคน */
export async function uploadGalleryFile(orig: File, o: GalleryUploadOpts): Promise<string | null> {
  const imageOnly = o.imageOnly ?? true;
  const maxItems = o.maxItems ?? GALLERY_MAX_ITEMS;
  const maxBytes = o.maxSizeBytes ?? GALLERY_MAX_BYTES;
  if (imageOnly && !(orig.type || "").startsWith("image/")) throw new Error(`${orig.name}: รับเฉพาะไฟล์รูปภาพ`);
  const file = imageOnly ? await downscaleImageWidth(orig, 1500) : orig;
  if (file.size > maxBytes) throw new Error(`ไฟล์ ${orig.name} ใหญ่เกิน ${Math.round(maxBytes / 1024 / 1024)}MB (แม้ย่อแล้ว)`);
  const fd = new FormData();
  fd.append("file", file);
  fd.append("entity_type", o.entityType);
  fd.append("entity_id", o.entityId);
  if (o.actor) fd.append("actor", o.actor);
  if (imageOnly) { fd.append("attachment_kind", "image_gallery"); fd.append("image_only", "1"); }
  if (maxItems > 0) fd.append("max_items", String(maxItems));
  fd.append("max_size_bytes", String(maxBytes));
  const res = await apiFetch("/api/attachments", { method: "POST", body: fd });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.error) throw new Error(json?.error || "อัปโหลดไม่สำเร็จ");
  const d = json?.data;
  const id = typeof d === "string" ? d : (d && typeof d === "object" ? (d as { id?: string }).id ?? (Array.isArray(d) ? (d[0] as { id?: string } | undefined)?.id : undefined) : undefined);
  return id ?? null;
}

/** ลบรูปที่เพิ่งเพิ่ม (ปุ่ม "ย้อนกลับ") — ไฟล์ย้ายเข้าถังขยะ R2 (เก็บ 30 วัน) */
export async function removeGalleryFile(id: string, actor?: string | null): Promise<void> {
  const res = await apiFetch(`/api/attachments/${id}?actor=${encodeURIComponent(actor ?? "")}`, { method: "DELETE" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.error) throw new Error(json?.error || "ลบไม่สำเร็จ");
}
