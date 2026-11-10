"use client";

// 🏠 ช่องที่อยู่ (ผู้รับ/ผู้ส่ง) ของศูนย์ออเดอร์ — พิมพ์ตำบลหรือรหัสไปรษณีย์ แล้วเลือก → อำเภอ/จังหวัด/รหัสไปรษณีย์เติมให้เอง
// ข้อมูลค้นที่อยู่: /api/public/address/search (ของกลาง lib/thai-address-search ตัวเดียวกับเว็บร้าน) · ไม่เจอ = พิมพ์เองได้เสมอ
// ใช้ที่: สร้างออเดอร์เอง · แผนรายละเอียดออเดอร์ (แก้ที่อยู่ผู้รับ) · ตั้งค่าจุดส่งของ

import { useEffect, useRef, useState } from "react";
import { ERPInput } from "@/components/form";
import type { ShipTo } from "@/lib/order-shipping";

type Hit = { subdistrict: string; district: string; province: string; postal: string };

export function ShipToFields({ value, onChange, disabled, nameLabel = "ชื่อผู้รับ" }: { value: ShipTo; onChange: (v: ShipTo) => void; disabled?: boolean; nameLabel?: string }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const seq = useRef(0);
  const set = (p: Partial<ShipTo>) => onChange({ ...value, ...p });

  useEffect(() => {
    const s = q.trim();
    if (s.length < 2) { setHits([]); return; }
    const n = ++seq.current;
    const t = setTimeout(() => {
      fetch(`/api/public/address/search?q=${encodeURIComponent(s)}&limit=8`).then((r) => r.json())
        .then((j: { results?: Hit[] }) => { if (n === seq.current) { setHits(j.results ?? []); setOpen(true); } })
        .catch(() => { /* ค้นไม่ได้ก็พิมพ์เองได้ */ });
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const pick = (h: Hit) => { set({ subdistrict: h.subdistrict, district: h.district, province: h.province, postal: h.postal }); setQ(""); setHits([]); setOpen(false); };
  const lbl = "mb-1 block text-xs text-slate-500";

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block"><span className={lbl}>{nameLabel}</span><ERPInput value={value.name} disabled={disabled} onChange={(e) => set({ name: e.target.value })} placeholder="สมชาย ใจดี" /></label>
      <label className="block"><span className={lbl}>เบอร์โทร</span><ERPInput value={value.phone} disabled={disabled} inputMode="tel" onChange={(e) => set({ phone: e.target.value })} placeholder="081-234-5678" /></label>
      <label className="block sm:col-span-2"><span className={lbl}>บ้านเลขที่ / ถนน / หมู่บ้าน</span><ERPInput value={value.address} disabled={disabled} onChange={(e) => set({ address: e.target.value })} placeholder="99/1 ซ.สุขุมวิท 21 ถ.สุขุมวิท" /></label>
      {!disabled && (
        <div className="relative sm:col-span-2">
          <span className={lbl}>ค้นตำบล หรือรหัสไปรษณีย์ (เลือกแล้วเติมช่องด้านล่างให้)</span>
          <ERPInput value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => hits.length && setOpen(true)} placeholder="เช่น สีลม หรือ 10500" />
          {open && hits.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
              {hits.map((h, i) => (
                <button key={i} type="button" onClick={() => pick(h)} className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50">
                  {h.subdistrict} › {h.district} › {h.province} <span className="text-slate-400">{h.postal}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <label className="block"><span className={lbl}>ตำบล / แขวง</span><ERPInput value={value.subdistrict} disabled={disabled} onChange={(e) => set({ subdistrict: e.target.value })} /></label>
      <label className="block"><span className={lbl}>อำเภอ / เขต</span><ERPInput value={value.district} disabled={disabled} onChange={(e) => set({ district: e.target.value })} /></label>
      <label className="block"><span className={lbl}>จังหวัด</span><ERPInput value={value.province} disabled={disabled} onChange={(e) => set({ province: e.target.value })} /></label>
      <label className="block"><span className={lbl}>รหัสไปรษณีย์</span><ERPInput value={value.postal} disabled={disabled} inputMode="numeric" maxLength={5} onChange={(e) => set({ postal: e.target.value })} /></label>
    </div>
  );
}
