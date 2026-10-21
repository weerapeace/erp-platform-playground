"use client";

// ============================================================
// การ์ดงาน (ของกลาง) — ใช้ร่วมกัน: บอร์ดการ์ด · มุมมอง WIP · "งานของฉัน" ในภาพรวม · กระดานลากวาง
// เลือกโชว์ข้อมูลผ่าน KanbanTheme (รูปปก/แบรนด์/ผู้รับผิดชอบ/กำหนดส่ง/ความสำคัญ/ความคืบหน้า/เลขที่งาน/ประเภท/สินค้า)
// + CardExtra (ป้ายสถานะ/นับวันกำหนดส่ง/แถบสีซ้าย/ป้ายเล็ก) — ห้ามเขียนการ์ดงานใหม่เองในหน้า
// ============================================================

import type { ReactNode } from "react";
import { useT } from "@/components/i18n";
import { r2ImageUrl } from "@/lib/r2-image";
import { HoverPreview } from "@/components/hover-image";
import { TaskHoverWrap, DEFAULT_HOVER_FIELDS } from "./task-hover-card";
import { AssigneeStack } from "./assignee-avatar";
import { TaskTypeChip } from "./task-type-chip";
import { statusMeta, isTerminal } from "./use-statuses";
import { PRIORITY_META, priorityLabel, isOverdue, type CreativeTask, type CreativePriority } from "./data";
import type { KanbanTheme } from "./overview-customizer";

/** ค่าตั้งต้นของการ์ด (เปิดเฉพาะที่ระบุ) — ใช้กับการ์ดนอกบอร์ด เช่น "งานของฉัน" / กระดานลากวาง */
export function taskCardCfg(p: Partial<KanbanTheme>): KanbanTheme {
  return { view: "kanban", groupBy: "status", cover: false, brand: false, assignee: false, due: false, priority: false, progress: false, brandBorder: false,
    sku: false, taskNo: false, taskType: false, compact: false, ...p };
}

// รูปการ์ด: Parent SKU มาก่อน (ตามกฎเดียวกับ drawer) → รูปที่อัปเอง → รูป SKU
export function coverKey(task: CreativeTask): string | null {
  return (task.parent_sku_image_key as string) || (task.cover_image_r2_key as string) || (task.sku_image_key as string) || null;
}

// กำหนดส่งเทียบวันนี้ เป็นจำนวนวัน (ลบ = เกินมาแล้ว) · ใช้วันที่ตามเวลาเครื่อง + Date.UTC กันเพี้ยน timezone
export function dueDiffDays(due: string): number {
  const [y, m, d] = due.slice(0, 10).split("-").map(Number);
  const now = new Date();
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
}

// ตัวเลือกเสริมของการ์ด (มุมมอง WIP ใช้) — ป้ายสถานะ / กำหนดส่งแบบนับวัน / ความสูงรูปปก / ความกว้างรูปที่โหลด
// placeholder = ไม่มีรูป → กล่องไอคอนแทน (การ์ดหน้าตาเท่ากัน) · fill = การ์ดยืดเต็มช่องกริด (สูงเท่ากันทุกใบ)
// accentLeft = แถบสีซ้าย (เช่น งานที่มีแค่ฉัน) · badge = ป้ายเล็กหน้าป้ายความสำคัญ (เช่น ⭐)
export type CardExtra = { statusPill?: boolean; relDue?: boolean; coverCls?: string; imgW?: number; placeholder?: boolean; fill?: boolean; accentLeft?: string; badge?: ReactNode };

// ขนาดการ์ด (ย่อ/ขยายทั้งใบ — ตัวอักษร รูป ระยะใน) ต่อคน
const CARD_SCALE: Record<string, number> = { sm: 0.85, md: 1, lg: 1.15 };

// รูปปกปรับได้ต่อคน (KanbanTheme): ขนาด · ครอปเต็มกรอบ/เห็นทั้งรูป · อยู่บน/ข้างซ้าย
const COVER_TOP_H: Record<string, string> = { sm: "h-16", md: "h-28", lg: "h-44", square: "aspect-square" };
const COVER_SIDE_BOX: Record<string, string> = { auto: "w-16 h-16", sm: "w-12 h-12", md: "w-16 h-16", lg: "w-24 h-24", square: "w-20 h-20" };
// ระยะห่างระหว่างการ์ด (px) — ใช้ทั้งบอร์ดการ์ดและ WIP
const CARD_GAP_PX: Record<string, number> = { tight: 4, normal: 8, loose: 14, xloose: 22 };
export const cardGapPx = (cfg: KanbanTheme) => CARD_GAP_PX[cfg.cardGap ?? "normal"] ?? 8;

// ───────── การ์ด ─────────
export function TaskCard({ task, cfg, dragging, extra }: { task: CreativeTask; cfg: KanbanTheme; dragging?: boolean; extra?: CardExtra }) {
  const t = useT();   // subscribe ภาษา
  const pr = PRIORITY_META[task.priority as CreativePriority];
  const overdue = isOverdue(task);
  const compact = cfg.compact === true;
  // คอลัมน์ที่จบแล้ว (เสร็จ/ยกเลิก) ไม่โชว์รูปปก — เหลือแค่ตัวอักษร+ผู้รับผิดชอบ
  const showImages = cfg.cover && !isTerminal(task.status);
  const cover = showImages ? coverKey(task) : null;
  const size = cfg.coverSize ?? "auto";
  const coverUrl = cover ? r2ImageUrl(cover, size === "lg" || size === "square" ? Math.max(extra?.imgW ?? 320, 480) : extra?.imgW ?? 320) : null;
  const fitCls = cfg.coverFit === "contain" ? "object-contain bg-white" : "object-cover bg-slate-50";   // contain = เห็นทั้งรูป ไม่ครอป
  const topH = COVER_TOP_H[size] ?? extra?.coverCls ?? (compact ? "h-12" : "h-20");
  const sideBox = COVER_SIDE_BOX[size] ?? COVER_SIDE_BOX.auto;
  // งานเรียงพิมพ์ไม่ผูกสินค้า → ไม่มีรูปปก แต่มี "รูป Artwork ที่จะพิมพ์" → โชว์เป็นแถวรูปเล็กแทน
  const artKeys = showImages && !coverUrl ? (task.arrange_image_keys ?? []) : [];
  const artMax = compact ? 4 : 6;
  const artShown = artKeys.slice(0, artMax);
  const showPh = !!extra?.placeholder && showImages && !coverUrl && artShown.length === 0;   // ไม่มีรูปเลย → ไอคอนแทน
  const side = cfg.coverPos === "side" && (!!coverUrl || showPh);   // รูปเล็กข้างซ้าย (ข้อความอยู่ขวา)
  const fill = !!extra?.fill;
  const scale = CARD_SCALE[cfg.cardScale ?? "md"] ?? 1;
  // กรอบสีตามแบรนด์ (ถ้าเปิด + แบรนด์มีสี hex)
  const bc = task.brand_color;
  const brandBorder = cfg.brandBorder && bc && /^#[0-9a-fA-F]{6}$/.test(String(bc));
  const showSku = cfg.sku !== false, showTaskNo = cfg.taskNo !== false;
  const phIcon = <span className="text-2xl opacity-40 grayscale" aria-hidden>🖼️</span>;
  // 🪟 ชี้ที่การ์ด = รูปใหญ่ + รายละเอียด (ตั้งค่าต่อคน) · เปิดอยู่ = ไม่เด้งพรีวิวรูปเดี่ยวซ้ำ
  const hoverOn = cfg.hoverCard !== false;
  const preview = (url: string | null | undefined, w: number, node: ReactNode) => (hoverOn ? node : <HoverPreview url={url} previewW={w}>{node}</HoverPreview>);
  return (
    <TaskHoverWrap task={task} enabled={hoverOn} fields={cfg.hoverFields ?? DEFAULT_HOVER_FIELDS} off={dragging} className={fill ? "h-full" : undefined}>
    <div className={`bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm ${fill ? "h-full flex flex-col" : ""} ${dragging ? "shadow-xl ring-2 ring-violet-300 rotate-1" : "hover:border-violet-300 hover:shadow"}`}
      style={{ ...(brandBorder ? { borderColor: String(bc), borderLeftWidth: 3 } : {}), ...(extra?.accentLeft ? { borderLeftWidth: 3, borderLeftColor: extra.accentLeft } : {}), ...(scale !== 1 ? { zoom: scale } : {}) }}>
      {coverUrl && !side && preview(r2ImageUrl(cover), 640,
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coverUrl} alt="" loading="lazy" decoding="async" className={`${topH} w-full shrink-0 ${fitCls} border-b border-slate-100`} />
      )}
      {showPh && !side && (
        <div className={`${topH} w-full shrink-0 flex items-center justify-center bg-slate-50 border-b border-slate-100`} title={t("ยังไม่มีรูป", "No image yet")}>{phIcon}</div>
      )}
      {/* งานเรียงพิมพ์ — แถวรูป Artwork ที่จะพิมพ์ (เล็ก หลายตัว · ชี้เมาส์ดูใหญ่) */}
      {artShown.length > 0 && (
        <div className="flex items-center gap-1 border-b border-slate-100 bg-slate-50/70 px-1.5 py-1.5">
          {artShown.map((k) => (
            <span key={k}>{preview(r2ImageUrl(k), 520,
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r2ImageUrl(k, 160) ?? undefined} alt="" loading="lazy" decoding="async"
                className={`${compact ? "h-8 w-8" : "h-10 w-10"} rounded border border-slate-200 bg-white object-contain`} />
            )}</span>
          ))}
          {artKeys.length > artShown.length && (
            <span className="text-[10px] font-medium text-slate-400">+{artKeys.length - artShown.length}</span>
          )}
        </div>
      )}
      <div className={`${compact ? "p-2" : "p-2.5"} ${side ? "flex gap-2.5 items-start" : fill ? "flex flex-col" : ""} ${fill ? "flex-1" : ""}`}>
        {side && coverUrl && preview(r2ImageUrl(cover), 640,
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt="" loading="lazy" decoding="async" className={`${sideBox} shrink-0 rounded-md border border-slate-200 ${fitCls}`} />
        )}
        {side && !coverUrl && (
          <div className={`${sideBox} shrink-0 rounded-md border border-slate-200 bg-slate-50 flex items-center justify-center`} title={t("ยังไม่มีรูป", "No image yet")}>{phIcon}</div>
        )}
        <div className={`${side ? "flex-1 min-w-0" : ""} ${fill ? "flex flex-col flex-1 self-stretch" : ""}`}>
        {/* flex-wrap: การ์ดแคบ (3 คอลัมน์/รูปข้างซ้าย) เลขที่งานตกบรรทัดใหม่ ไม่ทับป้าย */}
        <div className={`flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 ${compact ? "mb-1" : "mb-1.5"}`}>
          <div className="flex items-center gap-1 min-w-0">
            {extra?.badge}
            {cfg.priority && pr && <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${pr.cls}`}>{priorityLabel(task.priority as CreativePriority)}</span>}
            {cfg.taskType !== false && task.task_type && <TaskTypeChip code={task.task_type} />}
          </div>
          {showTaskNo && <span className="font-mono text-[10px] text-slate-400 shrink-0 ml-auto">{task.task_no}</span>}
        </div>
        <p className="text-sm font-medium text-slate-800 leading-snug line-clamp-2">{task.title}</p>
        {showSku && task.sku_code && <p className="text-[11px] text-slate-400 line-clamp-1 mt-1">📦 {task.sku_code}{task.sku_name ? ` · ${task.sku_name}` : ""}</p>}
        {cfg.brand && task.brand_label && (
          <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-slate-500">
            <span className="h-2 w-2 rounded-full" style={{ background: task.brand_color || "#cbd5e1" }} />{task.brand_label}
          </div>
        )}
        {extra?.statusPill && (() => { const m = statusMeta(task.status); return (
          <div className="mt-1.5"><span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${m.cls}`}><span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />{m.label}</span></div>
        ); })()}
        {/* ผู้รับผิดชอบ/กำหนดส่ง/ความคืบหน้า ชิดล่างเสมอ (การ์ดสูงเท่ากัน แถวล่างตรงกัน) */}
        <div className={fill ? "mt-auto" : undefined}>
        {(cfg.assignee || cfg.due) && (
          <div className="flex items-center justify-between gap-2 mt-2">
            {cfg.assignee ? <AssigneeStack list={task.assignees} size={20} /> : <span />}
            {cfg.due && task.due_date && (extra?.relDue ? (() => {
              const d = dueDiffDays(task.due_date);
              return <span title={task.due_date} className={`text-[11px] whitespace-nowrap ${d < 0 ? "text-red-600 font-semibold" : d === 0 ? "text-amber-600 font-semibold" : "text-slate-400"}`}>
                {d < 0 ? t(`⚠ เกิน ${-d} วัน`, `⚠ ${-d}d late`) : d === 0 ? t("ส่งวันนี้", "Due today") : t(`อีก ${d} วัน`, `in ${d}d`)}</span>;
            })() : <span className={`text-[11px] ${overdue ? "text-red-600 font-semibold" : "text-slate-400"}`}>{overdue && "⚠ "}{task.due_date.slice(5)}</span>)}
          </div>
        )}
        {cfg.progress && (
          <div className="mt-2 pt-2 border-t border-slate-100">
            <div className="h-1 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-violet-400" style={{ width: `${task.progress_percent}%` }} /></div>
          </div>
        )}
        </div>
        </div>
      </div>
    </div>
    </TaskHoverWrap>
  );
}
