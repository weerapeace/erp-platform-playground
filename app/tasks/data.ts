// ============================================================
// Creative Task Manager — Data Layer (client)
// เรียก API จริงผ่าน apiFetch (แนบ token). ของกลางค่าคงที่จาก lib/creative-tasks
// ============================================================
import { apiFetch } from "@/lib/api";
import { tr } from "@/lib/lang";

export type {
  CreativeStatus, CreativePriority, ApprovalStatus, AssetStatus, SubtaskStatus, ContentStatus,
} from "@/lib/creative-tasks";
export {
  STATUS_META, PRIORITY_META, APPROVAL_META, ASSET_META, PRIORITY_RANK,
  TASK_TYPES, PLATFORMS, TRANSITIONS, PRIMARY_ACTIONS, STATUS_PROGRESS,
  ALL_STATUSES, canTransition,
  CONTENT_STATUS_META, POST_TYPES, HASHTAG_CATEGORIES,
  priorityLabel, approvalLabel, assetLabel, statusLabelFb, contentStatusLabel, postTypeLabel,
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
  parent_sku_id: string | null; parent_sku_code: string | null; parent_sku_name: string | null; parent_sku_image_key: string | null;
  product_name: string | null;
  cover_image_r2_key: string | null;
  reference_html?: string | null;   // โน้ต/อ้างอิง (rich text)
  reference_images?: string[];   // รูปประกอบ/บรีฟ (array ของ r2_key) — แสดงใต้รายละเอียด
  priority: CreativePriority;
  status: CreativeStatus;
  progress_percent: number;
  assignee_id: string | null; assignee_label: string | null;
  assignees?: SubtaskAssignee[];   // ผู้รับผิดชอบหลายคน (ตั้งเอง ∪ คนเริ่มงานย่อย) — m2m
  reviewer_id: string | null; reviewer_label: string | null;
  reviewers?: SubtaskAssignee[];   // ผู้ตรวจหลายคน — m2m
  approver_id: string | null; approver_label: string | null;
  assigned_by_id?: string | null; assigned_by_label?: string | null;
  start_date: string | null; due_date: string | null; completed_at: string | null;
  approval_status: ApprovalStatus;
  asset_status: AssetStatus;
  platforms: string[] | null;
  drive_folder_url: string | null; final_asset_url: string | null; published_url: string | null;
  blocker_status: string | null; blocker_reason: string | null;
  is_active: boolean;
  created_by: string | null;
  created_by_label?: string | null;   // ชื่อผู้สร้าง (resolve ในหน้ารายละเอียด)
  created_at: string; updated_at: string;
};

export type SubtaskAssignee = { id: string; label: string; color?: string | null; avatar_url?: string | null };
export type CreativeSubtask = {
  id: string; task_id: string; title: string; title_en?: string | null; description: string | null;
  assignee_id: string | null;
  assignees: SubtaskAssignee[];
  attachments?: CreativeAttachment[];
  status: SubtaskStatus; due_date: string | null;
  required_before_next: boolean; sort_order: number;
  subtask_type?: string | null; config?: SubtaskStepConfig;
  content_preview?: { title: string | null; platforms: string[]; post_type: string | null; status: string | null; scheduled_at: string | null; captions: { platform: string; caption: string | null }[] } | null;   // งานย่อยชนิด content — พรีวิวคอนเทนต์ที่ผูก
  image_sync_targets?: { parent_ids?: string[]; sku_ids?: string[]; sku_images?: Record<string, string[]>; image_order?: string[]; replace_map?: Record<string, Record<string, string>> } | null; // ปลายทางรูป + รูปร่างต่อ SKU + จับคู่แทนรูป ตอนส่งงาน
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
  content_count?: number;
};

export type Campaign = {
  id: string; name: string; brand_id: string | null; brand_label: string | null; brand_color: string | null;
  objective: string | null; status: string; start_date: string | null; end_date: string | null;
  owner_id: string | null; owner_label: string | null; note: string | null; detail_html?: string | null;
  visibility?: string;   // team | private | shared
  shared_user_ids?: string[]; shared_users?: { id: string; name: string }[];
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

export type CreateTaskBody = Partial<Omit<CreativeTask, "id">> & { title: string; platforms?: string[]; subtasks?: { title: string; title_en?: string | null; description?: string | null; assignee_id?: string | null; assignee_ids?: string[]; required_before_next?: boolean; type?: string | null; config?: SubtaskStepConfig }[]; content_items?: TemplateContentItem[] };

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

// สร้างโฟลเดอร์ Google Drive ของงาน (ถ้ายังไม่มี) + อัปไฟล์แนบที่ยังไม่ขึ้น Drive → คืนลิงก์ + จำนวนที่อัป
export async function syncTaskDrive(id: string, opts?: { destination_name?: string; folder_name?: string }): Promise<{ url: string | null; uploaded: number; archived: number }> {
  const res = await apiFetch(`/api/creative-tasks/${id}/drive-folder`, { method: "POST", body: opts ? JSON.stringify(opts) : undefined });
  const j = await res.json();
  if (!res.ok || j.error) throw new Error(j.error || "สร้างโฟลเดอร์/อัปไฟล์ไม่สำเร็จ");
  return { url: (j.url as string) ?? null, uploaded: Number(j.uploaded ?? 0), archived: Number(j.archived ?? 0) };
}
export type DriveFolderInfo = { configured: boolean; structured: boolean; parent_name?: string; suggested_name?: string; suggested_destination?: string; destinations?: { id: string; name: string }[] };
export async function driveFolderInfo(id: string): Promise<DriveFolderInfo> {
  return await apiFetch(`/api/creative-tasks/${id}/drive-folder`).then((r) => r.json());
}
export async function driveFolderCheckDup(id: string, destination: string, folderName: string): Promise<boolean> {
  const p = new URLSearchParams({ check: "1", destination, folder_name: folderName });
  const j = await apiFetch(`/api/creative-tasks/${id}/drive-folder?${p.toString()}`).then((r) => r.json());
  return !!j.exists;
}

// ---- ฟิลด์ Parent SKU ที่ต้องกรอกก่อนส่งงาน (ค่ากลาง) ----
// ตัวเลือกฟิลด์ = ดึง "ทุกฟิลด์ Parent SKU" จาก field registry กลาง (ไม่ hardcode)
export async function getParentSkuFieldOptions(): Promise<{ col: string; label: string }[]> {
  const j = await jsonOrThrow(await apiFetch("/api/admin/field-registry-v2?module=parent-skus-v2"));
  const fields = (j.fields as { column_name: string | null; field_label: string; is_editable: boolean }[]) ?? [];
  return fields.filter((f) => f.column_name && f.is_editable).map((f) => ({ col: f.column_name as string, label: f.field_label || (f.column_name as string) }));
}
export async function getSubmitRequiredFields(): Promise<string[]> {
  const j = await jsonOrThrow(await apiFetch("/api/creative-submit-settings"));
  return (j.fields as string[]) ?? [];
}
export async function saveSubmitRequiredFields(fields: string[]): Promise<void> {
  await jsonOrThrow(await apiFetch("/api/creative-submit-settings", { method: "PUT", body: JSON.stringify({ fields }) }));
}

// ---- คิวรอตรวจ/อนุมัติ (งานย่อยที่ส่งมาแล้ว) ----
export type ReviewQueueItem = {
  id: string; title: string; description?: string | null; updated_at: string; status: string; approve_target?: string | null;
  task_id: string; task_no: string | null; task_title: string; task_desc?: string | null;
  brand_label: string | null; brand_color: string | null;
  assignees: SubtaskAssignee[]; images: { r2_key: string; file_name: string | null }[];
  image_sync_targets?: { parent_ids?: string[]; sku_ids?: string[]; sku_images?: Record<string, string[]>; product_images?: Record<string, string[]>; product_labels?: Record<string, string>; replace_map?: Record<string, Record<string, string>>; image_order?: string[] } | null;
  dest?: { parents: { id: string; code: string }[]; skus: { id: string; code: string }[] };
};
export async function listReviewQueue(): Promise<ReviewQueueItem[]> {
  const j = await jsonOrThrow(await apiFetch("/api/creative-tasks/review-queue"));
  return (j.data as ReviewQueueItem[]) ?? [];
}

// ---- Subtasks ----
export async function listSubtasks(taskId: string): Promise<CreativeSubtask[]> {
  const j = await jsonOrThrow(await apiFetch(`/api/creative-tasks/${taskId}/subtasks`));
  return (j.data as CreativeSubtask[]) ?? [];
}
export async function addSubtask(taskId: string, body: { title: string; title_en?: string | null; description?: string | null; assignee_ids?: string[]; due_date?: string | null; required_before_next?: boolean; type?: string | null; config?: Record<string, unknown> }): Promise<CreativeSubtask> {
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
  id: string; title: string; title_en?: string | null; status: string; due_date: string | null; required_before_next: boolean;
  subtask_type?: string | null; type_color?: string | null; type_icon?: string | null;
  task_id: string; task_no: string | null; task_title: string | null; task_status: string | null; priority?: string | null;
  cover_image_r2_key?: string | null;
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

// ---- แต่งหน้าแท็บแบรนด์ในปฏิทินคอนเทนต์ (ต่อแบรนด์ · /api/content-calendar/brand-styles) ----
export type BrandCalStyle = { brand_id: string; accent_color: string | null; bg_image_key: string | null };
export async function listBrandCalStyles(): Promise<BrandCalStyle[]> {
  const j = await jsonOrThrow(await apiFetch("/api/content-calendar/brand-styles"));
  return (j.data as BrandCalStyle[]) ?? [];
}
export async function saveBrandCalStyle(s: BrandCalStyle): Promise<void> {
  await jsonOrThrow(await apiFetch("/api/content-calendar/brand-styles", { method: "PUT", body: JSON.stringify(s) }));
}

// ============================================================
// Content / Social
// ============================================================
export type ContentCaption = { id?: string; platform: string; caption: string | null; hashtags: string | null; caption_type?: string; sort_order?: number };
export type ContentItem = {
  [key: string]: unknown;
  id: string; content_no: string | null; title: string;
  task_id?: string | null; task_label?: string | null; task_no?: string | null; task_cover_url?: string | null;   // งานที่ผูก (ชื่อ/เลข/รูปปกงาน)
  campaign_id: string | null; campaign_label: string | null;
  brand_id: string | null; brand_label: string | null; brand_color: string | null;
  sku_id: string | null; sku_code: string | null; sku_name: string | null; sku_color: string | null; sku_color_en?: string | null; sku_color_th?: string | null; sku_price: number | null; sku_fake_price?: number | null; product_name: string | null;
  color_source?: string | null;   // 'th' | 'en' — ภาษาที่ใช้แสดง {color}
  parent_sku_id?: string | null; parent_sku_code?: string | null; parent_sku_name?: string | null;
  cover_image_url?: string | null;   // รูปหน้าปก (resolve จากสื่อแนบ/SKU/งาน) — ใช้โชว์บนการ์ดกระดานแคมเปญ
  post_type: string | null; platforms: string[] | null; status: ContentStatus; approval_status: string;
  scheduled_at: string | null; published_at: string | null; published_url: string | null;
  product_links: { platform: string; url: string }[]; posted_links?: Record<string, string> | null; post_status?: Record<string, string> | null; platform_images?: Record<string, string[]> | null; note: string | null; is_template?: boolean; template_icon?: string | null; updated_at: string;
  discount_value?: number | null; discount_is_percent?: boolean;
  brand_shop_channels?: { label: string; value: string }[];
  assignee_id?: string | null; assignee_label?: string | null;   // ผู้รับผิดชอบคอนเทนต์ (เดี่ยว = back-compat)
  assignee_ids?: string[] | null; assignees?: { id: string; name: string }[];   // ผู้รับผิดชอบหลายคน (m2m)
};

// หาแบรนด์จากสินค้าที่เลือก (Parent SKU หรือ SKU เดี่ยว) — ให้ฟอร์มคอนเทนต์เติมแบรนด์อัตโนมัติ
export async function resolveBrandFromProduct(p: { parentSkuId?: string | null; skuId?: string | null }): Promise<string | null> {
  const q = new URLSearchParams();
  if (p.parentSkuId) q.set("parent_sku_id", p.parentSkuId);
  else if (p.skuId) q.set("sku_id", p.skuId);
  if (![...q.keys()].length) return null;
  try {
    const j = await jsonOrThrow(await apiFetch(`/api/creative-content/resolve-brand?${q.toString()}`));
    return (j.data as { brand_id: string | null } | null)?.brand_id ?? null;
  } catch { return null; }
}

// ดึงสีของ SKU ลูกทั้งหมดใต้ Parent SKU (รวมไม่ซ้ำ เช่น ["ดำ","น้ำตาล","แดง"])
export async function getParentSkuColors(parentId: string): Promise<string[]> {
  const res = await apiFetch(`/api/pickers/skus?parent_sku_id=${parentId}&limit=50`);
  const j = await res.json().catch(() => ({}));
  const rows = (j.data as { color?: string | null }[]) ?? [];
  return [...new Set(rows.map((r) => (r.color ?? "").trim()).filter(Boolean))];
}

// ลูก SKU ของ Parent (รหัส/สี 2 ภาษา/ราคา) — ใช้ทำ dropdown เลือกราคา + สลับภาษาสีในคอนเทนต์
export type ParentSkuChild = { id: string; code: string; color_en: string | null; color_th: string | null; list_price: number | null; fake_price: number | null };
export async function getParentSkuChildren(parentId: string): Promise<ParentSkuChild[]> {
  const res = await apiFetch(`/api/pickers/skus?parent_sku_id=${parentId}&limit=100`);
  const j = await res.json().catch(() => ({}));
  const rows = (j.data as { id: string; code?: string | null; color_en?: string | null; color_th?: string | null; list_price?: number | null; fake_price?: number | null }[]) ?? [];
  return rows.map((r) => ({ id: r.id, code: r.code ?? "", color_en: r.color_en ?? null, color_th: r.color_th ?? null, list_price: r.list_price ?? null, fake_price: r.fake_price ?? null }));
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
// ลบหลายรายการทีเดียว (คำขอเดียว — ไม่วนยิงทีละตัว) + คืนจำนวนที่สำเร็จ
export async function bulkDeleteContent(ids: string[]): Promise<{ success: number; failed: number }> {
  const j = await jsonOrThrow(await apiFetch("/api/creative-content/bulk", { method: "POST", body: JSON.stringify({ action: "delete", ids }) }));
  return { success: (j.success as number) ?? 0, failed: (j.failed as number) ?? 0 };
}
// แก้หลายงานทีเดียว (คำขอเดียว) + รายงานผลต่อรายการ
export async function bulkUpdateTasks(items: { id: string; changes: Record<string, unknown> }[]): Promise<{ success: number; failed: number; failures: { id: string; error: string }[] }> {
  const j = await jsonOrThrow(await apiFetch("/api/creative-tasks/bulk", { method: "POST", body: JSON.stringify({ items }) }));
  return { success: (j.success as number) ?? 0, failed: (j.failed as number) ?? 0, failures: (j.failures as { id: string; error: string }[]) ?? [] };
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

// ---- Content attachments (รูป/วิดีโอ/ลิงก์ ของคอนเทนต์) ----
export type ContentAttachment = {
  id: string; kind: string; label: string | null; url: string | null; r2_key: string | null;
  file_name: string | null; content_type: string | null; size_bytes: number | null; created_at?: string;
};
export async function listContentAttachments(contentId: string): Promise<ContentAttachment[]> {
  const j = await jsonOrThrow(await apiFetch(`/api/creative-content/${contentId}/attachments`));
  return (j.data as ContentAttachment[]) ?? [];
}
export async function addContentAttachment(contentId: string, body: { kind?: string; label?: string | null; url?: string | null; r2_key?: string | null; file_name?: string | null; content_type?: string | null; size_bytes?: number | null }): Promise<ContentAttachment> {
  const j = await jsonOrThrow(await apiFetch(`/api/creative-content/${contentId}/attachments`, { method: "POST", body: JSON.stringify(body) }));
  return j.data as ContentAttachment;
}
export async function deleteContentAttachment(contentId: string, attId: string): Promise<void> {
  await jsonOrThrow(await apiFetch(`/api/creative-content/${contentId}/attachments?attachment_id=${attId}`, { method: "DELETE" }));
}

// ---- ตั้งค่าต่อแพลตฟอร์ม (แม่แบบเริ่มต้น/ปิดแคปชั่น-แฮชแท็ก/ลิงก์โพสต์/โน้ต) ----
export type PlatformSetting = { template_key?: string | null; use_caption?: boolean; use_hashtags?: boolean; post_url?: string | null; note?: string | null };
export type PlatformSettings = Record<string, PlatformSetting>;
export async function getPlatformSettings(): Promise<PlatformSettings> {
  const j = await jsonOrThrow(await apiFetch("/api/creative-platform-settings"));
  return (j.settings as PlatformSettings) ?? {};
}
export async function savePlatformSettings(settings: PlatformSettings): Promise<void> {
  await jsonOrThrow(await apiFetch("/api/creative-platform-settings", { method: "PUT", body: JSON.stringify({ settings }) }));
}

// ---- สถานะเชื่อมต่อ Meta (Facebook/Instagram) ต่อแบรนด์ — ใช้รู้ว่า "โพสต์เลย" ยิงจริงได้ไหม ----
export type MetaConnStatus = { configured?: boolean; facebook?: { connected: boolean; page_name?: string | null }; instagram?: { connected: boolean } };
export async function getMetaStatus(brandId: string): Promise<MetaConnStatus> {
  try { return (await apiFetch(`/api/meta/status?brand_id=${encodeURIComponent(brandId)}`).then((r) => r.json())) as MetaConnStatus; }
  catch { return {}; }
}
// ยิงโพสต์คอนเทนต์ขึ้นแพลตฟอร์มจริง (facebook/instagram) — media หลายชิ้น (รูป/วิดีโอ) + ตั้งเวลา (unix, 0=ทันที)
// คืน: url+scheduled · หรือ processing+creationId (IG วิดีโอ ต้องไปตามเช็กที่ igFinalize)
export type PostMediaRef = { key: string; type: "image" | "video" };
export type PublishResult = { url: string; scheduled: boolean; processing: boolean; creationId?: string };
export async function publishToPlatform(contentId: string, platform: string, captionText: string, media: PostMediaRef[], scheduledTime?: number): Promise<PublishResult> {
  const j = await jsonOrThrow(await apiFetch("/api/meta/publish", { method: "POST", body: JSON.stringify({ content_id: contentId, platform, caption_text: captionText, media, scheduled_time: scheduledTime ?? 0 }) }));
  const r = j as { url?: string; scheduled?: boolean; processing?: boolean; creation_id?: string };
  return { url: String(r.url ?? ""), scheduled: !!r.scheduled, processing: !!r.processing, creationId: r.creation_id };
}
// IG Reels: ตามเช็กสถานะ container แล้วเผยแพร่เมื่อพร้อม (client เรียกซ้ำ) · คืน url เมื่อเสร็จ / processing=true ระหว่างรอ
export async function igFinalize(contentId: string, creationId: string): Promise<{ url?: string; processing: boolean }> {
  const j = await jsonOrThrow(await apiFetch("/api/meta/ig-finalize", { method: "POST", body: JSON.stringify({ content_id: contentId, creation_id: creationId }) }));
  const r = j as { url?: string; processing?: boolean };
  return { url: r.url, processing: !!r.processing };
}

// ---- เวลาแนะนำการโพสต์ต่อวัน (จันทร์-อาทิตย์) — เก็บ ui_config key 'creative_recommended_times' ----
// คีย์ = วันในสัปดาห์ตาม Date.getDay() ('0'=อาทิตย์ .. '6'=เสาร์) · ค่า = รายการเวลา [{time:"HH:MM", note?}]
export type RecTime = { time: string; note?: string };
export type RecommendedTimes = Record<string, RecTime[]>;
export async function getRecommendedTimes(): Promise<RecommendedTimes> {
  const j = await apiFetch("/api/ui-config?key=creative_recommended_times").then((r) => r.json()).catch(() => ({}));
  const raw = (j.value as Record<string, unknown>) ?? {};
  const out: RecommendedTimes = {};
  for (const [k, v] of Object.entries(raw)) {
    const items = Array.isArray(v) ? v : (v ? [v] : []);
    const arr: RecTime[] = [];
    for (const it of items) {
      if (typeof it === "string") { if (it) arr.push({ time: it }); }   // ข้อมูลเก่า: string เดี่ยว
      else if (it && typeof it === "object" && typeof (it as { time?: unknown }).time === "string") { const o = it as { time: string; note?: string }; if (o.time) arr.push({ time: o.time, note: o.note || undefined }); }
    }
    if (arr.length) out[k] = arr;
  }
  return out;
}
export async function saveRecommendedTimes(times: RecommendedTimes): Promise<void> {
  await jsonOrThrow(await apiFetch("/api/ui-config", { method: "PATCH", body: JSON.stringify({ key: "creative_recommended_times", value: times }) }));
}

// ---- พรอมต์ตั้งต้น + แฮชแท็กเริ่มต้น (ต่อแบรนด์/แพลตฟอร์ม + ตัวรวม) ----
export type CaptionConfig = {
  prompt?: string;                                  // พรอมต์รวม (fallback)
  prompt_by_brand?: Record<string, string>;         // พรอมต์ต่อแบรนด์
  hashtags_by_platform?: Record<string, string>;    // แฮชแท็กเริ่มต้นต่อแพลตฟอร์ม
  hashtags_by_brand?: Record<string, string>;       // แฮชแท็กเริ่มต้นต่อแบรนด์
};
export async function getCaptionConfig(): Promise<CaptionConfig> {
  const j = await jsonOrThrow(await apiFetch("/api/creative-caption-config"));
  return (j.config as CaptionConfig) ?? {};
}
export async function saveCaptionConfig(config: CaptionConfig): Promise<void> {
  await jsonOrThrow(await apiFetch("/api/creative-caption-config", { method: "PUT", body: JSON.stringify({ config }) }));
}
// แฮชแท็กเริ่มต้น = ของแบรนด์ + ของแพลตฟอร์ม (ตัดซ้ำ) · พรอมต์ = ของแบรนด์ ไม่งั้นตัวรวม
export function defaultHashtags(cfg: CaptionConfig, brandId: string | null, platform: string): string {
  const parts: string[] = [];
  if (brandId && cfg.hashtags_by_brand?.[brandId]) parts.push(cfg.hashtags_by_brand[brandId]);
  if (cfg.hashtags_by_platform?.[platform]) parts.push(cfg.hashtags_by_platform[platform]);
  const seen = new Set<string>(); const out: string[] = [];
  for (const tag of parts.join(" ").split(/\s+/).filter(Boolean)) { const k = tag.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(tag); } }
  return out.join(" ");
}
export function resolvePrompt(cfg: CaptionConfig, brandId: string | null): string {
  return (brandId && cfg.prompt_by_brand?.[brandId]) || cfg.prompt || "";
}

// ---- ตั้งค่าตัวช่วยเผยแพร่: เลือกฟิลด์ Parent SKU ที่จะโชว์ ----
export type PublishConfig = { parent_fields?: string[] };
export async function getPublishConfig(): Promise<PublishConfig> {
  const j = await jsonOrThrow(await apiFetch("/api/creative-publish-config"));
  return (j.config as PublishConfig) ?? {};
}
export async function savePublishConfig(config: PublishConfig): Promise<void> {
  await jsonOrThrow(await apiFetch("/api/creative-publish-config", { method: "PUT", body: JSON.stringify({ config }) }));
}

// ---- ทีม Creative (เลือกผู้รับผิดชอบเป็นทีม) ----
export type Team = { id: string; name: string; sort_order?: number; member_ids: string[]; members: { id: string; name: string }[] };
export async function listTeams(): Promise<Team[]> {
  const j = await jsonOrThrow(await apiFetch("/api/creative-teams"));
  return (j.teams as Team[]) ?? [];
}
export async function createTeam(body: { name: string; member_ids?: string[] }): Promise<Team> {
  const j = await jsonOrThrow(await apiFetch("/api/creative-teams", { method: "POST", body: JSON.stringify(body) }));
  return j.data as Team;
}
export async function updateTeam(id: string, patch: Record<string, unknown>): Promise<void> {
  await jsonOrThrow(await apiFetch(`/api/creative-teams/${id}`, { method: "PATCH", body: JSON.stringify(patch) }));
}
export async function deleteTeam(id: string): Promise<void> {
  await jsonOrThrow(await apiFetch(`/api/creative-teams/${id}`, { method: "DELETE" }));
}

// ---- พรีวิวลิงก์ (ดึง OG/meta) ----
export type LinkPreview = { url: string; title: string | null; description: string | null; image: string | null; site: string | null };
export async function getLinkPreview(url: string): Promise<LinkPreview> {
  // ไม่ throw เมื่อ error เป็น soft (เช่น timeout) — API ยังคืน data fallback (hostname) มาให้
  const res = await apiFetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
  const j = await res.json().catch(() => ({}));
  if (j?.data) return j.data as LinkPreview;
  throw new Error((j?.error as string) || "ดึงข้อมูลลิงก์ไม่สำเร็จ");
}

// ============================================================
// Templates + Recurring
// ============================================================
// ชนิดงานย่อย (registry กลาง) — จาก /api/subtask-types
export type SubtaskType = {
  key: string; label_th: string; label_en?: string | null; icon?: string | null; icon_key?: string | null; color?: string | null;
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
  content_id?: string;             // งานย่อยชนิด content: คอนเทนต์ที่ผูก (erp_creative_content.id)
  content_template_id?: string;    // แม่แบบคอนเทนต์ที่ใช้ตอนสร้าง
  post_type?: string;              // ประเภทคอนเทนต์
  platform_notes?: Record<string, string>;   // หมายเหตุ/รายละเอียดงาน ต่อแพลตฟอร์ม (เฉพาะคอนเทนต์นี้)
  arrange_print?: ArrangePrintSpec;   // งานเรียงพิมพ์: รูป Artwork + ขนาด+จำนวนต่อรูป
};

// งานเรียงพิมพ์ (Arrange Print) — เก็บใน subtask.config.arrange_print
export type ArrangeOrderLine = { label: string; w: number | null; h: number | null; unit: string; qty: number };   // 1 ขนาด + จำนวน
export type ArrangePrintItem = { asset_id: string; r2_key: string; title: string; orders: ArrangeOrderLine[] };     // 1 รูป + หลายขนาด
// รูปฐาน (จากอัลบั้ม "งานพิมพ์ DFT UV (Printed)") + รายละเอียด "เพิ่ม/ลบ" อะไรจากรูปฐานนี้ (ต่อรูป)
export type ArrangeBaseItem = { asset_id: string; r2_key: string; title: string; add: string; remove: string };
export type ArrangePrintSpec = { items: ArrangePrintItem[]; bases?: ArrangeBaseItem[] };
export type TemplateStep = { type?: string; title: string; description?: string | null; required_before_next?: boolean; assignee_ids?: string[]; assignee_labels?: string[]; config?: SubtaskStepConfig };

export async function listSubtaskTypes(all = false): Promise<SubtaskType[]> {
  const j = await jsonOrThrow(await apiFetch(`/api/subtask-types${all ? "?all=1" : ""}`));
  return (j.data as SubtaskType[]) ?? [];
}
export async function updateSubtaskType(key: string, patch: Record<string, unknown>): Promise<void> {
  await jsonOrThrow(await apiFetch("/api/subtask-types", { method: "PATCH", body: JSON.stringify({ key, patch }) }));
}
export async function createSubtaskType(key: string, label_th: string, patch?: Record<string, unknown>): Promise<void> {
  await jsonOrThrow(await apiFetch("/api/subtask-types", { method: "POST", body: JSON.stringify({ key, label_th, patch }) }));
}

// สรุป "logic" ของชนิดงานย่อยแบบอ่านง่าย (สร้างอัตโนมัติจากความสามารถ) — ใช้เป็น tooltip/คำอธิบาย
const SUBTASK_APPROVE_TEXT: Record<string, () => string> = {
  sku_media: () => tr("อนุมัติแล้ว → เข้าแกลเลอรีรูปสินค้า", "approved → product gallery"),
  cover: () => tr("อนุมัติแล้ว → ตั้งเป็นรูปปก", "approved → cover image"),
  sku_description: () => tr("อนุมัติแล้ว → เข้า description สินค้า", "approved → product description"),
  description_media: () => tr("อนุมัติแล้ว → เข้า media คำอธิบาย", "approved → description media"),
};
export function subtaskTypeHint(ty: SubtaskType): string {
  const parts: string[] = [];
  const accepts: string[] = [];
  if (ty.accepts_multi_image) accepts.push(tr("รูปหลายรูป", "multiple images"));
  else if (ty.accepts_image) accepts.push(tr("รูป", "image"));
  if (ty.accepts_text) accepts.push(tr("ข้อความ", "text"));
  if (ty.accepts_link) accepts.push(tr("ลิงก์", "link"));
  if (ty.accepts_file) accepts.push(tr("ไฟล์", "file"));
  if (accepts.length) parts.push(`${tr("รับ", "Accepts")}: ${accepts.join(", ")}`);
  if (ty.has_copy_prompt) parts.push(tr("มีปุ่ม copy prompt", "copy-prompt button"));
  if (ty.requires_approval) parts.push(tr("ต้องอนุมัติ", "needs approval"));
  const tgt = SUBTASK_APPROVE_TEXT[ty.approve_target]; if (tgt) parts.push(tgt());
  return parts.join(" · ") || tr("งานย่อยทั่วไป", "general subtask");
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
export type TemplateContentItem = { title: string; post_type?: string | null; platforms?: string[]; assignee_id?: string | null; assignee_label?: string | null; assignee_ids?: string[]; assignee_labels?: string[] };
export type TaskTemplate = {
  id: string; name: string; task_type: string | null; default_priority: string;
  brand_id: string | null; brand_label?: string | null; brand_color?: string | null; description: string | null;
  default_reviewer_id?: string | null; default_reviewer_label?: string | null; due_offset_days?: number | null;
  default_reviewer_ids?: string[]; default_reviewers?: { id: string; label: string }[];   // ผู้ตรวจหลายคน
  platforms: string[] | null; steps: TemplateStep[]; content_items?: TemplateContentItem[];
  require_parent_sku?: boolean;   // บังคับระบุ Parent SKU ตอนสร้างงาน (เช่น เพิ่มสี/แก้สี)
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
