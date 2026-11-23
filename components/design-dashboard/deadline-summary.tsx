"use client";
// Design Dashboard: 🖼 สรุปกำหนดส่ง (เลือกช่วงวัน) → รูป JPG ให้พนักงานดู — เจ้าของขอ 2026-11-23
//   ช่วงวัน = DateRangeInput (ของกลาง) · บันทึก JPG = SaveImageButton (ของกลาง) · คัดลอกรูป = lib/image-clipboard copyBlobToClipboard
//   เนื้อหา: แถบ "เลยกำหนดแล้ว" (งานที่ยังไม่ปิด ส่งก่อนวันเริ่ม) + งานต้องส่งในช่วง จัดกลุ่มตามวัน (รูปปก · รหัส · ชื่อ · แบรนด์ · สถานะ)
//   ขอบเขต = แบรนด์/คำค้นเดียวกับบอร์ด (หน้าแม่ส่ง sheets มา) · งานที่ปิดแล้วไม่นับ (เหมือนปฏิทิน)
import { useMemo, useState } from "react";
import type { DesignSheetListItem } from "@/app/api/design-sheets/route";
import type { StatusMeta } from "@/lib/design-sheets-meta";
import { ERPModal } from "@/components/modal";
import { DateRangeInput } from "@/components/date-input/range";
import { SaveImageButton } from "@/components/report/save-image-button";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { addDaysYmd, todayBangkok } from "@/lib/date";
import { htmlDocToImageBlob } from "@/lib/html-to-png";
import { canCopyImage, copyBlobToClipboard } from "@/lib/image-clipboard";
import { sheetCoverUrl } from "./dashboard-helpers";

const PAGE_W = 794;
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const thDay = (ymd: string, withWeekday = false) => new Date(`${ymd}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", ...(withWeekday ? { weekday: "short" } : {}) });
const safeHex = (c: string | null | undefined, fb: string) => (c && /^#[0-9a-f]{3,8}$/i.test(c) ? c : fb);

function weekRange(): { from: string; to: string } {
  const today = todayBangkok();
  const dow = new Date(`${today}T00:00:00`).getDay();
  return { from: addDaysYmd(today, -dow), to: addDaysYmd(today, 6 - dow) };
}

/** เอกสาร HTML ทั้งใบ (ใช้ทั้งพรีวิว + แปลงเป็นรูป) */
export function buildDeadlineSummaryHtml(opts: {
  sheets: DesignSheetListItem[]; statusMeta: StatusMeta; from: string; to: string; scopeLabel: string; origin: string;
}): { html: string; count: number; overdue: number } {
  const { sheets, statusMeta, from, to, scopeLabel, origin } = opts;
  const active = sheets.filter((s) => s.deadline && !statusMeta.finished.has(s.status));
  const dl = (s: DesignSheetListItem) => String(s.deadline).slice(0, 10);
  const inRange = active.filter((s) => dl(s) >= from && dl(s) <= to).sort((a, b) => dl(a).localeCompare(dl(b)) || a.code.localeCompare(b.code));
  const overdue = active.filter((s) => dl(s) < from && dl(s) < todayBangkok()).sort((a, b) => dl(a).localeCompare(dl(b)));
  const abs = (u: string | null) => (u ? (u.startsWith("/") ? origin + u : u) : null);
  const statusChip = (s: DesignSheetListItem) => {
    const c = safeHex(statusMeta.colorHex[s.status], "#64748b");
    return `<span class="st" style="color:${c};border-color:${c}55;background:${c}14">${esc(statusMeta.map[s.status]?.label ?? s.status)}</span>`;
  };
  const row = (s: DesignSheetListItem, showDate = false) => {
    const img = abs(sheetCoverUrl(s));
    return `<div class="row">
      ${img ? `<img src="${esc(img)}" alt="" />` : `<div class="noimg" style="background:${safeHex(s.brand_color, "#cbd5e1")}22"></div>`}
      <div class="main"><div class="nm">${esc(s.name)}</div>
        <div class="sub"><span class="code">${esc(s.code)}</span>${s.brand_name ? ` · <span class="dot" style="background:${safeHex(s.brand_color, "#94a3b8")}"></span>${esc(s.brand_name)}` : ""}${showDate ? ` · ส่ง ${esc(thDay(dl(s)))}` : ""}</div></div>
      ${statusChip(s)}</div>`;
  };
  const days = new Map<string, DesignSheetListItem[]>();
  for (const s of inRange) (days.get(dl(s)) ?? days.set(dl(s), []).get(dl(s))!).push(s);
  const today = todayBangkok();
  const groups = [...days.entries()].map(([d, list]) => `<div class="day"><div class="dh${d === today ? " today" : ""}">${esc(thDay(d, true))}${d === today ? " · วันนี้" : ""}<span>${list.length} งาน</span></div>${list.map((s) => row(s)).join("")}</div>`).join("");
  const now = new Date().toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box} body{margin:0;font-family:"Sarabun","Noto Sans Thai",Tahoma,sans-serif;color:#0f172a;background:#fff}
    .pg{width:${PAGE_W}px;padding:28px 32px}
    h1{font-size:22px;margin:0} .meta{font-size:12px;color:#64748b;margin:4px 0 16px}
    .over{border:1px solid #fecaca;background:#fef2f2;border-radius:10px;padding:10px 12px;margin-bottom:16px}
    .over .t{font-size:13px;font-weight:700;color:#b91c1c;margin-bottom:6px}
    .day{margin-bottom:14px} .dh{display:flex;justify-content:space-between;font-size:14px;font-weight:700;padding:6px 10px;border-radius:8px;background:#f1f5f9;margin-bottom:6px}
    .dh.today{background:#eef2ff;color:#3730a3} .dh span{font-weight:400;color:#64748b;font-size:12px}
    .row{display:flex;align-items:center;gap:10px;padding:6px 8px;border-bottom:1px solid #f1f5f9}
    .row img,.noimg{width:44px;height:44px;border-radius:6px;object-fit:contain;border:1px solid #e2e8f0;background:#f8fafc;flex:none}
    .main{flex:1;min-width:0} .nm{font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .sub{font-size:12px;color:#64748b;margin-top:2px} .code{font-family:Consolas,monospace}
    .dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:3px}
    .st{font-size:11px;font-weight:600;border:1px solid;border-radius:999px;padding:2px 8px;white-space:nowrap;flex:none}
    .empty{padding:24px;text-align:center;color:#94a3b8;font-size:14px;border:1px dashed #cbd5e1;border-radius:10px}
  </style></head><body><div class="pg">
    <h1>งานต้องส่ง ${esc(thDay(from))}${from !== to ? ` – ${esc(thDay(to))}` : ""} · ${inRange.length} งาน</h1>
    <div class="meta">${esc(scopeLabel)} · ทำเมื่อ ${esc(now)}</div>
    ${overdue.length ? `<div class="over"><div class="t">เลยกำหนดแล้ว ${overdue.length} งาน (ยังไม่ปิด)</div>${overdue.map((s) => row(s, true)).join("")}</div>` : ""}
    ${groups || `<div class="empty">ไม่มีงานต้องส่งในช่วงนี้</div>`}
  </div></body></html>`;
  return { html, count: inRange.length, overdue: overdue.length };
}

export function DeadlineSummaryModal({ open, onClose, sheets, statusMeta, scopeLabel }: {
  open: boolean; onClose: () => void; sheets: DesignSheetListItem[]; statusMeta: StatusMeta; scopeLabel: string;
}) {
  const toast = useToast();
  const [range, setRange] = useState(weekRange);
  const [copying, setCopying] = useState(false);
  const [frameH, setFrameH] = useState(600);
  const today = todayBangkok();
  const quick: { label: string; r: { from: string; to: string } }[] = [
    { label: "สัปดาห์นี้", r: weekRange() },
    { label: "7 วันข้างหน้า", r: { from: today, to: addDaysYmd(today, 6) } },
    { label: "14 วันข้างหน้า", r: { from: today, to: addDaysYmd(today, 13) } },
    { label: "เดือนนี้", r: { from: today.slice(0, 8) + "01", to: addDaysYmd(addDaysYmd(today.slice(0, 8) + "01", 32).slice(0, 8) + "01", -1) } },
  ];
  const from = range.from || today;
  const to = range.to && range.to >= from ? range.to : from;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const doc = useMemo(() => buildDeadlineSummaryHtml({ sheets, statusMeta, from, to, scopeLabel, origin }), [sheets, statusMeta, from, to, scopeLabel, origin]);
  const fileName = `สรุปกำหนดส่ง ${thDay(from)}${from !== to ? ` - ${thDay(to)}` : ""}`;
  const copy = async () => {
    if (copying) return;
    setCopying(true);
    try {
      await copyBlobToClipboard(htmlDocToImageBlob(doc.html, { width: PAGE_W, type: "image/png" }));
      toast.success("คัดลอกรูปแล้ว — ไปกดวาง (Ctrl+V) ในไลน์ได้เลย");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "คัดลอกรูปไม่สำเร็จ ลองกดบันทึก JPG แทน");
    } finally { setCopying(false); }
  };
  if (!open) return null;
  return (
    <ERPModal open onClose={onClose} size="lg" storageKey="design-deadline-summary"
      title="สรุปกำหนดส่ง (รูปให้พนักงานดู)"
      description={`${scopeLabel} · ${doc.count} งานในช่วงนี้${doc.overdue ? ` · เลยกำหนด ${doc.overdue} งาน` : ""}`}
      footer={<>
        <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-600 hover:bg-slate-50">ปิด</button>
        <span className="ml-auto" />
        {canCopyImage() && (
          <button type="button" onClick={() => void copy()} disabled={copying}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <Icon name="list" size={15} />{copying ? "กำลังทำรูป…" : "คัดลอกรูป (วางไลน์)"}
          </button>
        )}
        <SaveImageButton html={doc.html} fileName={fileName} pageWidthPx={PAGE_W}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50" />
      </>}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <DateRangeInput value={range} onChange={(r) => setRange(r)} allowClear={false} className="w-[240px]" />
        {quick.map((q) => (
          <button key={q.label} type="button" onClick={() => setRange(q.r)}
            className={`h-8 rounded-lg border px-2.5 text-xs ${q.r.from === from && q.r.to === to ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{q.label}</button>
        ))}
      </div>
      <div className="max-h-[60vh] overflow-auto rounded-lg border border-slate-200 bg-slate-100 p-2">
        <iframe title="พรีวิวสรุปกำหนดส่ง" srcDoc={doc.html} style={{ height: frameH }} sandbox="allow-same-origin"
          onLoad={(e) => { const h = e.currentTarget.contentDocument?.documentElement?.scrollHeight; if (h) setFrameH(h + 4); }}
          className="mx-auto block w-[794px] max-w-none rounded bg-white shadow-sm" />
      </div>
      <p className="mt-2 text-[11px] text-slate-400">งานที่ปิดแล้วไม่นับ · ขอบเขตเดียวกับบอร์ด (แบรนด์ที่เลือก + คำค้น)</p>
    </ERPModal>
  );
}
