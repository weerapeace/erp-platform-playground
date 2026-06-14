// ============================================================
// Creative Task Manager — Data Layer (client)
// เรียก API จริงผ่าน apiFetch (แนบ token). ของกลางค่าคงที่จาก lib/creative-tasks
// ============================================================
import { apiFetch } from "@/lib/api";

export type {
  CreativeStatus, CreativePriority, ApprovalStatus, AssetStatus, SubtaskStatus, ContentStatus,
} from "@/lib/creative-tasks";
export {
  STATUS_META, PRIORITY_META, APPROVAL_META, ASSET_META, PRIORITY_RANK,
  TASK_TYPES, PLATFORMS, TRANSITIONS, PRIMARY_ACTIONS, STATUS_PROGRESS,
  ALL_STATUSES, canTransition,
  CONTENT_STATUS_META, POST_TYPES, HASHTAG_CATEGORIES,
} from "@/lib/creative-tasks";

import type { CreativeStatus, CreativePriority, ApprovalStatus, AssetStatus, SubtaskStatus, ContentStatus } from "@/lib/creative-tasks";

// ---- Types (ตรงกับ output ของ /api/creative-tasks) ----
export type CreativeTask = {
  [key: string]: unknown;
  id: string;
  task_no: string | null;
  title: string;
  description: string | null;
  task_type: string | null;
  brand_id: string | null; brand_label: string | null; brand_color: string | null;
  campaign_id: string | null; campaign_label: string | null;
  sku_id: string | null; sku_code: string | null; sku_name: string | null;
  sku_color: string | null; sku_price: number | null; sku_image_key: string | null;
  product_name: string | null;
  priority: CreativePriority;
  status: CreativeStatus;
  progress_percent: number;
  assignee_id: string | null; assignee_label: string | null;
  reviewer_id: string | null; reviewer_label: string | null;
  approver_id: string | null; approver_label: string | null;
  start_date: string | null; due_date: string | null; completed_at: string | null;
  approval_status: ApprovalStatus;
  asset_status: AssetStatus;
  platforms: string[] | null;
  drive_folder_url: string | null; final_asset_url: string | null; published_url: string | null;
  blocker_status: string | null; blocker_reason: string | null;
  is_active: boolean;
  created_at: string; updated_at: string;
};

export type SubtaskAssignee = { id: string; label: string };
export type CreativeSubtask = {
  id: string; task_id: string; title: string; description: string | null;
  assignee_id: string | null;
  assignees: SubtaskAssignee[];
  attachments?: CreativeAttachment[];
  status: SubtaskStatus; due_date: string | null;
  required_before_next: boolean; sort_order: number;
};

export type CreativeComment = {
  id: string; task_id: string; author_id: string | null; author_name: string | null;
  body: string; mentions: string[]; created_at: string;
};

export type CreativeAttachment = {
  id: string; task_id: string; kind: string; label: string | null;
  url: string | null; r2_key: string | null; file_name: string | null;
  content_type: string | null; size_bytes: number | null; created_at: string;
};

export type TaskDetail = CreativeTask & {
  subtasks: CreativeSubtask[];
  comments: CreativeComment[];
  attachments: CreativeAttachment[];
};

export type Campaign = {
  id: string; name: string; brand_id: string | null; brand_label: string | null; brand_color: string | null;
  objective: string | null; status: string; start_date: string | null; end_date: string | null;
  owner_id: string | null; owner_label: string | null; note: string | null;
};

export type BrandOption = { id: string; name: string; color: string | null };

// ---- helpers ----
function today(): string { return new Date().toISOString().slice(0, 10); }

export function isOverdue(t: { due_date: string | null; status: string }): boolean {
  return !!t.due_date && t.due_date < today() && t.status !== "done" && t.status !== "cancelled" && t.status !== "published";
}
export function withinThisWeek(t: { due_date: string | null; status: string }): boolean {
  if (!t.due_date) return false;
  const diff = (new Date(t.due_date).getTime() - new Date(today()).getTime()) / 86400000;
  return diff >= 0 && diff <= 7 && t.status !== "done" && t.status !== "cancelled";
}

async function jsonOrThrow(res: Response): Promise<Record<string, unknown>> {
  const j = await res.json().catch(() => ({ error: "เครือข่ายผิดพลาด" }));
  if (!res.ok || j.error) throw new Error((j.error as string) || `HTTP ${res.status}`);
  return j;
}

// ---- Tasks ----
export type TaskListParams = {
  search?: string; status?: string; priority?: string; task_type?: string;
  campaign_id?: string; assignee_id?: string; brand_id?: string; mine?: boolean;
  sort_by?: string; sort_dir?: "asc" | "desc"; include_inactive?: boolean;
};

export async function listTasks(params: TaskListParams = {}): Promise<CreativeTask[]> {
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  if (params.status) q.set("status", params.status);
  if (params.priority) q.set("priority", params.priority);
  if (params.task_type) q.set("task_type", params.task_type);
  if (params.campaign_id) q.set("campaign_id", params.campaign_id);
  if (params.assignee_id) q.set("assignee_id", params.assignee_id);
  if (params.brand_id) q.set("brand_id", params.brand_id);
  if (params.mine) q.set("mine", "1");
  if (params.sort_by) q.set("sort_by", params.sort_by);
  if (params.sort_dir) q.set("sort_dir", params.sort_dir);
  if (params.include_inactive) q.set("include_inactive", "1");
  const res = await apiFetch(`/api/creative-tasks?${q.toString()}`);
  const j = await jsonOrThrow(res);
  return (j.data as CreativeTask[]) ?? [];
}

export async function getTask(id: string): Promise<TaskDetail> {
  const res = await apiFetch(`/api/creative-tasks/${id}`);
  const j = await jsonOrThrow(res);
  return j.data as TaskDetail;
}

export type CreateTaskBody = Partial<Omit<CreativeTask, "id">> & { title: string; platforms?: string[]; subtasks?: { title: string; description?: string | null; assignee_id?: string | null; assignee_ids?: string[]; required_before_next?: boolean }[] };

export async function createTask(body: CreateTaskBody): Promise<{ id: string; task_no: string }> {
  const res = await apiFetch("/api/creative-tasks", { method: "POST", body: JSON.stringify(body) });
  const j = await jsonOrThrow(res);
  return { id: j.id as string, task_no: j.task_no as string };
}

export async function updateTask(id: string, patch: Record<string, unknown>): Promise<CreativeTask> {
  const res = await apiFetch(`/api/creative-tasks/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  const j = await jsonOrThrow(res);
  return j.data as CreativeTask;
}

export async function transitionTask(id: string, to: CreativeStatus, comment?: string): Promise<CreativeTask> {
  return updateTask(id, { action: "transition", to, comment });
}

export async function approveTask(id: string, action: "approve" | "reject" | "revise", comment?: string): Promise<CreativeTask> {
  return updateTask(id, { action, comment });
}

export async function deleteTask(id: string): Promise<void> {
  await jsonOrThrow(await apiFetch(`/api/creative-tasks/${id}`, { method: "DELETE" }));
}

// ---- Subtasks ----
export async function addSubtask(taskId: string, body: { title: string; description?: string | null; assignee_ids?: string[]; due_date?: string | null; required_before_next?: boolean }): Promise<CreativeSubtask> {
  const j = await jsonOrThrow(await apiFetch(`/api/creative-tasks/${taskId}/subtasks`, { method: "POST", body: JSON.stringify(body) }));
  return j.data as CreativeSubtask;
}
export async function updateSubtask(taskId: string, subtaskId: string, patch: Record<string, unknown>): Promise<CreativeSubtask> {
  const j = await jsonOrThrow(await apiFetch(`/api/creative-tasks/${taskId}/subtasks`, { method: "PATCH", body: JSON.stringify({ subtask_id: subtaskId, ...patch }) }));
  return j.data as CreativeSubtask;
}
export async function deleteSubtask(taskId: string, subtaskId: string): Promise<void> {
  await jsonOrThrow(await apiFetch(`/api/creative-tasks/${taskId}/subtasks?subtask_id=${subtaskId}`, { method: "DELETE" }));
}

// ---- Comments ----
export async function addComment(taskId: string, body: string, mentions: string[] = []): Promise<CreativeComment> {
  const j = await jsonOrThrow(await apiFetch(`/api/creative-tasks/${taskId}/comments`, { method: "POST", body: JSON.stringify({ body, mentions }) }));
  return j.data as CreativeComment;
}

// ---- Attachments ----
export async function addAttachment(taskId: string, body: { kind?: string; label?: string; url?: string; subtask_id?: string }): Promise<CreativeAttachment> {
  const j = await jsonOrThrow(await apiFetch(`/api/creative-tasks/${taskId}/attachments`, { method: "POST", body: JSON.stringify(body) }));
  return j.data as CreativeAttachment;
}
export async function deleteAttachment(taskId: string, attId: string): Promise<void> {
  await jsonOrThrow(await apiFetch(`/api/creative-tasks/${taskId}/attachments?attachment_id=${attId}`, { method: "DELETE" }));
}

// ---- Campaigns ----
export type CampaignDetail = {
  campaign: Campaign & { is_active: boolean };
  tasks: CreativeTask[];
  summary: Record<string, number>;
  task_count: number;
};

export async function listCampaigns(includeInactive = false): Promise<Campaign[]> {
  const j = await jsonOrThrow(await apiFetch(`/api/creative-campaigns${includeInactive ? "?include_inactive=1" : ""}`));
  return (j.data as Campaign[]) ?? [];
}
export async function getCampaign(id: string): Promise<CampaignDetail> {
  const j = await jsonOrThrow(await apiFetch(`/api/creative-campaigns/${id}`));
  return j.data as CampaignDetail;
}
export async function createCampaign(body: { name: string; brand_id?: string | null; objective?: string | null; start_date?: string | null; end_date?: string | null; owner_id?: string | null; note?: string | null }): Promise<{ id: string }> {
  const j = await jsonOrThrow(await apiFetch("/api/creative-campaigns", { method: "POST", body: JSON.stringify(body) }));
  return { id: j.id as string };
}
export async function updateCampaign(id: string, patch: Record<string, unknown>): Promise<void> {
  await jsonOrThrow(await apiFetch(`/api/creative-campaigns/${id}`, { method: "PATCH", body: JSON.stringify(patch) }));
}
export async function deleteCampaign(id: string): Promise<void> {
  await jsonOrThrow(await apiFetch(`/api/creative-campaigns/${id}`, { method: "DELETE" }));
}

// ---- Brands (ของกลาง /api/brands) ----
export async function listBrands(): Promise<BrandOption[]> {
  const j = await jsonOrThrow(await apiFetch("/api/brands"));
  return ((j.data as { id: string; name: string; color: string | null }[]) ?? []).map((b) => ({ id: b.id, name: b.name, color: b.color }));
}

// ============================================================
// Content / Social
// ============================================================
export type ContentCaption = { id?: string; platform: string; caption: string | null; hashtags: string | null; sort_order?: number };
export type ContentItem = {
  [key: string]: unknown;
  id: string; content_no: string | null; title: string;
  campaign_id: string | null; campaign_label: string | null;
  brand_id: string | null; brand_label: string | null; brand_color: string | null;
  sku_id: string | null; sku_code: string | null; sku_name: string | null; product_name: string | null;
  post_type: string | null; platforms: string[] | null; status: ContentStatus; approval_status: string;
  scheduled_at: string | null; published_at: string | null; published_url: string | null;
  product_links: { platform: string; url: string }[]; note: string | null; updated_at: string;
};
export type ContentDetail = ContentItem & { captions: ContentCaption[] };
export type Hashtag = { id: string; text: string; brand_id: string | null; category: string; platform: string | null; usage_count: number; status: string };

export type ContentListParams = { search?: string; status?: string; campaign_id?: string; brand_id?: string; platform?: string };
export async function listContent(p: ContentListParams = {}): Promise<ContentItem[]> {
  const q = new URLSearchParams();
  if (p.search) q.set("search", p.search);
  if (p.status) q.set("status", p.status);
  if (p.campaign_id) q.set("campaign_id", p.campaign_id);
  if (p.brand_id) q.set("brand_id", p.brand_id);
  if (p.platform) q.set("platform", p.platform);
  const j = await jsonOrThrow(await apiFetch(`/api/creative-content?${q.toString()}`));
  return (j.data as ContentItem[]) ?? [];
}
export async function getContent(id: string): Promise<ContentDetail> {
  const j = await jsonOrThrow(await apiFetch(`/api/creative-content/${id}`));
  return j.data as ContentDetail;
}
export async function createContent(body: Record<string, unknown>): Promise<{ id: string; content_no: string }> {
  const j = await jsonOrThrow(await apiFetch("/api/creative-content", { method: "POST", body: JSON.stringify(body) }));
  return { id: j.id as string, content_no: j.content_no as string };
}
export async function updateContent(id: string, patch: Record<string, unknown>): Promise<ContentDetail> {
  const j = await jsonOrThrow(await apiFetch(`/api/creative-content/${id}`, { method: "PATCH", body: JSON.stringify(patch) }));
  return j.data as ContentDetail;
}
export async function deleteContent(id: string): Promise<void> {
  await jsonOrThrow(await apiFetch(`/api/creative-content/${id}`, { method: "DELETE" }));
}

// ---- Hashtags ----
export async function listHashtags(p: { search?: string; brand_id?: string; platform?: string; category?: string } = {}): Promise<Hashtag[]> {
  const q = new URLSearchParams();
  if (p.search) q.set("search", p.search);
  if (p.brand_id) q.set("brand_id", p.brand_id);
  if (p.platform) q.set("platform", p.platform);
  if (p.category) q.set("category", p.category);
  const j = await jsonOrThrow(await apiFetch(`/api/creative-hashtags?${q.toString()}`));
  return (j.data as Hashtag[]) ?? [];
}
export async function createHashtag(body: { text: string; brand_id?: string | null; category?: string; platform?: string | null }): Promise<Hashtag> {
  const j = await jsonOrThrow(await apiFetch("/api/creative-hashtags", { method: "POST", body: JSON.stringify(body) }));
  return j.data as Hashtag;
}
export async function deleteHashtag(id: string): Promise<void> {
  await jsonOrThrow(await apiFetch(`/api/creative-hashtags?id=${id}`, { method: "DELETE" }));
}

// ============================================================
// Templates + Recurring
// ============================================================
export type TemplateStep = { title: string; description?: string | null; required_before_next?: boolean; assignee_ids?: string[]; assignee_labels?: string[] };
export type TaskTemplate = {
  id: string; name: string; task_type: string | null; default_priority: string;
  brand_id: string | null; brand_label?: string | null; description: string | null;
  platforms: string[] | null; steps: TemplateStep[];
};
export type RecurringRule = {
  id: string; name: string; template_id: string | null; template_label?: string | null;
  frequency: string; interval_n: number; assignee_id: string | null; assignee_label?: string | null;
  brand_id: string | null; brand_label?: string | null; campaign_id: string | null;
  start_date: string; end_date: string | null; next_run: string | null; last_run: string | null; is_active: boolean;
};

export async function listTemplates(search?: string): Promise<TaskTemplate[]> {
  const j = await jsonOrThrow(await apiFetch(`/api/creative-templates${search ? `?search=${encodeURIComponent(search)}` : ""}`));
  return (j.data as TaskTemplate[]) ?? [];
}
export async function createTemplate(body: Record<string, unknown>): Promise<{ id: string }> {
  const j = await jsonOrThrow(await apiFetch("/api/creative-templates", { method: "POST", body: JSON.stringify(body) }));
  return { id: j.id as string };
}
export async function updateTemplate(id: string, patch: Record<string, unknown>): Promise<void> {
  await jsonOrThrow(await apiFetch(`/api/creative-templates/${id}`, { method: "PATCH", body: JSON.stringify(patch) }));
}
export async function deleteTemplate(id: string): Promise<void> {
  await jsonOrThrow(await apiFetch(`/api/creative-templates/${id}`, { method: "DELETE" }));
}

export async function listRecurring(run = false): Promise<{ data: RecurringRule[]; generated: number }> {
  const j = await jsonOrThrow(await apiFetch(`/api/creative-recurring${run ? "?run=1" : ""}`));
  return { data: (j.data as RecurringRule[]) ?? [], generated: (j.generated as number) ?? 0 };
}
export async function createRecurring(body: Record<string, unknown>): Promise<{ id: string }> {
  const j = await jsonOrThrow(await apiFetch("/api/creative-recurring", { method: "POST", body: JSON.stringify(body) }));
  return { id: j.id as string };
}
export async function updateRecurring(id: string, patch: Record<string, unknown>): Promise<void> {
  await jsonOrThrow(await apiFetch(`/api/creative-recurring/${id}`, { method: "PATCH", body: JSON.stringify(patch) }));
}
export async function deleteRecurring(id: string): Promise<void> {
  await jsonOrThrow(await apiFetch(`/api/creative-recurring/${id}`, { method: "DELETE" }));
}
export async function runRecurringNow(id: string): Promise<number> {
  const j = await jsonOrThrow(await apiFetch(`/api/creative-recurring/${id}`, { method: "POST", body: JSON.stringify({ action: "run" }) }));
  return (j.created as number) ?? 0;
}
