"use client";

/**
 * ParentSkuCreateModal (ของกลาง) — ป๊อปเล็ก "＋ เพิ่ม Parent SKU": รหัส + ชื่อ + แบรนด์ + หมวดสินค้า
 * บันทึกผ่าน POST /api/master-v2/parent-skus (ด่านสิทธิ์ products.create + audit log ฝั่ง server)
 * onCreated ได้ Parent ตัวที่สร้าง (id/รหัส/ชื่อ/รูป) → ผู้เรียกเอาไปผูกต่อได้ เช่น ผูกเข้างาน Creative
 * ใช้ที่: หน้า SKU (แท็บเลือกดูตามแท็ก) · กล่อง Parent SKU ใน drawer งาน
 * รูป/ราคา/แท็ก แก้ต่อที่ตัวแก้สินค้า (MasterRecordDrawer) — ป๊อปนี้ตั้งใจให้สั้น
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { tr } from "@/lib/lang";
import type { ParentSkuPickerValue } from "@/components/pickers";

const PARENT_FAMILIES: [string, string, string][] = [
  ["general", "ทั่วไป", "General"], ["bag", "กระเป๋า", "Bag"], ["belt", "เข็มขัด", "Belt"], ["jewelry", "เครื่องประดับ", "Jewelry"], ["spare", "อะไหล่", "Spare part"],
];

export function ParentSkuCreateModal({ onClose, onCreated, defaultBrandId, defaultCode }: {
  onClose: () => void;
  onCreated: (p: ParentSkuPickerValue) => void;
  /** เติมแบรนด์ไว้ก่อน (เช่น แบรนด์ของงาน) — เปลี่ยนได้ */
  defaultBrandId?: string | null;
  defaultCode?: string;
}) {
  const toast = useToast();
  const [code, setCode] = useState(defaultCode ?? "");
  const [nameTh, setNameTh] = useState("");
  const [brandId, setBrandId] = useState(defaultBrandId ?? "");
  const [family, setFamily] = useState("general");
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    apiFetch("/api/brands").then((r) => r.json()).then((j) => { if (Array.isArray(j.data)) setBrands(j.data as { id: string; name: string }[]); }).catch(() => {});
  }, []);
  const save = async () => {
    if (!code.trim()) { toast.error(tr("กรอกรหัส Parent SKU", "Enter the Parent SKU code")); return; }
    if (!nameTh.trim()) { toast.error(tr("กรอกชื่อสินค้า", "Enter the product name")); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/master-v2/parent-skus", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim(), name_th: nameTh.trim(), brand_id: brandId || null, product_family: family, is_active: true }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error || tr("สร้างไม่สำเร็จ", "Couldn't create"));
      const row = (j.data ?? {}) as Record<string, unknown>;
      toast.success(tr("สร้าง Parent SKU แล้ว", "Parent SKU created"));
      onCreated({ id: String(row.id ?? ""), code: String(row.code ?? code.trim()), name: String(row.name_th ?? nameTh.trim()), image_key: (row.cover_image_r2_key as string | null) ?? null });
    } catch (e) { toast.error(e instanceof Error ? e.message : tr("สร้างไม่สำเร็จ", "Couldn't create")); }
    finally { setSaving(false); }
  };
  return (
    <ERPModal open onClose={() => !saving && onClose()} size="md" title={tr("＋ เพิ่ม Parent SKU", "＋ Add Parent SKU")}
      footer={<div className="flex justify-end gap-2 w-full">
        <button onClick={() => !saving && onClose()} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{tr("ยกเลิก", "Cancel")}</button>
        <button onClick={save} disabled={saving} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{saving ? tr("กำลังสร้าง…", "Creating…") : tr("สร้าง", "Create")}</button>
      </div>}>
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="text-xs text-slate-500">{tr("รหัส Parent SKU", "Parent SKU code")} *</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={tr("เช่น CVB16", "e.g. CVB16")} className="mt-0.5 w-full h-9 px-2 text-sm font-mono border border-slate-200 rounded-lg" /></label>
        <label className="block"><span className="text-xs text-slate-500">{tr("ชื่อสินค้า (ไทย)", "Product name (TH)")} *</span>
          <input value={nameTh} onChange={(e) => setNameTh(e.target.value)} className="mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg" /></label>
        <label className="block"><span className="text-xs text-slate-500">{tr("แบรนด์", "Brand")}</span>
          <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white">
            <option value="">{tr("— ไม่ระบุ —", "— None —")}</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select></label>
        <label className="block"><span className="text-xs text-slate-500">{tr("หมวดสินค้า", "Product family")}</span>
          <select value={family} onChange={(e) => setFamily(e.target.value)} className="mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white">
            {PARENT_FAMILIES.map(([v, th, en]) => <option key={v} value={v}>{tr(th, en)}</option>)}
          </select></label>
      </div>
      <p className="text-[11px] text-slate-400 mt-2">{tr("สร้างแล้วแก้รายละเอียดเพิ่ม (รูป/ราคา/แท็ก) ได้ที่ตัวแก้สินค้า", "Add more details (images/price/tags) in the product editor afterwards")}</p>
    </ERPModal>
  );
}
