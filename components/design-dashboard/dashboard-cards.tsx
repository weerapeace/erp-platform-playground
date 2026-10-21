"use client";
// Design Dashboard: การ์ดใบงาน — แกลเลอรี (รูปเต็มใบ) / บอร์ด (ลากเปลี่ยนสถานะ · การ์ดเล็ก หรือ แถวย่อ) — แยกจาก index.tsx (Y1)
import type { DragEvent } from "react";
import type { DesignSheetListItem } from "@/app/api/design-sheets/route";
import type { StatusMeta } from "@/lib/design-sheets-meta";
import type { BrandTheme } from "@/lib/brand-theme";
import { useT } from "@/components/i18n";
import { BrandSlot } from "@/components/brand-theme/slots";
import { SheetHoverWrap, type SheetHoverPref } from "./sheet-hover";
import { CardDeadline, CoverPreview, NoPickVeil, PickBadge, deadlineLabel, deadlineTone, safeColor, sheetCoverUrl, sheetIsOwn } from "./dashboard-helpers";

export type SheetCardProps = {
  sheet: DesignSheetListItem;
  statusInfo: Map<string, { label: string; color: string }>;
  statusMeta: StatusMeta;
  pickedIds: Set<string>;
  pickMode: boolean;
  canPick: (sheet: DesignSheetListItem) => boolean;
  togglePicked: (id: string) => void;
  openDetail: (id: string | null) => void;
  hoverPref: SheetHoverPref;
  hoverOn: boolean;
  brandTheme: BrandTheme;
};
export type BoardCardProps = SheetCardProps & {
  draggingSheetId: string | null;
  movingSheetId: string | null;
  cardSize: "compact" | "row";
  isDesktop: boolean;
  handleCardDragStart: (event: DragEvent<HTMLDivElement>, sheet: DesignSheetListItem) => void;
  setDraggingSheetId: (id: string | null) => void;
  setDropTargetStatus: (key: string | null) => void;
};

// การ์ดแบบแกลเลอรี (รูปเต็มใบ) — ใช้ทั้งมุมมองแกลเลอรี และบอร์ดมือถือ (แท็บสถานะ)
export function GalleryCard({ sheet, statusInfo, statusMeta, pickedIds, pickMode, canPick, togglePicked, openDetail, hoverPref, hoverOn, brandTheme }: SheetCardProps) {
  const t = useT();
  const brandColor = safeColor(sheet.brand_color);
  const coverUrl = sheetCoverUrl(sheet);
  const st = statusInfo.get(sheet.status);
  const picked = pickedIds.has(sheet.id);
  const activate = () => (pickMode ? togglePicked(sheet.id) : openDetail(sheet.id));
  return (
    <SheetHoverWrap key={sheet.id} sheet={sheet} pref={hoverPref} status={st} own={sheetIsOwn(sheet)} className="h-full"
      deadline={{ label: deadlineLabel(sheet, statusMeta), tone: deadlineTone(sheet, statusMeta) }}>
    <div
      role="button"
      tabIndex={0}
      onClick={activate}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); } }}
      data-gg-task-card
      title={pickMode ? t("กดเพื่อเลือก/ยกเลิกเลือก", "Click to select/deselect") : hoverOn ? undefined : `${sheet.code} • ${sheet.name}`}
      className={`group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-lg border bg-white shadow-[3px_3px_0_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 ${picked ? "border-indigo-500 ring-2 ring-indigo-300" : "border-slate-200 hover:border-amber-300"}`}
    >
      {pickMode && (canPick(sheet) ? <PickBadge checked={picked} /> : <NoPickVeil />)}
      <BrandSlot theme={brandTheme} id="task_corner" />
      {coverUrl ? (
        <CoverPreview off={hoverOn} url={sheet.cover_url}>
          {/* รูปเต็มใบ (object-contain) ไม่ crop — กรอบ 1:1 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            data-gg-cover
            src={coverUrl}
            alt={sheet.name}
            loading="lazy"
            decoding="async"
            className="aspect-square w-full bg-slate-50 object-contain"
          />
        </CoverPreview>
      ) : (
        <div data-gg-cover className="flex aspect-square w-full items-center justify-center" style={{ background: `linear-gradient(135deg, #ffffff 0%, ${brandColor}18 70%, #fef3c7 100%)` }}>
          <BrandSlot theme={brandTheme} id="task_placeholder" size="max-h-16" />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-1 p-2">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: brandColor }} />
          <span className="font-mono text-[10px] text-slate-400">{sheet.code}</span>
        </div>
        <div className="line-clamp-2 text-xs font-semibold text-slate-800">{sheet.name}</div>
        {st && (
          <span className="inline-flex w-fit items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ color: st.color, backgroundColor: `${st.color}1a` }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: st.color }} />
            {st.label}
          </span>
        )}
        <div className="mt-auto flex items-center justify-between gap-1.5 pt-0.5">
          <span className="truncate text-[10px] text-slate-400">{sheet.brand_name ?? t("ไม่ระบุ", "None")}</span>
          <CardDeadline tone={deadlineTone(sheet, statusMeta)} label={deadlineLabel(sheet, statusMeta)} />
        </div>
        {(sheet.has_cost || sheet.has_quote || sheet.parent_count > 0) && (
          <div className="flex flex-wrap gap-1 text-[9px] text-slate-400">
            {sheet.has_cost && <span className="rounded bg-violet-50 px-1 py-0.5 text-violet-600">{t("ตีราคา", "Costed")}</span>}
            {sheet.has_quote && <span className="rounded bg-indigo-50 px-1 py-0.5 text-indigo-600">{t("มีราคา", "Quoted")}</span>}
            {sheet.parent_count > 0 && <span className="rounded bg-emerald-50 px-1 py-0.5 text-emerald-600">{t("มี SKU", "Has SKU")}</span>}
          </div>
        )}
      </div>
    </div>
    </SheetHoverWrap>
  );
}

// การ์ดบนบอร์ด (ลากเปลี่ยนสถานะได้บนจอคอม) — 2 ขนาดตาม cardSize:
//   compact = รูปจัตุรัส + ชื่อ + เลขที่/กำหนดส่ง (ไม่มีกล่องโน้ตสูงคงที่แบบเดิม — โน้ตเป็น 📝 ชี้ดูได้)
//   row     = รูปจิ๋ว 40px ซ้าย + ชื่อ/เลขที่/กำหนดส่ง ขวา (เห็นงานเยอะสุดต่อจอ · ชี้รูปแล้วขยายได้)
export function BoardCard({ sheet, statusInfo, statusMeta, pickedIds, pickMode, canPick, togglePicked, openDetail, hoverPref, hoverOn, brandTheme, draggingSheetId, movingSheetId, cardSize, isDesktop, handleCardDragStart, setDraggingSheetId, setDropTargetStatus }: BoardCardProps) {
  const t = useT();
  const brandColor = safeColor(sheet.brand_color);
  const coverUrl = sheetCoverUrl(sheet);
  const isDragging = draggingSheetId === sheet.id;
  const isMoving = movingSheetId === sheet.id;
  const picked = pickedIds.has(sheet.id);
  const row = cardSize === "row";
  const activate = () => { if (isMoving) return; if (pickMode) togglePicked(sheet.id); else openDetail(sheet.id); };
  const cover = coverUrl ? (
    <CoverPreview off={hoverOn} url={sheet.cover_url}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img data-gg-cover src={coverUrl} alt={sheet.name} loading="lazy" decoding="async"
        className={row ? "h-10 w-10 shrink-0 rounded border border-slate-100 bg-slate-50 object-contain" : "mb-1.5 aspect-square w-full rounded-md border border-slate-100 bg-slate-50 object-contain"} />
    </CoverPreview>
  ) : (
    <div data-gg-cover className={row ? "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-100" : "mb-1.5 flex aspect-square items-center justify-center overflow-hidden rounded-md border border-slate-100"}
      style={{ background: `linear-gradient(135deg, #ffffff 0%, ${brandColor}18 70%, #fef3c7 100%)` }}>
      <BrandSlot theme={brandTheme} id="task_placeholder" size={row ? "max-h-6" : "max-h-10"} />
    </div>
  );
  const noteIcon = sheet.note ? <span className="shrink-0 cursor-help text-[11px]" title={`📝 ${sheet.note}`}>📝</span> : null;
  const tags = (sheet.has_cost || sheet.has_quote || sheet.parent_count > 0) && (
    <div className="mt-1 flex flex-wrap gap-1 text-[9px]">
      {sheet.has_cost && <span className="rounded bg-violet-50 px-1 py-0.5 text-violet-600">{t("ตีราคา", "Costed")}</span>}
      {sheet.has_quote && <span className="rounded bg-indigo-50 px-1 py-0.5 text-indigo-600">{t("มีราคา", "Quoted")}</span>}
      {sheet.parent_count > 0 && <span className="rounded bg-emerald-50 px-1 py-0.5 text-emerald-600">{t("มี SKU", "Has SKU")}</span>}
    </div>
  );
  return (
    <SheetHoverWrap key={sheet.id} sheet={sheet} pref={hoverPref} status={statusInfo.get(sheet.status)} own={sheetIsOwn(sheet)} off={!!draggingSheetId || isMoving}
      deadline={{ label: deadlineLabel(sheet, statusMeta), tone: deadlineTone(sheet, statusMeta) }}>
    <div
      role="button"
      tabIndex={0}
      onClick={activate}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); } }}
      data-gg-task-card
      draggable={isDesktop && !movingSheetId && !pickMode}   /* ทัชลากไม่ได้ → เปลี่ยนสถานะผ่านป๊อปอัปรายละเอียดแทน */
      onDragStart={(event) => handleCardDragStart(event, sheet)}
      onDragEnd={() => { setDraggingSheetId(null); setDropTargetStatus(null); }}
      aria-busy={isMoving}
      title={pickMode ? t("กดเพื่อเลือก/ยกเลิกเลือก", "Click to select/deselect") : hoverOn && isDesktop ? undefined : isDesktop ? `${sheet.code} • ${sheet.name} — ${t("ลากเพื่อเปลี่ยนสถานะ หรือกดเพื่อเปิด", "drag to change status or click to open")}` : t("แตะเพื่อเปิด (เปลี่ยนสถานะได้ในป๊อปอัป)", "Tap to open (change status in the popup)")}
      className={`relative overflow-hidden rounded-lg border bg-white shadow-[2px_2px_0_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 ${row ? "flex items-center gap-2 p-1.5" : "block p-1.5"} ${picked ? "border-indigo-500 ring-2 ring-indigo-300" : "border-slate-200 hover:border-amber-300"} ${isDragging ? "opacity-45" : ""} ${isMoving ? "pointer-events-none opacity-60" : pickMode || !isDesktop ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"}`}
    >
      {pickMode && (canPick(sheet) ? <PickBadge checked={picked} /> : <NoPickVeil />)}
      <BrandSlot theme={brandTheme} id="task_corner" />
      {cover}
      {row ? (
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-slate-800">{sheet.name}</div>
          <div className="mt-0.5 flex items-center gap-1.5 whitespace-nowrap">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: brandColor }} />
            <span className="truncate font-mono text-[10px] text-slate-400">{sheet.code}</span>
            <span className="ml-auto flex shrink-0 items-center gap-1">{noteIcon}<CardDeadline tone={deadlineTone(sheet, statusMeta)} label={deadlineLabel(sheet, statusMeta)} /></span>
          </div>
        </div>
      ) : (
        <>
          <div className="line-clamp-2 text-xs font-semibold leading-snug text-slate-800">{sheet.name}</div>
          <div className="mt-1 flex items-center gap-1 whitespace-nowrap">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: brandColor }} />
            <span className="min-w-0 truncate font-mono text-[10px] text-slate-400">{sheet.code}</span>
            <span className="ml-auto flex shrink-0 items-center gap-1">{noteIcon}<CardDeadline tone={deadlineTone(sheet, statusMeta)} label={deadlineLabel(sheet, statusMeta)} /></span>
          </div>
          {tags}
        </>
      )}
    </div>
    </SheetHoverWrap>
  );
}
