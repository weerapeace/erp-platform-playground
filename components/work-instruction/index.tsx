"use client";

/**
 * WorkInstructionPanel — แผงรายละเอียดสั่งงาน (ของกลาง · อ่านอย่างเดียว · เฟส 1)
 *
 * ใช้ทำอะไร: รับรหัส SKU → ดึงสเปก/วิธีทำจาก Parent (read-through) มาแสดง
 *   - สเปกร่วม (Parent): attribute ระดับ model + ช่องเดิม (วัตถุดิบ/ซับใน/ซิป/ด้าย...) + โน้ตวิธีทำ + ขนาด
 *   - วัตถุดิบต่อสี/แบบ (SKU): attribute ระดับ sku
 * ใช้ที่ไหน: หน้าแก้ BOM, ใบสั่งผลิต (MO), ใบจ่ายงาน/พิมพ์ (ภายหลัง)
 * ไม่ทำ: ไม่แก้ข้อมูล (แก้ที่ทะเบียน Parent/attribute) — กันข้อมูลซ้ำ
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { ProductSpec, SpecField } from "@/app/api/product-spec/route";

function Row({ f }: { f: SpecField }) {
  return (
    <div className="flex gap-2 text-xs py-0.5">
      <span className="text-slate-400 w-24 shrink-0">{f.label}</span>
      <span className="text-slate-700 flex-1">{f.value}</span>
    </div>
  );
}

export function WorkInstructionPanel({ sku, className = "" }: { sku: string | null | undefined; className?: string }) {
  const [spec, setSpec] = useState<ProductSpec | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!sku) { setSpec(null); return; }
    let cancelled = false;
    setLoading(true);
    apiFetch(`/api/product-spec?sku=${encodeURIComponent(sku)}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setSpec(j as ProductSpec); })
      .catch(() => { if (!cancelled) setSpec(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sku]);

  if (!sku) return null;
  const empty = spec && !spec.parent && spec.legacy.length === 0 && spec.model_attrs.length === 0 && spec.sku_attrs.length === 0;
  const shared = [...(spec?.model_attrs ?? []), ...(spec?.legacy ?? [])];

  return (
    <div className={`border border-slate-200 rounded-lg bg-white ${className}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 rounded-t-lg">
        <span>📋 รายละเอียดสั่งงาน</span>
        <span className="text-slate-400 text-xs">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-100">
          {loading ? <div className="text-xs text-slate-400 py-3 text-center">กำลังโหลด…</div>
          : empty || !spec ? <div className="text-xs text-slate-300 py-3 text-center">ยังไม่มีรายละเอียดสั่งงานของสินค้านี้</div>
          : (
            <div className="space-y-2.5">
              {spec.parent && (
                <div className="flex gap-2 items-center">
                  {spec.parent.image_url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={spec.parent.image_url} alt="" className="w-12 h-12 rounded-md object-cover border border-slate-100" />}
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{spec.parent.name ?? spec.parent.code}</div>
                    {spec.parent.size_summary && <div className="text-[11px] text-slate-400">ขนาด: {spec.parent.size_summary}</div>}
                  </div>
                </div>
              )}

              {shared.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 mb-0.5">สเปกร่วม</div>
                  {shared.map((f, i) => <Row key={`m${i}`} f={f} />)}
                </div>
              )}

              {spec.sku_attrs.length > 0 && (
                <div className="pt-1 border-t border-slate-50">
                  <div className="text-[11px] font-semibold text-slate-500 mb-0.5">วัตถุดิบ/รายละเอียดของรุ่นสีนี้</div>
                  {spec.sku_attrs.map((f, i) => <Row key={`s${i}`} f={f} />)}
                </div>
              )}

              {spec.parent?.work_instruction_notes && (
                <div className="pt-1 border-t border-slate-50">
                  <div className="text-[11px] font-semibold text-slate-500 mb-0.5">วิธีทำ / หมายเหตุ</div>
                  <p className="text-xs text-slate-700 whitespace-pre-wrap">{spec.parent.work_instruction_notes}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
