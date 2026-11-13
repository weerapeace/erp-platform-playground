"use client";

// ============================================================
// DesignSheetPickerModal — ป๊อปเลือก "ใบงานออกแบบ" (ใบงานใน Design Dashboard) แบบค้นหาได้ + มีรูป (ของกลาง)
//
// ค้นรหัส/ชื่องาน/แบรนด์ (ไฮไลต์คำที่ตรง) · กรองแบรนด์ · ซ่อนงานปิดแล้ว (ค่าเริ่ม) · ใช้ล่าสุด (lib/recent-picks)
// สลับมุมมอง การ์ดรูป ↔ รายการ (จำต่อคน user-prefs design_sheet_picker_view) · จำนวนการ์ดต่อแถว = ของกลาง gallery-columns
// ข้อมูลชุดเดียวกับ Design Dashboard: GET /api/design-sheets (ใบที่ยังไม่เก็บเข้ากรุ) + /api/design-sheets/statuses (ชื่อ/สีสถานะ)
// เลือกแล้วกดยืนยันด้านล่าง (onConfirm คืน Promise ได้ — ระหว่างรอ ปุ่มขึ้น "กำลังทำ…" กันกดซ้ำ)
//
// ใช้:      <DesignSheetPickerModal open onClose={…} title="ย้าย 3 รูปไปใบงานไหน?" confirmText="ย้าย 3 รูป"
//             onConfirm={async (sheet) => { … }} head={<รูปที่จะย้าย/>} />
// ใช้เมื่อ:  ต้องให้ผู้ใช้ชี้ใบงานออกแบบ 1 ใบ (เช่น หน้า SAMPLE Images ย้ายรูปเข้าใบงาน)
// ห้ามใช้:  เลือกหลายใบพร้อมกัน → SearchMultiPick (เช่นกระดานแคมเปญ) · เปิดดู/แก้ใบงาน → DesignSheetsDetail
// สิทธิ์: อ่านรายการต้องมี products.view (ด่านเดียวกับ Design Dashboard) · doc: docs/design-sheet-picker.md
// ============================================================

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ERPModal } from "@/components/modal";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { GalleryColumnsControl, useGalleryColumns } from "@/components/gallery-columns";
import { apiFetch } from "@/lib/api";
import { withImageWidth } from "@/lib/r2-image";
import { useUserPref } from "@/lib/use-user-pref";
import { RECENT_KEYS, useRecentPicks } from "@/lib/recent-picks";
import { UNKNOWN_STATUS_CLS, buildStatusMeta, type WfStatusRow } from "@/lib/design-sheets-meta";
import type { DesignSheetListItem } from "@/app/api/design-sheets/route";

export type PickedDesignSheet = { id: string; code: string; name: string; brand_name: string | null; cover_url: string | null };
type View = "grid" | "list";
type Recent = { id: string; code: string; name: string };

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase();

/** ไฮไลต์คำค้นในข้อความ */
function Hl({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const i = norm(text).indexOf(norm(q));
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark className="rounded-sm bg-amber-100 px-0.5 text-inherit">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

function Cover({ url, w, className }: { url: string | null; w: number; className: string }) {
  const src = withImageWidth(url, w);
  return src
    ? <img src={src} alt="" loading="lazy" className={`bg-slate-50 object-contain ${className}`} />
    : <div className={`flex items-center justify-center bg-slate-100 text-slate-300 ${className}`}><Icon value="i:photo" /></div>;
}

export function DesignSheetPickerModal({ open, onClose, onConfirm, title, confirmText, head }: {
  open: boolean;
  onClose: () => void;
  onConfirm: (sheet: PickedDesignSheet) => void | Promise<void>;
  title?: string;
  confirmText?: string;
  /** ของที่โชว์ใต้หัว เช่น รูปย่อของรูปที่จะย้าย */
  head?: ReactNode;
}) {
  const t = useT();
  const [rows, setRows] = useState<DesignSheetListItem[] | null>(null);
  const [statusRows, setStatusRows] = useState<WfStatusRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [q, setQ] = useState("");
  const [brand, setBrand] = useState("");
  const [hideDone, setHideDone] = useState(true);
  const [picked, setPicked] = useState<string | null>(null);
  const [needPick, setNeedPick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useUserPref<View>("design_sheet_picker_view", "grid", (raw) => (raw === "grid" || raw === "list" ? raw : null));
  const { cols, setCols, gridStyle } = useGalleryColumns("design-sheet-picker", 4);
  const { recent, remember } = useRecentPicks<Recent>(RECENT_KEYS.designSheets, open);

  useEffect(() => {
    if (!open) return;
    setQ(""); setBrand(""); setPicked(null); setNeedPick(false); setBusy(false);
    let alive = true;
    setErr(null);
    Promise.all([
      apiFetch("/api/design-sheets?limit=500&sort_by=updated_at&sort_dir=desc").then((r) => r.json()),
      apiFetch("/api/design-sheets/statuses").then((r) => r.json()).catch(() => ({ data: [] })),
    ]).then(([s, st]) => {
      if (!alive) return;
      if (s?.error) throw new Error(s.error);
      setRows(Array.isArray(s?.data) ? s.data : []);
      setStatusRows(Array.isArray(st?.data) ? st.data : []);
    }).catch((e) => { if (alive) setErr((e as Error)?.message || t("โหลดใบงานไม่สำเร็จ", "Could not load design sheets")); });
    return () => { alive = false; };
  }, [open, reload, t]);

  const meta = useMemo(() => buildStatusMeta(statusRows), [statusRows]);
  const brands = useMemo(() => [...new Set((rows ?? []).map((r) => r.brand_name).filter((b): b is string => !!b))].sort((a, b) => a.localeCompare(b, "th")), [rows]);
  const list = useMemo(() => (rows ?? []).filter((r) =>
    (!brand || r.brand_name === brand)
    && (!hideDone || !meta.finished.has(r.status))
    && (!q.trim() || `${r.code} ${r.name} ${r.brand_name ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))), [rows, brand, hideDone, meta, q]);
  const byId = useMemo(() => new Map((rows ?? []).map((r) => [r.id, r])), [rows]);
  const pickedRow = picked ? byId.get(picked) ?? null : null;
  const recentShown = recent.filter((r) => byId.has(r.id));
  const qq = q.trim();

  const pick = (id: string) => { setPicked(id); setNeedPick(false); };
  const confirm = async () => {
    if (!pickedRow) { setNeedPick(true); return; }
    setBusy(true);
    try {
      await onConfirm({ id: pickedRow.id, code: pickedRow.code, name: pickedRow.name, brand_name: pickedRow.brand_name, cover_url: pickedRow.cover_url });
      remember({ id: pickedRow.id, code: pickedRow.code, name: pickedRow.name });
    } finally { setBusy(false); }
  };
  const status = (s: string) => {
    const m = meta.map[s];
    return <span className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[10.5px] ${m?.cls ?? UNKNOWN_STATUS_CLS}`}>{m?.label ?? s}</span>;
  };
  const chip = (on: boolean) => `inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[12px] ${on ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`;
  const vbtn = (on: boolean) => `inline-flex h-9 w-9 items-center justify-center rounded-lg border ${on ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`;

  const footer = (
    <div className="flex w-full flex-wrap items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-[13px] text-slate-600">
        {pickedRow ? <>{t("จะย้ายไป", "Moving to")} <b className="font-semibold text-slate-800">{pickedRow.code} · {pickedRow.name}</b></>
          : needPick ? <span className="text-rose-600">{t("เลือกใบงานก่อน", "Pick a design sheet first")}</span>
          : t("ยังไม่ได้เลือกใบงาน", "No design sheet picked yet")}
      </span>
      <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-600 hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
      <button type="button" onClick={() => void confirm()} disabled={busy} className="h-9 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60">
        {busy ? t("กำลังทำ…", "Working…") : confirmText ?? t("เลือกใบงานนี้", "Use this sheet")}
      </button>
    </div>
  );

  return (
    <ERPModal open={open} onClose={onClose} title={title ?? t("เลือกใบงานใน Design Dashboard", "Choose a design sheet")} size="xl" defaultExpanded={false} storageKey="design-sheet-picker"
      description={t("ค้นได้ทั้งรหัส ชื่องาน แบรนด์ · กดเลือกแล้วกดยืนยันด้านล่าง", "Search by code, name or brand · pick one, then confirm below")} footer={footer}>
      <div className="space-y-2">
        {head}
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute left-3 top-2.5 text-slate-400"><Icon value="i:search" /></span>
            <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus aria-label={t("ค้นหาใบงาน", "Search design sheets")}
              placeholder={t("เช่น heart · DS-0412 · Louis", "e.g. heart · DS-0412 · Louis")}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm focus:border-violet-400 focus:outline-none" />
          </div>
          <button type="button" className={vbtn(view === "list")} onClick={() => setView("list")} aria-label={t("มุมมองรายการ", "List view")} title={t("รายการ", "List")}><Icon value="i:list" /></button>
          <button type="button" className={vbtn(view === "grid")} onClick={() => setView("grid")} aria-label={t("มุมมองการ์ดรูป", "Grid view")} title={t("การ์ดรูป", "Grid")}><Icon value="i:layout-grid" /></button>
        </div>
        {brands.length > 1 && (
          <div className="flex flex-wrap gap-1">
            <button type="button" className={chip(!brand)} onClick={() => setBrand("")}>{t("ทุกแบรนด์", "All brands")}</button>
            {brands.map((b) => <button key={b} type="button" className={chip(brand === b)} onClick={() => setBrand(brand === b ? "" : b)}>{b}</button>)}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 text-[12px] text-slate-500">
          <label className="inline-flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />{t("ซ่อนงานปิดแล้ว", "Hide closed")}</label>
          {view === "grid" && <GalleryColumnsControl cols={cols} onChange={setCols} as="select" />}
          {rows && <span className="ml-auto">{t(`พบ ${list.length} ใบ`, `${list.length} found`)}</span>}
        </div>
        {!qq && !brand && recentShown.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-[12px] text-slate-400"><Icon value="i:clock" /> {t("ใช้ล่าสุด", "Recent")}</span>
            {recentShown.map((r) => <button key={r.id} type="button" className={chip(picked === r.id)} onClick={() => pick(r.id)}>{r.code} · {byId.get(r.id)?.name ?? r.name}</button>)}
          </div>
        )}

        {err ? <ErrorState title={t("โหลดใบงานไม่สำเร็จ", "Could not load design sheets")} hint={err} onRetry={() => setReload((x) => x + 1)} />
          : !rows ? <LoadingState className="py-12 text-sm" />
          : !list.length ? <EmptyState icon={<Icon value="i:search" />} className="p-8"
              title={qq || brand ? t("ไม่พบใบงานที่ตรงคำค้น", "No design sheet matches") : t("ยังไม่มีใบงาน", "No design sheets yet")}
              hint={qq || brand ? t("ลองคำอื่น หรือเลือก \"ทุกแบรนด์\" · งานปิดแล้วถูกซ่อนอยู่", "Try another word or \"All brands\" · closed jobs are hidden") : undefined} />
          : view === "grid" ? (
            <div className="grid" style={gridStyle}>
              {list.map((r) => (
                <button key={r.id} type="button" onClick={() => pick(r.id)}
                  className={`relative overflow-hidden rounded-xl border bg-white text-left transition ${picked === r.id ? "border-violet-500 ring-2 ring-violet-300" : "border-slate-200 hover:border-slate-300"}`}>
                  <Cover url={r.cover_url} w={360} className="aspect-square w-full" />
                  <div className="space-y-1 p-2">
                    <div className="truncate text-[11px] text-slate-400"><Hl text={r.code} q={qq} />{r.brand_name ? <> · <Hl text={r.brand_name} q={qq} /></> : null}</div>
                    <div className="line-clamp-2 text-[13px] leading-snug text-slate-800"><Hl text={r.name} q={qq} /></div>
                    {status(r.status)}
                  </div>
                  {picked === r.id && <span className="absolute right-1.5 top-1.5 rounded-full bg-white text-xl text-violet-600"><Icon value="i:circle-check" /></span>}
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-1.5">
              {list.map((r) => (
                <button key={r.id} type="button" onClick={() => pick(r.id)}
                  className={`flex w-full items-center gap-3 rounded-lg border bg-white p-1.5 text-left ${picked === r.id ? "border-violet-500 ring-2 ring-violet-300" : "border-slate-200 hover:border-slate-300"}`}>
                  <Cover url={r.cover_url} w={120} className="h-12 w-12 shrink-0 rounded-md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-slate-800"><Hl text={r.code} q={qq} /> · <Hl text={r.name} q={qq} /></span>
                    <span className="block truncate text-[11px] text-slate-400">{r.brand_name ? <Hl text={r.brand_name} q={qq} /> : t("ไม่ระบุแบรนด์", "No brand")}{r.deadline ? ` · ${t("ส่ง", "due")} ${r.deadline}` : ""}</span>
                  </span>
                  {status(r.status)}
                </button>
              ))}
            </div>
          )}
      </div>
    </ERPModal>
  );
}
