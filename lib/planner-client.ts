"use client";

// ============================================================
// ของกลาง — เรียกใช้แผนงานส่วนตัวจากฝั่งหน้าเว็บ
// โมดูลอื่นที่อยากมีปุ่ม "➕ ใส่แผนงานฉัน" ให้ import addToPlan() จากไฟล์นี้
// ตัวอย่าง: addToPlan({ title: "อนุมัติ PR-2026-00184", bucket: "today",
//                      source_type: "notification", source_id: n.id, link: n.link_url, module: "purchasing" })
// ============================================================

import { apiFetch } from "./api";
import type { PlanBucket, PlanDraft, PlanItem } from "./planner";

type PlanResponse = { data: PlanItem[]; error: string | null };

async function readJson(res: Response): Promise<PlanResponse> {
  const j = (await res.json().catch(() => ({}))) as Partial<PlanResponse>;
  if (!res.ok || j.error) throw new Error(j.error || `ทำรายการไม่สำเร็จ (${res.status})`);
  return { data: (j.data ?? []) as PlanItem[], error: null };
}

/** แผนงานทั้งหมดของฉัน (ยังไม่ถูกเก็บออกจากบอร์ด) */
export async function listPlan(includeArchived = false): Promise<PlanItem[]> {
  const res = await apiFetch(`/api/plan${includeArchived ? "?include_archived=1" : ""}`);
  return (await readJson(res)).data;
}

/** ปักงานเข้าแผน — ส่งได้ทีละใบหรือหลายใบ · งานต้นทางเดิมที่มีอยู่แล้วจะถูกข้าม (ไม่ซ้ำ) */
export async function addToPlan(draft: PlanDraft | PlanDraft[]): Promise<PlanItem[]> {
  const items = Array.isArray(draft) ? draft : [draft];
  if (!items.length) return [];
  const res = await apiFetch("/api/plan", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }),
  });
  return (await readJson(res)).data;
}

/** แก้ใบเดียว (ติ๊กเสร็จ / เปลี่ยนชื่อ / ย้ายช่อง) */
export async function patchPlanItem(id: string, patch: Partial<Pick<PlanItem, "title" | "note" | "bucket" | "sort_order" | "done_at" | "due_at" | "archived_at">>): Promise<PlanItem | null> {
  const res = await apiFetch("/api/plan", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, patch }),
  });
  return (await readJson(res)).data[0] ?? null;
}

/** ย้าย/เรียงใหม่หลายใบพร้อมกัน (หลังลากวาง) */
export async function movePlanItems(moves: { id: string; bucket: PlanBucket; sort_order: number }[]): Promise<PlanItem[]> {
  if (!moves.length) return [];
  const res = await apiFetch("/api/plan", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ moves }),
  });
  return (await readJson(res)).data;
}

export async function deletePlanItem(id: string): Promise<void> {
  const res = await apiFetch(`/api/plan?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  await readJson(res);
}

/**
 * ปิดวัน — เก็บงานที่ทำเสร็จวันนี้ออกจากบอร์ด และ (ถ้า carry=true) ยกงานค้างของวันนี้ไปพรุ่งนี้
 * คืนจำนวนที่เก็บ/ยก เพื่อเอาไปบอกผู้ใช้เป็นภาษาคน
 */
export async function closeDay(carry = true): Promise<{ archived: number; carried: number; data: PlanItem[] }> {
  const res = await apiFetch("/api/plan/close-day", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ carry }),
  });
  const j = (await res.json().catch(() => ({}))) as { data?: PlanItem[]; archived?: number; carried?: number; error?: string | null };
  if (!res.ok || j.error) throw new Error(j.error || `ปิดวันไม่สำเร็จ (${res.status})`);
  return { archived: j.archived ?? 0, carried: j.carried ?? 0, data: (j.data ?? []) as PlanItem[] };
}
