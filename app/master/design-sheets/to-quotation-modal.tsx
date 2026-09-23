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
import { CustomerPicker } from "@/components/pickers";
import type { CustomerPickerValue } from "@/components/pickers";
import type { SheetSku } from "@/app/api/design-sheets/[id]/skus/route";
import type { DesignSheetQuote } from "@/app/api/design-sheets/[id]/quotes/route";

/** แถวเลือกรอบเสนอราคา: ติ๊ก + จำนวน/ราคาที่แก้ได้ก่อนส่ง */
type RoundPick = { id: string; round: number; size: string; status: string; checked: boolean; qty: string; price: string };

// จำนวนตั้งต้นของรอบ: ช่องจำนวน → ถ้าไม่มี แต่หมายเหตุเป็นตัวเลขล้วน (รอบเก่าที่จดจำนวนไว้ในหมายเหตุ) ใช้อันนั้น → 1
const roundQty = (q: DesignSheetQuote) => {
  if (q.qty != null && Number(q.qty) > 0) return String(q.qty);
  const n = (q.note ?? "").replace(/,/g, "").trim();
  return /^\d+(\.\d+)?$/.test(n) && Number(n) > 0 ? n : "1";
};
const STATUS_LABEL: Record<string, string> = { pending: "รอผล", passed: "ผ่าน", failed: "ไม่ผ่าน" };

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
  const labelOf = (code: string) => (sizeLabel ? sizeLabel(code) : code || "ทั่วไป");

  const save = async () => {
    if (!batch && !name.trim()) { toast.error("กรอกชื่อสินค้า"); return; }
    if (batch && batch.length === 0) { toast.error("ไม่มีรายการที่จะส่ง"); return; }
    if (roundMode && checkedPicks.length === 0) { toast.error("ติ๊กเลือกราคาที่จะส่งอย่างน้อย 1 รายการ"); return; }
    if (roundMode && checkedPicks.some((p) => !(Number(p.qty) > 0) || p.price === "" || !(Number(p.price) >= 0))) {
      toast.error("กรอกจำนวน (มากกว่า 0) และราคา ให้ครบทุกรายการที่ติ๊ก"); return;
    }
    if (!hasCart && !customer) { toast.error("เลือกลูกค้าก่อน"); return; }
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
        ? `${hasCart ? "เพิ่มเข้าตะกร้า" : "สร้างตะกร้าใบเสนอราคา"} ${sendCount} รายการแล้ว`
        : hasCart ? "เพิ่มเข้าตะกร้าแล้ว" : "สร้างตะกร้าใบเสนอราคาแล้ว");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ส่งไปใบเสนอราคาไม่สำเร็จ");
    } finally { setSaving(false); }
  };

  return (
    <ERPModal open={open} onClose={() => !saving && onClose()} size="md" title="🧾 ส่งไปใบเสนอราคา"
      description={hasCart
        ? "หย่อนสินค้านี้เข้าตะกร้าใบเสนอราคาที่กำลังทำอยู่ (ดูตะกร้าได้ที่แถบขวา)"
        : "เลือกลูกค้าเพื่อเริ่มใบเสนอราคาใหม่ — สินค้าชิ้นต่อไปจะรวมเข้าใบเดียวกันอัตโนมัติ"}
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button onClick={() => !saving && onClose()} disabled={saving} className="h-9 px-4 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button>
          <button onClick={() => void save()} disabled={saving} className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? "กำลังส่ง..." : `${hasCart ? "เพิ่มเข้าตะกร้า" : "เริ่มใบ + เพิ่ม"}${roundMode ? ` (${checkedPicks.length})` : ""}`}</button>
        </div>
      }>
      <div className="space-y-3">
        {hasCart ? (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2 text-sm text-indigo-800">
            🧺 เพิ่มเข้าตะกร้า: <b>{cartLabel ?? "ใบร่างปัจจุบัน"}</b>
          </div>
        ) : (
          <label className="block">
            <span className="text-xs text-slate-500">ลูกค้า *</span>
            <div className="mt-0.5"><CustomerPicker value={customer} onChange={setCustomer} /></div>
          </label>
        )}

        {/* โหมดส่งเป็นชุด — โชว์รายการที่จะส่ง แทนช่องกรอกทีละชิ้น */}
        {batch && (
          <div className="rounded-lg border border-slate-200">
            <div className="border-b border-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">รายการที่จะส่ง {batch.length} รายการ</div>
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
              <span className="text-slate-500">รวม</span>
              <b className="tabular-nums text-emerald-700">{batch.reduce((s, l) => s + l.qty * l.unit_price, 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ฿</b>
            </div>
          </div>
        )}

        {!batch && sheetSkus.length > 0 && (
          <label className="block">
            <span className="text-xs text-slate-500">เลือก SKU ของงานนี้ (หรือพิมพ์ชื่อเอง)</span>
            <select value={selSkuId} onChange={(e) => pickSku(e.target.value)}
              className="mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— พิมพ์ชื่อเอง —</option>
              {sheetSkus.map((s) => <option key={s.id} value={s.id}>{s.code}{s.color ? ` · ${s.color}` : ""}{s.name_th ? ` — ${s.name_th}` : ""}</option>)}
            </select>
          </label>
        )}

        {!batch && <label className="block">
          <span className="text-xs text-slate-500">ชื่อสินค้า *</span>
          <input value={name} onChange={(e) => { setName(e.target.value); setSelSkuId(""); }} className="mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>}
        {!batch && <label className="block">
          <span className="text-xs text-slate-500">ตัวเลือก / variation (สี, ขนาด...)</span>
          <input value={variation} onChange={(e) => setVariation(e.target.value)} placeholder="เช่น สีดำ ขนาด L"
            className="mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>}
        {/* โหมดติ๊กเลือกรอบเสนอราคา — เลือกได้ว่าจะส่งราคาไหน จำนวนเท่าไหร่ (แก้ได้ก่อนส่ง) */}
        {roundMode && (
          <div className="rounded-lg border border-slate-200">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-1.5 text-xs">
              <span className="font-medium text-slate-600">เลือกราคาที่จะส่ง — 1 รายการที่ติ๊ก = 1 บรรทัดในใบเสนอราคา</span>
              <span className="flex shrink-0 gap-2">
                <button type="button" onClick={() => setPicks((l) => l.map((p) => ({ ...p, checked: true })))} className="text-blue-600 hover:underline">ติ๊กทั้งหมด</button>
                <button type="button" onClick={() => setPicks((l) => l.map((p) => ({ ...p, checked: false })))} className="text-slate-500 hover:underline">ล้างติ๊ก</button>
              </span>
            </div>
            <div className="max-h-72 overflow-auto">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="w-9 px-2 py-1"></th>
                    <th className="w-14 px-2 py-1 text-center">ครั้งที่</th>
                    <th className="px-2 py-1 text-left">ไซส์</th>
                    <th className="w-16 px-2 py-1 text-center">สถานะ</th>
                    <th className="w-28 px-2 py-1 text-right">จำนวน (ชิ้น)</th>
                    <th className="w-28 px-2 py-1 text-right">ราคา/ชิ้น</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {picks.map((p) => (
                    <tr key={p.id} className={p.checked ? "bg-blue-50/40" : ""}>
                      <td className="px-2 py-1 text-center">
                        <input type="checkbox" checked={p.checked} onChange={(e) => setPick(p.id, { checked: e.target.checked })} className="h-4 w-4 cursor-pointer" />
                      </td>
                      <td className="px-2 py-1 text-center text-slate-500">{p.round}</td>
                      <td className="px-2 py-1 text-slate-600">{labelOf(p.size)}</td>
                      <td className="px-2 py-1 text-center text-xs text-slate-400">{STATUS_LABEL[p.status] ?? p.status}</td>
                      <td className="px-2 py-1">
                        <input type="number" min={1} step="any" value={p.qty} onChange={(e) => setPick(p.id, { qty: e.target.value, checked: true })}
                          className="h-7 w-full px-1.5 text-right text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </td>
                      <td className="px-2 py-1">
                        <input type="number" min={0} step="any" value={p.price} onChange={(e) => setPick(p.id, { price: e.target.value, checked: true })}
                          className="h-7 w-full px-1.5 text-right text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 px-3 py-1.5 text-[13px]">
              <span className="text-slate-500">เลือก {checkedPicks.length} / {picks.length} รายการ</span>
              <b className="tabular-nums text-emerald-700">{checkedPicks.reduce((s, p) => s + (Number(p.qty) || 0) * (Number(p.price) || 0), 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ฿</b>
            </div>
          </div>
        )}
        {!batch && picks.length > 0 && (
          <button type="button" onClick={() => setManual((m) => !m)} className="text-xs text-blue-600 hover:underline">
            {manual ? "← กลับไปเลือกจากรอบเสนอราคา" : "หรือ กรอกราคา/จำนวนเอง (ไม่ใช้รอบเสนอราคา)"}
          </button>
        )}

        <div className={`grid grid-cols-2 gap-2 ${batch || roundMode ? "hidden" : ""}`}>
          <label className="block">
            <span className="text-xs text-slate-500">ราคาที่เสนอ (บาท)</span>
            <input type="number" min={0} step="any" value={price} onChange={(e) => setPrice(e.target.value)}
              className="mt-0.5 w-full h-9 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">จำนวน</span>
            <input type="number" min={1} step="any" value={qty} onChange={(e) => setQty(e.target.value)}
              className="mt-0.5 w-full h-9 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
        </div>
      </div>
    </ERPModal>
  );
}
