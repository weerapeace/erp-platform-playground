"use client";

// ⚙️ ตั้งค่าการส่ง (จุดส่งของต่อแบรนด์) — ชื่อ/ที่อยู่ผู้ส่งบนใบปะหน้า · กล่อง/น้ำหนักตั้งต้น · ขนส่งที่ใช้บ่อย
// ข้อมูล: /api/shipping-profiles (ตาราง shipping_profiles) · กุญแจ SHIPPOP ยังไม่อยู่ที่นี่ (ขั้น 2)

import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { ERPInput, ERPSelect } from "@/components/form";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { SHIPPOP_COURIERS } from "@/lib/shippop";
import { EMPTY_SHIP_TO, type ShipTo } from "@/lib/order-shipping";
import { ShipToFields } from "./ship-to-fields";

type Profile = { sender_name: string | null; sender_phone: string | null; sender_address: string | null; sender_subdistrict: string | null; sender_district: string | null; sender_province: string | null; sender_postal: string | null; default_box: string; default_weight_g: number; default_courier: string | null };

export function ShippingProfileModal({ brands, defaultBrandId, canManage, onClose }: { brands: { id: string; name: string }[]; defaultBrandId: string; canManage: boolean; onClose: () => void }) {
  const toast = useToast();
  const [brandId, setBrandId] = useState(defaultBrandId || brands[0]?.id || "");
  const [sender, setSender] = useState<ShipTo>(EMPTY_SHIP_TO);
  const [box, setBox] = useState("20x30x10");
  const [weight, setWeight] = useState("500");
  const [courier, setCourier] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!brandId) return;
    let live = true;
    setLoading(true); setErr(null);
    apiFetch(`/api/shipping-profiles?brand_id=${encodeURIComponent(brandId)}`).then((r) => r.json()).then((j: { profile?: Profile | null; error?: string }) => {
      if (!live) return;
      const p = j.profile;
      setSender({ name: p?.sender_name ?? brands.find((b) => b.id === brandId)?.name ?? "", phone: p?.sender_phone ?? "", address: p?.sender_address ?? "", subdistrict: p?.sender_subdistrict ?? "", district: p?.sender_district ?? "", province: p?.sender_province ?? "", postal: p?.sender_postal ?? "" });
      setBox(p?.default_box ?? "20x30x10"); setWeight(String(p?.default_weight_g ?? 500)); setCourier(p?.default_courier ?? "");
      setDirty(false);
    }).catch(() => live && setErr("โหลดไม่สำเร็จ")).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [brandId, brands]);

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const j = await apiFetch("/api/shipping-profiles", { method: "PATCH", body: JSON.stringify({
        brand_id: brandId, sender_name: sender.name, sender_phone: sender.phone, sender_address: sender.address, sender_subdistrict: sender.subdistrict,
        sender_district: sender.district, sender_province: sender.province, sender_postal: sender.postal, default_box: box, default_weight_g: Number(weight) || 0, default_courier: courier || null,
      }) }).then((r) => r.json());
      if (j.error) { setErr(j.error); return; }
      toast.success("บันทึกจุดส่งของแล้ว"); setDirty(false); onClose();
    } catch { setErr("บันทึกไม่สำเร็จ กรุณาลองใหม่"); } finally { setBusy(false); }
  };

  return (
    <ERPModal open onClose={onClose} title="ตั้งค่าการส่ง (จุดส่งของ)" description="ชื่อ/ที่อยู่ผู้ส่งที่พิมพ์บนใบปะหน้า และส่งให้ขนส่งตอนเรียกเข้ารับ — ตั้งแยกต่อแบรนด์" size="lg" defaultExpanded={false} hasUnsavedChanges={dirty} storageKey="platform-order-ship-profile"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <div className="min-w-0 flex-1">{err && <p role="alert" className="text-[13px] text-rose-600">{err}</p>}</div>
          <button onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50">ปิด</button>
          {canManage && <button onClick={() => void save()} disabled={busy || loading || !brandId} className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{busy ? "กำลังบันทึก…" : "บันทึก"}</button>}
        </div>
      }>
      <div className="space-y-5 text-sm">
        <label className="block max-w-xs"><span className="mb-1 block text-xs text-slate-500">แบรนด์</span>
          <ERPSelect value={brandId} onChange={(e) => setBrandId(e.target.value)} options={brands.map((b) => ({ value: b.id, label: b.name }))} placeholder="เลือกแบรนด์" />
        </label>
        {loading ? <p className="py-6 text-center text-slate-400">กำลังโหลด…</p> : (
          <>
            <div>
              <p className="mb-2 text-xs font-medium text-slate-700">ผู้ส่ง</p>
              <ShipToFields value={sender} onChange={(v) => { setSender(v); setDirty(true); }} disabled={!canManage} nameLabel="ชื่อผู้ส่ง (บนใบปะหน้า)" />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block"><span className="mb-1 block text-xs text-slate-500">กล่องตั้งต้น กว้างxยาวxสูง (ซม.)</span><ERPInput value={box} disabled={!canManage} onChange={(e) => { setBox(e.target.value); setDirty(true); }} placeholder="20x30x10" /></label>
              <label className="block"><span className="mb-1 block text-xs text-slate-500">น้ำหนักต่อชิ้นตั้งต้น (กรัม)</span><ERPInput value={weight} disabled={!canManage} inputMode="numeric" onChange={(e) => { setWeight(e.target.value); setDirty(true); }} /></label>
              <label className="block"><span className="mb-1 block text-xs text-slate-500">ขนส่งที่ใช้บ่อย</span>
                <ERPSelect value={courier} disabled={!canManage} onChange={(e) => { setCourier(e.target.value); setDirty(true); }} options={[{ value: "", label: "— ให้เลือกทุกครั้ง —" }, ...SHIPPOP_COURIERS.map((c) => ({ value: c.code, label: c.label }))]} />
              </label>
            </div>
            <p className="text-xs text-slate-500">น้ำหนักต่อชิ้นตั้งต้น ใช้กับสินค้าที่ยังไม่ได้ใส่น้ำหนักในข้อมูลสินค้า (Parent SKU)</p>
          </>
        )}
      </div>
    </ERPModal>
  );
}
