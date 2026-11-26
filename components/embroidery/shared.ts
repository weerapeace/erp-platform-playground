/**
 * 🧵 ไฟล์ปัก — ของใช้ร่วมของหน้าจอ (รายการงาน + หน้าทำงาน + ใบสั่งปัก)
 *   เรียก API ด้วย api() ตัวเดียวกับบล็อกพิมพ์ (components/block-print/shared) — ไม่เขียนซ้ำ
 */
import type { BlockPiece } from "@/lib/block-print";
import { buildDst, dstFileName, type EmbPlan, type EmbSettings } from "@/lib/embroidery";
import { buildPes, pesFileName } from "@/lib/embroidery-pes";
import { b64ToBytes } from "@/lib/embroidery-shop";

export { api, thaiDate } from "@/components/block-print/shared";

export const LIST_HREF = "/master/embroidery";
export const designHref = (id: string) => `${LIST_HREF}/${id}`;
export const sheetHref = (id: string) => `/print/embroidery/${id}`;
export const API = "/api/embroidery/designs";

export type ParentRef = { id: string; code: string; name: string } | null;
export type DesignRow = {
  id: string; code: string; name: string; note: string | null; source_file_name: string | null;
  parent_sku_id: string | null; parent?: ParentRef;
  stitch_count: number; color_count: number; width_mm: number | null; height_mm: number | null;
  is_active: boolean; created_at: string; updated_at: string; deleted_at: string | null;
  shop_file_name?: string | null; shop_file_kind?: "dst" | "pes" | null; shop_file_at?: string | null;
};
export type Design = DesignRow & { pieces: BlockPiece[]; settings: EmbSettings; shop_file_b64?: string | null };

/** ดาวน์โหลดไฟล์ที่ร้านตีบล็อกให้ (ไฟล์ต้นฉบับ ไม่แปลง) */
export const downloadShopFile = (d: Design) => { if (d.shop_file_b64) saveBytes(b64ToBytes(d.shop_file_b64), d.shop_file_name || `${d.code}.${d.shop_file_kind ?? "dst"}`); };

/** ชื่องานตั้งต้นจากชื่อไฟล์ */
export const nameFromFile = (fileName: string) => fileName.replace(/\.(ai|pdf|svg|dst|pes)$/i, "").trim().slice(0, 120) || "งานปักใหม่";

/** ผลการคำนวณที่เก็บไว้โชว์หน้ารายการ */
export const planStats = (plan: EmbPlan) => ({ stitch_count: plan.stitches, color_count: plan.colors.length, width_mm: plan.width, height_mm: plan.height });

function saveBytes(bytes: Uint8Array, fileName: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/octet-stream" }));
  const a = document.createElement("a");
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
/** ดาวน์โหลดไฟล์ .DST (Tajima · สร้างในเบราว์เซอร์) */
export const downloadDst = (plan: EmbPlan, code: string, name: string) => saveBytes(buildDst(plan, `${code} ${name}`), dstFileName(code, name));
/** ดาวน์โหลดไฟล์ .PES (Brother · สร้างในเบราว์เซอร์) */
export const downloadPes = (plan: EmbPlan, code: string, name: string) => saveBytes(buildPes(plan, code), pesFileName(dstFileName(code, name)));

export const fmtNum = (n: number) => Math.round(n).toLocaleString("th-TH");
export const fmtCm = (mm: number | null | undefined) => (mm ? (mm / 10).toFixed(1) : "—");

/** ความแน่นตั้งต้นตามผ้า (ระยะแถวถมเต็ม / ซิกแซก มม.) */
export const DENSITY = [
  { key: "thin", th: "ผ้าบาง", fill: 0.5, satin: 0.45 },
  { key: "normal", th: "ผ้าทั่วไป", fill: 0.45, satin: 0.4 },
  { key: "thick", th: "ผ้าหนา / ยีนส์", fill: 0.4, satin: 0.36 },
] as const;
