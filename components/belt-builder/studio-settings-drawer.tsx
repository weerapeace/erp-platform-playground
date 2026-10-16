"use client";

/**
 * Drawer "ตั้งค่าร้าน" ของสตูดิโอ — แก้เฉพาะกลุ่ม 🧵 ในข้อมูลร้าน (store_settings ผ่าน /api/website/settings PUT patch)
 *   เปิดใช้บนเว็บ · ราคาฐาน (MoneyInput) · ค่าสลักชื่อ (MoneyInput) · สลักได้กี่ตัวอักษร · ระยะเวลาทำ
 * ช่องเดียวกับหน้า "ข้อมูลร้าน" ในตัวจัดหน้าเว็บ → แก้ที่ไหนก็เห็นตรงกัน
 */
import { useEffect, useState } from "react";
import { Drawer } from "@/components/modal";
import { MoneyInput } from "@/components/money-input";
import { useToast } from "@/components/toast";
import { patchShopInfo, type BeltShopInfo } from "./studio-data";

export function ShopSettingsDrawer({ open, onClose, shopId, info, canEdit, onSaved }: {
  open: boolean;
  onClose: () => void;
  shopId: string;
  info: BeltShopInfo | null;
  canEdit: boolean;
  onSaved: (next: BeltShopInfo) => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<BeltShopInfo | null>(info);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setForm(info); }, [open, info]);

  const dirty = !!form && !!info && JSON.stringify(form) !== JSON.stringify(info);
  const set = <K extends keyof BeltShopInfo>(k: K, v: BeltShopInfo[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = async () => {
    if (!form || !info || !dirty || saving) return;
    const patch: Partial<BeltShopInfo> = {};
    (Object.keys(form) as (keyof BeltShopInfo)[]).forEach((k) => { if (form[k] !== info[k]) (patch as Record<string, unknown>)[k] = form[k]; });
    setSaving(true);
    try {
      await patchShopInfo(shopId, patch);
      toast.success("บันทึกตั้งค่าร้านแล้ว — เว็บลูกค้าจะใช้ค่าใหม่ทันที");
      onSaved(form);
      onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const inp = "w-full rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50";
  const lab = "mb-0.5 block text-xs font-medium text-slate-600";
  const hint = "mt-0.5 text-[11px] text-slate-400";

  return (
    <Drawer open={open} onClose={onClose} title="⚙ ตั้งค่าร้าน — ออกแบบเข็มขัด" size="md" hasUnsavedChanges={dirty}
      description="ราคาฐาน / ค่าสลักชื่อ / ระยะเวลาทำ ที่เว็บลูกค้าใช้คิดราคา (ช่องเดียวกับ ข้อมูลร้าน → 🧵)"
      footer={canEdit ? (
        <div className="flex w-full items-center gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">ยกเลิก</button>
          <button type="button" onClick={save} disabled={!dirty || saving} className="ml-auto rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40">{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
        </div>
      ) : undefined}>
      {!form ? <div className="text-sm text-slate-500">กำลังโหลด…</div> : (
        <div className="space-y-4">
          <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-emerald-600" checked={form.belt_enabled} disabled={!canEdit} onChange={(e) => set("belt_enabled", e.target.checked)} />
            <span><b className="font-medium text-slate-800">เปิดออกแบบเข็มขัดบนเว็บ</b><div className={hint}>ต้องมีสายหนัง + หัวเข็มขัด ที่เปิดอยู่อย่างน้อยอย่างละ 1 ชิ้น ไม่งั้นเว็บยังไม่โชว์</div></span>
          </label>
          <div>
            <label className={lab}>ราคาฐานเข็มขัด (฿) *</label>
            <MoneyInput value={form.belt_base_price} disabled={!canEdit} className={`${inp} text-lg font-semibold tabular-nums`} placeholder="เช่น 1,500" onChange={(raw) => set("belt_base_price", Number(raw) || 0)} />
            <div className={hint}>ราคาเริ่มต้นก่อนบวกราคาเพิ่มของแต่ละชิ้น · <b className="text-red-600">0 = ยังไม่ตั้ง เว็บจะโชว์ &quot;สอบถามราคา&quot;</b></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lab}>ค่าสลักชื่อ (฿)</label>
              <MoneyInput value={form.belt_engraving_fee} disabled={!canEdit} className={inp} placeholder="0" onChange={(raw) => set("belt_engraving_fee", Number(raw) || 0)} />
              <div className={hint}>บวกเมื่อลูกค้าพิมพ์ชื่อ · 0 = ฟรี</div>
            </div>
            <div>
              <label className={lab}>สลักได้สูงสุด (ตัวอักษร)</label>
              <input type="number" min={0} max={30} className={inp} value={form.belt_engraving_max} disabled={!canEdit} onChange={(e) => set("belt_engraving_max", Math.max(0, Math.min(30, Number(e.target.value) || 0)))} />
              <div className={hint}>แนะนำ 12 · 0 = ปิดสลักชื่อ</div>
            </div>
          </div>
          <div>
            <label className={lab}>ระยะเวลาทำ (ข้อความโชว์ใต้ราคา)</label>
            <input className={inp} value={form.belt_lead_time} disabled={!canEdit} placeholder="ทำ 7–10 วันทำการ" onChange={(e) => set("belt_lead_time", e.target.value)} />
          </div>
        </div>
      )}
    </Drawer>
  );
}
