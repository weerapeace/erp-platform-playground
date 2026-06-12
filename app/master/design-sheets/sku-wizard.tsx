"use client";

// ============================================================
// SkuWizard — สร้าง Parent SKU + SKU ลูก จากใบงานออกแบบ (เฉพาะโมดูล Design Sheets)
// ของกลางที่ใช้: ERPModal · useToast · apiFetch → POST /api/design-sheets/[id]/create-skus
// Parent มีรหัสนี้แล้ว = เพิ่ม SKU เข้า Parent เดิม · ราคาเริ่มต้น = ราคาที่เสนอ (แก้ได้)
// ============================================================

import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";

const FAMILIES: [string, string][] = [
  ["general", "ทั่วไป"], ["bag", "กระเป๋า"], ["belt", "เข็มขัด"], ["jewelry", "เครื่องประดับ"], ["spare", "อะไหล่"],
];

type SkuRow = { code: string; color: string; name: string; price: string };

export function SkuWizard({
  open, onClose, sheetId, sheetName, brandId, parentCodeDefault, defaultPrice, onDone,
}: {
  open: boolean;
  onClose: () => void;
  sheetId: string;
  sheetName: string;
  brandId: string | null;
  parentCodeDefault: string;
  /** ราคาที่เสนอ (ผ่านแล้ว) ใช้เป็นราคาตั้งต้นของ SKU */
  defaultPrice: number | null;
  /** เรียกหลังสร้างสำเร็จ — refresh + อัปเดตสถานะใบเป็น sku_created */
  onDone: () => void;
}) {
  const toast = useToast();
  const [pCode, setPCode] = useState("");
  const [pName, setPName] = useState("");
  const [pNameEn, setPNameEn] = useState("");
  const [family, setFamily] = useState("general");
  const [rows, setRows] = useState<SkuRow[]>([]);
  const [parentExists, setParentExists] = useState(false);
  const [saving, setSaving] = useState(false);

  // เปิดหน้าต่าง = เซ็ตค่าเริ่มต้นจากใบงาน
  useEffect(() => {
    if (!open) return;
    setPCode(parentCodeDefault || "");
    setPName(sheetName || "");
    setPNameEn(""); setFamily("general");
    setRows([{ code: "", color: "", name: sheetName || "", price: defaultPrice != null ? String(defaultPrice) : "" }]);
  }, [open, parentCodeDefault, sheetName, defaultPrice]);

  // เช็กว่ารหัส Parent มีอยู่แล้วไหม (เตือนว่าจะเพิ่มเข้า Parent เดิม)
  useEffect(() => {
    if (!open) return;
    const code = pCode.trim();
    if (!code) { setParentExists(false); return; }
    let alive = true;
    const t = setTimeout(() => {
      apiFetch(`/api/design-sheets/parent-sku-check?code=${encodeURIComponent(code)}`)
        .then((r) => r.json()).then((j) => { if (alive) setParentExists(!!j?.exists); }).catch(() => {});
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [pCode, open]);

  const setRow = (i: number, p: Partial<SkuRow>) => setRows((list) => list.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  const addRow = () => setRows((list) => [...list, { code: "", color: "", name: pName, price: defaultPrice != null ? String(defaultPrice) : "" }]);
  const removeRow = (i: number) => setRows((list) => (list.length <= 1 ? list : list.filter((_, idx) => idx !== i)));

  const save = async () => {
    if (!pCode.trim()) { toast.error("กรอกรหัส Parent SKU"); return; }
    if (!pName.trim()) { toast.error("กรอกชื่อสินค้า"); return; }
    const valid = rows.filter((r) => r.code.trim());
    if (valid.length === 0) { toast.error("กรอกรหัส SKU ลูกอย่างน้อย 1 ตัว"); return; }
    setSaving(true);
    try {
      const res = await apiFetch(`/api/design-sheets/${sheetId}/create-skus`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parent: { code: pCode.trim(), name_th: pName.trim(), name_en: pNameEn.trim() || null, product_family: family, brand_id: brandId },
          skus: valid.map((r) => ({
            code: r.code.trim(), color: r.color.trim() || null, name_th: r.name.trim() || pName.trim(),
            standard_price: r.price === "" ? null : Number(r.price),
            list_price: r.price === "" ? null : Number(r.price),
          })),
        }),
      });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success(`สร้าง ${j.count} SKU ${j.parent_created ? "+ Parent ใหม่" : "(เข้า Parent เดิม)"} แล้ว`);
      onDone();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "สร้าง SKU ไม่สำเร็จ");
    } finally { setSaving(false); }
  };

  return (
    <ERPModal open={open} onClose={() => !saving && onClose()} size="lg" title="🪄 สร้าง SKU จากใบงาน"
      description="สร้างสินค้าหลัก (Parent SKU) + SKU ลูกหลายสี/หลายแบบในครั้งเดียว — ราคาตั้งต้นดึงจากราคาที่เสนอ แก้ได้"
      footer={
        <div className="flex justify-between items-center w-full">
          <button onClick={addRow} disabled={saving} className="h-9 px-3 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">＋ เพิ่ม SKU</button>
          <div className="flex gap-2">
            <button onClick={() => !saving && onClose()} disabled={saving} className="h-9 px-4 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button>
            <button onClick={() => void save()} disabled={saving} className="h-9 px-4 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
              {saving ? "กำลังสร้าง..." : "สร้าง SKU"}</button>
          </div>
        </div>
      }>
      <div className="space-y-4">
        {/* ---- Parent SKU ---- */}
        <div className="p-3 border border-slate-200 rounded-lg bg-slate-50/60 space-y-2">
          <div className="text-xs font-medium text-slate-500">สินค้าหลัก (Parent SKU)</div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs text-slate-500">รหัส Parent SKU *</span>
              <input value={pCode} onChange={(e) => setPCode(e.target.value)} placeholder="เช่น CTL085"
                className="mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500">หมวดสินค้า</span>
              <select value={family} onChange={(e) => setFamily(e.target.value)} className="mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white">
                {FAMILIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-500">ชื่อสินค้า (ไทย) *</span>
              <input value={pName} onChange={(e) => setPName(e.target.value)} className="mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500">ชื่อสินค้า (อังกฤษ)</span>
              <input value={pNameEn} onChange={(e) => setPNameEn(e.target.value)} className="mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </label>
          </div>
          {parentExists && (
            <p className="text-xs text-amber-600">⚠ รหัสนี้มีอยู่แล้ว — SKU ลูกที่สร้างจะถูกเพิ่มเข้า Parent เดิม (ไม่สร้าง Parent ซ้ำ)</p>
          )}
        </div>

        {/* ---- SKU ลูก ---- */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-slate-500">SKU ลูก (แต่ละสี/แบบ = 1 ตัว)</div>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 text-xs text-slate-500">
                <th className="border border-slate-200 px-2 py-1.5 text-left">รหัส SKU *</th>
                <th className="border border-slate-200 px-2 py-1.5 text-left w-32">สี / แบบ</th>
                <th className="border border-slate-200 px-2 py-1.5 text-left">ชื่อ</th>
                <th className="border border-slate-200 px-2 py-1.5 text-right w-28">ราคาขาย</th>
                <th className="border border-slate-200 px-1 py-1.5 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="border border-slate-200 px-1 py-1">
                    <input value={r.code} onChange={(e) => setRow(i, { code: e.target.value })} placeholder="เช่น CTL085-BLK"
                      className="w-full h-8 px-2 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </td>
                  <td className="border border-slate-200 px-1 py-1">
                    <input value={r.color} onChange={(e) => setRow(i, { color: e.target.value })} placeholder="ดำ / แดง..."
                      className="w-full h-8 px-2 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </td>
                  <td className="border border-slate-200 px-1 py-1">
                    <input value={r.name} onChange={(e) => setRow(i, { name: e.target.value })}
                      className="w-full h-8 px-2 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </td>
                  <td className="border border-slate-200 px-1 py-1">
                    <input type="number" min={0} step="any" value={r.price} onChange={(e) => setRow(i, { price: e.target.value })}
                      className="w-full h-8 px-2 text-sm text-right border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </td>
                  <td className="border border-slate-200 px-1 py-1 text-center">
                    <button onClick={() => removeRow(i)} disabled={rows.length <= 1} title="ลบแถว"
                      className="h-7 w-7 text-rose-500 hover:bg-rose-50 rounded disabled:opacity-30">🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ERPModal>
  );
}
