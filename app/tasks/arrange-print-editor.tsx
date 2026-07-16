"use client";

// ============================================================
// ArrangePrintEditor (ของกลาง) — งานเรียงพิมพ์: เลือกรูป Artwork + ต่อรูปหลายขนาด + จำนวน
// ใช้ทั้ง Wizard สร้างงาน (create-task-modal) และหน้างาน (subtask-manager)
// controlled: รับ items + onChange · เพิ่มขนาดใหม่ = PATCH /api/assets/[id] (save กลับ asset)
// ============================================================

import { useState } from "react";
import { AssetPicker } from "@/components/asset-picker";
import type { AssetRow, AssetSize } from "@/app/api/assets/shared";
import { withImageWidth } from "@/lib/r2-image";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";
import type { ArrangePrintSpec } from "./data";

export type ArrangeOrder = { label: string; w: number | null; h: number | null; unit: string; qty: number };
export type ArrangeItem = { asset_id: string; r2_key: string; title: string; url: string; available: AssetSize[]; orders: ArrangeOrder[] };

export const arrangeSizeKey = (s: { label?: string; w: number | null; h: number | null; unit: string }) => `${(s.label ?? "").trim()}|${s.w}|${s.h}|${s.unit}`;
export const arrangeSizeText = (s: { label?: string; w: number | null; h: number | null; unit: string }) => (s.label?.trim() ? s.label : (s.w != null || s.h != null ? `${s.w ?? "?"}×${s.h ?? "?"} ${s.unit}` : "—"));

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

export function ArrangePrintEditor({ items, onChange, pushToast, contextLabel }: {
  items: ArrangeItem[];
  onChange: (items: ArrangeItem[]) => void;
  pushToast: (type: "success" | "error" | "info", m: string) => void;
  contextLabel?: string;
}) {
  const t = useT();
  const [pickerOpen, setPickerOpen] = useState(false);

  const addAssets = (assets: AssetRow[]) => {
    const seen = new Set(items.map((x) => x.asset_id));
    const add = assets.filter((a) => !seen.has(a.id)).map((a) => ({ asset_id: a.id, r2_key: a.r2_key, title: a.title, url: a.url, available: a.sizes ?? [], orders: [] as ArrangeOrder[] }));
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
      <button type="button" onClick={() => setPickerOpen(true)} className="w-full border border-dashed border-violet-300 rounded-xl py-2.5 text-sm font-medium text-violet-700 bg-violet-50/50 hover:bg-violet-50 mb-3">🖼️ ＋ {t("เลือกรูปจาก Artwork (เลือกได้หลายรูป)", "Pick images from Artwork (multiple)")}</button>
      {items.length === 0 ? (
        <div className="border border-dashed border-slate-200 rounded-lg p-6 text-center text-sm text-slate-400">{t("ยังไม่ได้เลือกรูป — กดปุ่มด้านบนเพื่อเลือกจากคลัง Artwork", "No images yet — pick from the Artwork library")}</div>
      ) : (
        <div className="space-y-2">
          {items.map((it, i) => <ArrangeImageCard key={it.asset_id} item={it} onToggleSize={(s) => toggleSize(i, s)} onSetQty={(oi, q) => setQty(i, oi, q)} onAddSize={(s) => addSize(i, s)} onRemove={() => removeItem(i)} />)}
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
    </div>
  );
}

// การ์ดรูป 1 รูป — ติ๊กขนาด (จากคลัง) + ใส่จำนวน + เพิ่มขนาดใหม่ (save กลับ asset)
function ArrangeImageCard({ item, onToggleSize, onSetQty, onAddSize, onRemove }: {
  item: ArrangeItem;
  onToggleSize: (s: AssetSize) => void;
  onSetQty: (orderIdx: number, qty: number) => void;
  onAddSize: (s: AssetSize) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const [nl, setNl] = useState(""); const [nw, setNw] = useState(""); const [nh, setNh] = useState(""); const [nu, setNu] = useState<AssetSize["unit"]>("cm");
  const orderIdxOf = (s: AssetSize) => item.orders.findIndex((o) => arrangeSizeKey(o) === arrangeSizeKey(s));
  const submitSize = () => {
    const w = nw === "" ? null : Number(nw); const h = nh === "" ? null : Number(nh);
    if (!nl.trim() && w == null && h == null) return;
    onAddSize({ label: nl.trim(), w, h, unit: nu });
    setNl(""); setNw(""); setNh(""); setAdding(false);
  };
  return (
    <div className="border border-slate-200 rounded-xl p-3">
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={withImageWidth(item.url, 120) ?? item.url} alt="" className="h-14 w-14 rounded-lg object-cover border border-slate-200 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-800 truncate">{item.title}</span>
            <button type="button" onClick={onRemove} className="text-slate-300 hover:text-red-500 text-sm shrink-0" title={t("เอารูปออก", "Remove")}>✕</button>
          </div>
          <p className="text-[11px] text-slate-400 mb-1.5">{t("ขนาดที่จะสั่ง (ติ๊กเลือก + ใส่จำนวน)", "Sizes to order (tick + qty)")}</p>
          <div className="space-y-1.5">
            {item.available.length === 0 && !adding && <p className="text-[11px] text-slate-400 italic">{t("รูปนี้ยังไม่มีขนาดในคลัง — กดเพิ่มขนาด", "No sizes in library yet — add one")}</p>}
            {item.available.map((s, si) => {
              const oi = orderIdxOf(s); const sel = oi >= 0;
              return (
                <div key={si} className="flex items-center gap-2 flex-wrap">
                  <button type="button" onClick={() => onToggleSize(s)} className={`inline-flex items-center gap-1 text-xs rounded-full px-2.5 py-1 border ${sel ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200 hover:border-violet-300"}`}>
                    {sel && <span>✓</span>}{arrangeSizeText(s)}
                  </button>
                  {sel && (
                    <>
                      <span className="text-[11px] text-slate-400">{t("จำนวน", "Qty")}</span>
                      <input type="number" min={0} value={item.orders[oi].qty} onChange={(e) => onSetQty(oi, Math.max(0, Number(e.target.value) || 0))} className="w-20 h-8 border border-slate-200 rounded-md px-2 text-sm text-center" />
                    </>
                  )}
                </div>
              );
            })}
            {adding ? (
              <div className="flex items-center gap-1.5 flex-wrap bg-slate-50 rounded-lg p-2">
                <input value={nl} onChange={(e) => setNl(e.target.value)} placeholder={t("ชื่อ (เช่น เล็ก)", "label")} className="w-24 h-8 border border-slate-200 rounded-md px-2 text-sm" />
                <input value={nw} onChange={(e) => setNw(e.target.value)} placeholder={t("กว้าง", "W")} inputMode="decimal" className="w-14 h-8 border border-slate-200 rounded-md px-2 text-sm" />
                <span className="text-slate-400">×</span>
                <input value={nh} onChange={(e) => setNh(e.target.value)} placeholder={t("ยาว", "H")} inputMode="decimal" className="w-14 h-8 border border-slate-200 rounded-md px-2 text-sm" />
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
