"use client";

/**
 * สตูดิโอตัวประกอบสินค้า — ตัวช่วยเรียก API + อัปโหลดรูป + ดาวน์โหลดไฟล์ (ฝั่ง client) ที่ทุกชิ้นของสตูดิโอใช้ร่วม
 * API จริง: app/api/configurator/* (guardApi + writeAudit อยู่ฝั่ง server) · ที่นี่แค่ห่อ apiFetch ให้ข้อความผิดพลาดเป็นภาษาคน
 */
import { apiFetch } from "@/lib/api";
import { CONFIG_IMAGE_FOLDER, type CfgModel, type ConfigData } from "@/lib/product-configurator";

export type CfgShop = { id: string; slug: string; name: string; site_url: string | null; preview_key?: string | null };
export type ResKind = "models" | "slots" | "options" | "layers" | "images" | "rules" | "designs";
export type CfgDesign = { id: string; code: string; model_id: string | null; selections: Record<string, unknown>; total_price: number; status: string; order_ref: string | null; created_at: string };

export const money = (v: unknown) => `฿${(Number(v) || 0).toLocaleString("th-TH", { maximumFractionDigits: 0 })}`;
export const DESIGN_STATUS_TH: Record<string, string> = { saved: "บันทึกไว้", in_cart: "อยู่ในตะกร้า", ordered: "สั่งแล้ว" };

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || j.error) {
    const msg = typeof j.error === "string" && j.error ? j.error : res.status === 401 ? "ต้องเข้าสู่ระบบและมีสิทธิ์ตัวประกอบสินค้า" : res.status === 403 ? "คุณไม่มีสิทธิ์ทำรายการนี้" : `ทำรายการไม่สำเร็จ (${res.status})`;
    throw new Error(msg);
  }
  return j;
}
const json = (method: string, body: unknown) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export async function fetchShops(): Promise<CfgShop[]> {
  return ((await readJson(await apiFetch("/api/configurator/shops"))).data ?? []) as CfgShop[];
}
/** ทรงทั้งหมดของร้าน (รวมที่ปิดอยู่ · ไม่รวมที่ลบแล้ว) */
export async function fetchModels(shopId: string): Promise<CfgModel[]> {
  const j = await readJson(await apiFetch(`/api/configurator/models?shop_id=${encodeURIComponent(shopId)}&include_inactive=true&limit=500`));
  return ((j.data ?? []) as (CfgModel & { deleted_at?: string | null })[]).filter((m) => !m.deleted_at);
}
export async function fetchBundle(modelId: string): Promise<ConfigData> {
  return (await readJson(await apiFetch(`/api/configurator/bundle?model_id=${encodeURIComponent(modelId)}`))).data as ConfigData;
}
export async function createRow<T>(kind: ResKind, body: Record<string, unknown>): Promise<T> {
  return (await readJson(await apiFetch(`/api/configurator/${kind}`, json("POST", body)))).data as T;
}
export async function patchRow<T>(kind: ResKind, id: string, patch: Record<string, unknown>): Promise<T> {
  return (await readJson(await apiFetch(`/api/configurator/${kind}/${encodeURIComponent(id)}`, json("PATCH", patch)))).data as T;
}
/** ลบ: ทรง/ตัวเลือก = ลบแบบกู้คืนได้ (hard=false) · ช่อง/ชั้น/รูป/กติกา = ลบจริงเสมอ */
export async function deleteRow(kind: ResKind, id: string, hard = false): Promise<void> {
  await readJson(await apiFetch(`/api/configurator/${kind}/${encodeURIComponent(id)}${hard ? "?hard=1" : ""}`, { method: "DELETE" }));
}
export async function runAction(body: Record<string, unknown>): Promise<{ model_id?: string; updated?: number }> {
  return ((await readJson(await apiFetch("/api/configurator/actions", json("POST", body)))).data ?? {}) as { model_id?: string; updated?: number };
}
export async function fetchDesigns(shopId: string, modelId: string): Promise<CfgDesign[]> {
  const j = await readJson(await apiFetch(`/api/configurator/designs?shop_id=${encodeURIComponent(shopId)}&model_id=${encodeURIComponent(modelId)}&limit=500`));
  return (j.data ?? []) as CfgDesign[];
}

// ─── รูป PNG ─────────────────────────────────────────────────────────────────
export const PNG_WARN_BYTES = 4 * 1024 * 1024;
export type PngInfo = { ok: boolean; error?: string; width: number | null; height: number | null; hasAlpha: boolean | null; warnings: string[] };

/** อ่านหัวไฟล์ PNG: ลายเซ็น + ขนาด (IHDR) + มีช่องโปร่งไหม (color type 4/6 · 3 อาจมี tRNS) */
export async function inspectPng(file: File): Promise<PngInfo> {
  const warnings: string[] = [];
  const looksPng = file.type === "image/png" || /\.png$/i.test(file.name);
  if (!looksPng) return { ok: false, error: "ไม่ใช่ไฟล์ PNG — ต้องเป็น PNG พื้นใส (ไดคัทพื้นออกแล้ว)", width: null, height: null, hasAlpha: null, warnings };
  const head = new Uint8Array(await file.slice(0, 33).arrayBuffer());
  const sig = [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => head[i] === b);
  if (!sig) return { ok: false, error: "เนื้อไฟล์ไม่ใช่ PNG จริง (นามสกุลอาจถูกเปลี่ยน)", width: null, height: null, hasAlpha: null, warnings };
  const dv = new DataView(head.buffer);
  const width = dv.getUint32(16), height = dv.getUint32(20), colorType = head[25];
  const hasAlpha = colorType === 4 || colorType === 6 ? true : colorType === 3 ? null : false;
  if (hasAlpha === false) warnings.push("ไม่มีช่องโปร่ง (พื้นทึบ) — จะทับชั้นอื่นเป็นสี่เหลี่ยม ควรไดคัทพื้นออก");
  if (file.size > PNG_WARN_BYTES) warnings.push(`ไฟล์ ${(file.size / 1024 / 1024).toFixed(1)} MB ใหญ่ — หน้าเว็บโหลดช้า แนะนำบีบอัด PNG ก่อน`);
  return { ok: true, width, height, hasAlpha, warnings };
}

/** อัปโหลด PNG ขึ้น R2 (ไม่ย่อ · ลงคลังไฟล์กลางโฟลเดอร์ configurator-parts) → r2_key */
export async function uploadPng(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("folder", CONFIG_IMAGE_FOLDER);
  const res = await apiFetch("/api/admin/upload", { method: "POST", body: fd });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(String(j.error ?? `อัปโหลดไม่สำเร็จ (${res.status})`));
  return String(j.r2_key);
}

// ─── ดาวน์โหลดไฟล์ (แม่แบบ / รายการรูป) ───────────────────────────────────────
export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export const downloadText = (name: string, text: string, mime: string) => downloadBlob(name, new Blob([text], { type: mime }));

/** แปลงแม่แบบ SVG → PNG พื้นใสขนาดจริง (รูปผีที่ฝังต้องมาจาก /api/r2-image โดเมนเดียวกัน ไม่งั้นวาดลงผืนไม่ได้) */
export async function svgToPng(svg: string, w: number, h: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((ok, fail) => { img.onload = () => ok(); img.onerror = () => fail(new Error("วาดแม่แบบไม่สำเร็จ")); img.src = url; });
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("สร้าง PNG ไม่สำเร็จ"))), "image/png"));
  } finally { URL.revokeObjectURL(url); }
}

/** โหลดรูปจาก URL เดียวกันเป็น data URL (ใช้ฝังรูปผีลงแม่แบบ PNG) */
export async function toDataUrl(src: string): Promise<string | null> {
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => ok(null); r.readAsDataURL(blob); });
  } catch { return null; }
}
