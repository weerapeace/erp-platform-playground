"use client";

// ============================================================
// ToQuotationModal — ส่งสินค้าจากใบงานออกแบบ → ใบเสนอราคา (draft) ของระบบขาย
// ของกลาง: ERPModal · useToast · CustomerPicker · apiFetch → POST /api/design-sheets/[id]/to-quotation
// มีตะกร้าอยู่แล้ว = หย่อนเข้าตะกร้าเลย (ไม่ถามซ้ำ) · ไม่มีตะกร้า = เลือกลูกค้า → สร้างใบใหม่ → ตั้งเป็นตะกร้า
// variation เก็บที่ note · ระบบขายบังคับต้องมีลูกค้า (เลือกครั้งเดียวตอนเปิดตะกร้า)
// ============================================================

import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { CustomerPicker } from "@/components/pickers";
import type { CustomerPickerValue } from "@/components/pickers";

export function ToQuotationModal({
  open, onClose, sheetId, sheetName, defaultPrice, cartId, cartLabel, onCartSet, onAdded,
}: {
  open: boolean;
  onClose: () => void;
  sheetId: string;
  sheetName: string;
  defaultPrice: number | null;
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

  const hasCart = !!cartId;

  useEffect(() => {
    if (!open) return;
    setVariation(""); setQty("1"); setCustomer(null);
    setName(sheetName || "");
    setPrice(defaultPrice != null ? String(defaultPrice) : "");
  }, [open, sheetName, defaultPrice]);

  const save = async () => {
    if (!name.trim()) { toast.error("กรอกชื่อสินค้า"); return; }
    if (!hasCart && !customer) { toast.error("เลือกลูกค้าก่อน"); return; }
    setSaving(true);
    try {
      const res = await apiFetch(`/api/design-sheets/${sheetId}/to-quotation`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: hasCart ? cartId : "new",
          customer: !hasCart && customer ? { id: customer.id, name: customer.name, code: customer.code } : null,
          line: { product_name: name.trim(), variation: variation.trim() || null, unit_price: price === "" ? 0 : Number(price), qty: Number(qty) || 1 },
        }),
      });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      if (!hasCart && j.quotation_id) onCartSet(j.quotation_id as string);
      onAdded();
      toast.success(hasCart ? "เพิ่มเข้าตะกร้าแล้ว" : "สร้างตะกร้าใบเสนอราคาแล้ว");
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
            {saving ? "กำลังส่ง..." : hasCart ? "เพิ่มเข้าตะกร้า" : "เริ่มใบ + เพิ่ม"}</button>
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

        <label className="block">
          <span className="text-xs text-slate-500">ชื่อสินค้า *</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        <label className="block">
          <span className="text-xs text-slate-500">ตัวเลือก / variation (สี, ขนาด...)</span>
          <input value={variation} onChange={(e) => setVariation(e.target.value)} placeholder="เช่น สีดำ ขนาด L"
            className="mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        <div className="grid grid-cols-2 gap-2">
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
