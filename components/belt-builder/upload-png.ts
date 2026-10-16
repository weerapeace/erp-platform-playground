"use client";

/**
 * อัปโหลดรูปชิ้นส่วนเข็มขัด (PNG พื้นโปร่ง) ขึ้น R2 โฟลเดอร์ belt-parts — ไม่ย่อขนาด (สายหนังต้องคมที่ 1600px)
 *
 * ตรวจก่อนส่ง: ต้องเป็น PNG (เว็บลูกค้าซ้อนชั้น ถ้าไม่โปร่งจะมีกล่องขาวทับ) · เตือนถ้าเกิน 2 MB (โหลดช้า) หรือ PNG ไม่มีช่องโปร่ง
 * ใช้ที่: การ์ดชิ้นส่วน (ลากไฟล์วาง) · แผงแก้ไข · ป๊อปอัปโหลดหลายรูป ในสตูดิโอ (components/belt-builder/studio*.tsx)
 */
import { apiFetch } from "@/lib/api";

export const BELT_PART_FOLDER = "belt-parts";
export const PNG_WARN_BYTES = 2 * 1024 * 1024;

export type PngCheck = { ok: boolean; error?: string; warnings: string[] };

/** อ่าน header PNG: IHDR color type 4/6 = มี alpha · 3 (palette) อาจมี tRNS · 0/2 = ไม่มีช่องโปร่ง */
export async function checkPngFile(file: File): Promise<PngCheck> {
  const warnings: string[] = [];
  const isPng = file.type === "image/png" || /\.png$/i.test(file.name);
  if (!isPng) return { ok: false, error: `"${file.name}" ไม่ใช่ PNG — ต้องเป็น PNG พื้นโปร่ง (ไดคัทพื้นออกแล้ว) ไม่งั้นจะมีกล่องขาวทับสายหนัง`, warnings };
  if (file.size > PNG_WARN_BYTES) warnings.push(`ไฟล์ ${(file.size / 1024 / 1024).toFixed(1)} MB ใหญ่กว่า 2 MB — หน้าเว็บลูกค้าจะโหลดช้า แนะนำย่อ/บีบอัด (ยังอัปโหลดให้)`);
  try {
    const head = new Uint8Array(await file.slice(0, 33).arrayBuffer());
    const sig = [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => head[i] === b);
    if (!sig) return { ok: false, error: `"${file.name}" เนื้อไฟล์ไม่ใช่ PNG จริง (นามสกุลอาจถูกเปลี่ยน)`, warnings };
    const colorType = head[25];
    if (colorType === 0 || colorType === 2) warnings.push("PNG นี้ไม่มีช่องโปร่ง (พื้นทึบ) — บนพรีวิวจะเห็นพื้นสี่เหลี่ยมทับชิ้นอื่น ควรไดคัทพื้นออก");
  } catch { /* อ่าน header ไม่ได้ก็ปล่อยผ่าน ให้ server ตรวจต่อ */ }
  return { ok: true, warnings };
}

/** อัปโหลดขึ้น R2 (ไม่ย่อ) → คืน r2_key · โยน Error ถ้าไม่ผ่าน (ข้อความภาษาคน) */
export async function uploadBeltPartPng(file: File): Promise<{ r2_key: string; warnings: string[] }> {
  const chk = await checkPngFile(file);
  if (!chk.ok) throw new Error(chk.error ?? "ไฟล์ไม่ถูกต้อง");
  const fd = new FormData();
  fd.append("file", file);
  fd.append("folder", BELT_PART_FOLDER);
  const res = await apiFetch("/api/admin/upload", { method: "POST", body: fd });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(String(j.error ?? `อัปโหลดไม่สำเร็จ (${res.status})`));
  return { r2_key: String(j.r2_key), warnings: chk.warnings };
}

// จับคู่ชื่อไฟล์ ↔ code อยู่ใน lib/belt-builder.ts (pure + test) — re-export ให้ผู้เรียกเดิม
export { matchFileToPart, normalizeCodeKey } from "@/lib/belt-builder";
