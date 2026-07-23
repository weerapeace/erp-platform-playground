"use client";

// ============================================================
// ArrangePrintEditor (ของกลาง) — งานเรียงพิมพ์: เลือกรูป Artwork + ต่อรูปหลายขนาด + จำนวน
// ใช้ทั้ง Wizard สร้างงาน (create-task-modal) และหน้างาน (subtask-manager)
// controlled: รับ items + onChange · เพิ่มขนาดใหม่ = PATCH /api/assets/[id] (save กลับ asset)
// ============================================================

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { AssetPicker } from "@/components/asset-picker";
import type { AssetRow, AssetSize } from "@/app/api/assets/shared";
import { HoverImage } from "@/components/hover-image";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";
import type { ArrangePrintSpec, ArrangeBaseItem, ArrangePrintType, PrintTypeRow } from "./data";
import { listPrintTypes, createPrintType, updatePrintType, deletePrintType } from "./data";

// ป๊อปอัปรายละเอียด/แก้ไฟล์คลังกลาง (กดรูปในการ์ด) — dynamic กัน bundle asset-library ลากเข้า tasks
const AssetDetailPopup = dynamic(() => import("@/components/asset-library").then((m) => m.AssetDetailPopup), { ssr: false });

export type ArrangeOrder = { label: string; w: number | null; h: number | null; unit: string; qty: number };
export type ArrangeItem = { asset_id: string; r2_key: string; title: string; url: string; available: AssetSize[]; orders: ArrangeOrder[]; master_path?: string | null; master_url?: string | null };
// รูปฐาน (จากอัลบั้ม DFT UV Printed) + รายละเอียด เพิ่ม/ลบ ต่อรูป
export type ArrangeBase = { asset_id: string; r2_key: string; title: string; url: string; add: string; remove: string };
export const DFT_UV_COLLECTION_NAME = "งานพิมพ์ DFT UV (Printed)";   // อัลบั้มรูปฐานสำหรับงานเรียงพิมพ์
export function basesFromSpec(spec: ArrangePrintSpec | undefined): ArrangeBase[] {
  return (spec?.bases ?? []).map((b) => ({ asset_id: b.asset_id, r2_key: b.r2_key, title: b.title, url: `/api/r2-image?key=${encodeURIComponent(b.r2_key)}`, add: b.add ?? "", remove: b.remove ?? "" }));
}
export const specBasesFrom = (bases: ArrangeBase[]): ArrangeBaseItem[] => bases.map((b) => ({ asset_id: b.asset_id, r2_key: b.r2_key, title: b.title, add: b.add.trim(), remove: b.remove.trim() }));

export const arrangeSizeKey = (s: { label?: string; w: number | null; h: number | null; unit: string }) => `${(s.label ?? "").trim()}|${s.w}|${s.h}|${s.unit}`;
export const arrangeSizeText = (s: { label?: string; w: number | null; h: number | null; unit: string }) => (s.label?.trim() ? s.label : (s.w != null || s.h != null ? `${s.w ?? "?"}×${s.h ?? "?"} ${s.unit}` : "—"));
// มิติกว้าง×สูง (ถ้ามี) — โชว์กำกับต่อท้ายชื่อ
export const arrangeSizeDim = (s: { w: number | null; h: number | null; unit: string }) => (s.w != null || s.h != null ? `${s.w ?? "?"}×${s.h ?? "?"} ${s.unit}` : "");

// แสดงผลขนาด (รองรับ TH/EN) — label auto "ขนาด #N" → "Size #N" · มิติเดียวโชว์ กว้าง/ยาว แทน "×?"
type SizeTFn = (th: string, en: string) => string;
export function sizeLabelDisplay(label: string | undefined, t: SizeTFn): string {
  const l = (label ?? "").trim();
  const m = /^ขนาด\s*#?\s*(\d+)$/.exec(l);
  return m ? t(`ขนาด #${m[1]}`, `Size #${m[1]}`) : l;
}
export function sizeDimDisplay(s: { w: number | null; h: number | null; unit: string }, t: SizeTFn): string {
  const { w, h, unit } = s;
  if (w != null && h != null) return `${w}×${h} ${unit}`;
  if (w != null) return `${t("กว้าง", "Width")} ${w} ${unit}`;
  if (h != null) return `${t("สูง", "Height")} ${h} ${unit}`;
  return "";
}

// spec (จาก subtask.config) → items · sizesByAsset = ขนาดจริงจากคลัง (เติมตัวเลือกให้ครบ)
export function itemsFromSpec(spec: ArrangePrintSpec | undefined, sizesByAsset?: Record<string, AssetSize[]>): ArrangeItem[] {
  return (spec?.items ?? []).map((it) => {
    const orderSizes: AssetSize[] = it.orders.map((o) => ({ label: o.label, w: o.w, h: o.h, unit: (["cm", "mm", "in", "px"].includes(o.unit) ? o.unit : "cm") as AssetSize["unit"] }));
    const avail: AssetSize[] = []; const seen = new Set<string>();
    for (const s of [...(sizesByAsset?.[it.asset_id] ?? []), ...orderSizes]) { const k = arrangeSizeKey(s); if (!seen.has(k)) { seen.add(k); avail.push(s); } }
    return { asset_id: it.asset_id, r2_key: it.r2_key, title: it.title, url: `/api/r2-image?key=${encodeURIComponent(it.r2_key)}`, available: avail, orders: it.orders.map((o) => ({ ...o })) };
  });
}
export function specFromItems(items: ArrangeItem[]): ArrangePrintSpec {
  return { items: items.map((it) => ({ asset_id: it.asset_id, r2_key: it.r2_key, title: it.title, orders: it.orders })) };
}
export const arrangeTotalQty = (items: ArrangeItem[]) => items.reduce((n, it) => n + it.orders.reduce((m, o) => m + (o.qty || 0), 0), 0);

export function ArrangePrintEditor({ items, onChange, pushToast, contextLabel, collapseSizes = true, bases, onBasesChange, printType, onPrintTypeChange }: {
  items: ArrangeItem[];
  onChange: (items: ArrangeItem[]) => void;
  pushToast: (type: "success" | "error" | "info", m: string) => void;
  contextLabel?: string;
  collapseSizes?: boolean;   // พับซ่อนขนาดที่ยังไม่เลือก (default) · ตอนสร้างงานใน Wizard ส่ง false = โชว์หมด
  bases?: ArrangeBase[];                          // รูปฐาน (DFT UV Printed) — ส่งมาพร้อม onBasesChange ถึงจะโชว์บล็อกรูปฐาน
  onBasesChange?: (bases: ArrangeBase[]) => void;
  printType?: ArrangePrintType | null;           // ประเภทแผ่นพิมพ์ (DTF/UV) — ส่งมาพร้อม onPrintTypeChange ถึงจะโชว์ช่องเลือก
  onPrintTypeChange?: (pt: ArrangePrintType | null) => void;
}) {
  const t = useT();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [basePickerOpen, setBasePickerOpen] = useState(false);
  const [detailAssetId, setDetailAssetId] = useState<string | null>(null);   // กดรูป → เปิดป๊อปอัปแก้ไฟล์คลังกลาง
  const addBases = (assets: AssetRow[]) => {
    if (!onBasesChange) return;
    const cur = bases ?? [];
    const seen = new Set(cur.map((x) => x.asset_id));
    const add = assets.filter((a) => !seen.has(a.id)).map((a) => ({ asset_id: a.id, r2_key: a.r2_key, title: a.title, url: a.url, add: "", remove: "" }));
    if (add.length) onBasesChange([...cur, ...add]);
  };

  const addAssets = (assets: AssetRow[]) => {
    const seen = new Set(items.map((x) => x.asset_id));
    const add = assets.filter((a) => !seen.has(a.id)).map((a) => ({ asset_id: a.id, r2_key: a.r2_key, title: a.title, url: a.url, available: a.sizes ?? [], orders: [] as ArrangeOrder[], master_path: a.master_path ?? null, master_url: a.master_url ?? null }));
    if (add.length) onChange([...items, ...add]);
  };
  const removeItem = (idx: number) => onChange(items.filter((_, i) => i !== idx));
  const toggleSize = (idx: number, s: AssetSize) => onChange(items.map((it, i) => {
    if (i !== idx) return it;
    const has = it.orders.some((o) => arrangeSizeKey(o) === arrangeSizeKey(s));
    return { ...it, orders: has ? it.orders.filter((o) => arrangeSizeKey(o) !== arrangeSizeKey(s)) : [...it.orders, { label: s.label, w: s.w, h: s.h, unit: s.unit, qty: 1 }] };
  }));
  const setQty = (idx: number, orderIdx: number, qty: number) => onChange(items.map((it, i) => i === idx ? { ...it, orders: it.orders.map((o, j) => j === orderIdx ? { ...o, qty } : o) } : it));
  const addSize = async (idx: number, s: AssetSize) => {
    const it = items[idx]; if (!it) return;
    const nextAvail = [...it.available, s];
    onChange(items.map((x, i) => i === idx ? { ...x, available: nextAvail, orders: [...x.orders, { label: s.label, w: s.w, h: s.h, unit: s.unit, qty: 1 }] } : x));
    try { await apiFetch(`/api/assets/${it.asset_id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sizes: nextAvail }) }); pushToast("success", t("เพิ่มขนาด + บันทึกกลับคลังรูปแล้ว", "Size added and saved to library")); }
    catch (e) { pushToast("error", (e as Error).message); }
  };

  return (
    <div>
      {/* ประเภทแผ่นพิมพ์ (DTF/UV) — โชว์เมื่อส่ง onPrintTypeChange · เลือก/แก้/เพิ่มได้ */}
      {onPrintTypeChange && (
        <div className="mb-4">
          <div className="text-xs font-semibold text-slate-500 mb-1.5">🖨️ {t("ประเภทแผ่นพิมพ์", "Print sheet type")}</div>
          <PrintTypeField value={printType ?? null} onChange={onPrintTypeChange} pushToast={pushToast} />
        </div>
      )}
      {/* บล็อกรูปฐาน (DFT UV Printed) — โชว์เมื่อส่ง onBasesChange · วางก่อนบล็อกเลือกรูป Artwork */}
      {onBasesChange && (
        <div className="mb-4">
          <div className="text-xs font-semibold text-slate-500 mb-1.5">🧱 {t("รูปฐาน (จาก DFT UV Printed)", "Base images (from DFT UV Printed)")}</div>
          <button type="button" onClick={() => setBasePickerOpen(true)} className="w-full border border-dashed border-teal-300 rounded-xl py-2.5 text-sm font-medium text-teal-700 bg-teal-50/50 hover:bg-teal-50 mb-2">🧱 ＋ {t("เลือกฐานรูปจากอัลบั้ม DFT UV (Printed)", "Pick base images from DFT UV (Printed)")}</button>
          {(bases ?? []).length === 0 ? (
            <div className="border border-dashed border-slate-200 rounded-lg p-4 text-center text-xs text-slate-400">{t("ยังไม่ได้เลือกรูปฐาน (ถ้ามี) — กดปุ่มด้านบน", "No base images yet (optional) — use the button above")}</div>
          ) : (
            <div className="space-y-2">
              {(bases ?? []).map((b, i) => (
                <ArrangeBaseCard key={b.asset_id} base={b} onOpenDetail={() => setDetailAssetId(b.asset_id)}
                  onChange={(patch) => onBasesChange((bases ?? []).map((x, j) => j === i ? { ...x, ...patch } : x))}
                  onRemove={() => onBasesChange((bases ?? []).filter((_, j) => j !== i))} />
              ))}
            </div>
          )}
        </div>
      )}
      <button type="button" onClick={() => setPickerOpen(true)} className="w-full border border-dashed border-violet-300 rounded-xl py-2.5 text-sm font-medium text-violet-700 bg-violet-50/50 hover:bg-violet-50 mb-3">🖼️ ＋ {t("เลือกรูปจาก Artwork (เลือกได้หลายรูป)", "Pick images from Artwork (multiple)")}</button>
      {items.length === 0 ? (
        <div className="border border-dashed border-slate-200 rounded-lg p-6 text-center text-sm text-slate-400">{t("ยังไม่ได้เลือกรูป — กดปุ่มด้านบนเพื่อเลือกจากคลัง Artwork", "No images yet — pick from the Artwork library")}</div>
      ) : (
        <div className="space-y-2">
          {items.map((it, i) => <ArrangeImageCard key={it.asset_id} item={it} collapseSizes={collapseSizes} pushToast={pushToast} onOpenDetail={() => setDetailAssetId(it.asset_id)} onToggleSize={(s) => toggleSize(i, s)} onSetQty={(oi, q) => setQty(i, oi, q)} onAddSize={(s) => addSize(i, s)} onRemove={() => removeItem(i)} />)}
        </div>
      )}
      {items.length > 0 && (
        <div className="mt-3 bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-600 flex gap-4 flex-wrap">
          <span>{t("รูป", "Images")} <b className="text-slate-800">{items.length}</b></span>
          <span>{t("รายการขนาด", "Size lines")} <b className="text-slate-800">{items.reduce((n, it) => n + it.orders.length, 0)}</b></span>
          <span>{t("รวมจำนวน", "Total qty")} <b className="text-slate-800">{arrangeTotalQty(items).toLocaleString()}</b> {t("ชิ้น", "pcs")}</span>
        </div>
      )}
      {pickerOpen && <AssetPicker open onClose={() => setPickerOpen(false)} multiple typeFilter="image" defaultSource="artwork" title={t("เลือกรูป Artwork สำหรับเรียงพิมพ์", "Pick Artwork images")} contextLabel={contextLabel} onSelect={addAssets} />}
      {basePickerOpen && <AssetPicker open onClose={() => setBasePickerOpen(false)} multiple typeFilter="image" lockCollectionName={DFT_UV_COLLECTION_NAME} title={t("เลือกฐานรูป (DFT UV Printed)", "Pick base images (DFT UV Printed)")} contextLabel={contextLabel} onSelect={addBases} />}
      {detailAssetId && <AssetDetailPopup assetId={detailAssetId} onClose={() => setDetailAssetId(null)} />}
    </div>
  );
}

// การ์ดรูป 1 รูป — ติ๊กขนาด (จากคลัง) + ใส่จำนวน + เพิ่มขนาดใหม่ (save กลับ asset)
function ArrangeImageCard({ item, onToggleSize, onSetQty, onAddSize, onRemove, onOpenDetail, collapseSizes = true, pushToast }: {
  item: ArrangeItem;
  onToggleSize: (s: AssetSize) => void;
  onSetQty: (orderIdx: number, qty: number) => void;
  onAddSize: (s: AssetSize) => void;
  onRemove: () => void;
  onOpenDetail: () => void;
  collapseSizes?: boolean;
  pushToast: (type: "success" | "error" | "info", m: string) => void;
}) {
  const t = useT();
  const copyPath = async () => {
    if (!item.master_path) return;
    try { await navigator.clipboard.writeText(item.master_path); pushToast("success", t("คัดลอก path แล้ว", "Path copied")); }
    catch { pushToast("error", t("คัดลอกไม่สำเร็จ", "Copy failed")); }
  };
  const [adding, setAdding] = useState(false);
  const [showAll, setShowAll] = useState(false);   // พับ/กางขนาดที่ยังไม่ได้เลือก
  const [nl, setNl] = useState(""); const [nw, setNw] = useState(""); const [nh, setNh] = useState(""); const [nu, setNu] = useState<AssetSize["unit"]>("cm");
  const orderIdxOf = (s: AssetSize) => item.orders.findIndex((o) => arrangeSizeKey(o) === arrangeSizeKey(s));
  // แยกขนาดที่เลือกแล้ว (โชว์บนสุด) กับที่ยังไม่เลือก (พับซ่อน)
  const selected = item.available.filter((s) => orderIdxOf(s) >= 0);
  const unselected = item.available.filter((s) => orderIdxOf(s) < 0);
  const mainText = (s: AssetSize) => (s.label?.trim() ? sizeLabelDisplay(s.label, t) : (sizeDimDisplay(s, t) || "—"));   // ข้อความหลัก = ชื่อ (แปล) หรือมิติ ถ้าไม่มีชื่อ
  const chipDim = (s: AssetSize) => (s.label?.trim() ? sizeDimDisplay(s, t) : "");   // มีชื่อ → โชว์มิติต่อท้าย (มิติเดียว = กว้าง/ยาว)
  const submitSize = () => {
    const w = nw === "" ? null : Number(nw); const h = nh === "" ? null : Number(nh);
    if (!nl.trim() && w == null && h == null) return;
    onAddSize({ label: nl.trim(), w, h, unit: nu });
    setNl(""); setNw(""); setNh(""); setAdding(false);
  };
  return (
    <div className="border border-slate-200 rounded-xl p-3">
      <div className="flex items-start gap-3">
        {/* รูป + ปุ่มคัดลอก path / เปิด Drive (ไฟล์ต้นฉบับ) · กดรูป = เปิดป๊อปอัปแก้ไฟล์คลังกลาง · ชี้ค้าง = ดูรูปใหญ่ */}
        <div className="shrink-0 flex flex-col items-center gap-1 w-[64px]">
          <button type="button" onClick={onOpenDetail} title={t("กดดู/แก้ไฟล์ในคลัง · ชี้ค้างดูรูปใหญ่", "Open in library · hover to preview")} className="rounded-lg overflow-hidden border border-slate-200 hover:ring-2 hover:ring-violet-300 leading-[0]">
            <HoverImage url={item.url} size={56} previewSize={340} rounded="rounded-lg" alt={item.title} />
          </button>
          {item.master_path && <button type="button" onClick={copyPath} title={item.master_path} className="w-full text-[10px] text-slate-500 hover:text-violet-700 border border-slate-200 rounded px-1 py-0.5 truncate">📋 {t("คัดลอก path", "Copy path")}</button>}
          {item.master_url && <a href={item.master_url} target="_blank" rel="noopener noreferrer" title={t("เปิดโฟลเดอร์บน Google Drive", "Open on Google Drive")} className="w-full text-[10px] text-center text-violet-700 hover:underline border border-slate-200 rounded px-1 py-0.5">📁 Drive</a>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-800 truncate">{item.title}</span>
            <button type="button" onClick={onRemove} className="text-slate-300 hover:text-red-500 text-sm shrink-0" title={t("เอารูปออก", "Remove")}>✕</button>
          </div>
          <p className="text-[11px] text-slate-400 mb-1.5">{t("ขนาดที่จะสั่ง (ติ๊กเลือก + ใส่จำนวน)", "Sizes to order (tick + qty)")}</p>
          <div className="space-y-1.5">
            {item.available.length === 0 && !adding && <p className="text-[11px] text-slate-400 italic">{t("รูปนี้ยังไม่มีขนาดในคลัง — กดเพิ่มขนาด", "No sizes in library yet — add one")}</p>}
            {/* ขนาดที่เลือกแล้ว — โชว์บนสุด + ช่องจำนวน */}
            {selected.map((s) => { const oi = orderIdxOf(s); const dim = chipDim(s); return (
              <div key={arrangeSizeKey(s)} className="flex items-center gap-2 flex-wrap">
                <button type="button" onClick={() => onToggleSize(s)} className="inline-flex items-center gap-1 text-xs rounded-full px-2.5 py-1 border bg-violet-600 text-white border-violet-600">
                  <span>✓</span>{mainText(s)}{dim && <span className="text-violet-200">· {dim}</span>}
                </button>
                <span className="text-[11px] text-slate-400">{t("จำนวน", "Qty")}</span>
                <input type="number" min={0} value={item.orders[oi].qty} onChange={(e) => onSetQty(oi, Math.max(0, Number(e.target.value) || 0))} className="w-20 h-8 border border-slate-200 rounded-md px-2 text-sm text-center" />
              </div>
            ); })}
            {/* ขนาดที่ยังไม่เลือก — Wizard (collapseSizes=false) โชว์หมด · หน้างานพับซ่อน กดปุ่มกาง */}
            {unselected.length > 0 && (
              (showAll || !collapseSizes) ? (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {unselected.map((s) => { const dim = chipDim(s); return (
                    <button key={arrangeSizeKey(s)} type="button" onClick={() => onToggleSize(s)} className="inline-flex items-center gap-1 text-xs rounded-full px-2.5 py-1 border bg-white text-slate-600 border-slate-200 hover:border-violet-300">
                      {mainText(s)}{dim && <span className="text-slate-400">· {dim}</span>}
                    </button>
                  ); })}
                  {collapseSizes && <button type="button" onClick={() => setShowAll(false)} className="text-[11px] text-slate-400 hover:underline px-1">▲ {t("พับ", "Collapse")}</button>}
                </div>
              ) : (
                <button type="button" onClick={() => setShowAll(true)} className="text-[11px] text-violet-600 hover:underline">▾ {t(`เลือกขนาดอื่น (${unselected.length})`, `More sizes (${unselected.length})`)}</button>
              )
            )}
            {adding ? (
              <div className="flex items-center gap-1.5 flex-wrap bg-slate-50 rounded-lg p-2">
                <input value={nl} onChange={(e) => setNl(e.target.value)} placeholder={t("ชื่อ (เช่น เล็ก)", "label")} className="w-24 h-8 border border-slate-200 rounded-md px-2 text-sm" />
                <input value={nw} onChange={(e) => setNw(e.target.value)} placeholder={t("กว้าง", "W")} inputMode="decimal" className="w-14 h-8 border border-slate-200 rounded-md px-2 text-sm" />
                <span className="text-slate-400">×</span>
                <input value={nh} onChange={(e) => setNh(e.target.value)} placeholder={t("สูง", "H")} inputMode="decimal" className="w-14 h-8 border border-slate-200 rounded-md px-2 text-sm" />
                <select value={nu} onChange={(e) => setNu(e.target.value as AssetSize["unit"])} className="h-8 border border-slate-200 rounded-md px-1 text-sm"><option value="cm">cm</option><option value="mm">mm</option><option value="in">in</option><option value="px">px</option></select>
                <button type="button" onClick={submitSize} className="h-8 px-3 text-xs font-medium text-white bg-violet-600 rounded-md hover:bg-violet-700">{t("เพิ่ม", "Add")}</button>
                <button type="button" onClick={() => setAdding(false)} className="h-8 px-2 text-xs text-slate-500">{t("ยกเลิก", "Cancel")}</button>
              </div>
            ) : (
              <button type="button" onClick={() => setAdding(true)} className="text-xs text-violet-700 hover:underline">＋ {t("เพิ่มขนาดใหม่ (บันทึกกลับคลังรูป)", "Add new size (saved to library)")}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// การ์ดรูปฐาน 1 รูป — รูปย่อ + 2 ช่อง: ➕ เพิ่มอะไร / ➖ ลบอะไร จากรูปฐานนี้
function ArrangeBaseCard({ base, onChange, onRemove, onOpenDetail }: {
  base: ArrangeBase;
  onChange: (patch: Partial<ArrangeBase>) => void;
  onRemove: () => void;
  onOpenDetail: () => void;
}) {
  const t = useT();
  return (
    <div className="flex items-stretch gap-2">
      {/* กล่องที่ 1 — เลือกรูป (รูปฐาน) */}
      <div className="relative w-[124px] shrink-0 border border-slate-200 rounded-xl p-2.5 bg-slate-50/40 flex flex-col items-center gap-1.5">
        <button type="button" onClick={onRemove} className="absolute top-1 right-1 text-slate-300 hover:text-red-500 text-sm leading-none" title={t("เอารูปฐานออก", "Remove base")}>✕</button>
        <button type="button" onClick={onOpenDetail} title={t("กดดู/แก้ไฟล์ในคลัง · ชี้ค้างดูรูปใหญ่", "Open in library · hover to preview")} className="rounded-lg overflow-hidden border border-slate-200 hover:ring-2 hover:ring-teal-300 leading-[0]">
          <HoverImage url={base.url} size={80} previewSize={340} rounded="rounded-lg" alt={base.title} />
        </button>
        <span className="w-full text-[11px] font-medium text-slate-700 text-center leading-tight line-clamp-2" title={base.title}>{base.title}</span>
      </div>
      {/* กล่องที่ 2 — รายละเอียด (เพิ่ม/ลบ จากรูปฐาน) */}
      <div className="flex-1 min-w-0 border border-slate-200 rounded-xl p-2.5">
        <div className="text-[11px] font-semibold text-slate-400 mb-1.5">{t("รายละเอียด (เพิ่ม/ลบ จากรูปฐาน)", "Details (add/remove from base)")}</div>
        <div className="grid sm:grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[11px] font-medium text-emerald-700">➕ {t("เพิ่มอะไรจากรูปฐาน", "Add to base")}</span>
            <textarea value={base.add} onChange={(e) => onChange({ add: e.target.value })} rows={2}
              placeholder={t("เช่น เพิ่มโลโก้มุมขวา, เพิ่มข้อความ...", "e.g. add logo top-right, add text...")}
              className="mt-0.5 w-full text-sm border border-slate-200 rounded-md px-2 py-1 resize-y focus:outline-none focus:ring-1 focus:ring-emerald-300" />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-rose-700">➖ {t("ลบอะไรจากรูปฐาน", "Remove from base")}</span>
            <textarea value={base.remove} onChange={(e) => onChange({ remove: e.target.value })} rows={2}
              placeholder={t("เช่น ลบลายน้ำ, ลบข้อความเดิม...", "e.g. remove watermark, remove old text...")}
              className="mt-0.5 w-full text-sm border border-slate-200 rounded-md px-2 py-1 resize-y focus:outline-none focus:ring-1 focus:ring-rose-300" />
          </label>
        </div>
      </div>
    </div>
  );
}

const ptDim = (w: number | null, h: number | null, unit: string) => (w != null && h != null ? `${w}×${h} ${unit}` : w != null ? `${w} ${unit}` : h != null ? `${h} ${unit}` : "");

// เลือกประเภทแผ่นพิมพ์ (DTF/UV) เป็นชิป + ปุ่ม ⚙️ จัดการ (แก้/เพิ่ม/ลบ) — เก็บ snapshot กลับผ่าน onChange
function PrintTypeField({ value, onChange, pushToast }: {
  value: ArrangePrintType | null;
  onChange: (pt: ArrangePrintType | null) => void;
  pushToast: (type: "success" | "error" | "info", m: string) => void;
}) {
  const t = useT();
  const [types, setTypes] = useState<PrintTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [managing, setManaging] = useState(false);
  const load = () => { setLoading(true); listPrintTypes().then(setTypes).catch((e) => pushToast("error", (e as Error).message)).finally(() => setLoading(false)); };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const pick = (ty: PrintTypeRow) => onChange({ id: ty.id, code: ty.code, name: ty.name, w: ty.default_w, h: ty.default_h, unit: ty.unit });
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {loading ? <span className="text-xs text-slate-400">{t("กำลังโหลด...", "Loading...")}</span>
          : types.length === 0 ? <span className="text-xs text-slate-400">{t("ยังไม่มีประเภท — กด ⚙️ เพิ่ม", "No types yet — use ⚙️ to add")}</span>
          : types.map((ty) => {
            const on = value?.id ? value.id === ty.id : value?.code === ty.code;
            const d = ptDim(ty.default_w, ty.default_h, ty.unit);
            return (
              <button key={ty.id} type="button" onClick={() => pick(ty)}
                className={`inline-flex items-center gap-1 text-xs rounded-full px-2.5 py-1 border ${on ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200 hover:border-violet-300"}`}>
                {on && <span>✓</span>}<b>{ty.code}</b>{d && <span className={on ? "text-violet-200" : "text-slate-400"}>{d}</span>}
              </button>
            );
          })}
        {value && <button type="button" onClick={() => onChange(null)} className="text-[11px] text-slate-400 hover:text-red-500 px-1">✕ {t("ล้าง", "Clear")}</button>}
        <button type="button" onClick={() => setManaging((s) => !s)} className="text-[11px] text-slate-500 hover:text-violet-700 px-1">⚙️ {t("จัดการ", "Manage")}</button>
      </div>
      {managing && <PrintTypeManager types={types} onChanged={load} pushToast={pushToast} />}
    </div>
  );
}

function PrintTypeManager({ types, onChanged, pushToast }: {
  types: PrintTypeRow[];
  onChanged: () => void;
  pushToast: (type: "success" | "error" | "info", m: string) => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [nc, setNc] = useState({ code: "", name: "", w: "", h: "", unit: "cm" });
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const inp = "h-8 border border-slate-200 rounded-md px-2 text-sm";
  const add = async () => {
    if (!nc.code.trim()) { pushToast("error", t("ใส่รหัส (เช่น DTF)", "Enter a code (e.g. DTF)")); return; }
    setBusy(true);
    try { await createPrintType({ code: nc.code.trim(), name: nc.name.trim() || nc.code.trim(), default_w: num(nc.w), default_h: num(nc.h), unit: nc.unit }); setNc({ code: "", name: "", w: "", h: "", unit: "cm" }); onChanged(); pushToast("success", t("เพิ่มประเภทแล้ว", "Type added")); }
    catch (e) { pushToast("error", (e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="mt-2 border border-slate-200 rounded-lg p-2.5 bg-slate-50/60 space-y-2">
      {types.map((ty) => <PrintTypeRowEdit key={ty.id} ty={ty} onChanged={onChanged} pushToast={pushToast} />)}
      <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-200">
        <input value={nc.code} onChange={(e) => setNc((s) => ({ ...s, code: e.target.value }))} placeholder={t("รหัส", "code")} className={`w-20 ${inp}`} />
        <input value={nc.name} onChange={(e) => setNc((s) => ({ ...s, name: e.target.value }))} placeholder={t("ชื่อ", "name")} className={`w-28 ${inp}`} />
        <input value={nc.w} onChange={(e) => setNc((s) => ({ ...s, w: e.target.value }))} placeholder={t("กว้าง", "W")} inputMode="decimal" className={`w-14 ${inp}`} />
        <span className="text-slate-400">×</span>
        <input value={nc.h} onChange={(e) => setNc((s) => ({ ...s, h: e.target.value }))} placeholder={t("ยาว", "H")} inputMode="decimal" className={`w-14 ${inp}`} />
        <select value={nc.unit} onChange={(e) => setNc((s) => ({ ...s, unit: e.target.value }))} className={`${inp} px-1`}><option value="cm">cm</option><option value="mm">mm</option><option value="in">in</option></select>
        <button type="button" disabled={busy} onClick={add} className="h-8 px-3 text-xs font-medium text-white bg-violet-600 rounded-md hover:bg-violet-700 disabled:opacity-50">＋ {t("เพิ่ม", "Add")}</button>
      </div>
    </div>
  );
}

function PrintTypeRowEdit({ ty, onChanged, pushToast }: {
  ty: PrintTypeRow;
  onChanged: () => void;
  pushToast: (type: "success" | "error" | "info", m: string) => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ code: ty.code, name: ty.name, w: ty.default_w?.toString() ?? "", h: ty.default_h?.toString() ?? "", unit: ty.unit });
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const inp = "h-8 border border-slate-200 rounded-md px-2 text-sm";
  const save = async () => { setBusy(true); try { await updatePrintType(ty.id, { code: f.code.trim(), name: f.name.trim() || f.code.trim(), default_w: num(f.w), default_h: num(f.h), unit: f.unit }); onChanged(); pushToast("success", t("บันทึกแล้ว", "Saved")); } catch (e) { pushToast("error", (e as Error).message); } finally { setBusy(false); } };
  const del = async () => { if (!window.confirm(t(`ลบประเภท "${ty.code}"?`, `Delete type "${ty.code}"?`))) return; setBusy(true); try { await deletePrintType(ty.id); onChanged(); } catch (e) { pushToast("error", (e as Error).message); } finally { setBusy(false); } };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input value={f.code} onChange={(e) => setF((s) => ({ ...s, code: e.target.value }))} className={`w-20 ${inp}`} />
      <input value={f.name} onChange={(e) => setF((s) => ({ ...s, name: e.target.value }))} className={`w-28 ${inp}`} />
      <input value={f.w} onChange={(e) => setF((s) => ({ ...s, w: e.target.value }))} inputMode="decimal" className={`w-14 ${inp}`} />
      <span className="text-slate-400">×</span>
      <input value={f.h} onChange={(e) => setF((s) => ({ ...s, h: e.target.value }))} inputMode="decimal" className={`w-14 ${inp}`} />
      <select value={f.unit} onChange={(e) => setF((s) => ({ ...s, unit: e.target.value }))} className={`${inp} px-1`}><option value="cm">cm</option><option value="mm">mm</option><option value="in">in</option></select>
      <button type="button" disabled={busy} onClick={save} className="h-8 px-2 text-xs text-violet-700 hover:underline disabled:opacity-50">{t("บันทึก", "Save")}</button>
      <button type="button" disabled={busy} onClick={del} className="h-8 px-2 text-xs text-slate-400 hover:text-red-500 disabled:opacity-50" title={t("ลบ", "Delete")}>🗑</button>
    </div>
  );
}
