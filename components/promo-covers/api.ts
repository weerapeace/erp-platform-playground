/**
 * 🖼 เปลี่ยนปกโปรทุกร้าน — ตัวเรียก API ฝั่งหน้าจอ (/api/promo-covers) + ชนิดข้อมูลที่หน้าใช้
 */
import { apiFetch } from "@/lib/api";
import type { CampaignStatus, PromoPlatform, TargetCounts, TargetStatus } from "@/lib/promo-cover";

export type Campaign = {
  id: string; name: string; status: CampaignStatus; starts_at: string | null; ends_at: string | null; auto_revert: boolean; early_hours: number;
  platforms: string[]; frame_key: string | null; note: string | null; confirmed_at: string | null; confirmed_by: string | null;
  revert_requested_at: string | null; deleted_at: string | null; created_by: string | null; created_at: string; updated_at: string;
};
export type CampaignListRow = Campaign & { items: number; counts: TargetCounts };
export type Item = { id: string; campaign_id: string; parent_sku_id: string; promo_key: string | null; source: "upload" | "library" | "frame"; sort_order: number; code: string; name: string; cover_key: string | null; brand_id: string | null };
export type Target = {
  id: string; campaign_id: string; item_id: string; parent_sku_id: string; platform: PromoPlatform; target_key: string; brand_id: string | null; label: string | null;
  status: TargetStatus; before_cover_url: string | null; backup_key: string | null; applied_ref: string | null; error: string | null; attempts: number;
  applied_at: string | null; reverted_at: string | null; updated_at: string;
  /** เปิดหน้าเช็กหลังส่ง (push-open): รหัสสินค้าบนร้าน · Shop ID · slug เว็บ */
  external_product_id?: string | null; shop_ref?: string | null; web_slug?: string | null;
};
/** อัลบั้มปกโปรในคลังรูป (ชื่อตามชื่อชุด · null = ยังไม่มีปก จึงยังไม่สร้าง) — lib/promo-cover-album */
export type PromoAlbum = { id: string; name: string; count: number; own: boolean };
export type Full = { campaign: Campaign; items: Item[]; targets: Target[]; album?: PromoAlbum | null };
export type PlatformSummary = { platform: PromoPlatform; targets: number; ready: number; closed: number; unmatched: number; blocked: string[] };
export type PlannedTarget = { item_id: string; parent_sku_id: string; platform: PromoPlatform; target_key: string; label: string; before_cover_url: string | null; ready: boolean; reason: string | null };
export type Preview = { summary: PlatformSummary[]; targets: PlannedTarget[]; total: number; missingImage: string[] };
export type RunResult = { applied: number; reverted: number; failed: number; conflict: number; remaining: number; campaigns: number; timedOut: boolean };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try { res = await apiFetch(url, init); } catch { throw new Error("เชื่อมต่อระบบไม่ได้ ลองใหม่อีกครั้ง"); }
  const j = await res.json().catch(() => ({})) as T & { error?: string };
  if (!res.ok || j.error) throw new Error(j.error || `ทำรายการไม่สำเร็จ (${res.status})`);
  return j;
}
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const listCampaigns = (trash = false) => call<{ campaigns: CampaignListRow[] }>(`/api/promo-covers${trash ? "?trash=1" : ""}`).then((j) => j.campaigns);
export const createCampaign = (body: Partial<Campaign>) => call<{ campaign: Campaign }>("/api/promo-covers", json("POST", body)).then((j) => j.campaign);
export const getCampaign = (id: string) => call<Full>(`/api/promo-covers/${id}`);
export const patchCampaign = (id: string, body: Record<string, unknown>) => call<Full & { back_to_draft?: boolean }>(`/api/promo-covers/${id}`, json("PATCH", body));
export const deleteCampaign = (id: string) => call<{ ok: true }>(`/api/promo-covers/${id}`, { method: "DELETE" });
export const previewCampaign = (id: string) => call<Preview>(`/api/promo-covers/${id}/preview`);
export const frameBatch = (id: string, itemIds?: string[]) => call<{ done: number; failed: { parent_sku_id: string; error: string }[]; left: number }>(`/api/promo-covers/${id}/frame`, json("POST", itemIds ? { item_ids: itemIds } : {}));
export const confirmCampaign = (id: string, body: { ack?: true; undo?: true }) => call<{ ok: true; created?: number; skipped?: number }>(`/api/promo-covers/${id}/confirm`, json("POST", body));
export const runCampaign = (id: string, mode: "run" | "start_now" | "revert" | "retry" | "force_revert", targetIds?: string[]) =>
  call<RunResult>(`/api/promo-covers/${id}/run`, json("POST", { mode, ...(targetIds ? { target_ids: targetIds } : {}) }));

/** อัปรูปเข้าคลังรูปเรา (โฟลเดอร์ promo-covers · ลงคลังไฟล์กลางให้เอง) → r2 key */
export async function uploadPromoImage(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error(`${file.name}: ใช้ได้แค่รูป JPG / PNG / WEBP`);
  if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name}: ใหญ่เกิน 10MB`);
  const fd = new FormData();
  fd.append("file", file);
  fd.append("folder", "promo-covers");
  const j = await call<{ r2_key?: string }>("/api/admin/upload", { method: "POST", body: fd });
  if (!j.r2_key) throw new Error("อัปโหลดไม่สำเร็จ");
  return j.r2_key;
}

export const imgUrl = (key: string | null | undefined, w = 300) => (key ? `/api/r2-image?key=${encodeURIComponent(key)}&w=${w}` : null);
/** รอบส่ง/ย้อน — เรียกซ้ำจนไม่มีค้าง (สูงสุด 40 รอบ ≈ 30 นาที) */
export async function runUntilDone(id: string, mode: Parameters<typeof runCampaign>[1], onTick: (r: RunResult, total: RunResult) => void, targetIds?: string[]): Promise<RunResult> {
  const total: RunResult = { applied: 0, reverted: 0, failed: 0, conflict: 0, remaining: 0, campaigns: 0, timedOut: false };
  let m = mode;
  for (let i = 0; i < 40; i++) {
    const r = await runCampaign(id, m, targetIds);
    total.applied += r.applied; total.reverted += r.reverted; total.failed += r.failed; total.conflict += r.conflict; total.remaining = r.remaining;
    onTick(r, total);
    if (!r.remaining || mode === "force_revert") break;
    m = "run";   // รอบต่อไปทำต่อจากที่ค้าง (ไม่เลื่อนเวลา/ไม่ตั้งซ้ำ)
  }
  return total;
}
