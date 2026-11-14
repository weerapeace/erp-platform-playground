/**
 * 📚 Design Library — ชนิดข้อมูล + ตัวช่วยฝั่งหน้าจอ (ใช้ร่วมทุกไฟล์ใน components/design-library)
 * API: /api/design-library/* · กฎกลาง lib/design-library.ts
 */
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import type { Choice, Spec } from "@/lib/design-library";
import type { MaterialInfo } from "@/lib/design-library-cost";

export type Template = {
  id: string; code: string; name: string; description: string | null; category: string | null;
  image_key: string | null; image_w: number | null; image_h: number | null; vector_image_key: string | null;
  default_spec: Partial<Spec> | null; sort_order: number; is_active: boolean; created_at: string; updated_at: string;
  recipe_count?: number;
};
export type RecipeCard = {
  id: string; seq: number; name: string | null; note: string | null; created_by_name: string | null; updated_by_name: string | null;
  created_at: string; updated_at: string; pin_count: number; cover_key: string | null;
};
export type Recipe = {
  id: string; template_id: string; seq: number; name: string | null; note: string | null; spec: Spec; design_sheet_id?: string | null;
  created_by_name: string | null; updated_by_name: string | null; created_at: string; updated_at: string;
};
export type Render = {
  id: string; recipe_id: string; view_key: string; version: number; image_key: string; note: string | null; colorway_id?: string | null;
  created_by_name: string | null; created_at: string;
};
export type CalcRow = { material_type: string; default_face_width_cm: number | null; loss_percent: number | null; uom: string | null; cm_per_unit: number | null };
/** materials = หน่วย/หน้าผ้าของ SKU ในสูตร (ไม่มีราคา) · calc = bom_calc_settings · can_cost = มีสิทธิ์ดูต้นทุน (ไม่มี = spec.cost ว่าง) */
export type RecipeBundle = { recipe: Recipe; template: Template; choices: Choice[]; renders: Render[]; stock: Record<string, number>; materials: Record<string, MaterialInfo>; calc: CalcRow[]; can_cost: boolean };
export const techpackHref = (id: string, colorwayId?: string | null) => `/print/design-library/${id}/techpack${colorwayId ? `?cw=${encodeURIComponent(colorwayId)}` : ""}`;

export const LIB_HREF = "/master/design-library";
export const tplHref = (id: string) => `${LIB_HREF}/${id}`;
export const recipeHref = (id: string) => `${LIB_HREF}/recipe/${id}`;
export const printHref = (id: string, colorwayId?: string | null) => `/print/design-library/${id}${colorwayId ? `?cw=${encodeURIComponent(colorwayId)}` : ""}`;
export const compareHref = (a?: string | null, b?: string | null) => `${LIB_HREF}/compare${a ? `?a=${a}${b ? `&b=${b}` : ""}` : ""}`;
export const img = (key: string | null | undefined, w: number) => r2ImageUrl(key, w) ?? "";

/** เรียก API แล้วคืน data · error → โยนข้อความภาษาคน */
export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await apiFetch(url, json === undefined ? rest : { ...rest, method: rest.method ?? "POST", headers: { "Content-Type": "application/json", ...(rest.headers ?? {}) }, body: JSON.stringify(json) });
  let j: { data?: T; error?: string | null } = {};
  try { j = await res.json(); } catch { /* ตอบไม่ใช่ JSON */ }
  if (!res.ok || j.error) throw new Error(j.error || (res.status === 403 ? "คุณไม่มีสิทธิ์ทำรายการนี้" : "เกิดข้อผิดพลาด กรุณาลองใหม่"));
  return j.data as T;
}

export const thaiDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

export const newId = () => Math.random().toString(36).slice(2, 10);
