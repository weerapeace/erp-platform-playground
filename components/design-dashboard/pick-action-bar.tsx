"use client";
// Design Dashboard: แถบล่าง "เลือกไว้ N ใบ" ในโหมดติ๊กเลือก (ส่งขึ้นกระดาน / สรุปงาน) — แยกจาก index.tsx (Y1)
import { createPortal } from "react-dom";
import type { DesignSheetListItem } from "@/app/api/design-sheets/route";
import { SEND_TO_BOARD_MAX } from "@/components/campaign-board-send";
import { SUMMARY_MAX } from "./dashboard-helpers";
import { useT } from "@/components/i18n";

export function PickActionBar({ pickMode, pickPurpose, pickedIds, filteredSheets, canPick, setPickedIds, exitPickMode, openSummary, setCampaignPickOpen }: {
  pickMode: boolean;
  pickPurpose: "board" | "summary";
  pickedIds: Set<string>;
  filteredSheets: DesignSheetListItem[];
  canPick: (sheet: DesignSheetListItem) => boolean;
  setPickedIds: (ids: Set<string>) => void;
  exitPickMode: () => void;
  openSummary: (id: string | null, sheetIds?: string[]) => void;
  setCampaignPickOpen: (open: boolean) => void;
}) {
  const t = useT();
  return (
    <>{pickMode && createPortal(
            <div className="fixed inset-x-0 bottom-0 z-[80] border-t border-indigo-200 bg-white/95 px-4 py-3 shadow-[0_-6px_20px_rgba(15,23,42,0.10)] backdrop-blur">
              <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-3">
                <span className="text-sm font-semibold text-slate-800">{pickPurpose === "summary" ? "📋" : "🎨"} {t(`เลือกไว้ ${pickedIds.size.toLocaleString("th-TH")} ใบ`, `${pickedIds.size.toLocaleString("th-TH")} selected`)}</span>
                <span className="text-xs text-slate-400">
                  {pickPurpose === "summary"
                    ? t(`กดการ์ดเพื่อเลือก · เฉพาะใบที่ยังไม่ปิดงาน · ไม่เกิน ${SUMMARY_MAX} ใบ`, `Click cards to select · open sheets only · up to ${SUMMARY_MAX}`)
                    : t(`กดการ์ดเพื่อเลือก · ส่งได้ครั้งละไม่เกิน ${SEND_TO_BOARD_MAX} ใบ`, `Click cards to select · up to ${SEND_TO_BOARD_MAX} per send`)}
                </span>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {(() => {
                    const max = pickPurpose === "summary" ? SUMMARY_MAX : SEND_TO_BOARD_MAX;
                    const pickable = filteredSheets.filter(canPick);
                    return (
                      <button onClick={() => setPickedIds(new Set(pickable.map((s) => s.id).slice(0, max)))}
                        title={t(`เลือกทุกใบที่ผ่านตัวกรอง/คำค้นตอนนี้ (${Math.min(pickable.length, max)} ใบ)`, `Select every sheet matching the current filter/search (${Math.min(pickable.length, max)})`)}
                        className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50">
                        {t("เลือกทั้งหมดที่กรองอยู่", "Select all filtered")}
                      </button>
                    );
                  })()}
                  <button onClick={() => setPickedIds(new Set())} disabled={pickedIds.size === 0}
                    className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                    {t("ล้างที่เลือก", "Clear selection")}
                  </button>
                  <button onClick={exitPickMode} className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50">
                    {t("ออกจากโหมด", "Exit mode")}
                  </button>
                  {pickPurpose === "summary" ? (
                    <button onClick={() => { const ids = Array.from(pickedIds).slice(0, SUMMARY_MAX); exitPickMode(); openSummary(null, ids); }} disabled={pickedIds.size === 0}
                      className="h-9 rounded-md bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-40">
                      {t("จัดสรุป", "Build summary")} →
                    </button>
                  ) : (
                    <button onClick={() => setCampaignPickOpen(true)} disabled={pickedIds.size === 0}
                      className="h-9 rounded-md bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40">
                      {t("ส่งขึ้นกระดาน", "Send to board")} →
                    </button>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )}</>
  );
}
