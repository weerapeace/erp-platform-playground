/**
 * 🔑 ใครดู "ร่าง / พรีวิว" ของเว็บร้านได้ (API สาธารณะ /api/public/storefront/*) · audit 2026-10-21 ขั้นที่ 5 เฟส 2
 *
 * key   = ลิงก์มีรหัสพรีวิวถูกต้อง (&pk= จาก lib/storefront-preview-key — ตัวจัดหน้า/ดีไซน์ใน ERP แนบให้เอง)
 * staff = พนักงาน ERP ที่ล็อกอินอยู่ (เรียกผ่าน apiFetch · สิทธิ์ products.view)
 * none  = คนทั่วไปที่เติม ?preview=1 เอง
 *
 * ⏳ ช่วงเปลี่ยนผ่าน: PREVIEW_KEY_REQUIRED = false → ยังให้ดูร่างได้เหมือนเดิม แต่จด log "[preview] ไม่มีรหัส"
 *    ไว้ดูว่ายังมีลิงก์ไหนไม่แนบรหัส · เจ้าของยืนยันว่าพรีวิวใน ERP ใช้ได้ครบแล้ว → เปลี่ยนเป็น true (เฟส C)
 */
import { apiCan } from "@/lib/api-auth";
import { verifyPreviewKey } from "@/lib/storefront-preview-key";

export const PREVIEW_KEY_REQUIRED = false;

export async function previewAccess(request: Request, shopSlug: string, pk?: unknown): Promise<"key" | "staff" | "none"> {
  const key = pk !== undefined ? pk : new URL(request.url).searchParams.get("pk");
  if (verifyPreviewKey(shopSlug, key)) return "key";
  if (request.headers.get("authorization") && (await apiCan(request, "products.view"))) return "staff";
  return "none";
}

/** ให้เห็นร่าง (preview=1) ได้ไหม — ไม่มีสิทธิ์ = จด log · ช่วงเปลี่ยนผ่านยังปล่อยผ่าน */
export async function allowDraftPreview(request: Request, shopSlug: string, where: string): Promise<boolean> {
  if ((await previewAccess(request, shopSlug)) !== "none") return true;
  console.warn(`[preview] ไม่มีรหัสพรีวิว · ${where} · shop=${shopSlug} · ref=${request.headers.get("referer") ?? "-"}`);
  return !PREVIEW_KEY_REQUIRED;
}
