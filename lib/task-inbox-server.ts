/**
 * task-inbox-server — โหลด "งาน Task Manager ที่รอฉัน" จากฐานข้อมูล (ฝั่ง server เท่านั้น)
 * ใช้ที่: GET /api/creative-tasks/inbox (แท็บ Task ในศูนย์แจ้งเตือน)
 *
 * ฉันเกี่ยวกับงานยังไง (ตรงกับที่ลิ้นชักงาน/คิวรอตรวจใช้):
 *   ผู้ตรวจ   = อยู่ใน erp_creative_task_reviewers หรือเป็น reviewer_id / approver_id ของงาน
 *   ผู้รับผิดชอบ = อยู่ใน erp_creative_task_assignees · ช่องเดี่ยว assignee_id นับเฉพาะงานที่ยังไม่มีรายชื่อในตารางเชื่อม
 *   งานรอตรวจที่ไม่ได้ตั้งผู้ตรวจเลย → คนที่มีสิทธิ์ tasks.approve เห็น
 * จัดกลุ่ม/เรียงด้วย lib/task-inbox (pure) · นับจุดที่ต้องเช็กของสินค้า (เฉพาะงานรอตรวจ) ด้วย lib/product-listing-checks
 * งานที่ลบแล้ว (is_active=false) / สถานะจบแล้ว ไม่นับ · กลุ่มละไม่เกิน 50 งาน
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { terminalStatusKeys } from "@/lib/creative-statuses-server";
import { classifyTask, emptyInbox, sortInbox, todayBkk, type InboxGroup, type InboxItem, type InboxPayload } from "@/lib/task-inbox";
import { listingChecks, plainColor, type ListingParent } from "@/lib/product-listing-checks";

type Db = ReturnType<typeof supabaseAdmin>;
type Row = Record<string, unknown>;
const LIMIT = 50;
const s = (v: unknown) => (typeof v === "string" && v ? v : null);
const n = (v: unknown) => { const x = Number(v); return v == null || v === "" || !Number.isFinite(x) ? null : x; };
const isImage = (ct: unknown) => !ct || String(ct).startsWith("image/");

export async function loadTaskInbox(admin: Db, me: string, canApprove: boolean): Promise<{ data: InboxPayload } | { error: string }> {
  // 1) งานที่ฉันอาจเกี่ยว (ตารางเชื่อม + ช่องเดี่ยว) + งานรอตรวจทั้งหมด (ถ้ามีสิทธิ์อนุมัติ — ไว้หางานที่ไม่ได้ตั้งผู้ตรวจ)
  const [revL, asgL, legacy, terminal, reviewAll] = await Promise.all([
    admin.from("erp_creative_task_reviewers").select("task_id").eq("user_id", me),
    admin.from("erp_creative_task_assignees").select("task_id").eq("user_id", me),
    admin.from("erp_creative_tasks").select("id").or(`reviewer_id.eq.${me},approver_id.eq.${me},assignee_id.eq.${me}`).not("is_active", "is", false).limit(500),
    terminalStatusKeys(admin),
    canApprove ? admin.from("erp_creative_tasks").select("id").eq("status", "need_review").not("is_active", "is", false).limit(300) : Promise.resolve({ data: [] as Row[], error: null }),
  ]);
  if (revL.error) return { error: revL.error.message };
  if (asgL.error) return { error: asgL.error.message };
  if (legacy.error) return { error: legacy.error.message };
  const ids = [...new Set([...(revL.data ?? []), ...(asgL.data ?? [])].map((r) => String((r as Row).task_id))
    .concat([...(legacy.data ?? []), ...(reviewAll.data ?? [])].map((r) => String((r as Row).id))))];
  if (!ids.length) return { data: emptyInbox() };

  // 2) ตัวงาน + รายชื่อผู้ตรวจ/ผู้รับผิดชอบทั้งหมดของงานเหล่านั้น
  const [tRes, allRev, allAsg] = await Promise.all([
    admin.from("erp_creative_tasks").select("id, task_no, title, status, due_date, updated_at, brand_id, task_type, parent_sku_id, cover_image_r2_key, reviewer_id, approver_id, assignee_id")
      .in("id", ids.slice(0, 800)).not("is_active", "is", false),
    admin.from("erp_creative_task_reviewers").select("task_id, user_id").in("task_id", ids.slice(0, 800)),
    admin.from("erp_creative_task_assignees").select("task_id, user_id").in("task_id", ids.slice(0, 800)),
  ]);
  if (tRes.error) return { error: tRes.error.message };
  const revBy = new Map<string, string[]>(), asgBy = new Map<string, string[]>();
  for (const r of (allRev.data ?? []) as Row[]) revBy.set(String(r.task_id), [...(revBy.get(String(r.task_id)) ?? []), String(r.user_id)]);
  for (const r of (allAsg.data ?? []) as Row[]) asgBy.set(String(r.task_id), [...(asgBy.get(String(r.task_id)) ?? []), String(r.user_id)]);

  const grouped: Record<InboxGroup, Row[]> = { review: [], revision: [], assigned: [] };
  for (const t of (tRes.data ?? []) as Row[]) {
    const id = String(t.id);
    const revs = revBy.get(id) ?? [], asgs = asgBy.get(id) ?? [];
    const isReviewer = revs.includes(me) || t.reviewer_id === me || t.approver_id === me;
    const isAssignee = asgs.includes(me) || (asgs.length === 0 && t.assignee_id === me);
    const noReviewer = revs.length === 0 && !t.reviewer_id && !t.approver_id;
    const g = classifyTask({ status: String(t.status) }, { isReviewer, isAssignee, canApproveUnassigned: canApprove && noReviewer }, terminal);
    if (g) grouped[g].push(t);
  }
  const all = [...grouped.review, ...grouped.revision, ...grouped.assigned];
  if (!all.length) return { data: emptyInbox() };
  const taskIds = all.map((t) => String(t.id));

  // 3) ข้อมูลประกอบ: แบรนด์ · ประเภทงาน · Parent (ช่องหลัก หรือ Parent แรกที่ผูก) · มีงานย่อยไหม
  const brandIds = [...new Set(all.map((t) => s(t.brand_id)).filter((x): x is string => !!x))];
  const typeCodes = [...new Set(all.map((t) => s(t.task_type)).filter((x): x is string => !!x))];
  const [bRes, tyRes, plRes, subRes] = await Promise.all([
    brandIds.length ? admin.from("brands").select("id, name").in("id", brandIds) : Promise.resolve({ data: [] as Row[] }),
    typeCodes.length ? admin.from("erp_task_types").select("code, name_th").in("code", typeCodes) : Promise.resolve({ data: [] as Row[] }),
    admin.from("erp_creative_task_parent_skus").select("task_id, parent_sku_id").in("task_id", taskIds),
    admin.from("erp_creative_subtasks").select("task_id").in("task_id", taskIds),
  ]);
  const brandName = new Map(((bRes.data ?? []) as Row[]).map((r) => [String(r.id), s(r.name)]));
  const typeName = new Map(((tyRes.data ?? []) as Row[]).map((r) => [String(r.code), s(r.name_th)]));
  const hasSub = new Set(((subRes.data ?? []) as Row[]).map((r) => String(r.task_id)));
  const linkParent = new Map<string, string>();
  for (const r of (plRes.data ?? []) as Row[]) if (!linkParent.has(String(r.task_id)) && r.parent_sku_id) linkParent.set(String(r.task_id), String(r.parent_sku_id));
  const parentOf = (t: Row) => s(t.parent_sku_id) ?? linkParent.get(String(t.id)) ?? null;

  // 4) สินค้า: รหัส/รูปปก (ทุกกลุ่ม) + ข้อมูลที่ตัวเช็กใช้ (เฉพาะงานรอตรวจ)
  const parentIds = [...new Set(all.map(parentOf).filter((x): x is string => !!x))];
  const reviewParentIds = [...new Set(grouped.review.map(parentOf).filter((x): x is string => !!x))];
  const { data: pData } = parentIds.length
    ? await admin.from("parent_skus_v2").select("id, code, cover_image_r2_key, introduction, description, english_description, size_length_cm, size_height_cm, size_thickness_cm").in("id", parentIds)
    : { data: [] as Row[] };
  const parentById = new Map(((pData ?? []) as Row[]).map((r) => [String(r.id), r]));
  const checksByParent = new Map<string, number>();
  if (reviewParentIds.length) {
    const { data: sData } = await admin.from("skus_v2").select("id, code, parent_sku_id, color_th, color_platform_th, color_platform_en, list_price, fake_price").in("parent_sku_id", reviewParentIds).not("is_active", "is", false);
    const skus = (sData ?? []) as Row[];
    const entityIds = [...reviewParentIds, ...skus.map((x) => String(x.id))];
    const [aRes, uRes] = await Promise.all([
      admin.from("erp_playground_attachments").select("entity_type, entity_id, content_type").in("entity_type", ["parent_skus_v2", "skus_v2"]).in("entity_id", entityIds).limit(5000),
      admin.from("asset_usages").select("module, record_id").in("module", ["parent_sku", "product_sku", "parent_sku_description"]).in("record_id", entityIds).limit(5000),
    ]);
    const cnt = new Map<string, number>();
    const bump = (k: string) => cnt.set(k, (cnt.get(k) ?? 0) + 1);
    for (const a of (aRes.data ?? []) as Row[]) if (isImage(a.content_type)) bump(`${a.entity_type === "parent_skus_v2" ? "p" : "s"}:${a.entity_id}`);
    for (const u of (uRes.data ?? []) as Row[]) bump(`${u.module === "parent_sku" ? "p" : u.module === "product_sku" ? "s" : "d"}:${u.record_id}`);
    for (const pid of reviewParentIds) {
      const p = parentById.get(pid);
      if (!p) continue;
      const l = n(p.size_length_cm), h = n(p.size_height_cm), th = n(p.size_thickness_cm);
      const lp: ListingParent = {
        code: String(p.code ?? ""), introduction: s(p.introduction), description: s(p.description), english_description: s(p.english_description),
        size: l || h || th ? { length: l, height: h, thickness: th } : null,
        parent_images: cnt.get(`p:${pid}`) ?? 0, description_images: cnt.get(`d:${pid}`) ?? 0,
        skus: skus.filter((x) => String(x.parent_sku_id) === pid).map((x) => ({
          code: String(x.code ?? ""), color_th: s(x.color_th) ?? (plainColor(s(x.color_platform_th)) || null), color_en: s(x.color_platform_en),
          list_price: n(x.list_price), fake_price: n(x.fake_price), images: cnt.get(`s:${x.id}`) ?? 0,
        })),
      };
      checksByParent.set(pid, listingChecks(lp).length);
    }
  }

  const toItem = (t: Row, g: InboxGroup): InboxItem => {
    const pid = parentOf(t), p = pid ? parentById.get(pid) : undefined;
    return {
      id: String(t.id), task_no: s(t.task_no), title: s(t.title) ?? "", status: String(t.status),
      due_date: s(t.due_date)?.slice(0, 10) ?? null, updated_at: s(t.updated_at),
      brand: t.brand_id ? brandName.get(String(t.brand_id)) ?? null : null,
      task_type: t.task_type ? typeName.get(String(t.task_type)) ?? null : null,
      parent_code: p ? s(p.code) : null,
      cover_key: (p ? s(p.cover_image_r2_key) : null) ?? s(t.cover_image_r2_key),
      has_subtasks: hasSub.has(String(t.id)),
      checks: g === "review" && pid && checksByParent.has(pid) ? checksByParent.get(pid)! : null,
    };
  };
  const today = todayBkk();
  const out = emptyInbox();
  for (const g of ["review", "revision", "assigned"] as InboxGroup[]) out[g] = sortInbox(grouped[g].map((t) => toItem(t, g)), today).slice(0, LIMIT);
  return { data: out };
}
