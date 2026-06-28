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
  parent_sku_id: string | null; parent_sku_code: string | null; parent_sku_name: string | null;
  product_name: string | null;
  cover_image_r2_key: string | null;
  priority: CreativePriority;
  status: CreativeStatus;
  progress_percent: number;
  assignee_id: string | null; assignee_label: string | null;
  assignees?: SubtaskAssignee[];   // ผู้รับผิดชอบหลายคน (ตั้งเอง ∪ คนเริ่มงานย่อย) — m2m
  reviewer_id: string | null; reviewer_label: string | null;
  approver_id: string | null; approver_label: string | null;
  assigned_by_id?: string | null; assigned_by_label?: string | null;
  assigned_to_id?: string | null; assigned_to_label?: string | null;
  start_date: string | null; due_date: string | null; completed_at: string | null;
  approval_status: ApprovalStatus;
  asset_status: AssetStatus;
  platforms: string[] | null;
  drive_folder_url: string | null; final_asset_url: string | null; published_url: string | null;
  blocker_status: string | null; blocker_reason: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string; updated_at: string;
};

export type SubtaskAssignee = { id: string; label: string; color?: string | null; avatar_url?: string | null };
export type CreativeSubtask = {
  id: string; task_id: string; title: string; description: string | null;
  assignee_id: string | null;
  assignees: SubtaskAssignee[];
  attachments?: CreativeAttachment[];
  status: SubtaskStatus; due_date: string | null;
  required_before_next: boolean; sort_order: number;
  subtask_type?: string | null; config?: SubtaskStepConfig;
  image_sync_targets?: { parent_ids?: string[]; sku_ids?: string[]; sku_images?: Record<string, string[]> } | null; // ปลายทางรูป + รูปร่างต่อ SKU ตอนส่งงาน
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

export type TaskSkuRef = { id: string; code: string | null; name: string | null; color?: string | null; price?: number | null; image_key?: string | null };
export type TaskParentRef = { id: string; code: string | null; name: string | null; image_key?: string | null };
export type TaskDetail = CreativeTask & {
  subtasks: CreativeSubtask[];
  comments: CreativeComment[];
  attachments: CreativeAttachment[];
  skus?: TaskSkuRef[];
  parent_skus?: TaskParentRef[];
};

export type Campaign = {
  id: string; name: string; brand_id: string | null; brand_label: string | null; brand_color: string | null;
  objective: string | null; status: string; start_date: string | null; end_date: string | null;
  owner_id: string | null; owner_label: string | null; note: string | null; detail_html?: string | null;
};

export type BrandOption = { id: string; name: string; color: string | null; logo_url?: string | null };

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

export type CreateTaskBody = Partial<Omit<CreativeTask, "id">> & { title: string; platforms?: string[]; subtasks?: { title: string; description?: string | null; assignee_id?: string | null; assignee_ids?: string[]; required_before_next?: boolean; type?: string | null; config?: SubtaskStepConfig }[]; content_items?: TemplateContentItem[] };

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

export async function transitionTask(id: string, to: string, comment?: string, force?: boolean): Promise<CreativeTask> {
  return updateTask(id, { action: "transition", to, comment, force });
}

export async function approveTask(id: string, action: "approve" | "reject" | "revise", comment?: string, to?: string): Promise<CreativeTask> {
  return updateTask(id, { action, comment, to });
}

export async function deleteTask(id: string): Promise<void> {
  await jsonOrThrow(await apiFetch(`/api/creative-tasks/${id}`, { method: "DELETE" }));
}

// ---- Subtasks ----
export async function listSubtasks(taskId: string): Promise<CreativeSubtask[]> {
  const j = await jsonOrThrow(await apiFetch(`/api/creative-tasks/${taskId}/subtasks`));
  return (j.data as CreativeSubtask[]) ?? [];
}
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

// ---- งานย่อยของฉัน (queue พนักงาน) ----
export type MySubtask = {
  id: string; title: string; status: string; due_date: string | null; required_before_next: boolean;
  task_id: string; task_no: string | null; task_title: string | null; task_status: string | null; priority?: string | null;
};
export async function listMySubtasks(): Promise<MySubtask[]> {
  const j = await jsonOrThrow(await apiFetch("/api/creative-tasks/my-subtasks"));
  return (j.data as MySubtask[]) ?? [];
}

// ---- Comments ----
export async function addComment(taskId: string, body: string, mentions: string[] = []): Promise<CreativeComment> {
  const j = await jsonOrThrow(await apiFetch(`/api/creative-tasks/${taskId}/comments`, { method: "POST", body: JSON.stringify({ body, mentions }) }));
  return j.data as CreativeComment;
}

// ---- Attachments ----
export async function addAttachment(taskId: string, body: { kind?: string; label?: string; url?: string; r2_key?: string; file_name?: string; content_type?: string; size_bytes?: number; subtask_id?: string }): Promise<CreativeAttachment> {
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

// ---- คลังความรู้ (Knowledge) ----
export type KnowledgePage = { id: string; title: string; body_html: string | null; sort_order: number; updated_at: string };
export async function listKnowledge(): Promise<KnowledgePage[]> {
  const j = await jsonOrThrow(await apiFetch("/api/creative-knowledge"));
  return (j.data as KnowledgePage[]) ?? [];
}
export async function createKnowledge(title: string): Promise<KnowledgePage> {
  const j = await jsonOrThrow(await apiFetch("/api/creative-knowledge", { method: "POST", body: JSON.stringify({ title }) }));
  return j.data as KnowledgePage;
}
export async function updateKnowledge(id: string, patch: { title?: string; body_html?: string | null; sort_order?: number }): Promise<void> {
  await jsonOrThrow(await apiFetch(`/api/creative-knowledge/${id}`, { method: "PATCH", body: JSON.stringify(patch) }));
}
export async function deleteKnowledge(id: string): Promise<void> {
  await jsonOrThrow(await apiFetch(`/api/creative-knowledge/${id}`, { method: "DELETE" }));
}

// ---- Brands (ของกลาง /api/brands) ----
export async function listBrands(): Promise<BrandOption[]> {
  const j = await jsonOrThrow(await apiFetch("/api/brands"));
  // กรองเฉพาะแบรนด์ของเรา (ไม่ใช่ "งานลูกค้า") — ใช้ทุกฟอร์มที่เลือกแบรนด์ใน Creative
  return ((j.data as { id: string; name: string; color: string | null; is_customer_job?: boolean; logo_url?: string | null }[]) ?? [])
    .filter((b) => !b.is_customer_job)
    .map((b) => ({ id: b.id, name: b.name, color: b.color, logo_url: b.logo_url ?? null }));
}

// ============================================================
// Content / Social
// ============================================================
export type ContentCaption = { id?: string; platform: string; caption: string | null; hashtags: string | null; caption_type?: string; sort_order?: number };
export type ContentItem = {
  [key: string]: unknown;
  id: string; content_no: string | null; title: string;
  task_id?: string | null;
  campaign_id: string | null; campaign_label: string | null;
  brand_id: string | null; brand_label: string | null; brand_color: string | null;
  sku_id: string | null; sku_code: string | null; sku_name: string | null; sku_color: string | null; sku_price: number | null; product_name: string | null;
  parent_sku_id?: string | null; parent_sku_code?: string | null; parent_sku_name?: string | null;
  post_type: string | null; platforms: string[] | null; status: ContentStatus; approval_status: string;
  scheduled_at: string | null; published_at: string | null; published_url: string | null;
  product_links: { platform: string; url: string }[]; note: string | null; is_template?: boolean; updated_at: string;
  discount_value?: number | null; discount_is_percent?: boolean;
  brand_shop_channels?: { label: string; value: string }[];
};

// ดึงสีของ SKU ลูกทั้งหมดใต้ Parent SKU (รวมไม่ซ้ำ เช่น ["ดำ","น้ำตาล","แดง"])
export async function getParentSkuColors(parentId: string): Promise<string[]> {
  const res = await apiFetch(`/api/pickers/skus?parent_sku_id=${parentId}&limit=50`);
  const j = await res.json().catch(() => ({}));
  const rows = (j.data as { color?: string | null }[]) ?? [];
  return [...new Set(rows.map((r) => (r.color ?? "").trim()).filter(Boolean))];
}

// ---- แม่แบบแคปชั่น + ช่องทางร้าน ----
export type CaptionTemplate = { id?: string; key: string; label: string; body: string; sort_order?: number };
export type ShopChannel = { label: string; value: string };
export async function getCaptionTemplates(brandId: string | null): Promise<{ templates: CaptionTemplate[]; shop_channels: ShopChannel[]; is_brand_specific: boolean }> {
  const j = await jsonOrThrow(await apiFetch(`/api/creative-caption-templates${brandId ? `?brand_id=${brandId}` : ""}`));
  const d = j.data as { templates: CaptionTemplate[]; shop_channels: ShopChannel[]; is_brand_specific: boolean };
  return { templates: d.templates ?? [], shop_channels: d.shop_channels ?? [], is_brand_specific: !!d.is_brand_specific };
}
export async function saveCaptionTemplates(brandId: string | null, templates: CaptionTemplate[], shop_channels?: ShopChannel[]): Promise<void> {
  await jsonOrThrow(await apiFetch("/api/creative-caption-templates", { method: "PUT", body: JSON.stringify({ brand_id: brandId, templates, shop_channels }) }));
}
export type ContentDetail = ContentItem & { captions: ContentCaption[] };
export type Hashtag = { id: string; text: string; brand_id: string | null; category: string; platform: string | null; usage_count: number; status: string };

export type ContentListParams = { search?: string; status?: string; campaign_id?: string; brand_id?: string; platform?: string; templates?: boolean; task_id?: string; unlinked?: boolean };
export async function listContent(p: ContentListParams = {}): Promise<ContentItem[]> {
  const q = new URLSearchParams();
  if (p.search) q.set("search", p.search);
  if (p.status) q.set("status", p.status);
  if (p.campaign_id) q.set("campaign_id", p.campaign_id);
  if (p.brand_id) q.set("brand_id", p.brand_id);
  if (p.platform) q.set("platform", p.platform);
  if (p.templates) q.set("templates", "1");
  if (p.task_id) q.set("task_id", p.task_id);
  if (p.unlinked) q.set("unlinked", "1");
  const j = await jsonOrThrow(await apiFetch(`/api/creative-content?${q.toString()}`));
  return (j.data as ContentItem[]) ?? [];
}
export async function listContentTemplates(): Promise<ContentItem[]> { return listContent({ templates: true }); }
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
// ชนิดงานย่อย (registry กลาง) — จาก /api/subtask-types
export type SubtaskType = {
  key: string; label_th: string; label_en?: string | null; icon?: string | null; color?: string | null;
  sort_order: number; is_active: boolean; is_builtin: boolean;
  accepts_text: boolean; accepts_image: boolean; accepts_multi_image: boolean; accepts_link: boolean; accepts_file: boolean;
  requires_approval: boolean; approve_target: string; has_copy_prompt: boolean;
  applies_to: string[]; default_required: boolean; default_due_offset_days: number | null;
  default_assignee_id: string | null; prompt_template: string | null;
};
// ค่าตั้งของงานย่อย 1 ชิ้นในเทมเพลต (snapshot ลง subtask ตอนสร้างงาน)
export type SubtaskStepConfig = {
  required?: boolean;
  due_offset_days?: number | null;
  requires_approval?: boolean;
  accepts_text?: boolean; accepts_image?: boolean; accepts_multi_image?: boolean; accepts_link?: boolean; accepts_file?: boolean;
  applies_to?: ("parent" | "sku")[];
  approve_target?: string;        // none | sku_media | sku_description | description_media | cover
  description_field?: string;     // เฉพาะ description_text: description | english_description | platform_description
  desc_mode?: "append" | "replace";
  has_copy_prompt?: boolean;
  prompt_template?: string | null;
};
export type TemplateStep = { type?: string; title: string; description?: string | null; required_before_next?: boolean; assignee_ids?: string[]; assignee_labels?: string[]; config?: SubtaskStepConfig };

export async function listSubtaskTypes(): Promise<SubtaskType[]> {
  const j = await jsonOrThrow(await apiFetch("/api/subtask-types"));
  return (j.data as SubtaskType[]) ?? [];
}

// prompt ต่อแบรนด์ (override)
export type BrandPrompt = { brand_id: string; subtask_type: string; prompt_template: string | null };
export async function listBrandPrompts(brandId: string): Promise<BrandPrompt[]> {
  const j = await jsonOrThrow(await apiFetch(`/api/brand-prompts?brand_id=${encodeURIComponent(brandId)}`));
  return (j.data as BrandPrompt[]) ?? [];
}
export async function saveBrandPrompt(brand_id: string, subtask_type: string, prompt_template: string | null): Promise<void> {
  await jsonOrThrow(await apiFetch("/api/brand-prompts", { method: "PATCH", body: JSON.stringify({ brand_id, subtask_type, prompt_template }) }));
}
export type TemplateContentItem = { title: string; post_type?: string | null; platforms?: string[] };
export type TaskTemplate = {
  id: string; name: string; task_type: string | null; default_priority: string;
  brand_id: string | null; brand_label?: string | null; brand_color?: string | null; description: string | null;
  default_reviewer_id?: string | null; default_reviewer_label?: string | null; due_offset_days?: number | null;
  platforms: string[] | null; steps: TemplateStep[]; content_items?: TemplateContentItem[];
};
export type RecurringRule = {
  id: string; name: string; template_id: string | null; template_label?: string | null;
  frequency: string; interval_n: number; assignee_id: string | null; assignee_label?: string | null;
  brand_id: string | null; brand_label?: string | null; campaign_id: string | null;
  start_date: string; end_date: string | null; next_run: string | null; last_run: string | null; is_active: boolean;
  // section งาน — ค่าที่ติดไปกับงานที่ระบบสร้าง (ตั้งบนกฎได้โดยตรง)
  description?: string | null; task_type?: string | null; priority?: string | null; platforms?: string[] | null; due_day?: number | null;
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
