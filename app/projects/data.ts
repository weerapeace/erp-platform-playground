// ============================================================
// Brainstorm Projects — Data Layer (client)
// ใช้ของกลาง brands/campaigns จาก ../tasks/data
// ============================================================
import { apiFetch } from "@/lib/api";
export { listBrands, listCampaigns, type BrandOption, type Campaign } from "../tasks/data";

export type Project = {
  id: string; code: string | null; name: string; status: string;
  brand_id: string | null; brand_label: string | null; brand_color: string | null;
  parent_sku_id: string | null; parent_sku_code: string | null; parent_sku_name: string | null;
  pm_id: string | null; pm_label: string | null;
  google_slides_url: string | null; drive_folder_url: string | null; updated_at: string;
};
export type ProjectSku = { sku_id: string; role: string; code: string | null; name: string | null; color: string | null; price: number | null; image_key: string | null };
export type ProjectDetail = Project & {
  campaign_id: string | null; campaign_label: string | null;
  summary: Record<string, string>; note: string | null; board_id: string | null; skus: ProjectSku[];
};

export const PROJECT_STATUS: { value: string; label: string; cls: string }[] = [
  { value: "brainstorming", label: "ระดมไอเดีย", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "in_progress",   label: "กำลังทำ",    cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { value: "in_production", label: "ส่งผลิตแล้ว", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  { value: "done",          label: "เสร็จ",      cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "cancelled",     label: "ยกเลิก",     cls: "bg-slate-100 text-slate-400 border-slate-200" },
];

async function ok(res: Response): Promise<Record<string, unknown>> { const j = await res.json().catch(() => ({ error: "เครือข่ายผิดพลาด" })); if (!res.ok || j.error) throw new Error((j.error as string) || `HTTP ${res.status}`); return j; }

export async function listProjects(p: { search?: string; status?: string } = {}): Promise<Project[]> {
  const q = new URLSearchParams();
  if (p.search) q.set("search", p.search);
  if (p.status) q.set("status", p.status);
  const j = await ok(await apiFetch(`/api/creative-projects?${q.toString()}`));
  return (j.data as Project[]) ?? [];
}
export async function getProject(id: string): Promise<ProjectDetail> {
  const j = await ok(await apiFetch(`/api/creative-projects/${id}`));
  return j.data as ProjectDetail;
}
export async function createProject(body: Record<string, unknown>): Promise<{ id: string; code: string; board_id: string | null }> {
  const j = await ok(await apiFetch("/api/creative-projects", { method: "POST", body: JSON.stringify(body) }));
  return { id: j.id as string, code: j.code as string, board_id: (j.board_id as string) ?? null };
}
export async function updateProject(id: string, patch: Record<string, unknown>): Promise<void> { await ok(await apiFetch(`/api/creative-projects/${id}`, { method: "PATCH", body: JSON.stringify(patch) })); }
export async function deleteProject(id: string): Promise<void> { await ok(await apiFetch(`/api/creative-projects/${id}`, { method: "DELETE" })); }
