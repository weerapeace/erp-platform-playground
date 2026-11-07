"use client";
// Design Dashboard: บอร์ดตามสถานะ (มือถือ = แท็บสถานะ · แท็บเล็ต = ชิปเลื่อนไปคอลัมน์ · จอคอม = คอลัมน์พอดีจอ ลากวางเปลี่ยนสถานะ) — แยกจาก index.tsx (Y1)
import { useRef, type Dispatch, type DragEvent, type ReactNode, type SetStateAction } from "react";
import type { DesignSheetListItem } from "@/app/api/design-sheets/route";
import { wfIconSlotId } from "@/lib/brand-theme";
import type { BrandTheme } from "@/lib/brand-theme";
import { BrandSlot } from "@/components/brand-theme/slots";
import { Icon } from "@/components/icon";
import type { BoardColumn, StatusColumn } from "./dashboard-helpers";
import { useT } from "@/components/i18n";

const FOLD_W = 44;   // ความกว้างคอลัมน์ที่พับ (px)

export function StatusBoard({ boardColumns, cardSize, renderBoardCard, renderGalleryCard, isDesktop, isPhone, dropTargetStatus, handleColumnDragOver, handleColumnDragLeave, handleColumnDrop, brandTheme, foldedCols, onToggleFold, expandedCols, setExpandedCols, phoneCol, setPhoneStatus, stickyTop = null }: {
  boardColumns: BoardColumn[];
  cardSize: "compact" | "row";
  renderBoardCard: (sheet: DesignSheetListItem) => ReactNode;
  renderGalleryCard: (sheet: DesignSheetListItem) => ReactNode;
  isDesktop: boolean;
  isPhone: boolean;
  dropTargetStatus: string | null;
  handleColumnDragOver: (event: DragEvent<HTMLDivElement>, column: StatusColumn) => void;
  handleColumnDragLeave: (event: DragEvent<HTMLDivElement>, column: StatusColumn) => void;
  handleColumnDrop: (event: DragEvent<HTMLDivElement>, column: StatusColumn) => void;
  brandTheme: BrandTheme;
  /** คอลัมน์ที่พับเป็นแถบแคบ (จำรายคน · จอคอม/แท็บเล็ต) */
  foldedCols: Set<string>;
  onToggleFold: (key: string) => void;
  expandedCols: Set<string>;
  setExpandedCols: Dispatch<SetStateAction<Set<string>>>;
  phoneCol: BoardColumn | null;
  setPhoneStatus: (key: string) => void;
  /** หัวคอลัมน์ติดใต้หัวหน้าที่ติดบน (px · ของกลาง sticky-header) — null = ใต้แถบเมนูแอปตามเดิม */
  stickyTop?: number | null;
}) {
  const t = useT();
  const colRefs = useRef<Record<string, HTMLDivElement | null>>({});   // คอลัมน์สถานะ (โหมดแท็บเล็ต: กดชิปสถานะแล้วเลื่อนไปคอลัมน์นั้น)
  return (
    <>
      {isPhone ? (
        /* ── มือถือ: แท็บสถานะ (ชิปสีตามสถานะ) → การ์ด 2 ต่อแถวของสถานะที่เลือก · ไม่มีคอลัมน์เรียงข้าง ── */
        <div>
          <div className="-mx-3 mb-2 flex gap-1.5 overflow-x-auto px-3 pb-1">
            {boardColumns.map((column) => {
              const on = phoneCol?.key === column.key;
              return (
                <button key={column.key} type="button" onClick={() => setPhoneStatus(column.key)}
                  className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition ${on ? "text-white" : "bg-white text-slate-700"}`}
                  style={on ? { backgroundColor: column.color, borderColor: column.color } : { borderColor: `${column.color}66` }}>
                  {!on && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: column.color }} />}
                  {column.notForOwn && "⚠ "}{column.label}
                  <span className={on ? "opacity-80" : "text-slate-400"}>{column.sheets.length}</span>
                </button>
              );
            })}
          </div>
          {phoneCol && phoneCol.sheets.length > 0 ? (
            cardSize === "row"
              ? <div className="space-y-1.5">{phoneCol.sheets.map(renderBoardCard)}</div>
              : <div className="grid grid-cols-2 gap-2">{phoneCol.sheets.map(renderGalleryCard)}</div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-white/70 p-6 text-center text-xs text-slate-400">{t("ไม่มีงานในสถานะนี้", "No jobs in this status")}</div>
          )}
        </div>
      ) : (
      <div className="px-1 pb-2">
        {/* แท็บเล็ต: ชิปสถานะด้านบน — กดแล้วเลื่อนไปคอลัมน์นั้น (คอลัมน์เรียงแนวนอน ปัดซ้าย-ขวาทีละสถานะ) */}
        {!isDesktop && (
          <div className="mb-2 flex gap-1 overflow-x-auto pb-1">
            {boardColumns.map((column) => (
              <button key={column.key} type="button"
                onClick={() => colRefs.current[column.key]?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" })}
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border bg-white px-2.5 text-[11px] font-medium text-slate-700"
                style={{ borderColor: `${column.color}66` }}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: column.color }} />
                {column.label} <span className="text-slate-400">{column.sheets.length}</span>
              </button>
            ))}
          </div>
        )}
        {/* จอคอม: เห็นครบทุกคอลัมน์พอดีจอ (minmax(0,1fr) = คอลัมน์หดพอดี ไม่ต้องเลื่อนแนวนอน) · gap-4 เว้นช่องไฟ
            แท็บเล็ต/มือถือ: แถวเลื่อนแนวนอน + snap ทีละคอลัมน์ (มือถือ 1 คอลัมน์/จอ · แท็บเล็ต ~2.5 คอลัมน์) */}
        <div className={isDesktop ? "grid gap-4" : "flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2"}
          style={isDesktop ? { gridTemplateColumns: boardColumns.map((c) => (foldedCols.has(c.key) ? `${FOLD_W}px` : "minmax(0, 1fr)")).join(" ") } : undefined}>
          {boardColumns.map((column, index) => {
            const isDropTarget = dropTargetStatus === column.key;
            const dropProps = {
              "data-gg-column-drop": true,
              "data-gg-drop-target": isDropTarget ? "true" : undefined,
              onDragOver: (event: DragEvent<HTMLDivElement>) => handleColumnDragOver(event, column),
              onDragEnter: (event: DragEvent<HTMLDivElement>) => handleColumnDragOver(event, column),
              onDragLeave: (event: DragEvent<HTMLDivElement>) => handleColumnDragLeave(event, column),
              onDrop: (event: DragEvent<HTMLDivElement>) => handleColumnDrop(event, column),
              ref: (el: HTMLDivElement | null) => { colRefs.current[column.key] = el; },
            };
            if (foldedCols.has(column.key)) {
              /* ── คอลัมน์ที่พับ: แถบแคบ (สีสถานะ + จำนวน + ชื่อแนวตั้ง) · กด = กางกลับ · ลากการ์ดมาวางยังได้ ── */
              return (
                <div key={`${column.key}-${index}`} {...dropProps}
                  className={`relative rounded-xl transition-colors ${isDesktop ? "" : "shrink-0 snap-start"} ${isDropTarget ? "bg-amber-50/70 ring-2 ring-amber-300 ring-offset-2" : ""}`}
                  style={{ ...(isDropTarget ? {} : { background: `${column.color}12`, border: `1px solid ${column.color}26` }), ...(isDesktop ? {} : { width: FOLD_W }) }}>
                  <button type="button" data-gg-column-folded onClick={() => onToggleFold(column.key)}
                    title={t(`กางคอลัมน์ "${column.label}" (${column.sheets.length} งาน)`, `Expand "${column.label}" (${column.sheets.length} jobs)`)}
                    className={`${isDesktop ? `sticky ${stickyTop == null ? "top-16" : ""}` : ""} flex min-h-[220px] w-full flex-col items-center gap-2 rounded-xl px-1 py-2 text-slate-600 hover:bg-white/70`}
                    style={isDesktop && stickyTop != null ? { top: stickyTop + 8 } : undefined}>
                    <Icon value="i:chevron-down" className="-rotate-90 text-[13px] text-slate-400" />
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: column.color }} />
                    <span className="rounded-full bg-white px-1.5 text-[11px] font-semibold tabular-nums text-slate-700 shadow-sm">{column.sheets.length}</span>
                    <span className="whitespace-nowrap text-xs font-semibold text-slate-700" style={{ writingMode: "vertical-rl" }}>{column.notForOwn ? "⚠ " : ""}{column.label}</span>
                  </button>
                </div>
              );
            }
            const expanded = expandedCols.has(column.key);
            const limit = cardSize === "row" ? 12 : 9;   // โชว์กี่ใบก่อนกด "ดูอีก" (การ์ดเล็ก 9 = 3×3 พอดีคอลัมน์กว้าง)
            const shown = expanded ? column.sheets : column.sheets.slice(0, limit);
            const hiddenCount = Math.max(0, column.sheets.length - shown.length);
            // ☰ แถวย่อ + งานเกิน 4 ใบ = แบ่ง 2 คอลัมน์เมื่อคอลัมน์กว้างพอ (≥ ~440px · แคบกว่านั้นเหลือคอลัมน์เดียวเอง) — เจ้าของขอ 2026-11-07
            const rowTwoCols = cardSize === "row" && shown.length > 4;
            return (
              <div
                key={`${column.key}-${index}`}
                {...dropProps}
                className={`relative rounded-xl p-2 transition-colors ${isDesktop ? "" : "shrink-0 snap-start"} ${isDropTarget ? "bg-amber-50/70 ring-2 ring-amber-300 ring-offset-2" : ""}`}
                style={{
                  ...(isDropTarget ? {} : { background: `${column.color}12`, border: `1px solid ${column.color}26` }),
                  ...(isPhone ? { width: "86%" } : isDesktop ? {} : { width: 300 }),
                }}
              >
                <div data-gg-column-header className={`${isDesktop ? `sticky z-10 ${stickyTop == null ? "top-16" : ""}` : ""} mb-3 rounded-lg border px-2 py-2 text-center shadow-sm`} style={{ borderColor: `${column.color}33`, background: `linear-gradient(180deg, #ffffff 0%, ${column.color}14 100%), #ffffff`, ...(isDesktop && stickyTop != null ? { top: stickyTop + 8 } : {}) }}>
                  <BrandSlot theme={brandTheme} id={wfIconSlotId(column.key)} w={96} size="w-7 h-7" className="absolute left-1 top-1" />
                  {/* พับคอลัมน์เป็นแถบแคบ (จำรายคน) · ซ่อนทั้งคอลัมน์ = เมนู มุมมอง → คอลัมน์ที่โชว์ */}
                  <button type="button" data-gg-column-fold onClick={() => onToggleFold(column.key)} title={t(`พับคอลัมน์ "${column.label}" ให้แคบ (กดแถบเพื่อกางกลับ)`, `Fold "${column.label}" into a narrow strip (click the strip to expand)`)}
                    aria-label={t(`พับคอลัมน์ ${column.label}`, `Fold column ${column.label}`)}
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded text-slate-300 hover:bg-slate-100 hover:text-slate-600">
                    <Icon value="i:chevron-down" className="rotate-90 text-[13px]" />
                  </button>
                  <div data-gg-column-dot className="mx-auto mb-1 h-3 w-3 rounded-full shadow-[0_0_16px_rgba(245,158,11,0.65)]" style={{ backgroundColor: column.color }} />
                  <div className="truncate text-xs font-semibold text-slate-800" title={column.label}>{column.label}</div>
                  <div className="text-[11px] text-slate-400">{column.sheets.length} {t("งาน", "jobs")}</div>
                  {column.notForOwn && (
                    <div className="mt-1 rounded bg-amber-50 px-1.5 py-1 text-[10px] leading-snug text-amber-700" title={t("สถานะนี้ติ๊ก “เฉพาะงานลูกค้า” ไว้ — งานแบรนด์เราที่ค้างอยู่ตรงนี้ เปิดใบงานแล้วเปลี่ยนสถานะได้", "This status is marked “Customer jobs only” — open our-brand jobs stuck here to change their status")}>
                      ⚠ {t("ขั้นนี้ใช้กับงานลูกค้า — ย้ายงานออกได้", "This step is for customer jobs — move jobs out")}
                    </div>
                  )}
                </div>
                <div className="min-h-[128px] space-y-2">
                  {shown.length > 0 && (
                    /* ▦ การ์ดเล็ก = กริดในคอลัมน์ (การ์ด ~130px+ · คอลัมน์กว้างเรียงได้หลายใบ) · ☰ แถวย่อ = ซ้อนแถวละใบ */
                    <div className={cardSize === "row" && !rowTwoCols ? "space-y-1.5" : "grid gap-2"}
                      style={cardSize === "row" ? (rowTwoCols ? { gridTemplateColumns: "repeat(auto-fill, minmax(max(216px, calc(50% - 4px)), 1fr))" } : undefined) : { gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))" }}>
                      {shown.map(renderBoardCard)}
                    </div>
                  )}
                  {shown.length === 0 && (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-white/70 p-3 text-center text-xs text-slate-400">
                      {t("ไม่มีงานในสถานะนี้", "No jobs in this status")}
                    </div>
                  )}
                  {hiddenCount > 0 && (
                    <button type="button" onClick={() => setExpandedCols((s) => new Set(s).add(column.key))}
                      className="w-full rounded-lg border border-dashed border-slate-200 bg-white/70 p-2 text-center text-xs text-blue-600 hover:border-blue-300 hover:bg-blue-50">
                      ＋ {t(`ดูอีก ${hiddenCount.toLocaleString("th-TH")} งาน`, `Show ${hiddenCount.toLocaleString("th-TH")} more`)}
                    </button>
                  )}
                  {expanded && column.sheets.length > limit && (
                    <button type="button" onClick={() => setExpandedCols((s) => { const n = new Set(s); n.delete(column.key); return n; })}
                      className="w-full rounded-lg p-1.5 text-center text-[11px] text-slate-400 hover:text-slate-600">
                      {t("ย่อ", "Collapse")} ▲
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}
    </>
  );
}
