"use client";

// ➕ สร้างออเดอร์เอง (ลูกค้าสั่งทาง LINE แชต / Facebook / IG / โทร) → ส่งของผ่าน SHIPPOP ได้ทันที
// บันทึก: POST /api/platform-orders (source=manual) · ที่อยู่ = ShipToFields · สินค้า = SkuPicker กลาง

import { useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { ERPInput, ERPSelect, ERPTextarea } from "@/components/form";
import { SkuPicker, type SkuPickerValue } from "@/components/pickers";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { EMPTY_SHIP_TO, OPEN_MANUAL_CHANNELS, cleanShipTo, type ShipTo } from "@/lib/order-shipping";
import { ShipToFields } from "./ship-to-fields";

type Line = { sku: SkuPickerValue | null; name: string; qty: string; price: string };
const NEW_LINE: Line = { sku: null, name: "", qty: "1", price: "" };
const money = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ManualOrderModal({ brands, defaultBrandId, onClose, onCreated }: {
  brands: { id: string; name: string }[]; defaultBrandId: string; onClose: () => void; onCreated: (id: string) => void;
}) {
  const toast = useToast();
  const [channel, setChannel] = useState("line_oa");
  const [brandId, setBrandId] = useState(defaultBrandId || brands[0]?.id || "");
  const [shipTo, setShipTo] = useState<ShipTo>(EMPTY_SHIP_TO);
  const [lines, setLines] = useState<Line[]>([{ ...NEW_LINE }]);
  const [cod, setCod] = useState(false);
  const [codAmount, setCodAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const touch = () => { setDirty(true); setErr(null); };

  const total = useMemo(() => lines.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.price) || 0), 0), [lines]);
  const setLine = (i: number, p: Partial<Line>) => { setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l))); touch(); };

  const save = async () => {
    if (!brandId) return setErr("เลือกแบรนด์");
    const st = cleanShipTo(shipTo);
    if (!st.ok) return setErr(st.error);
    const items = lines.filter((l) => l.sku || l.name.trim()).map((l) => ({ sku_id: l.sku?.id ?? null, sku_code: l.sku?.code ?? null, name: (l.name || l.sku?.name || "").trim(), qty: Number(l.qty) || 0, price: Number(l.price) || 0 }));
    if (!items.length) return setErr("เพิ่มสินค้าอย่างน้อย 1 รายการ");
    const bad = items.find((i) => !i.name || i.qty <= 0);
    if (bad) return setErr(`รายการ "${bad.name || "?"}" ต้องมีชื่อและจำนวนมากกว่า 0`);
    setBusy(true); setErr(null);
    try {
      const j = await apiFetch("/api/platform-orders", { method: "POST", body: JSON.stringify({ channel, brand_id: brandId, ship_to: st.value, items, cod_amount: cod ? Number(codAmount || total) || 0 : 0, note }) }).then((r) => r.json());
      if (j.error) { setErr(j.error); return; }
      toast.success(`สร้างออเดอร์ ${j.order_no} แล้ว`);
      setDirty(false);
      onCreated(String(j.id));
    } catch { setErr("สร้างออเดอร์ไม่สำเร็จ กรุณาลองใหม่"); } finally { setBusy(false); }
  };

  return (
    <ERPModal open onClose={onClose} title="สร้างออเดอร์เอง" description="ลูกค้าสั่งทาง LINE แชต / Facebook / IG / โทร — สร้างแล้วกดจัดส่งผ่าน SHIPPOP ได้เลย" size="lg" hasUnsavedChanges={dirty} storageKey="platform-order-manual"
      footer={
        <div className="flex w-full items-center gap-2">
          <span className="shrink-0 text-sm text-slate-600">รวม <b className="text-slate-900">฿{money(total)}</b></span>
          <div className="min-w-0 flex-1">{err && <p role="alert" className="text-right text-[13px] text-rose-600">{err}</p>}</div>
          <button onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50">ยกเลิก</button>
          <button onClick={() => void save()} disabled={busy} className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{busy ? "กำลังบันทึก…" : "สร้างออเดอร์"}</button>
        </div>
      }>
      <div className="space-y-5 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1 block text-xs text-slate-500">ลูกค้าสั่งทาง</span>
            <ERPSelect value={channel} onChange={(e) => { setChannel(e.target.value); touch(); }} options={OPEN_MANUAL_CHANNELS.map((c) => ({ value: c.code, label: c.label }))} />
          </label>
          <label className="block"><span className="mb-1 block text-xs text-slate-500">แบรนด์ (ใช้จุดส่งของของแบรนด์นี้)</span>
            <ERPSelect value={brandId} onChange={(e) => { setBrandId(e.target.value); touch(); }} options={brands.map((b) => ({ value: b.id, label: b.name }))} placeholder="เลือกแบรนด์" />
          </label>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-slate-700">ผู้รับ</p>
          <ShipToFields value={shipTo} onChange={(v) => { setShipTo(v); touch(); }} />
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-slate-700">สินค้า</p>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.4fr)_70px_90px_32px] items-center gap-2">
                <SkuPicker value={l.sku} salesOnly onChange={(v) => setLine(i, { sku: v, name: v?.name ?? l.name, price: l.price || (v?.list_price != null ? String(v.list_price) : "") })} />
                <ERPInput value={l.name} onChange={(e) => setLine(i, { name: e.target.value })} placeholder="ชื่อสินค้า" />
                <ERPInput value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} inputMode="numeric" aria-label="จำนวน" />
                <ERPInput value={l.price} onChange={(e) => setLine(i, { price: e.target.value })} inputMode="decimal" placeholder="ราคา/ชิ้น" aria-label="ราคาต่อชิ้น" />
                <button type="button" onClick={() => { setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : [{ ...NEW_LINE }])); touch(); }} className="h-9 w-8 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-rose-600" aria-label="ลบรายการ"><Icon value="i:trash" /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => { setLines((ls) => [...ls, { ...NEW_LINE }]); touch(); }} className="mt-2 inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs text-slate-700 hover:bg-slate-50"><Icon value="i:plus" />เพิ่มสินค้า</button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2"><input type="checkbox" checked={cod} onChange={(e) => { setCod(e.target.checked); touch(); }} />เก็บเงินปลายทาง</label>
          {cod && <label className="block"><span className="mb-1 block text-xs text-slate-500">ยอดที่ขนส่งต้องเก็บ (บาท)</span><ERPInput value={codAmount} onChange={(e) => { setCodAmount(e.target.value); touch(); }} inputMode="decimal" placeholder={money(total)} /></label>}
          <label className="block sm:col-span-2"><span className="mb-1 block text-xs text-slate-500">หมายเหตุ (ถ้ามี)</span><ERPTextarea value={note} onChange={(e) => { setNote(e.target.value); touch(); }} rows={2} /></label>
        </div>
      </div>
    </ERPModal>
  );
}
