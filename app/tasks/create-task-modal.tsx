"use client";

// ============================================================
// CreateTaskModal (ของกลางในโมดูล) — Wizard สร้างงาน 3 สเต็ป
//   1) ข้อมูลงาน (+ เริ่มจาก Template)
//   2) งานย่อย (subtask) — เลือก/แก้รายตัว + ผู้รับผิดชอบ
//   3) สินค้า (SKU / Parent SKU)
// ใช้ที่: หน้า /tasks และ Campaign Canvas (ล็อกแคมเปญ) — props/ชื่อเดิม
// ============================================================

import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { ERPFormSection, ERPFormField, ERPInput, ERPSelect, ERPTextarea } from "@/components/form";
import { UserPicker, SkuPicker, ParentSkuPicker } from "@/components/pickers";
import type { UserPickerValue, SkuPickerValue, ParentSkuPickerValue } from "@/components/pickers";
import { MultiUserPicker } from "./multi-user-picker";
import { TeamFill } from "./team-picker";
import { ImageInput } from "@/components/image-input";
import { ImageAttachKeys } from "@/components/image-attach";
import { apiFetch } from "@/lib/api";
import { useCreativeOptions } from "./use-options";
import { useT } from "@/components/i18n";
import {
  PRIORITY_META, priorityLabel, createTask, listTasks, listCampaigns, listBrands, listTemplates,
  type CreativePriority, type Campaign, type BrandOption, type TaskTemplate, type SubtaskStepConfig, type TemplateContentItem,
} from "./data";
import { ArrangePrintEditor, specFromItems, specBasesFrom, type ArrangeItem, type ArrangeBase } from "./arrange-print-editor";
import type { ArrangePrintType } from "./data";

const priorityOptions = () => (Object.keys(PRIORITY_META) as CreativePriority[]).map((k) => ({ value: k, label: priorityLabel(k) }));

// ช่องในขั้น "ข้อมูลงาน" ที่จัดลำดับได้ (ช่องว่างดันขึ้นบน) — ไม่รวม "ชื่องาน" (ตรึงบนสุดเสมอ)
const REORDER_KEYS = ["task_type", "priority", "brand_id", "campaign_id", "assignee", "reviewers", "order_date", "due_date", "drive", "platform", "description", "cover"];
// ช่องที่โชว์ในโหมด BASIC (ค่าเริ่มต้น — แอดมินติ๊กเพิ่ม/ลบได้ที่ปุ่ม ⚙️ ข้างสวิตช์โหมด)
const DEFAULT_BASIC_FIELDS = ["task_type", "priority", "assignee", "due_date"];
// ป้ายชื่อช่อง (ใช้ในกล่องตั้งค่าโหมด BASIC)
const FIELD_LABELS: Record<string, [string, string]> = {
  task_type: ["ประเภทงาน", "Task type"], priority: ["ความสำคัญ", "Priority"],
  brand_id: ["แบรนด์", "Brand"], campaign_id: ["Campaign", "Campaign"],
  assignee: ["ผู้รับผิดชอบ", "Assignee"], reviewers: ["ผู้ตรวจ/อนุมัติ", "Reviewer"],
  order_date: ["วันที่สั่ง", "Order date"], due_date: ["กำหนดส่ง", "Due date"],
  drive: ["โฟลเดอร์ Drive", "Drive folder"], platform: ["Platform", "Platform"],
  description: ["รายละเอียด", "Description"], cover: ["รูปปก", "Cover image"],
};

function todayStr(): string { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`); if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type FormState = {
  title: string; description: string; task_type: string;
  brand_id: string; campaign_id: string;
  assignees: UserPickerValue[]; reviewers: UserPickerValue[];
  priority: CreativePriority; order_date: string; due_date: string;
  products: SkuPickerValue[]; parents: ParentSkuPickerValue[]; platforms: string[]; drive_folder_url: string;
  cover_image_r2_key: string; reference_images: string[];
};
const EMPTY_FORM: FormState = {
  title: "", description: "", task_type: "", brand_id: "", campaign_id: "",
  assignees: [], reviewers: [], priority: "normal", order_date: "", due_date: "", products: [], parents: [], platforms: [], drive_folder_url: "", cover_image_r2_key: "", reference_images: [],
};

// แถวงานย่อยในขั้นที่ 2
type SubRow = { include: boolean; title: string; description: string | null; required_before_next: boolean; assignees: { id: string; label: string }[]; type: string; config: SubtaskStepConfig };

export type CreatedTask = { id: string; task_no: string; title: string; subtasks: { title: string }[] };

// Step labels are rendered via t() inside the component
const STEPS_TH = ["แบรนด์", "ข้อมูลงาน", "งานย่อย", "สินค้า"];

export function CreateTaskModal({ open, onClose, onCreated, pushToast, lockedCampaignId, lockedCampaignLabel }: {
  open: boolean;
  onClose: () => void;
  onCreated: (res: CreatedTask) => void;
  pushToast: (type: "success" | "error" | "info", m: string) => void;
  lockedCampaignId?: string;
  lockedCampaignLabel?: string;
}) {
  const t = useT();
  const { taskTypes, platforms } = useCreativeOptions();
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [tplId, setTplId] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [contentItems, setContentItems] = useState<TemplateContentItem[]>([]);   // คอนเทนต์พ่วงจากแม่แบบ
  const [tplDueOffset, setTplDueOffset] = useState<number | null>(null);   // กำหนดส่ง = วันที่สั่ง + X (จากแม่แบบ)
  const [defaultReviewers, setDefaultReviewers] = useState<UserPickerValue[]>([]);   // ผู้ตรวจเริ่มต้น (ค่ากลาง ui_config)
  const [step, setStep] = useState(1);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [arrangeItems, setArrangeItems] = useState<ArrangeItem[]>([]);   // งานเรียงพิมพ์: รูป+ขนาด+จำนวน
  const [arrangeBases, setArrangeBases] = useState<ArrangeBase[]>([]);   // งานเรียงพิมพ์: รูปฐาน (DFT UV Printed) + เพิ่ม/ลบต่อรูป
  const [arrangePrintType, setArrangePrintType] = useState<ArrangePrintType | null>(null);   // งานเรียงพิมพ์: ประเภทแผ่นพิมพ์ (DTF/UV)
  const [printedName, setPrintedName] = useState("");   // งานเรียงพิมพ์: ชื่อเสริม (ต่อท้ายชื่อ Printed_YYYY_MM_DD-#)
  // ช่องที่ผู้ใช้ "แตะเอง" ในขั้นข้อมูลงาน — ช่องที่ยังไม่แตะ (ยังเป็นค่าเริ่มต้น) = กล่องเทาอ่อน · ช่องว่าง = กล่องส้มอ่อน + ดันขึ้นบน
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [emptySnap, setEmptySnap] = useState<Set<string>>(new Set());   // ช่องที่ว่างตอน "เข้าขั้นข้อมูลงาน" (snapshot กันเด้งไปมาระหว่างพิมพ์)
  // โหมดกรอกข้อมูล BASIC (โชว์เฉพาะช่องจำเป็น) / ADVANCE (โชว์ครบ) — ตั้งร่วมทั้งระบบ (ui_config)
  const [fieldMode, setFieldMode] = useState<"basic" | "advance">("advance");
  const [basicFields, setBasicFields] = useState<string[]>(DEFAULT_BASIC_FIELDS);
  const [modeCfgOpen, setModeCfgOpen] = useState(false);
  useEffect(() => {
    apiFetch("/api/ui-config?key=wizard_fields").then((r) => r.json()).then((j) => {
      const v = (j.value ?? {}) as { mode?: string; basic?: string[] };
      if (v.mode === "basic" || v.mode === "advance") setFieldMode(v.mode);
      if (Array.isArray(v.basic) && v.basic.length) setBasicFields(v.basic);
    }).catch(() => { /* ไม่มีค่า = ใช้ค่าเริ่มต้น */ });
  }, []);
  const saveFieldCfg = (mode: "basic" | "advance", basic: string[]) => {
    apiFetch("/api/ui-config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "wizard_fields", value: { mode, basic } }) }).catch(() => { /* บันทึกไม่ได้ก็ใช้ในเครื่องต่อได้ */ });
  };

  const STEPS = [t("แบรนด์/เทมเพลต","Brand/Template"), t("ข้อมูลงาน","Task info"), t("งานย่อย","Subtasks"), t("สินค้า","Products")];

  useEffect(() => {
    (async () => { try { const [b, c, tp] = await Promise.all([listBrands(), listCampaigns(), listTemplates()]); setBrands(b); setCampaigns(c); setTemplates(tp); } catch { /* ignore */ } })();
    // ผู้ตรวจเริ่มต้น (ค่ากลาง) — prefill ตอนเปิด Wizard สร้างงานใหม่
    apiFetch("/api/ui-config?key=creative_default_reviewers").then((r) => r.json()).then((j) => {
      const rv = ((j.value?.reviewers ?? []) as { id: string; name: string }[]).filter((x) => x?.id);
      if (rv.length) setDefaultReviewers(rv.map((x) => ({ id: x.id, name: x.name } as UserPickerValue)));
    }).catch(() => {});
  }, []);
  useEffect(() => { if (open) { setForm({ ...EMPTY_FORM, campaign_id: lockedCampaignId ?? "", order_date: todayStr(), due_date: addDaysStr(todayStr(), 3), reviewers: defaultReviewers }); setSubs([]); setContentItems([]); setArrangeItems([]); setArrangeBases([]); setPrintedName(""); setTplDueOffset(null); setTplId(""); setStep(1); setFormErr(null); setDirty(false); setTouched(new Set()); } }, [open, lockedCampaignId]);   // eslint-disable-line react-hooks/exhaustive-deps
  // เผื่อ default reviewers โหลดเสร็จหลังเปิด Wizard → เติมให้ถ้ายังว่าง (ไม่ทับที่แก้เอง/แม่แบบ)
  useEffect(() => { if (open && !tplId && defaultReviewers.length && form.reviewers.length === 0 && !touched.has("reviewers")) updateForm({ reviewers: defaultReviewers }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open, defaultReviewers]);

  const updateForm = (patch: Partial<FormState>) => { setForm((p) => ({ ...p, ...patch })); setDirty(true); };
  // เลือกผู้รับผิดชอบงานแม่ → เติมให้เฉพาะงานย่อยที่ "ยังว่าง" (งานย่อยที่ template ใส่คนไว้แล้ว/แก้เองแล้ว จะไม่โดนทับ)
  const pickTaskAssignees = (list: UserPickerValue[]) => {
    markTouched("assignee");
    updateForm({ assignees: list });
    const asg = list.map((u) => ({ id: u.id, label: u.name }));
    setSubs((rows) => rows.map((r) => (r.assignees.length === 0 ? { ...r, assignees: asg } : r)));
  };
  // แตะช่องแล้ว = ตั้งเอง → กล่องปกติ · ยังไม่แตะแต่มีค่า = ค่าเริ่มต้น → กล่องเทาอ่อน · ว่าง = กล่องส้มอ่อน
  const markTouched = (k: string) => setTouched((prev) => (prev.has(k) ? prev : new Set(prev).add(k)));
  const emptyNow = (k: string): boolean => {
    switch (k) {
      case "title": return !form.title.trim();
      case "brand_id": return !form.brand_id;
      case "campaign_id": return !form.campaign_id;
      case "assignee": return form.assignees.length === 0;
      case "reviewers": return form.reviewers.length === 0;
      case "order_date": return !form.order_date;
      case "due_date": return !form.due_date;
      case "drive": return !form.drive_folder_url.trim();
      case "platform": return form.platforms.length === 0;
      case "description": return !form.description.trim();
      case "cover": return !form.cover_image_r2_key;
      default: return false;   // task_type/priority มีค่าเสมอ
    }
  };
  const orderStyle = (k: string) => ({ order: emptySnap.has(k) ? 0 : 1 });
  // โหมด BASIC = ซ่อนช่องที่ไม่ได้ติ๊ก · แต่ช่องที่ "มีค่าอยู่แล้ว" ยังโชว์ (กันข้อมูลจากเทมเพลตหายไปเงียบ ๆ)
  const showField = (k: string) => fieldMode === "advance" || basicFields.includes(k) || !emptyNow(k);
  const hideCls = (k: string) => (showField(k) ? "" : "hidden");
  const ctrlCls = (k: string) => (emptyNow(k) ? "bg-orange-50 border-orange-200" : touched.has(k) ? "" : "bg-slate-100");
  const wrapCls = (k: string) => (emptyNow(k) ? "rounded-lg bg-orange-50 border border-orange-200 p-1.5" : "");
  // เข้าขั้น "ข้อมูลงาน" ครั้งใด → จับ snapshot ว่าช่องไหนว่าง (ใช้จัดลำดับให้ช่องว่างอยู่บน โดยไม่เด้งระหว่างพิมพ์)
  useEffect(() => {
    if (step === 2) setEmptySnap(new Set(REORDER_KEYS.filter((k) => emptyNow(k))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);
  const togglePlatform = (v: string) => updateForm({ platforms: form.platforms.includes(v) ? form.platforms.filter((x) => x !== v) : [...form.platforms, v] });

  // เลือก template → เติมข้อมูลงาน + ดึงงานย่อยมาเป็นรายการให้เลือก/แก้
  const applyTemplate = (id: string) => {
    setTplId(id); setDirty(true); setTouched(new Set());   // เปลี่ยนแม่แบบ/แบรนด์ = ตั้งค่าเริ่มต้นใหม่ → กลับเป็นสีเทาหมด
    const tpl = templates.find((x) => x.id === id);
    setArrangeItems([]); setArrangeBases([]); setPrintedName("");   // เปลี่ยนแม่แบบ → ล้างรายการเรียงพิมพ์/รูปฐาน/ชื่อเสริม
    if (!tpl) { setSubs([]); setContentItems([]); setTplDueOffset(null); return; }
    // งานเรียงพิมพ์ → ตั้งชื่ออัตโนมัติ Printed_YYYY_MM_DD-# (# = เลขรันของวันนั้น นับจากงานเดิม)
    if ((tpl.steps ?? []).some((s) => s.type === "arrange_print")) {
      const d = new Date();
      const prefix = `Printed_${d.getFullYear()}_${String(d.getMonth() + 1).padStart(2, "0")}_${String(d.getDate()).padStart(2, "0")}-`;
      setForm((p) => ({ ...p, title: `${prefix}1` }));
      listTasks({ search: prefix, include_inactive: true }).then((rows) => {
        const nums = rows.map((r) => { const m = String(r.title ?? "").match(/-(\d+)/); return String(r.title ?? "").startsWith(prefix) && m ? Number(m[1]) : 0; });
        const next = Math.max(0, ...nums) + 1;
        setForm((p) => (String(p.title).startsWith(prefix) ? { ...p, title: `${prefix}${next}` } : p));
      }).catch(() => { /* ใช้ -1 ไปก่อน */ });
    }
    const offset = tpl.due_offset_days ?? null;
    setTplDueOffset(offset);
    setForm((p) => ({
      ...p,
      task_type: tpl.task_type ?? p.task_type, priority: (tpl.default_priority as CreativePriority) ?? p.priority,
      platforms: tpl.platforms ?? [], brand_id: tpl.brand_id ?? p.brand_id,
      description: tpl.description ?? p.description,
      reviewers: (tpl.default_reviewers && tpl.default_reviewers.length) ? tpl.default_reviewers.map((r) => ({ id: r.id, name: r.label } as UserPickerValue)) : (tpl.default_reviewer_id ? [{ id: tpl.default_reviewer_id, name: tpl.default_reviewer_label ?? "" } as UserPickerValue] : p.reviewers),
      due_date: (offset != null && p.order_date) ? addDaysStr(p.order_date, offset) : p.due_date,
    }));
    setContentItems(Array.isArray(tpl.content_items) ? tpl.content_items : []);
    setSubs((tpl.steps ?? []).filter((s) => s.title?.trim()).map((s) => ({
      include: true, title: s.title, description: s.description ?? null, required_before_next: !!s.required_before_next,
      assignees: (s.assignee_ids ?? []).map((aid, i) => ({ id: aid, label: s.assignee_labels?.[i] ?? "ผู้ใช้" })),
      type: s.type ?? "custom", config: s.config ?? {},
    })));
  };

  const addBlankSub = () => { setSubs((p) => [...p, { include: true, title: "", description: null, required_before_next: false, assignees: form.assignees.map((u) => ({ id: u.id, label: u.name })), type: "custom", config: {} }]); setDirty(true); };
  const addContentItem = () => { setContentItems((p) => [...p, { title: "", platforms: [] }]); setDirty(true); };
  const patchContentItem = (i: number, patch: Partial<TemplateContentItem>) => { setContentItems((p) => p.map((c, j) => j === i ? { ...c, ...patch } : c)); setDirty(true); };
  const removeContentItem = (i: number) => { setContentItems((p) => p.filter((_, j) => j !== i)); setDirty(true); };
  const patchSub = (i: number, p: Partial<SubRow>) => { setSubs((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...p } : r))); setDirty(true); };
  const removeSub = (i: number) => { setSubs((rows) => rows.filter((_, idx) => idx !== i)); setDirty(true); };

  // เปลี่ยนรายการเรียงพิมพ์ (จากของกลาง ArrangePrintEditor) → mark dirty
  const onArrangeChange = (items: ArrangeItem[]) => { setArrangeItems(items); setDirty(true); };
  const onArrangeBasesChange = (b: ArrangeBase[]) => { setArrangeBases(b); setDirty(true); };

  const next = () => {
    if (step === 2 && !form.title.trim()) { setFormErr(t("กรุณากรอกชื่องาน","Please enter a task title")); return; }
    setFormErr(null);
    // งานเรียงพิมพ์: ข้ามขั้น "ข้อมูลงาน" ไปขั้นเรียงพิมพ์เลย (ข้อมูลย่อรวมอยู่ในขั้นนั้น)
    if (step === 1 && isArrangePrint) { setStep(3); return; }
    setStep((s) => Math.min(4, s + 1));
  };
  const back = () => {
    setFormErr(null);
    if (step === 3 && isArrangePrint) { setStep(1); return; }
    setStep((s) => Math.max(1, s - 1));
  };
  // วันที่สั่งเปลี่ยน → คำนวณกำหนดส่งใหม่ (แม่แบบ +X หรือ default +3) ถ้ายังไม่แก้กำหนดส่งเอง
  const setOrderDate = (v: string) => { const autoDue = !!v && (tplDueOffset != null || !touched.has("due_date")); updateForm({ order_date: v, ...(autoDue ? { due_date: addDaysStr(v, tplDueOffset ?? 3) } : {}) }); };
  // เทมเพลตของแบรนด์ที่เลือก (+ เทมเพลตทั่วไปที่ไม่ผูกแบรนด์)
  // ยกเว้นเทมเพลตที่ติ๊ก "ไม่เกี่ยวกับแบรนด์" (เช่นงานเรียงพิมพ์) → โชว์เฉพาะตอนเลือก "ไม่ระบุแบรนด์"
  const brandTemplates = templates.filter((tp) => form.brand_id
    ? ((tp.brand_id === form.brand_id || !tp.brand_id) && !tp.no_brand_only)
    : !tp.brand_id);
  // เทมเพลตที่เลือกบังคับระบุ Parent SKU ไหม (เช่น เพิ่มสี/แก้สี)
  const requireParent = !!templates.find((x) => x.id === tplId)?.require_parent_sku;
  // งานเรียงพิมพ์ (มีงานย่อยชนิด arrange_print) → ขั้น "งานย่อย" แสดง UI เลือกรูป+ขนาด+จำนวนแทน
  const isArrangePrint = subs.some((s) => s.type === "arrange_print");
  // ชื่อเต็มงานเรียงพิมพ์ = ชื่ออัตโนมัติ + ชื่อเสริม (ใช้เป็นชื่องานจริงตอนบันทึก + ปุ่มคัดลอก)
  const combinedTitle = `${form.title.trim()}${printedName.trim() ? `_${printedName.trim()}` : ""}`;
  const copyCombined = async () => {
    try { await navigator.clipboard.writeText(combinedTitle); pushToast("success", t("คัดลอกชื่อเต็มแล้ว", "Full name copied")); }
    catch { pushToast("error", t("คัดลอกไม่สำเร็จ", "Copy failed")); }
  };

  const save = async () => {
    if (!form.title.trim()) { setStep(2); setFormErr(t("กรุณากรอกชื่องาน","Please enter a task title")); return; }
    if (requireParent && form.parents.length === 0) { setStep(4); setFormErr(t("งานนี้ต้องระบุ Parent SKU (ตระกูลสินค้า) อย่างน้อย 1 รายการ","This task requires at least one Parent SKU")); return; }
    setSaving(true); setFormErr(null);
    const arrangeConfig = { ...specFromItems(arrangeItems), bases: specBasesFrom(arrangeBases), print_type: arrangePrintType };
    const subtasks = subs.filter((s) => s.include && s.title.trim()).map((s) => ({ title: s.title.trim(), description: s.description, assignee_ids: s.assignees.map((a) => a.id), required_before_next: s.required_before_next, type: s.type, config: s.type === "arrange_print" ? { ...s.config, arrange_print: arrangeConfig } : s.config }));
    const effTitle = isArrangePrint ? combinedTitle : form.title.trim();   // เรียงพิมพ์ = ชื่ออัตโนมัติ + ชื่อเสริม
    try {
      const { id, task_no } = await createTask({
        title: effTitle, description: form.description.trim() || null, task_type: form.task_type || null,
        brand_id: form.brand_id || null, campaign_id: (lockedCampaignId ?? form.campaign_id) || null,
        assignee_ids: form.assignees.map((a) => a.id), assignee_id: form.assignees[0]?.id ?? null, reviewer_ids: form.reviewers.map((r) => r.id),
        priority: form.priority, start_date: form.order_date || null, due_date: form.due_date || null,
        sku_id: form.products[0]?.id ?? null, product_name: form.products[0]?.name ?? null, sku_ids: form.products.map((p) => p.id),
        parent_sku_id: form.parents[0]?.id ?? null, parent_sku_ids: form.parents.map((p) => p.id),
        platforms: form.platforms, drive_folder_url: form.drive_folder_url.trim() || null,
        cover_image_r2_key: form.cover_image_r2_key || null,
        reference_images: form.reference_images,
        subtasks,
        content_items: contentItems.filter((c) => c.title?.trim()),
      });
      setDirty(false);
      onCreated({ id, task_no, title: effTitle, subtasks: subtasks.map((s) => ({ title: s.title })) });
      onClose();
    } catch (e) { setFormErr((e as Error).message); pushToast("error", (e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <ERPModal
      open={open} onClose={onClose} title={t("สร้างงานใหม่ (Wizard)","Create Task (Wizard)")} size="lg" hasUnsavedChanges={dirty}
      footer={<>
        {step > 1 && <button onClick={back} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 mr-auto">← {t("ย้อนกลับ","Back")}</button>}
        <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก","Cancel")}</button>
        {step < (isArrangePrint ? 3 : 4)
          ? <button onClick={next} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700">{t("ถัดไป","Next")} →</button>
          : <button onClick={save} disabled={saving} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{saving ? t("กำลังบันทึก...","Saving...") : t("สร้างงาน","Create task")}</button>}
      </>}
    >
      {/* step indicator — งานเรียงพิมพ์เหลือ 2 ขั้น (แบรนด์/เทมเพลต → เรียงพิมพ์) */}
      <div className="flex items-center gap-2 mb-4">
        {(isArrangePrint ? [STEPS[0], t("เรียงพิมพ์", "Arrange print")] : STEPS).map((label, i) => {
          const cur = isArrangePrint ? (step === 1 ? 1 : 2) : step;
          const count = isArrangePrint ? 2 : STEPS.length;
          const n = i + 1; const active = n === cur; const done = n < cur;
          return (
          <div key={`${i}-${label}`} className="flex items-center gap-2">
            <span className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${active ? "bg-violet-600 text-white" : done ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-400"}`}>{done ? "✓" : n}</span>
            <span className={`text-sm ${active ? "font-semibold text-slate-800" : "text-slate-400"}`}>{label}</span>
            {n < count && <span className="text-slate-300">—</span>}
          </div>
        ); })}
      </div>

      {formErr && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠️ {formErr}</div>}
      {lockedCampaignId && step === 1 && <div className="mb-4 px-3 py-2 bg-violet-50/60 border border-violet-100 rounded-lg text-sm text-slate-600">📣 Campaign: <span className="font-medium text-slate-800">{lockedCampaignLabel || t("แคมเปญนี้","this campaign")}</span></div>}

      {/* STEP 1 — เลือกแบรนด์ + เทมเพลตของแบรนด์ */}
      {step === 1 && (
        <div className="space-y-5">
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">{t("เลือกแบรนด์","Choose a brand")}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {brands.map((b) => { const on = form.brand_id === b.id; return (
                <button key={b.id} type="button" onClick={() => { updateForm({ brand_id: b.id }); applyTemplate(""); }}
                  className={`flex items-center gap-2 p-2.5 rounded-lg border text-left ${on ? "border-violet-400 ring-2 ring-violet-200 bg-violet-50/40" : "border-slate-200 hover:border-violet-300"}`}>
                  <BrandIcon brand={b} /><span className="text-sm font-medium text-slate-700 truncate">{b.name}</span>
                </button>
              ); })}
              <button type="button" onClick={() => { updateForm({ brand_id: "" }); applyTemplate(""); }}
                className={`flex items-center gap-2 p-2.5 rounded-lg border text-left ${!form.brand_id ? "border-violet-400 ring-2 ring-violet-200 bg-violet-50/40" : "border-slate-200 hover:border-violet-300"}`}>
                <span className="h-8 w-8 rounded-md bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">∅</span>
                <span className="text-sm font-medium text-slate-500">{t("ไม่ระบุแบรนด์","No brand")}</span>
              </button>
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">{t("เลือกเทมเพลต","Choose a template")} <span className="text-xs font-normal text-slate-400">({t("ของแบรนด์นี้ + ทั่วไป","this brand + general")})</span></p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button type="button" onClick={() => applyTemplate("")} className={`p-3 rounded-lg border text-left ${!tplId ? "border-violet-400 ring-2 ring-violet-200 bg-violet-50/40" : "border-slate-200 hover:border-violet-300"}`}>
                <p className="text-sm font-medium text-slate-700">— {t("ไม่ใช้เทมเพลต","No template")} —</p>
                <p className="text-xs text-slate-400">{t("กรอกข้อมูลงานเอง","Fill task info manually")}</p>
              </button>
              {brandTemplates.map((tpl) => { const on = tplId === tpl.id; return (
                <button key={tpl.id} type="button" onClick={() => applyTemplate(tpl.id)} className={`p-3 rounded-lg border text-left ${on ? "border-violet-400 ring-2 ring-violet-200 bg-violet-50/40" : "border-slate-200 hover:border-violet-300"}`}>
                  <p className="text-sm font-medium text-slate-800 flex items-center gap-1.5">
                    {tpl.icon ? <span className="text-lg leading-none shrink-0">{tpl.icon}</span> : null}
                    <span className="min-w-0">{tpl.name}</span>
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">{(tpl.steps?.length ?? 0)} {t("ขั้นตอน","steps")}{(tpl.content_items?.length ?? 0) > 0 ? ` · 📱 ${tpl.content_items!.length}` : ""}{tpl.due_offset_days != null ? ` · ⏱ +${tpl.due_offset_days}${t("ว","d")}` : ""}</p>
                </button>
              ); })}
              {brandTemplates.length === 0 && <p className="text-xs text-slate-400 sm:col-span-2 py-2">{t("แบรนด์นี้ยังไม่มีเทมเพลต — กดถัดไปกรอกข้อมูลงานได้เลย","No templates for this brand — click Next to fill task info")}</p>}
            </div>
          </div>
        </div>
      )}

      {/* STEP 2 — ข้อมูลงาน */}
      {step === 2 && (<>
        {contentItems.length > 0 && (
          <div className="mb-4 flex items-center gap-2 bg-fuchsia-50/60 border border-fuchsia-100 rounded-lg px-3 py-2 text-sm text-fuchsia-700">
            📱 {t("แม่แบบนี้จะสร้างคอนเทนต์", "This template will create")} {contentItems.length} {t("ชิ้นพ่วงกับงาน (ดู/แก้ได้ที่แท็บคอนเทนต์ในงาน)", "content item(s) linked to the task (view/edit in the task's Content tab)")}
          </div>
        )}
        {/* สวิตช์โหมดกรอก: BASIC (เฉพาะช่องจำเป็น) / ADVANCE (ครบ) + ⚙️ ตั้งว่า BASIC โชว์ช่องไหน (ตั้งร่วมทั้งระบบ) */}
        <div className="flex items-center justify-end gap-2 mb-2">
          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5">
            {(["basic", "advance"] as const).map((m) => (
              <button key={m} type="button" onClick={() => { setFieldMode(m); saveFieldCfg(m, basicFields); }}
                className={`h-7 px-3 text-[11px] font-semibold rounded-md transition-colors ${fieldMode === m ? "bg-violet-600 text-white" : "text-slate-500 hover:text-slate-700"}`}>
                {m === "basic" ? "BASIC" : "ADVANCE"}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setModeCfgOpen((s) => !s)} title={t("ตั้งว่าโหมด BASIC โชว์ช่องไหน", "Choose which fields BASIC shows")}
            className="h-7 w-7 inline-flex items-center justify-center text-slate-400 hover:text-violet-700 border border-slate-200 rounded-md">⚙️</button>
        </div>
        {modeCfgOpen && (
          <div className="mb-3 border border-violet-200 bg-violet-50/40 rounded-lg p-2.5">
            <p className="text-[11px] text-slate-500 mb-1.5">{t("ติ๊กช่องที่จะให้โชว์ในโหมด BASIC (มีผลกับทุกคน) · ช่องที่มีค่าอยู่แล้วจะโชว์เสมอ", "Tick fields shown in BASIC (applies to everyone) · fields with a value always show")}</p>
            <div className="flex flex-wrap gap-1.5">
              {REORDER_KEYS.map((k) => {
                const on = basicFields.includes(k);
                return (
                  <button key={k} type="button"
                    onClick={() => { const next = on ? basicFields.filter((x) => x !== k) : [...basicFields, k]; setBasicFields(next); saveFieldCfg(fieldMode, next); }}
                    className={`h-7 px-2.5 text-[11px] rounded-full border ${on ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200 hover:border-violet-300"}`}>
                    {on ? "✓ " : ""}{t(FIELD_LABELS[k]?.[0] ?? k, FIELD_LABELS[k]?.[1] ?? k)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <ERPFormSection title={t("ข้อมูลงาน","Task info")} columns={2}>
          <ERPFormField label={t("ชื่องาน","Task title")} required span={2}><ERPInput className={ctrlCls("title")} value={form.title} onChange={(e) => { markTouched("title"); updateForm({ title: e.target.value }); }} placeholder={t("เช่น ถ่ายรูปกระเป๋า Summer 8 สี","e.g. Summer bag photoshoot 8 colors")} /></ERPFormField>
          {/* ประเภทงาน — ปักไว้ลำดับ 2 เสมอ (ต่อจากชื่องาน) ไม่ให้เลื่อนตอนกรอก */}
          <ERPFormField label={t("ประเภทงาน","Task type")} style={{ order: 0 }} className={hideCls("task_type")}><ERPSelect className={ctrlCls("task_type")} value={form.task_type} placeholder={t("— เลือกประเภท —","— select —")} options={taskTypes} onChange={(e) => { markTouched("task_type"); updateForm({ task_type: e.target.value }); }} /></ERPFormField>
          <ERPFormField label={t("ความสำคัญ","Priority")} style={orderStyle("priority")} className={hideCls("priority")}><ERPSelect className={ctrlCls("priority")} value={form.priority} options={priorityOptions()} onChange={(e) => { markTouched("priority"); updateForm({ priority: e.target.value as CreativePriority }); }} /></ERPFormField>
          <ERPFormField label={t("แบรนด์","Brand")} style={orderStyle("brand_id")} className={hideCls("brand_id")}><ERPSelect className={ctrlCls("brand_id")} value={form.brand_id} options={[{ value: "", label: `— ${t("ไม่ระบุ","Not specified")} —` }, ...brands.map((b) => ({ value: b.id, label: b.name }))]} onChange={(e) => { markTouched("brand_id"); updateForm({ brand_id: e.target.value }); }} /></ERPFormField>
          {!lockedCampaignId && <ERPFormField label="Campaign" style={orderStyle("campaign_id")} className={hideCls("campaign_id")}><ERPSelect className={ctrlCls("campaign_id")} value={form.campaign_id} options={[{ value: "", label: `— ${t("ไม่ระบุ","Not specified")} —` }, ...campaigns.map((c) => ({ value: c.id, label: c.name }))]} onChange={(e) => { markTouched("campaign_id"); updateForm({ campaign_id: e.target.value }); }} /></ERPFormField>}
          <ERPFormField label={t("ผู้รับผิดชอบ (เลือกได้หลายคน)","Assignee (multiple)")} span={2} style={orderStyle("assignee")} className={hideCls("assignee")}>
            <div className={wrapCls("assignee")}>
              <MultiUserPicker value={form.assignees} onChange={pickTaskAssignees} disableCreate />
              <p className="text-[11px] text-slate-400 mt-1">{t("เลือกแล้ว งานย่อยทุกอันจะใช้คนกลุ่มนี้อัตโนมัติ (แก้รายอันได้ในขั้นถัดไป)", "Subtasks inherit these people automatically (editable per subtask in the next step)")}</p>
            </div>
          </ERPFormField>
          <ERPFormField label={t("ผู้ตรวจ/อนุมัติ (เลือกได้หลายคน)","Reviewer / Approver (multiple)")} style={orderStyle("reviewers")} className={hideCls("reviewers")}><div className={wrapCls("reviewers")}><MultiUserPicker value={form.reviewers} onChange={(v) => updateForm({ reviewers: v })} disableCreate /></div></ERPFormField>
          <ERPFormField label={t("วันที่สั่ง","Order date")} style={orderStyle("order_date")} className={hideCls("order_date")}><ERPInput type="date" className={ctrlCls("order_date")} value={form.order_date} onChange={(e) => { markTouched("order_date"); setOrderDate(e.target.value); }} /></ERPFormField>
          <ERPFormField label={t("กำหนดส่ง","Due date")} style={orderStyle("due_date")} className={hideCls("due_date")} hint={tplDueOffset != null ? t(`อัตโนมัติ = วันที่สั่ง + ${tplDueOffset} วัน (แก้เองได้)`, `auto = order date + ${tplDueOffset}d (editable)`) : t("ค่าเริ่มต้น = วันที่สั่ง + 3 วัน · กดปุ่มลัด/แก้เองได้", "default = order date + 3 days · use quick buttons / edit")}>
            <div className="space-y-1">
              <ERPInput type="date" className={ctrlCls("due_date")} value={form.due_date} onChange={(e) => { markTouched("due_date"); updateForm({ due_date: e.target.value }); }} />
              <div className="flex gap-1">
                {[1, 3, 7].map((n) => <button key={n} type="button" title={t(`วันที่สั่ง + ${n} วัน`, `order date + ${n}d`)} onClick={() => { markTouched("due_date"); updateForm({ due_date: addDaysStr(form.order_date || todayStr(), n) }); }} className="h-7 px-2 text-[11px] rounded-md border border-slate-200 text-slate-600 hover:bg-violet-50 hover:border-violet-300">+{n} {t("วัน","d")}</button>)}
              </div>
            </div>
          </ERPFormField>
          <ERPFormField label={t("โฟลเดอร์ Drive (ลิงก์)","Drive folder (link)")} span={2} style={orderStyle("drive")} className={hideCls("drive")}><ERPInput className={ctrlCls("drive")} value={form.drive_folder_url} onChange={(e) => { markTouched("drive"); updateForm({ drive_folder_url: e.target.value }); }} placeholder="https://drive.google.com/..." /></ERPFormField>
          <ERPFormField label="Platform" span={2} style={orderStyle("platform")} className={hideCls("platform")}>
            <div className={`flex flex-wrap gap-1.5 ${wrapCls("platform")}`}>
              {platforms.map((p) => <button key={p.value} type="button" onClick={() => togglePlatform(p.value)} className={`px-2.5 py-1 rounded-full text-xs border ${form.platforms.includes(p.value) ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200 hover:border-violet-300"}`}>{p.label}</button>)}
            </div>
          </ERPFormField>
          <ERPFormField label={t("รายละเอียด","Description")} span={2} style={orderStyle("description")} className={hideCls("description")}><ERPTextarea className={ctrlCls("description")} value={form.description} rows={2} onChange={(e) => { markTouched("description"); updateForm({ description: e.target.value }); }} placeholder={t("อธิบายงาน/บรีฟเพิ่มเติม","Describe the task or brief")} /></ERPFormField>
          <ERPFormField label={t("แนบรูป (บรีฟ/อ้างอิง)","Attach images (brief/reference)")} span={2}>
            <ImageAttachKeys value={form.reference_images} onChange={(keys) => { markTouched("description"); updateForm({ reference_images: keys }); }} folder="creative-tasks" maxSize={800} />
          </ERPFormField>
          <ERPFormField label={t("รูปปก (ไม่บังคับ — ถ้า Parent SKU มีรูป จะใช้รูปนั้นแทน)","Cover image (optional — Parent SKU image takes priority)")} span={2} style={orderStyle("cover")} className={hideCls("cover")}>
            <div className={wrapCls("cover")}><ImageInput value={form.cover_image_r2_key || null} onChange={(k) => updateForm({ cover_image_r2_key: k ?? "" })} folder="creative-tasks" compact /></div>
          </ERPFormField>
        </ERPFormSection>
      </>)}

      {/* STEP 3A — งานเรียงพิมพ์ (เลือกรูป Artwork + ขนาด + จำนวน) */}
      {step === 3 && isArrangePrint && (
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-base">🖨️</span>
            <p className="text-sm font-semibold text-slate-700">{t("งานเรียงพิมพ์ — เลือกรูปแล้วกำหนดขนาด/จำนวน", "Arrange print — pick images, set sizes/qty")}</p>
          </div>
          <p className="text-xs text-slate-400 mb-3">{t("แต่ละรูปเลือกได้หลายขนาด · ขนาดดึงจากคลัง Artwork · เพิ่มขนาดใหม่ได้", "Each image: multiple sizes · from Artwork library · add new sizes")}</p>

          {/* 2 คอลัมน์: ซ้าย = ข้อมูลงาน · ขวา = ประเภทแผ่นพิมพ์/รูปฐาน/Artwork (จอแคบยุบเป็นบน-ล่าง) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
          {/* ซ้าย — ข้อมูลงานแบบย่อ (รวมขั้น "ข้อมูลงาน") */}
          <div className="border border-slate-200 rounded-xl p-3 space-y-2.5 bg-slate-50/40">
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] text-slate-400">{t("ชื่องาน (ตั้งอัตโนมัติ)", "Task name (auto)")}</label>
                <ERPInput value={form.title} onChange={(e) => updateForm({ title: e.target.value })} className="font-mono" />
              </div>
              <div>
                <label className="text-[11px] text-slate-400">{t("ชื่อเสริม (ไม่บังคับ)", "Optional name")}</label>
                <ERPInput value={printedName} onChange={(e) => { setPrintedName(e.target.value); setDirty(true); }} placeholder={t("เช่น ลายแมว Leo", "e.g. Leo pattern")} />
              </div>
            </div>
            <div>
              <label className="text-[11px] text-slate-400">{t("ชื่อเต็ม (ชื่องาน + ชื่อเสริม)", "Full name")}</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-9 px-3 flex items-center text-sm font-mono bg-white border border-slate-200 rounded-lg truncate">{combinedTitle}</div>
                <button type="button" onClick={copyCombined} title={t("คัดลอกชื่อเต็ม", "Copy full name")} className="h-9 px-3 text-sm text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50 shrink-0">📋 {t("คัดลอก", "Copy")}</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] text-slate-400">{t("ประเภทงาน", "Task type")}</label>
                <ERPSelect value={form.task_type} placeholder={t("— เลือกประเภท —","— select —")} options={taskTypes} onChange={(e) => updateForm({ task_type: e.target.value })} />
              </div>
              <div>
                <label className="text-[11px] text-slate-400">{t("ความสำคัญ", "Priority")}</label>
                <ERPSelect value={form.priority} options={priorityOptions()} onChange={(e) => updateForm({ priority: e.target.value as CreativePriority })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] text-slate-400">{t("ผู้รับผิดชอบ", "Assignees")}</label>
                <MultiUserPicker value={form.assignees} onChange={pickTaskAssignees} disableCreate />
              </div>
              <div>
                <label className="text-[11px] text-slate-400">{t("ผู้ตรวจ/อนุมัติ", "Reviewers")}</label>
                <MultiUserPicker value={form.reviewers} onChange={(v) => updateForm({ reviewers: v })} disableCreate />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] text-slate-400">{t("วันที่สั่ง", "Order date")}</label>
                <ERPInput type="date" value={form.order_date} onChange={(e) => setOrderDate(e.target.value)} />
              </div>
              <div>
                <label className="text-[11px] text-slate-400">{t("กำหนดส่ง", "Due date")}</label>
                <ERPInput type="date" value={form.due_date} onChange={(e) => updateForm({ due_date: e.target.value })} />
              </div>
            </div>
          </div>

          {/* ขวา — ประเภทแผ่นพิมพ์ + รูปฐาน + Artwork (กล่องแยก) */}
          <div className="border border-violet-200 rounded-xl p-3 bg-violet-50/30 lg:max-h-[62vh] lg:overflow-y-auto">
            <ArrangePrintEditor items={arrangeItems} onChange={onArrangeChange} bases={arrangeBases} onBasesChange={onArrangeBasesChange} printType={arrangePrintType} onPrintTypeChange={setArrangePrintType} pushToast={pushToast} contextLabel={combinedTitle || undefined} collapseSizes={false} />
          </div>
          </div>
        </div>
      )}

      {/* STEP 3 — งานย่อย (งานปกติ) */}
      {step === 3 && !isArrangePrint && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-slate-600">{t("งานย่อย","Subtasks")} {subs.length > 0 && <span className="text-slate-400">· {t("ติ๊กเลือกอันที่จะสร้าง / แก้ผู้รับผิดชอบได้","Check the ones to create / edit assignees")}</span>}</p>
            <button onClick={addBlankSub} className="h-8 px-3 text-sm text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50">＋ {t("เพิ่มงานย่อย","Add subtask")}</button>
          </div>
          {subs.length === 0 ? (
            <div className="border border-dashed border-slate-200 rounded-lg p-6 text-center text-sm text-slate-400">{t("ยังไม่มีงานย่อย — เลือกเทมเพลตในขั้นแรก หรือกด ปุ่ม เพิ่มงานย่อย (ข้ามได้ถ้าไม่ต้องการ)","No subtasks yet — choose a Template in step 1, or click Add subtask (optional)")}</div>
          ) : (
            <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
              {subs.map((row, i) => <SubRowEditor key={i} row={row} onChange={(p) => patchSub(i, p)} onRemove={() => removeSub(i)} />)}
            </div>
          )}

          {/* คอนเทนต์ social (สร้างพร้อมงาน) + ผู้รับผิดชอบต่อคอนเทนต์ */}
          <div className="mt-5 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-slate-600">📱 {t("คอนเทนต์ social (สร้างพร้อมงาน)", "Social content (created with the task)")}</p>
              <button onClick={addContentItem} className="h-8 px-3 text-sm text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50">＋ {t("เพิ่มคอนเทนต์", "Add content")}</button>
            </div>
            {contentItems.length === 0 ? (
              <div className="border border-dashed border-slate-200 rounded-lg p-4 text-center text-xs text-slate-400">{t("ยังไม่มีคอนเทนต์ (ข้ามได้ · มาเพิ่มทีหลังที่แท็บคอนเทนต์ได้)", "No content yet (optional · can add later in the Content tab)")}</div>
            ) : (
              <div className="space-y-2">
                {contentItems.map((c, i) => (
                  <div key={i} className="border border-slate-200 rounded-lg p-2.5 space-y-1.5 bg-violet-50/10">
                    <div className="flex items-center gap-2">
                      <span className="text-base">📱</span>
                      <input value={c.title} onChange={(e) => patchContentItem(i, { title: e.target.value })} placeholder={t("ชื่อคอนเทนต์ เช่น โพสต์เปิดตัว 7.7", "Content title")} className="flex-1 h-8 border border-slate-200 rounded-md px-2 text-sm" />
                      <button onClick={() => removeContentItem(i)} className="text-slate-300 hover:text-red-500 text-sm px-1" title={t("ลบ", "Remove")}>✕</button>
                    </div>
                    <div className="pl-7 flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] text-slate-400">{t("ผู้รับผิดชอบ:", "Assignees:")}</span>
                      {(() => {
                        const ids = c.assignee_ids ?? (c.assignee_id ? [c.assignee_id] : []);
                        const labels = c.assignee_labels ?? (c.assignee_label ? [c.assignee_label] : []);
                        const set = (nids: string[], nlabels: string[]) => patchContentItem(i, { assignee_ids: nids, assignee_labels: nlabels, assignee_id: nids[0] ?? null, assignee_label: nlabels[0] ?? null });
                        const addOne = (id: string, name: string) => { if (!ids.includes(id)) set([...ids, id], [...labels, name]); };
                        return <>
                          {ids.map((id, k) => <span key={id} className="inline-flex items-center gap-1 text-xs bg-slate-100 rounded-full pl-2 pr-1 py-0.5">{labels[k] || t("ผู้ใช้", "User")}<button onClick={() => set(ids.filter((_, j2) => j2 !== k), labels.filter((_, j2) => j2 !== k))} className="text-slate-400 hover:text-red-500">✕</button></span>)}
                          <div className="w-48"><UserPicker value={null} onChange={(v) => { if (v) addOne(v.id, v.name); }} disableCreate /></div>
                          <TeamFill onPick={(members) => { const add = members.filter((m) => !ids.includes(m.id)); if (add.length) set([...ids, ...add.map((m) => m.id)], [...labels, ...add.map((m) => m.name)]); }} />
                        </>;
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 4 — สินค้า */}
      {step === 4 && (
        <ERPFormSection title={t("สินค้าที่เกี่ยวข้อง (ใส่ได้หลายรายการ)","Related products (multi-select)")} columns={2}>
          <ERPFormField label={t("สินค้า","Product") + "/SKU"}>
            <SkuPicker value={null} onChange={(v) => { if (v && !form.products.some((p) => p.id === v.id)) updateForm({ products: [...form.products, v] }); }} />
            {form.products.length > 0 && <div className="flex flex-wrap gap-1.5 mt-1.5">{form.products.map((p) => <span key={p.id} className="inline-flex items-center gap-1 text-xs bg-slate-100 rounded-full pl-2 pr-1 py-0.5"><span className="font-mono text-slate-500">{p.code}</span>{p.name}<button onClick={() => updateForm({ products: form.products.filter((x) => x.id !== p.id) })} className="text-slate-400 hover:text-red-500">✕</button></span>)}</div>}
          </ERPFormField>
          <ERPFormField label={`Parent SKU (${t("ตระกูลสินค้า","product family")})`} required={requireParent}>
            <div className={requireParent && form.parents.length === 0 ? "rounded-lg ring-1 ring-orange-300" : ""}>
              <ParentSkuPicker value={null} onChange={(v) => { if (v && !form.parents.some((p) => p.id === v.id)) updateForm({ parents: [...form.parents, v] }); }} />
            </div>
            {requireParent && <p className="text-[11px] text-orange-600 mt-1">{t("งานนี้ (เช่น เพิ่มสี/แก้สี) ต้องระบุ Parent SKU","This task type requires a Parent SKU")}</p>}
            {form.parents.length > 0 && <div className="flex flex-wrap gap-1.5 mt-1.5">{form.parents.map((p) => <span key={p.id} className="inline-flex items-center gap-1 text-xs bg-slate-100 rounded-full pl-2 pr-1 py-0.5"><span className="font-mono text-slate-500">{p.code}</span>{p.name}<button onClick={() => updateForm({ parents: form.parents.filter((x) => x.id !== p.id) })} className="text-slate-400 hover:text-red-500">✕</button></span>)}</div>}
          </ERPFormField>
          <div className="col-span-2 text-xs text-slate-400">{requireParent ? t("Parent SKU จำเป็นสำหรับงานนี้ — สินค้า/SKU ยังไม่บังคับ","Parent SKU is required for this task — Product/SKU still optional") : t("ขั้นนี้ไม่บังคับ — เลือกได้หลายรายการ (เลือกแล้วเลือกต่อได้) กด สร้างงาน ได้เลยถ้าไม่ต้องผูกสินค้า","This step is optional — select as many as needed. Click Create task to skip linking products.")}</div>
        </ERPFormSection>
      )}

    </ERPModal>
  );
}

// ไอคอนแบรนด์ (รูปโลโก้ถ้ามี ไม่งั้นวงกลมตัวอักษร + สีแบรนด์)
function BrandIcon({ brand }: { brand: BrandOption }) {
  const src = brand.logo_url ? (brand.logo_url.startsWith("http") ? brand.logo_url : `/api/r2-image?key=${encodeURIComponent(brand.logo_url)}&w=64`) : null;
  // eslint-disable-next-line @next/next/no-img-element
  if (src) return <img src={src} alt="" className="h-8 w-8 rounded-md object-contain bg-white border border-slate-100 shrink-0" />;
  return <span className="h-8 w-8 rounded-md flex items-center justify-center text-xs font-semibold text-white shrink-0" style={{ background: brand.color || "#94a3b8" }}>{brand.name.slice(0, 2).toUpperCase()}</span>;
}

// แถวงานย่อย (มี state ผู้รับผิดชอบของตัวเอง)
function SubRowEditor({ row, onChange, onRemove }: { row: SubRow; onChange: (p: Partial<SubRow>) => void; onRemove: () => void }) {
  const t = useT();
  const [adding, setAdding] = useState<UserPickerValue | null>(null);
  const addAssignee = (v: UserPickerValue | null) => { if (v && !row.assignees.some((a) => a.id === v.id)) onChange({ assignees: [...row.assignees, { id: v.id, label: v.name }] }); setAdding(null); };
  return (
    <div className={`border rounded-lg p-3 space-y-2 ${row.include ? "border-violet-200 bg-violet-50/20" : "border-slate-200 bg-slate-50/40 opacity-70"}`}>
      <div className="flex items-center gap-2">
        <input type="checkbox" checked={row.include} onChange={(e) => onChange({ include: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-violet-600" />
        <input value={row.title} onChange={(e) => onChange({ title: e.target.value })} placeholder={t("ชื่องานย่อย","Subtask title")} className="flex-1 h-8 border border-slate-200 rounded-md px-2 text-sm" />
        <button onClick={onRemove} className="text-slate-300 hover:text-red-500 text-sm px-1" title={t("ลบแถว","Remove row")}>✕</button>
      </div>
      {row.include && (
        <div className="pl-6 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-400">{t("ผู้รับผิดชอบ:","Assignee:")}</span>
            {row.assignees.map((a) => <span key={a.id} className="inline-flex items-center gap-1 text-xs bg-slate-100 rounded-full pl-2 pr-1 py-0.5">{a.label}<button onClick={() => onChange({ assignees: row.assignees.filter((x) => x.id !== a.id) })} className="text-slate-400 hover:text-red-500">✕</button></span>)}
            {row.assignees.length === 0 && <span className="text-xs text-slate-400">{t("ยังไม่กำหนด","Not assigned")}</span>}
          </div>
          <div className="flex items-center gap-2">
            <div className="w-56"><UserPicker value={adding} onChange={addAssignee} disableCreate /></div>
            <TeamFill onPick={(members) => { const fresh = members.filter((m) => !row.assignees.some((a) => a.id === m.id)).map((m) => ({ id: m.id, label: m.name })); if (fresh.length) onChange({ assignees: [...row.assignees, ...fresh] }); }} />
            <label className="flex items-center gap-1 text-[11px] text-slate-500"><input type="checkbox" checked={row.required_before_next} onChange={(e) => onChange({ required_before_next: e.target.checked })} />{t("ต้องเสร็จก่อนขั้นถัดไป","Must complete before next step")}</label>
          </div>
        </div>
      )}
    </div>
  );
}
