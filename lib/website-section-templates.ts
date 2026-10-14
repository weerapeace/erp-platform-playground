/**
 * ของกลาง — แม่แบบ Section (ตาราง website_section_templates) · ฟังก์ชันล้วน ใช้ได้ทั้ง API และหน้าจอ
 *
 * บันทึก = Section 1 ก้อน (เนื้อหา + รูปลักษณ์ + ชิ้นย่อย) ผ่านตัวทำความสะอาดชุดเดียวกับตอนบันทึกหน้าเว็บ (normalizeBlocks)
 *          ตัด id ทิ้ง — ตอน "ใช้" ได้ id ใหม่ของ Section และชิ้นย่อยทุกครั้ง (ใช้ซ้ำหลายที่ไม่ชนกัน)
 * รับเฉพาะชนิด Section ที่ schema รู้จัก (กันเก็บของแปลก/บล็อกเก่าที่แก้ไม่ได้)
 */
import { normalizeBlocks } from "@/lib/website-blocks";
import { SECTION_SCHEMAS } from "@/lib/website-schema";

export interface SectionTemplate {
  id: string;
  shopId: string | null;
  shopName: string | null;
  name: string;
  type: string;
  /** Section ไม่มี id */
  block: Record<string, unknown>;
  createdByName: string | null;
  updatedAt: string;
}

/** Section จากตัวจัดหน้า → ก้อนที่เก็บเป็นแม่แบบได้ (null = ไม่ใช่ Section ที่รู้จัก) */
export function cleanTemplateBlock(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const type = (raw as { type?: unknown }).type;
  if (typeof type !== "string" || !SECTION_SCHEMAS[type]) return null;
  const [b] = normalizeBlocks([{ ...(raw as Record<string, unknown>), id: "tpl" }]);
  if (!b || b.type !== type) return null;
  const rest: Record<string, unknown> = { ...(b as unknown as Record<string, unknown>) };
  delete rest.id;
  return rest;
}

export const cleanTemplateName = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 80);

/** ชื่อตั้งต้นตอนกดบันทึก = ชื่อชนิด + หัวข้อของ Section (ถ้ามี) */
export function defaultTemplateName(block: Record<string, unknown>): string {
  const meta = SECTION_SCHEMAS[String(block.type)]?.meta;
  const title = typeof block.title === "string" ? block.title.trim() : "";
  return cleanTemplateName([meta?.label ?? String(block.type), title].filter(Boolean).join(" — "));
}
