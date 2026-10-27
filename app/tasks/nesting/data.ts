"use client";

/**
 * ข้อมูลงานจัดเรียงงานพิมพ์ ฝั่ง ERP (/api/nesting-jobs) — งานที่บันทึกไว้ เปิดต่อจากเครื่องไหนก็ได้
 * ตัวคำนวณ (ตัวช่วยในเครื่อง) อยู่ที่ lib/nesting-helper.ts
 */
import { apiFetch } from "@/lib/api";
import type {
  NestingItem, NestingJobRow, NestingLock, NestingPiece, NestingResult, NestingStatus, RotateLock, SplitParams,
} from "@/app/api/nesting-jobs/shared";

export type { NestingItem, NestingJobRow, NestingLock, NestingPiece, NestingResult, NestingStatus, RotateLock, SplitParams };

/** มุมหมุนของลายที่ล็อก → รายการมุมที่ส่งให้ตัวช่วย (ตามแผ่น = ไม่ส่ง) */
export const ROTATE_LOCK_ANGLES: Record<RotateLock, number[] | null> = { sheet: null, none: [0], flip: [0, 180], quad: [0, 90, 180, 270] };

// ---------------------------------------------------------------- ไฟล์พิมพ์ในคลังกลาง (R2) + ไซส์ในคลัง

export type CloudPrint = { sha: string; name: string; size: number | null };

/** เตรียมส่งไฟล์ขึ้นคลัง: มีแล้ว = ไม่ต้องส่ง · ไม่มี = ลิงก์ PUT ให้ตัวช่วยส่งตรง */
export async function openPrintUpload(sha: string): Promise<{ exists: boolean; put_url: string | null }> {
  return json(await apiFetch("/api/nesting-jobs/print-files", { method: "POST", body: JSON.stringify({ sha }) }));
}
/** ยืนยันว่าไฟล์ขึ้นคลังแล้ว + จำไว้กับลายในคลัง (มี asset_id = แทนที่ไฟล์เดิมของลายนั้น) */
export async function confirmPrintUpload(sha: string, name: string, assetId: string | null): Promise<void> {
  await json(await apiFetch("/api/nesting-jobs/print-files", { method: "PUT", body: JSON.stringify({ sha, name, asset_id: assetId }) }));
}
/** ลิงก์โหลดไฟล์จากคลัง (ไม่มีในคลัง = exists false) */
export async function printDownloadUrl(sha: string): Promise<{ exists: boolean; get_url: string | null }> {
  return json(await apiFetch(`/api/nesting-jobs/print-files?sha=${sha}`));
}
/** ไฟล์พิมพ์ที่จำไว้กับลายในคลัง */
export async function getAssetPrints(ids: string[]): Promise<Record<string, CloudPrint>> {
  if (!ids.length) return {};
  return json<Record<string, CloudPrint>>(await apiFetch(`/api/nesting-jobs/asset-prints?ids=${ids.join(",")}`));
}
/** เพิ่มไซส์เข้าลายในคลัง → รายการไซส์ล่าสุด */
export async function addAssetSize(assetId: string, size: { label: string; w: number | null; h: number | null; unit: "cm" }): Promise<{ sizes: import("@/app/api/assets/shared").AssetSize[]; added: boolean }> {
  return json(await apiFetch("/api/nesting-jobs/asset-sizes", { method: "POST", body: JSON.stringify({ asset_id: assetId, size }) }));
}

/** ค่าแยกชิ้นที่จำไว้กับลายในคลัง (เฉพาะลายที่ตั้งไว้) */
export async function getAssetSplits(ids: string[]): Promise<Record<string, SplitParams>> {
  if (!ids.length) return {};
  return json<Record<string, SplitParams>>(await apiFetch(`/api/nesting-jobs/asset-split?ids=${ids.join(",")}`));
}

/** จำ/เลิกจำ การแยกชิ้นกับลายในคลัง (split = null = เลิกแยก) */
export async function saveAssetSplit(assetId: string, split: SplitParams | null): Promise<void> {
  await json(await apiFetch("/api/nesting-jobs/asset-split", { method: "PUT", body: JSON.stringify({ asset_id: assetId, split }) }));
}

export type PrintType = { id: string; code: string; name: string; default_w: number | null; default_h: number | null; unit: string };

export type JobDraft = {
  name: string;
  status: NestingStatus;
  print_type_id: string | null;
  settings: Record<string, unknown>;
  items: NestingItem[];
  result: NestingResult | null;
};

async function json<T>(res: Response): Promise<T> {
  let j: { data?: unknown; error?: string | null } = {};
  try { j = await res.json(); } catch { /* ไม่ใช่ JSON */ }
  if (!res.ok || j.error) throw new Error(j.error || `(${res.status})`);
  return j.data as T;
}

export async function listNestingJobs(): Promise<NestingJobRow[]> {
  return json<NestingJobRow[]>(await apiFetch("/api/nesting-jobs"));
}

export async function getNestingJob(id: string): Promise<NestingJobRow> {
  return json<NestingJobRow>(await apiFetch(`/api/nesting-jobs/${id}`));
}

export async function createNestingJob(draft: JobDraft): Promise<NestingJobRow> {
  return json<NestingJobRow>(await apiFetch("/api/nesting-jobs", { method: "POST", body: JSON.stringify(draft) }));
}

export async function updateNestingJob(id: string, patch: Partial<JobDraft>): Promise<NestingJobRow> {
  return json<NestingJobRow>(await apiFetch(`/api/nesting-jobs/${id}`, { method: "PATCH", body: JSON.stringify(patch) }));
}

export async function deleteNestingJob(id: string): Promise<void> {
  await json(await apiFetch(`/api/nesting-jobs/${id}`, { method: "DELETE" }));
}

// ---------------------------------------------------------------- ส่งเข้าคลังงานพิมพ์ (เฟส 3)

export type DriveGroups = { configured: boolean; subpath: string; folders: string[] };
export type DriveUploads = { folder_url: string; local_path: string; uploads: { key: string; filename: string; upload_url: string }[] };
export type PublishResult = { job: NestingJobRow; asset_id: string; created: boolean; replaced: number; local_path: string };

/** โฟลเดอร์ย่อยที่มีอยู่แล้วใต้ [แม่งานพิมพ์]/Printed/<ประเภท> (ทำ dropdown) */
export async function listDriveGroups(printTypeCode: string): Promise<DriveGroups> {
  return json<DriveGroups>(await apiFetch(`/api/nesting-jobs/drive-groups?print_type=${encodeURIComponent(printTypeCode)}`));
}

/** เปิดช่องอัปโหลดบน Drive ให้ตัวช่วยส่งไฟล์ตรง — files = ชื่อไฟล์ผลลัพธ์ของตัวช่วย (sheet_01.pdf, preview_01.png …) */
export async function openDriveUploads(id: string, body: { print_type_code: string; group: string; files: string[] }): Promise<DriveUploads> {
  return json<DriveUploads>(await apiFetch(`/api/nesting-jobs/${id}/drive`, { method: "POST", body: JSON.stringify(body) }));
}

/** ปิดท้าย: ทับไฟล์เดิม + สร้าง/อัปเดตการ์ดในคลังไฟล์ หมวดงานพิมพ์ + จำไว้ในงาน */
export async function publishToLibrary(id: string, preview: File, meta: Record<string, unknown>): Promise<PublishResult> {
  const fd = new FormData();
  fd.append("file", preview, preview.name);
  fd.append("meta", JSON.stringify(meta));
  return json<PublishResult>(await apiFetch(`/api/nesting-jobs/${id}/publish`, { method: "POST", body: fd }));
}

/** ประเภทงานพิมพ์กลาง (DTF/UV …) = แม่แบบขนาดแผ่น */
export async function listPrintTypes(): Promise<PrintType[]> {
  return json<PrintType[]>(await apiFetch("/api/print-types"));
}

/** ขนาดในหน่วยใด ๆ → mm */
export function toMm(v: number, unit: string): number {
  return unit === "cm" ? v * 10 : unit === "in" ? v * 25.4 : v;
}
