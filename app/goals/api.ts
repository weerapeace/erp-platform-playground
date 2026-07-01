"use client";

// ตัวเรียก API ของโมดูลเป้าหมาย (ผ่าน apiFetch ที่แนบ token) — หน้า UI เรียกที่นี่ ไม่แตะ Supabase ตรง
import { apiFetch } from "@/lib/api";
import type { Goal, GoalDraft } from "./mock-data";

const JSON_HEADERS = { "Content-Type": "application/json" };

async function unwrap(res: Response) {
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string })?.error || `เกิดข้อผิดพลาด (${res.status})`);
  return j as { data?: unknown };
}

export async function listGoals(): Promise<Goal[]> {
  const j = await unwrap(await apiFetch("/api/goals"));
  return (j.data ?? []) as Goal[];
}

export async function fetchGoal(id: string): Promise<Goal> {
  const j = await unwrap(await apiFetch(`/api/goals/${id}`));
  return j.data as Goal;
}

export async function createGoal(input: GoalDraft): Promise<Goal> {
  const j = await unwrap(await apiFetch("/api/goals", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(input) }));
  return j.data as Goal;
}

export async function updateGoal(id: string, patch: Record<string, unknown>): Promise<Goal> {
  const j = await unwrap(await apiFetch(`/api/goals/${id}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(patch) }));
  return j.data as Goal;
}

export async function deleteGoal(id: string): Promise<void> {
  await unwrap(await apiFetch(`/api/goals/${id}`, { method: "DELETE" }));
}

export async function updateStep(goalId: string, stepId: string, patch: Record<string, unknown>): Promise<Goal> {
  const j = await unwrap(await apiFetch(`/api/goals/${goalId}/steps`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ stepId, ...patch }) }));
  return j.data as Goal;
}

export async function addStep(goalId: string, input: { title: string; target_date?: string }): Promise<Goal> {
  const j = await unwrap(await apiFetch(`/api/goals/${goalId}/steps`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(input) }));
  return j.data as Goal;
}

export async function addCheckin(goalId: string, input: { health?: string; current_value?: number | null; note?: string }): Promise<Goal> {
  const j = await unwrap(await apiFetch(`/api/goals/${goalId}/checkins`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(input) }));
  return j.data as Goal;
}

export type ExerciseLog = { activity_type?: string; title: string; quantity: number; unit?: string };

export async function addExercise(goalId: string, input: ExerciseLog): Promise<Goal> {
  const j = await unwrap(await apiFetch(`/api/goals/${goalId}/exercise`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(input) }));
  return j.data as Goal;
}
