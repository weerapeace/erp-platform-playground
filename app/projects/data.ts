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

// ---- Board items ----
export type BoardItem = {
  id: string; board_id: string; item_type: string;
  title: string | null; content: string | null; url: string | null; r2_key: string | null; thumbnail_url: string | null;
  sku_id: string | null; parent_sku_id: string | null; task_id: string | null; google_slides_url: string | null;
  x: number; y: number; width: number; height: number; rotation: number; z_index: number;
  color: string | null; tags: string[] | null; status: string; data: Record<string, unknown>;
  sku_info?: { code: string | null; name: string | null; color: string | null; price: number | null; image_key: string | null } | null;
  reactions?: { vote: number; pin: number; like: number };
  my_reactions?: string[];
  comment_count?: number;
};
export type BoardComment = { id: string; item_id: string; author_id: string | null; author_name: string | null; body: string; mentions: string[]; created_at: string };

export async function listItems(boardId: string): Promise<BoardItem[]> {
  const j = await ok(await apiFetch(`/api/creative-boards/${boardId}/items`));
  return (j.data as BoardItem[]) ?? [];
}
export async function createItem(boardId: string, body: Record<string, unknown>): Promise<BoardItem> {
  const j = await ok(await apiFetch(`/api/creative-boards/${boardId}/items`, { method: "POST", body: JSON.stringify(body) }));
  return j.data as BoardItem;
}
export async function updateItem(id: string, patch: Record<string, unknown>): Promise<BoardItem> {
  const j = await ok(await apiFetch(`/api/creative-board-items/${id}`, { method: "PATCH", body: JSON.stringify(patch) }));
  return j.data as BoardItem;
}
export async function deleteItem(id: string): Promise<void> { await ok(await apiFetch(`/api/creative-board-items/${id}`, { method: "DELETE" })); }

// ---- comments + reactions ----
export async function listItemComments(itemId: string): Promise<BoardComment[]> {
  const j = await ok(await apiFetch(`/api/creative-board-items/${itemId}/comments`));
  return (j.data as BoardComment[]) ?? [];
}
export async function addItemComment(itemId: string, body: string, mentions: string[] = []): Promise<BoardComment> {
  const j = await ok(await apiFetch(`/api/creative-board-items/${itemId}/comments`, { method: "POST", body: JSON.stringify({ body, mentions }) }));
  return j.data as BoardComment;
}
export async function toggleReaction(itemId: string, type: "vote" | "pin" | "like"): Promise<boolean> {
  const j = await ok(await apiFetch(`/api/creative-board-items/${itemId}/reactions`, { method: "POST", body: JSON.stringify({ type }) }));
  return (j.active as boolean) ?? false;
}

// ---- Send to Production ----
export const PRODUCTION_TASKS: { task_type: string; label: string }[] = [
  { task_type: "photo_shoot", label: "ถ่ายรูปสินค้า" },
  { task_type: "photo_edit", label: "แต่งรูป Shopee / Lazada" },
  { task_type: "product_image", label: "ทำรูปปก / Detail" },
  { task_type: "banner", label: "ทำ Banner" },
  { task_type: "video", label: "ทำ Video Content" },
  { task_type: "caption", label: "เขียน Caption" },
  { task_type: "product_listing", label: "ลงสินค้า Marketplace" },
  { task_type: "social_post", label: "โพสต์ Social" },
];
export async function sendToProduction(projectId: string, tasks: { task_type: string; title: string }[]): Promise<number> {
  const j = await ok(await apiFetch(`/api/creative-projects/${projectId}/send-to-production`, { method: "POST", body: JSON.stringify({ tasks }) }));
  return (j.created as number) ?? 0;
}

// summary keys
export const SUMMARY_FIELDS: { key: string; label: string }[] = [
  { key: "mood", label: "Mood / โทน" },
  { key: "photo", label: "สไตล์ภาพ" },
  { key: "video", label: "สไตล์วิดีโอ" },
  { key: "banner", label: "ข้อความ Banner" },
  { key: "target", label: "กลุ่มเป้าหมาย" },
];
