"use client";

/**
 * 🪟 ชี้ที่การ์ดงานแล้วเห็น "รูปใหญ่ + รายละเอียดงาน" (เจ้าของ 2026-10-20: "hover ที่การ์ดแทน hover รูป · ตั้งค่าได้ว่าจะโชว์อะไรบ้าง")
 *   - ชี้ค้าง ~0.35 วิ → กล่องลอยข้างการ์ด (ขวา · ไม่พอ = ซ้าย) · ออกจากการ์ด/กดเมาส์ (เริ่มลาก) = ปิด
 *   - ตั้งค่าต่อคน ใน ⚙️ ของบอร์ด (KanbanTheme.hoverCard / hoverFields) — ค่าเริ่ม = เปิด + ชุด DEFAULT_HOVER_FIELDS
 *   - ทัช (มือถือ/แท็บเล็ต) ไม่เด้ง (useCanHover) · ลากการ์ดอยู่ไม่เด้ง
 * ใช้ที่: การ์ดบอร์ดงาน (overview-kanban CardBody — ทั้งมุมมองการ์ดและ WIP)
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/components/i18n";
import { useCanHover } from "@/lib/use-can-hover";
import { r2ImageUrl } from "@/lib/r2-image";
import { AssigneeStack } from "./assignee-avatar";
import { TaskTypeChip } from "./task-type-chip";
import { statusMeta } from "./use-statuses";
import { PRIORITY_META, priorityLabel, isOverdue, type CreativeTask, type CreativePriority } from "./data";

export type HoverField =
  | "image" | "title" | "taskNo" | "status" | "taskType" | "priority" | "brand" | "campaign"
  | "product" | "assignees" | "reviewers" | "due" | "progress" | "description";

/** รายการที่เลือกได้ (ลำดับ = ลำดับที่โชว์ในกล่อง) */
export const HOVER_FIELDS: { key: HoverField; th: string; en: string }[] = [
  { key: "image", th: "รูปใหญ่", en: "Large image" },
  { key: "title", th: "ชื่องาน", en: "Title" },
  { key: "taskNo", th: "เลขที่งาน", en: "Task no." },
  { key: "status", th: "สถานะ", en: "Status" },
  { key: "taskType", th: "ประเภทงาน", en: "Task type" },
  { key: "priority", th: "ความสำคัญ", en: "Priority" },
  { key: "brand", th: "แบรนด์", en: "Brand" },
  { key: "campaign", th: "แคมเปญ", en: "Campaign" },
  { key: "product", th: "สินค้า (Parent / SKU)", en: "Product (Parent / SKU)" },
  { key: "assignees", th: "ผู้รับผิดชอบ", en: "Assignees" },
  { key: "reviewers", th: "ผู้ตรวจ", en: "Reviewers" },
  { key: "due", th: "กำหนดส่ง", en: "Due date" },
  { key: "progress", th: "ความคืบหน้า", en: "Progress" },
  { key: "description", th: "รายละเอียดงาน", en: "Description" },
];
export const DEFAULT_HOVER_FIELDS: HoverField[] = ["image", "title", "taskNo", "status", "taskType", "brand", "product", "assignees", "due", "progress", "description"];

const DELAY_MS = 350;
const PANEL_W_IMG = 600;   // มีรูป: รูป ~ซ้าย + รายละเอียดขวา
const PANEL_W_TEXT = 320;  // ไม่มีรูป / ปิดรูป

const imageKeyOf = (t: CreativeTask): string | null =>
  (t.parent_sku_image_key as string) || (t.cover_image_r2_key as string) || (t.sku_image_key as string) || null;

/** ห่อการ์ด — ชี้ค้างแล้วเด้งกล่องรูปใหญ่ + รายละเอียด · off = ไม่ทำอะไร (เช่น การ์ดที่กำลังลาก) */
export function TaskHoverWrap({ task, enabled, fields, off, children, className }: {
  task: CreativeTask; enabled: boolean; fields: HoverField[]; off?: boolean; children: ReactNode; className?: string;
}) {
  const canHover = useCanHover();
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [box, setBox] = useState<{ left: number; top: number; w: number } | null>(null);
  const active = enabled && canHover && !off && fields.length > 0;
  const art = (task.arrange_image_keys ?? []) as string[];
  const imgKey = fields.includes("image") ? imageKeyOf(task) : null;
  const artKeys = fields.includes("image") && !imgKey ? art.slice(0, 4) : [];
  const hasImg = !!imgKey || artKeys.length > 0;

  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  const close = () => { clear(); setBox(null); };
  const open = () => {
    const r = ref.current?.getBoundingClientRect(); if (!r) return;
    const pad = 10, vw = window.innerWidth, vh = window.innerHeight;
    const w = Math.min(hasImg ? PANEL_W_IMG : PANEL_W_TEXT, vw - pad * 2);
    const h = Math.min(hasImg ? 420 : 320, vh - pad * 2);
    let left = r.right + pad;
    if (left + w > vw - pad) left = r.left - w - pad;
    if (left < pad) left = Math.max(pad, (vw - w) / 2);
    let top = r.top + r.height / 2 - h / 2;
    if (top < pad) top = pad;
    if (top + h > vh - pad) top = Math.max(pad, vh - h - pad);
    setBox({ left, top, w });
  };
  useEffect(() => () => clear(), []);
  useEffect(() => { if (!active) close(); }, [active]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!box) return;
    const hide = () => close();
    window.addEventListener("scroll", hide, true);
    window.addEventListener("wheel", hide, { passive: true });
    return () => { window.removeEventListener("scroll", hide, true); window.removeEventListener("wheel", hide); };
  }, [box]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={ref} className={className}
      onMouseEnter={active ? () => { clear(); timer.current = setTimeout(open, DELAY_MS); } : undefined}
      onMouseLeave={active ? close : undefined}
      onMouseDown={active ? close : undefined}>
      {children}
      {active && box && typeof document !== "undefined" && createPortal(
        <div style={{ position: "fixed", left: box.left, top: box.top, width: box.w, zIndex: 9999 }} data-task-hover-card
          className="pointer-events-none overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
          <HoverBody task={task} fields={fields} imgKey={imgKey} artKeys={artKeys} />
        </div>,
        document.body,
      )}
    </div>
  );
}

function HoverBody({ task, fields, imgKey, artKeys }: { task: CreativeTask; fields: HoverField[]; imgKey: string | null; artKeys: string[] }) {
  const t = useT();
  const has = (k: HoverField) => fields.includes(k);
  const pr = PRIORITY_META[task.priority as CreativePriority];
  const st = statusMeta(task.status);
  const overdue = isOverdue(task);
  const product = [task.parent_sku_code, task.sku_code && task.sku_code !== task.parent_sku_code ? task.sku_code : null].filter(Boolean).join(" · ");
  const productName = (task.parent_sku_name as string) || task.sku_name || task.product_name;
  const reviewers = (task.reviewers ?? []) as NonNullable<CreativeTask["reviewers"]>;
  const desc = (task.description ?? "").trim();
  const showImg = !!imgKey || artKeys.length > 0;
  const row = (label: string, value: ReactNode) => (
    <div className="flex items-start gap-2 text-[12.5px]">
      <span className="w-20 shrink-0 text-slate-400">{label}</span>
      <span className="min-w-0 flex-1 text-slate-700">{value}</span>
    </div>
  );
  return (
    <div className={`flex ${showImg ? "flex-row" : "flex-col"}`}>
      {showImg && (
        <div className="flex w-[52%] shrink-0 items-center justify-center bg-slate-50 p-2">
          {imgKey ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r2ImageUrl(imgKey, 640) ?? undefined} alt="" decoding="async" className="max-h-[400px] w-full rounded-lg object-contain" />
          ) : (
            <div className="grid w-full grid-cols-2 gap-1.5">
              {artKeys.map((k) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={k} src={r2ImageUrl(k, 320) ?? undefined} alt="" decoding="async" className="aspect-square w-full rounded-md border border-slate-200 bg-white object-contain" />
              ))}
            </div>
          )}
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-1.5 p-3">
        {(has("taskNo") || has("status") || has("taskType") || has("priority")) && (
          <div className="flex flex-wrap items-center gap-1">
            {has("status") && <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10.5px] font-medium ${st.cls}`}><span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />{st.label}</span>}
            {has("taskType") && task.task_type && <TaskTypeChip code={task.task_type} />}
            {has("priority") && pr && <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10.5px] font-medium ${pr.cls}`}>{priorityLabel(task.priority as CreativePriority)}</span>}
            {has("taskNo") && task.task_no && <span className="ml-auto font-mono text-[10.5px] text-slate-400">{task.task_no}</span>}
          </div>
        )}
        {has("title") && <p className="text-[15px] font-semibold leading-snug text-slate-900">{task.title}</p>}
        {has("brand") && task.brand_label && row(t("แบรนด์", "Brand"), <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: task.brand_color || "#cbd5e1" }} />{task.brand_label}</span>)}
        {has("campaign") && task.campaign_label && row(t("แคมเปญ", "Campaign"), task.campaign_label)}
        {has("product") && (product || productName) && row(t("สินค้า", "Product"), <span>{product && <span className="font-mono text-[11.5px]">{product}</span>}{productName ? <span className="block text-slate-500">{productName}</span> : null}</span>)}
        {has("assignees") && (task.assignees?.length ?? 0) > 0 && row(t("ผู้รับผิดชอบ", "Assignees"), <span className="inline-flex flex-wrap items-center gap-1"><AssigneeStack list={task.assignees} size={20} /><span className="text-slate-500">{(task.assignees ?? []).map((a) => a.label).filter(Boolean).join(", ")}</span></span>)}
        {has("reviewers") && (reviewers.length > 0 || task.reviewer_label) && row(t("ผู้ตรวจ", "Reviewers"), reviewers.length ? reviewers.map((r) => r.label).filter(Boolean).join(", ") : task.reviewer_label)}
        {has("due") && task.due_date && row(t("กำหนดส่ง", "Due"), <span className={overdue ? "font-semibold text-red-600" : ""}>{overdue && "⚠ "}{task.due_date}</span>)}
        {has("progress") && (
          <div className="pt-0.5">
            <div className="mb-0.5 flex justify-between text-[11px] text-slate-400"><span>{t("ความคืบหน้า", "Progress")}</span><span>{task.progress_percent}%</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-violet-400" style={{ width: `${task.progress_percent}%` }} /></div>
          </div>
        )}
        {has("description") && desc && (
          <p className="line-clamp-6 whitespace-pre-wrap border-t border-slate-100 pt-1.5 text-[12px] leading-relaxed text-slate-600">{desc}</p>
        )}
      </div>
    </div>
  );
}
