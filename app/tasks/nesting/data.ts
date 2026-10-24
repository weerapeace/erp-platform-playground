"use client";

/**
 * ข้อมูลงานจัดเรียงงานพิมพ์ ฝั่ง ERP (/api/nesting-jobs) — งานที่บันทึกไว้ เปิดต่อจากเครื่องไหนก็ได้
 * ตัวคำนวณ (ตัวช่วยในเครื่อง) อยู่ที่ lib/nesting-helper.ts
 */
import { apiFetch } from "@/lib/api";
import type { NestingItem, NestingJobRow, NestingResult, NestingStatus } from "@/app/api/nesting-jobs/shared";

export type { NestingItem, NestingJobRow, NestingResult, NestingStatus };

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

/** ประเภทงานพิมพ์กลาง (DTF/UV …) = แม่แบบขนาดแผ่น */
export async function listPrintTypes(): Promise<PrintType[]> {
  return json<PrintType[]>(await apiFetch("/api/print-types"));
}

/** ขนาดในหน่วยใด ๆ → mm */
export function toMm(v: number, unit: string): number {
  return unit === "cm" ? v * 10 : unit === "in" ? v * 25.4 : v;
}
