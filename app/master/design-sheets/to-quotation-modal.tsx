"use client";

// ============================================================
// ToQuotationModal — ส่งสินค้าจากใบงานออกแบบ → ใบเสนอราคา (draft) ของระบบขาย
// ของกลาง: ERPModal · useToast · CustomerPicker · apiFetch → POST /api/design-sheets/[id]/to-quotation
// มีตะกร้าอยู่แล้ว = หย่อนเข้าตะกร้าเลย (ไม่ถามซ้ำ) · ไม่มีตะกร้า = เลือกลูกค้า → สร้างใบใหม่ → ตั้งเป็นตะกร้า
// variation เก็บที่ note · ระบบขายบังคับต้องมีลูกค้า (เลือกครั้งเดียวตอนเปิดตะกร้า)
// มีรอบเสนอราคา (quotes) = ติ๊กเลือกได้ว่าจะส่งราคาไหน + จำนวนเท่าไหร่ (1 รอบที่ติ๊ก = 1 บรรทัดในใบเสนอราคา)
// ============================================================

import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";
import { CustomerPicker } from "@/components/pickers";
import type { CustomerPickerValue } from "@/components/pickers";
import type { SheetSku } from "@/app/api/design-sheets/[id]/skus/route";
import type { DesignSheetQuote } from "@/app/api/design-sheets/[id]/quotes/route";

/** แถวเลือกรอบเสนอราคา: ติ๊ก + จำนวน/ราคาที่แก้ได้ก่อนส่ง */
type RoundPick = {
  id: string; round: number; size: string; status: string; checked: boolean; qty: string; price: string;
  batch: number; date: string | null; note: string | null;   // ครั้งที่จริง (1 ครั้ง = หลายไซส์ × หลายขั้นจำนวน) + วันที่/หมายเหตุของครั้ง
  cost: number | null;                                       // ราคาจากตีราคา ณ ตอนเสนอ (ไว้โชว์กำไร/ชิ้น)
};
const fmt2 = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string | null) => { if (!d) return ""; const t = new Date(d); return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString(tr("th-TH", "en-GB"), { day: "numeric", month: "short", year: "2-digit" }); };
const STATUS_CLS: Record<string, string> = { pending: "bg-amber-50 text-amber-700 border-amber-200", passed: "bg-emerald-50 text-emerald-700 border-emerald-200", failed: "bg-rose-50 text-rose-600 border-rose-200" };

// จำนวนตั้งต้นของรอบ: ช่องจำนวน → ถ้าไม่มี แต่หมายเหตุเป็นตัวเลขล้วน (รอบเก่าที่จดจำนวนไว้ในหมายเหตุ) ใช้อันนั้น → 1
const roundQty = (q: DesignSheetQuote) => {
  if (q.qty != null && Number(q.qty) > 0) return String(q.qty);
  const n = (q.note ?? "").replace(/,/g, "").trim();
  return /^\d+(\.\d+)?$/.test(n) && Number(n) > 0 ? n : "1";
};
// ป้ายสถานะเป็นฟังก์ชัน → อ่านภาษาตอนเรียก (ห้ามเรียก tr ที่ระดับ module)
const STATUS_LABEL: Record<string, () => string> = { pending: () => tr("รอผล", "Pending"), passed: () => tr("ผ่าน", "Passed"), failed: () => tr("ไม่ผ่าน", "Failed") };

/** รายการที่ส่งมาเป็นชุด (เช่น ทั้งตาราง "คำนวณจากซัพพลายเออร์") — มีแล้วจะไม่ถามชื่อ/ราคาทีละชิ้น */
export type PresetQuoteLine = { product_name: string; variation: string | null; unit_price: number; qty: number };

export function ToQuotationModal({
  open, onClose, sheetId, sheetName, defaultPrice, cartId, cartLabel, onCartSet, onAdded, presetLines, quotes, sizeLabel,
}: {
  open: boolean;
  onClose: () => void;
  sheetId: string;
  sheetName: string;
  defaultPrice: number | null;
  /** ส่งหลายรายการพร้อมกัน (จากตารางตีราคาจากร้าน) — ไม่ส่ง = โหมดกรอกทีละชิ้นเหมือนเดิม */
  presetLines?: PresetQuoteLine[];
  /** รอบเสนอราคาของใบงาน — มี = ให้ติ๊กเลือกราคา/จำนวนที่จะส่ง */
  quotes?: DesignSheetQuote[];
  /** ป้ายไซส์ของรอบ ("" = ทั่วไป) */
  sizeLabel?: (code: string | null) => string;
  /** ตะกร้าปัจจุบัน (ใบร่าง active) — มี = หย่อนเข้าใบนี้ */
  cartId: string | null;
  /** ป้ายตะกร้า (เลขที่ใบ · ลูกค้า) โชว์ใน banner */
  cartLabel: string | null;
  /** สร้างใบใหม่สำเร็จ → ตั้งใบนี้เป็นตะกร้า */
  onCartSet: (quotationId: string) => void;
  /** หย่อนของเข้าตะกร้าสำเร็จ → ให้ drawer โหลดใหม่ */
  onAdded: () => void;
}) {
  const toast = useToast();
  const t = useT();
  const [customer, setCustomer] = useState<CustomerPickerValue | null>(null);
  const [name, setName] = useState("");
  const [variation, setVariation] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("1");
  const [saving, setSaving] = useState(false);
  const [sheetSkus, setSheetSkus] = useState<SheetSku[]>([]);   // SKU ที่สร้างจากงานนี้ (เลือกได้ ถ้ามี)
  const [selSkuId, setSelSkuId] = useState("");                 // SKU ที่เลือก ("" = พิมพ์ชื่อเอง)

  const [picks, setPicks] = useState<RoundPick[]>([]);          // รอบเสนอราคาที่เลือกส่งได้
  const [manual, setManual] = useState(false);                   // true = กรอกราคา/จำนวนเอง (ไม่เลือกจากรอบ)

  const hasCart = !!cartId;

  useEffect(() => {
    if (!open) return;
    setVariation(""); setQty("1"); setCustomer(null); setSelSkuId("");
    setName(sheetName || "");
    setPrice(defaultPrice != null ? String(defaultPrice) : "");
    // รอบที่มีราคา → เป็นตัวเลือก · ติ๊กรอบ "ผ่าน" ไว้ก่อน (ไม่มีรอบผ่าน = ไม่ติ๊กอะไร ให้เลือกเอง)
    const priced = (quotes ?? []).filter((q) => (q.offered_price ?? q.price) != null);
    const anyPassed = priced.some((q) => q.status === "passed");
    setPicks(priced.map((q) => ({
      id: q.id, round: q.round, size: q.parent_code ?? "", status: q.status,
      checked: anyPassed && q.status === "passed",
      qty: roundQty(q), price: String(q.offered_price ?? q.price),
      batch: q.batch ?? q.round, date: q.quote_date ?? null, note: q.note ?? null, cost: q.price != null ? Number(q.price) : null,
    })));
    setManual(priced.length === 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- รีเซ็ตเฉพาะตอนเปิดป๊อป (quotes อัปเดตระหว่างเปิดไม่ต้องล้างที่ติ๊กไว้)
  }, [open, sheetName, defaultPrice]);

  // โหลด SKU ที่สร้างจากงานนี้ → ให้เลือกแทนพิมพ์ชื่อเอง (เติมชื่อ/สี/ราคา + ผูกรหัสสินค้าจริง)
  useEffect(() => {
    if (!open || !sheetId) return;
    let alive = true;
    apiFetch(`/api/design-sheets/${sheetId}/skus`).then((r) => r.json())
      .then((j) => { if (alive && Array.isArray(j.data)) setSheetSkus(j.data as SheetSku[]); }).catch(() => {});
    return () => { alive = false; };
  }, [open, sheetId]);

  const pickSku = (skuId: string) => {
    setSelSkuId(skuId);
    const s = sheetSkus.find((x) => x.id === skuId);
    if (s) {
      setName(s.name_th || sheetName || "");
      setVariation(s.color || "");
      if (s.list_price != null) setPrice(String(s.list_price));
    }
  };

  const batch = presetLines ?? null;   // โหมดส่งเป็นชุด
  const roundMode = !batch && !manual && picks.length > 0;   // โหมดติ๊กเลือกจากรอบเสนอราคา
  const checkedPicks = picks.filter((p) => p.checked);
  const setPick = (id: string, patch: Partial<RoundPick>) => setPicks((l) => l.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const setMany = (ids: Set<string>, checked: boolean) => setPicks((l) => l.map((p) => (ids.has(p.id) ? { ...p, checked } : p)));
  // จัดกลุ่ม: ครั้งที่ (ล่าสุดบน) → ไซส์ → ขั้นจำนวน (น้อย→มาก) — เจ้าของขอ "จับกลุ่มให้ดูง่าย + มีรายละเอียด"
  const groups = (() => {
    const byBatch = new Map<number, RoundPick[]>();
    for (const p of picks) (byBatch.get(p.batch) ?? byBatch.set(p.batch, []).get(p.batch)!).push(p);
    return [...byBatch.entries()].sort((a, b) => b[0] - a[0]).map(([batch, ps]) => {
      const bySize = new Map<string, RoundPick[]>();
      for (const p of ps) (bySize.get(p.size) ?? bySize.set(p.size, []).get(p.size)!).push(p);
      const sizes = [...bySize.entries()].map(([size, rows]) => ({ size, rows: rows.sort((a, b) => (Number(a.qty) || 0) - (Number(b.qty) || 0)) }));
      const sts = new Set(ps.map((p) => p.status));
      return { batch, date: ps[0]?.date ?? null, note: ps.find((p) => p.note)?.note ?? null, status: sts.size === 1 ? ps[0].status : "mixed", sizes, ids: new Set(ps.map((p) => p.id)), checked: ps.filter((p) => p.checked).length };
    });
  })();
  const labelOf = (code: string) => (sizeLabel ? sizeLabel(code) : code || t("ทั่วไป", "General"));

  const save = async () => {
    if (!batch && !name.trim()) { toast.error(tr("กรอกชื่อสินค้า", "Enter a product name")); return; }
    if (batch && batch.length === 0) { toast.error(tr("ไม่มีรายการที่จะส่ง", "Nothing to send")); return; }
    if (roundMode && checkedPicks.length === 0) { toast.error(tr("ติ๊กเลือกราคาที่จะส่งอย่างน้อย 1 รายการ", "Tick at least 1 price to send")); return; }
    if (roundMode && checkedPicks.some((p) => !(Number(p.qty) > 0) || p.price === "" || !(Number(p.price) >= 0))) {
      toast.error(tr("กรอกจำนวน (มากกว่า 0) และราคา ให้ครบทุกรายการที่ติ๊ก", "Enter a qty (above 0) and a price for every ticked row")); return;
    }
    if (!hasCart && !customer) { toast.error(tr("เลือกลูกค้าก่อน", "Select a customer first")); return; }
    const sel = sheetSkus.find((x) => x.id === selSkuId);
    // โหมดติ๊กรอบ: 1 รอบ = 1 บรรทัด · ตัวเลือกบรรทัด = variation ที่กรอก + ไซส์ (ถ้าไม่ใช่ "ทั่วไป")
    const roundLines = roundMode ? checkedPicks.map((p) => ({
      product_name: name.trim(),
      variation: [variation.trim(), p.size ? labelOf(p.size) : ""].filter(Boolean).join(" · ") || null,
      unit_price: Number(p.price), qty: Number(p.qty),
      sku: sel?.code ?? null, product_id: sel?.id ?? null,
    })) : null;
    const sendCount = batch ? batch.length : roundLines ? roundLines.length : 1;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/design-sheets/${sheetId}/to-quotation`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: hasCart ? cartId : "new",
          customer: !hasCart && customer ? { id: customer.id, name: customer.name, code: customer.code } : null,
          ...(batch
            ? { lines: batch }
            : roundLines ? { lines: roundLines }
            : { line: { product_name: name.trim(), variation: variation.trim() || null, unit_price: price === "" ? 0 : Number(price), qty: Number(qty) || 1,
                        sku: sel?.code ?? null, product_id: sel?.id ?? null } }),
        }),
      });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      if (!hasCart && j.quotation_id) onCartSet(j.quotation_id as string);
      onAdded();
      toast.success(sendCount > 1
        ? (hasCart ? tr(`เพิ่มเข้าตะกร้า ${sendCount} รายการแล้ว`, `Added ${sendCount} items to cart`) : tr(`สร้างตะกร้าใบเสนอราคา ${sendCount} รายการแล้ว`, `Quotation cart created with ${sendCount} items`))
        : hasCart ? tr("เพิ่มเข้าตะกร้าแล้ว", "Added to cart") : tr("สร้างตะกร้าใบเสนอราคาแล้ว", "Quotation cart created"));
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("ส่งไปใบเสนอราคาไม่สำเร็จ", "Send to quotation failed"));
    } finally { setSaving(false); }
  };

  return (
    <ERPModal open={open} onClose={() => !saving && onClose()} size="md" title={t("🧾 ส่งไปใบเสนอราคา", "🧾 Send to quotation")}
      description={hasCart
        ? t("หย่อนสินค้านี้เข้าตะกร้าใบเสนอราคาที่กำลังทำอยู่ (ดูตะกร้าได้ที่แถบขวา)", "Drop this product into the quotation cart in progress (see the cart in the right panel)")
        : t("เลือกลูกค้าเพื่อเริ่มใบเสนอราคาใหม่ — สินค้าชิ้นต่อไปจะรวมเข้าใบเดียวกันอัตโนมัติ", "Select a customer to start a new quotation — the next products are added to the same quotation automatically")}
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button onClick={() => !saving && onClose()} disabled={saving} className="h-9 px-4 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
          <button onClick={() => void save()} disabled={saving} className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? t("กำลังส่ง...", "Sending...") : `${hasCart ? t("เพิ่มเข้าตะกร้า", "Add to cart") : t("เริ่มใบ + เพิ่ม", "Start quotation + add")}${roundMode ? ` (${checkedPicks.length})` : ""}`}</button>
        </div>
      }>
      <div className="space-y-3">
        {hasCart ? (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2 text-sm text-indigo-800">
            {t("🧺 เพิ่มเข้าตะกร้า:", "🧺 Adding to cart:")} <b>{cartLabel ?? t("ใบร่างปัจจุบัน", "Current draft")}</b>
          </div>
        ) : (
          <label className="block">
            <span className="text-xs text-slate-500">{t("ลูกค้า *", "Customer *")}</span>
            <div className="mt-0.5"><CustomerPicker value={customer} onChange={setCustomer} /></div>
          </label>
        )}

        {/* โหมดส่งเป็นชุด — โชว์รายการที่จะส่ง แทนช่องกรอกทีละชิ้น */}
        {batch && (
          <div className="rounded-lg border border-slate-200">
            <div className="border-b border-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">{t(`รายการที่จะส่ง ${batch.length} รายการ`, `${batch.length} items to send`)}</div>
            <div className="max-h-56 divide-y divide-slate-50 overflow-auto">
              {batch.map((l, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-[13px]">
                  <span className="min-w-0 flex-1 truncate text-slate-700">{l.product_name}{l.variation ? <span className="text-slate-400"> · {l.variation}</span> : null}</span>
                  <span className="shrink-0 text-slate-400">×{l.qty.toLocaleString("th-TH")}</span>
                  <span className="shrink-0 tabular-nums text-slate-700">{l.unit_price.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 px-3 py-1.5 text-[13px]">
              <span className="text-slate-500">{t("รวม", "Total")}</span>
              <b className="tabular-nums text-emerald-700">{batch.reduce((s, l) => s + l.qty * l.unit_price, 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ฿</b>
            </div>
          </div>
        )}

        {!batch && sheetSkus.length > 0 && (
          <label className="block">
            <span className="text-xs text-slate-500">{t("เลือก SKU ของงานนี้ (หรือพิมพ์ชื่อเอง)", "Pick a SKU from this job (or type a name)")}</span>
            <select value={selSkuId} onChange={(e) => pickSku(e.target.value)}
              className="mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">{t("— พิมพ์ชื่อเอง —", "— Type a name —")}</option>
              {sheetSkus.map((s) => <option key={s.id} value={s.id}>{s.code}{s.color ? ` · ${s.color}` : ""}{s.name_th ? ` — ${s.name_th}` : ""}</option>)}
            </select>
          </label>
        )}

        {!batch && <label className="block">
          <span className="text-xs text-slate-500">{t("ชื่อสินค้า *", "Product name *")}</span>
          <input value={name} onChange={(e) => { setName(e.target.value); setSelSkuId(""); }} className="mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>}
        {!batch && <label className="block">
          <span className="text-xs text-slate-500">{t("ตัวเลือก / variation (สี, ขนาด...)", "Option / variation (color, size...)")}</span>
          <input value={variation} onChange={(e) => setVariation(e.target.value)} placeholder={t("เช่น สีดำ ขนาด L", "e.g. Black, size L")}
            className="mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>}
        {/* โหมดติ๊กเลือกรอบเสนอราคา — เลือกได้ว่าจะส่งราคาไหน จำนวนเท่าไหร่ (แก้ได้ก่อนส่ง) */}
        {roundMode && (
          <div className="rounded-lg border border-slate-200">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-1.5 text-xs">
              <span className="font-medium text-slate-600">{t("เลือกราคาที่จะส่ง — 1 รายการที่ติ๊ก = 1 บรรทัดในใบเสนอราคา", "Pick prices to send — 1 ticked row = 1 quotation line")}</span>
              <span className="flex shrink-0 gap-2">
                <button type="button" onClick={() => setPicks((l) => l.map((p) => ({ ...p, checked: true })))} className="text-blue-600 hover:underline">{t("ติ๊กทั้งหมด", "Tick all")}</button>
                <button type="button" onClick={() => setPicks((l) => l.map((p) => ({ ...p, checked: false })))} className="text-slate-500 hover:underline">{t("ล้างติ๊ก", "Clear ticks")}</button>
              </span>
            </div>
            <div className="max-h-[26rem] overflow-auto p-2 space-y-2 bg-slate-50/60">
              {groups.map((g) => (
                <div key={g.batch} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                  {/* หัวครั้ง: ครั้งที่ · วันที่ · สถานะ · หมายเหตุ · ติ๊กทั้งครั้ง */}
                  <div className="flex flex-wrap items-center gap-2 px-2.5 py-1.5 bg-slate-50 border-b border-slate-100 text-xs">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={g.checked === g.ids.size} ref={(el) => { if (el) el.indeterminate = g.checked > 0 && g.checked < g.ids.size; }} onChange={(e) => setMany(g.ids, e.target.checked)} className="h-4 w-4 cursor-pointer" />
                      <span className="h-6 px-2 rounded-md bg-slate-800 text-white font-semibold flex items-center">{t(`ครั้งที่ ${g.batch}`, `Round ${g.batch}`)}</span>
                    </label>
                    <span className="text-slate-500">{fmtDate(g.date)}</span>
                    <span className={`px-1.5 py-0.5 rounded border text-[11px] ${g.status === "mixed" ? "bg-slate-50 text-slate-500 border-slate-200" : (STATUS_CLS[g.status] ?? "bg-slate-50 text-slate-500 border-slate-200")}`}>{g.status === "mixed" ? t("◐ ผสม", "◐ Mixed") : (STATUS_LABEL[g.status]?.() ?? g.status)}</span>
                    {g.note && <span className="text-slate-500 truncate min-w-0 flex-1" title={g.note}>📝 {g.note}</span>}
                    <span className="ml-auto text-[11px] text-slate-400">{g.checked}/{g.ids.size} {t("ติ๊ก", "ticked")}</span>
                  </div>
                  <table className="w-full text-[13px]">
                    <thead className="text-[11px] text-slate-400">
                      <tr>
                        <th className="w-9 px-2 py-1"></th>
                        <th className="px-2 py-1 text-left">{t("ไซส์ / ขั้นจำนวน", "Size / qty tier")}</th>
                        <th className="w-24 px-2 py-1 text-right">{t("จำนวน (ชิ้น)", "Qty (pcs)")}</th>
                        <th className="w-24 px-2 py-1 text-right">{t("ราคา/ชิ้น", "Price/pc")}</th>
                        <th className="w-28 px-2 py-1 text-right" title={t("ราคาที่เสนอ − ราคาจากตีราคาตอนเสนอ", "Offered price − costing price at time of quote")}>{t("กำไร/ชิ้น", "Profit/pc")}</th>
                        <th className="w-24 px-2 py-1 text-right">{t("รวม", "Total")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.sizes.map(({ size, rows }) => {
                        const sizeIds = new Set(rows.map((r) => r.id)); const sizeChecked = rows.filter((r) => r.checked).length;
                        return [
                          <tr key={`h-${size}`} className="bg-blue-50/40">
                            <td className="px-2 py-1 text-center"><input type="checkbox" checked={sizeChecked === rows.length} ref={(el) => { if (el) el.indeterminate = sizeChecked > 0 && sizeChecked < rows.length; }} onChange={(e) => setMany(sizeIds, e.target.checked)} className="h-3.5 w-3.5 cursor-pointer" /></td>
                            <td colSpan={5} className="px-2 py-1 text-xs font-semibold text-blue-800">{labelOf(size)} <span className="font-normal text-blue-500">{t(`· ${rows.length} ขั้นจำนวน`, `· ${rows.length} qty tiers`)}</span></td>
                          </tr>,
                          ...rows.map((p) => {
                            const price = Number(p.price) || 0; const qn = Number(p.qty) || 0;
                            const margin = p.cost != null && p.price !== "" ? price - p.cost : null;
                            const pct = margin != null && price ? (margin / price) * 100 : null;
                            return (
                              <tr key={p.id} className={`border-t border-slate-50 ${p.checked ? "bg-blue-50/40" : ""}`}>
                                <td className="px-2 py-1 text-center"><input type="checkbox" checked={p.checked} onChange={(e) => setPick(p.id, { checked: e.target.checked })} className="h-4 w-4 cursor-pointer" /></td>
                                <td className="px-2 py-1 pl-6 text-slate-600">
                                  {qn ? `${qn.toLocaleString("th-TH")} ${t("ชิ้น", "pcs")}` : t("ไม่ระบุจำนวน", "No qty")}
                                  <span className={`ml-1.5 text-[10px] px-1 py-px rounded border ${STATUS_CLS[p.status] ?? "bg-slate-50 text-slate-400 border-slate-200"}`}>{STATUS_LABEL[p.status]?.() ?? p.status}</span>
                                  {p.cost != null && <span className="ml-1.5 text-[10px] text-slate-400" title={t("ราคาจากตีราคาตอนเสนอ", "Costing price at time of quote")}>{t("ต้นทุน", "Cost")} {fmt2(p.cost)}</span>}
                                </td>
                                <td className="px-2 py-1">
                                  <input type="number" min={1} step="any" value={p.qty} onChange={(e) => setPick(p.id, { qty: e.target.value, checked: true })}
                                    className="h-7 w-full px-1.5 text-right text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                </td>
                                <td className="px-2 py-1">
                                  <input type="number" min={0} step="any" value={p.price} onChange={(e) => setPick(p.id, { price: e.target.value, checked: true })}
                                    className="h-7 w-full px-1.5 text-right text-sm font-medium text-blue-700 border border-blue-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                </td>
                                <td className={`px-2 py-1 text-right tabular-nums text-xs ${margin == null ? "text-slate-300" : margin > 0 ? "text-emerald-700" : margin < 0 ? "text-rose-600" : "text-slate-400"}`}>
                                  {margin == null ? "—" : `${margin > 0 ? "+" : margin < 0 ? "−" : ""}${fmt2(Math.abs(margin))}${pct != null ? ` (${pct.toFixed(0)}%)` : ""}`}
                                </td>
                                <td className="px-2 py-1 text-right tabular-nums text-slate-700">{fmt2(qn * price)}</td>
                              </tr>
                            );
                          }),
                        ];
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 px-3 py-1.5 text-[13px]">
              <span className="text-slate-500">{t(`เลือก ${checkedPicks.length} / ${picks.length} รายการ`, `Selected ${checkedPicks.length} / ${picks.length} items`)}{checkedPicks.length ? ` · ${checkedPicks.reduce((n, p) => n + (Number(p.qty) || 0), 0).toLocaleString("th-TH")} ${t("ชิ้น", "pcs")}` : ""}</span>
              <b className="tabular-nums text-emerald-700">{checkedPicks.reduce((s, p) => s + (Number(p.qty) || 0) * (Number(p.price) || 0), 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ฿</b>
            </div>
          </div>
        )}
        {!batch && picks.length > 0 && (
          <button type="button" onClick={() => setManual((m) => !m)} className="text-xs text-blue-600 hover:underline">
            {manual ? t("← กลับไปเลือกจากรอบเสนอราคา", "← Back to picking from quote rounds") : t("หรือ กรอกราคา/จำนวนเอง (ไม่ใช้รอบเสนอราคา)", "Or enter price/qty manually (no quote round)")}
          </button>
        )}

        <div className={`grid grid-cols-2 gap-2 ${batch || roundMode ? "hidden" : ""}`}>
          <label className="block">
            <span className="text-xs text-slate-500">{t("ราคาที่เสนอ (บาท)", "Offered price (THB)")}</span>
            <input type="number" min={0} step="any" value={price} onChange={(e) => setPrice(e.target.value)}
              className="mt-0.5 w-full h-9 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">{t("จำนวน", "Qty")}</span>
            <input type="number" min={1} step="any" value={qty} onChange={(e) => setQty(e.target.value)}
              className="mt-0.5 w-full h-9 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
        </div>
      </div>
    </ERPModal>
  );
}
