/**
 * ✂️ วางแบบบนผ้าลาย — ของใช้ร่วมของหน้าจอ (หน้ารวม · อัลบั้มผ้า · แบบตัด · กระดานวาง · หน้าพิมพ์)
 */
import { useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import type { LayBag, LayCheck, LayItem, LayPiece, LaySettings } from "@/lib/fabric-lay";

export const HOME = "/master/fabric-lay";
export const planHref = (id: string) => `${HOME}/plans/${id}`;
export const patternHref = (id: string) => `${HOME}/patterns/${id}`;
export const printHref = (id: string) => `/print/fabric-lay/${id}`;
export const API = "/api/fabric-lay";
export const FABRIC_KIND = "fabric_lay_type";   // ชุดชื่อประเภทผ้า (FreeTextPicker · ตาราง free_text_names)

export type FabricRow = {
  id: string; code: string; name: string; kind: string | null; note: string | null;
  image_key: string | null; photo_key: string | null; img_w: number | null; img_h: number | null;
  width_cm: number | null; height_cm: number | null; used_area_cm2: number;
  is_active: boolean; created_at: string; updated_at: string; deleted_at: string | null;
};
export type Fabric = FabricRow & { quad: [number, number][] | null; checks: LayCheck[] };

export type PatternRow = {
  id: string; code: string; name: string; parent_sku_id: string | null; parent_code: string | null;
  design_sheet_id: string | null; design_sheet_code: string | null; bag_image: string | null;
  piece_count: number; note: string | null; is_active: boolean; created_at: string; updated_at: string; deleted_at: string | null;
};
export type Pattern = PatternRow & { pieces: LayPiece[]; pattern_project_id?: string | null };

export type PlanRow = {
  id: string; code: string; name: string; fabric_id: string; bags: LayBag[]; note: string | null;
  cut_area_cm2: number; cut_done_at: string | null; cut_done_by: string | null;
  is_active: boolean; created_at: string; updated_at: string; deleted_at: string | null;
};
export type CutPlan = { id: string; code: string; name: string; bags: LayBag[]; items: LayItem[]; settings: LaySettings };
export type PlanFull = PlanRow & { items: LayItem[]; settings: LaySettings; fabric: Fabric | null; patterns: Pattern[]; cut_plans: CutPlan[] };

/** เรียก API แล้วคืน data · error → โยนข้อความภาษาคน */
export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await apiFetch(url, json === undefined ? rest : { ...rest, method: rest.method ?? "POST", headers: { "Content-Type": "application/json", ...(rest.headers ?? {}) }, body: JSON.stringify(json) });
  let j: { data?: T; error?: string | null } = {};
  try { j = await res.json(); } catch { /* ตอบไม่ใช่ JSON */ }
  if (!res.ok || j.error) throw new Error(j.error || (res.status === 403 ? "คุณไม่มีสิทธิ์ทำรายการนี้" : "เกิดข้อผิดพลาด กรุณาลองใหม่"));
  return j.data as T;
}

/** อัปรูปขึ้นที่เก็บรูป (R2 · กฎหมวด board_images) — คืน key */
export async function uploadImage(blob: Blob, name: string): Promise<string> {
  const fd = new FormData();
  fd.append("file", new File([blob], name, { type: blob.type || "image/jpeg" }));
  fd.append("folder", "fabric-lay");
  fd.append("no_library", "1");
  const res = await apiFetch("/api/admin/upload", { method: "POST", body: fd });
  let j: { r2_key?: string; error?: string } = {};
  try { j = await res.json(); } catch { /* ตอบไม่ใช่ JSON */ }
  if (!res.ok || j.error || !j.r2_key) throw new Error(j.error || (res.status === 413 ? "รูปใหญ่เกินไป" : "อัปโหลดรูปไม่สำเร็จ"));
  return j.r2_key;
}

/** ย่อรูปในเครื่อง (ด้านยาว ≤ maxSide) เป็น JPEG — กันไฟล์เกินขนาดอัปโหลด */
export async function shrinkToJpeg(src: Blob, maxSide = 3600, quality = 0.88): Promise<{ blob: Blob; w: number; h: number }> {
  const url = URL.createObjectURL(src);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("เปิดรูปไม่ได้")); im.src = url; });
    const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d"); if (!x) throw new Error("no canvas");
    x.drawImage(img, 0, 0, w, h);
    let q = quality, blob: Blob | null = null;
    for (let i = 0; i < 4; i++) {
      blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", q));
      if (blob && blob.size <= 3.8 * 1024 * 1024) break;
      q -= 0.12;
    }
    if (!blob) throw new Error("แปลงรูปไม่สำเร็จ");
    return { blob, w, h };
  } finally { URL.revokeObjectURL(url); }
}

/** รูปผ้า/ชิ้น: R2 key → proxy (ย่อได้) · URL เต็ม/path ตรง = ใช้ตามนั้น */
export const imgUrl = (key: string | null | undefined, w?: number): string | null => (!key ? null : /^(https?:|\/)/.test(key) ? key : r2ImageUrl(key, w));
/** รูปกระเป๋า: URL เต็ม / proxy path / R2 key */
export const bagImgUrl = (v: string | null | undefined, w?: number): string | null => (!v ? null : /^(https?:|\/)/.test(v) ? v : r2ImageUrl(v, w));

export const thaiDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

export const sizeText = (w: number | null | undefined, h: number | null | undefined) => (w && h ? `${Number(w)}×${Number(h)} ซม.` : "ยังไม่ตั้งขนาด");

/** ยังไม่บันทึก → ถามก่อนปิด/รีโหลดเบราว์เซอร์ (แบบเดียวกับหน้าบล็อกพิมพ์) */
export function useLeaveGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
}

/** ภาพย่อแพทเทิร์นจากสตูดิโอ ("กว้าง สูง|path d") → SVG data URL */
export function studioThumbUrl(t: string | null | undefined): string | null {
  if (!t || !t.includes("|")) return null;
  const [vb, d] = t.split("|");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vb}"><path d="${d}" fill="#eef2ff" stroke="#4f46e5" stroke-width="${Math.max(...vb.split(" ").map(Number)) / 80}" fill-rule="evenodd"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
