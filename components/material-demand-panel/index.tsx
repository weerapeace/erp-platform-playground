"use client";

/**
 * ของกลาง — "วัตถุดิบตัวนี้ ใบงานไหนรออยู่บ้าง / พอไหม / ไม่พอกดขอซื้อ"
 * ใช้ตอนรับของเข้า (/purchasing/receive) เป็นหลัก แต่เสียบหน้าไหนก็ได้ที่มีรหัสวัตถุดิบ
 *
 *   <MaterialDemandPanel code="ZIP-001" uom="เส้น" incomingQty={100} />
 *
 * แสดง: รวมต้องใช้ · ของที่กำลังจะรับ · ยังขาดเท่าไร + รายการใบงาน (ใกล้ครบกำหนดก่อน)
 *       + ปุ่ม 🛒 ใส่ตะกร้าขอซื้อส่วนที่ขาด (ของกลาง lib/pr-cart)
 * ของกลางที่ใช้: apiFetch · useToast · HoverImage · addToPrCart
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { HoverImage } from "@/components/hover-image";
import { addToPrCart } from "@/lib/pr-cart";
import type { MaterialDemand } from "@/app/api/mo/material-demand/route";

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const dueText = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short" }) : "—");
const dueCls = (d: string | null) => {
  if (!d) return "text-slate-400";
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const days = Math.floor((new Date(d + "T00:00:00").getTime() - t.getTime()) / 86400000);
  return days < 0 ? "text-rose-600 font-semibold" : days < 3 ? "text-amber-600 font-semibold" : "text-slate-500";
};

export function MaterialDemandPanel({
  code, uom, incomingQty = 0, compact = false,
}: {
  /** รหัสวัตถุดิบ (component_sku / skus_v2.code) */
  code: string | null | undefined;
  uom?: string | null;
  /** จำนวนที่กำลังจะรับเข้ารอบนี้ — ใช้คำนวณว่า "พอไหม" */
  incomingQty?: number;
  compact?: boolean;
}) {
  const toast = useToast();
  const [d, setD] = useState<MaterialDemand | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(!compact);

  useEffect(() => {
    if (!code) { setD(null); return; }
    let on = true;
    setLoading(true);
    apiFetch(`/api/mo/material-demand?code=${encodeURIComponent(code)}`)
      .then((r) => r.json())
      .then((j) => { if (on) setD((j?.data?.[code] ?? null) as MaterialDemand | null); })
      .catch(() => { if (on) setD(null); })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [code]);

  if (!code) return null;
  if (loading && !d) return <div className="mt-3 text-[11px] text-slate-400">กำลังตรวจว่าใบงานไหนรอของนี้…</div>;
  if (!d) return null;

  const unit = uom || d.uom || "";
  const shortAfter = Math.max(0, Math.round((d.total_short - incomingQty) * 100) / 100);
  const enough = d.total_short > 0 && shortAfter === 0;

  if (d.mo_count === 0) {
    return (
      <div className="mt-3 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-[11px] text-slate-500">
        ℹ️ ตอนนี้<b>ไม่มีใบสั่งผลิตที่รอวัตถุดิบตัวนี้</b> — รับเข้าเก็บสต๊อกได้เลย
      </div>
    );
  }

  const addShortToCart = () => {
    const qty = Math.max(1, Math.ceil(shortAfter || d.total_short));
    const n = addToPrCart([{
      label: `[${d.code}] ${d.component_name ?? ""}`.trim(),
      qty, uom: unit, seller: "", price: 0, currency: "THB",
      image: null, variationId: null, skuRef: d.code, skuId: null,
      note: `ขาดจาก ${d.mo_count} ใบสั่งผลิต (${d.mos.filter((m) => !m.is_ready).slice(0, 5).map((m) => m.mo_no).join(", ")})`,
      reason: "รับของแล้วยังไม่พอตามใบสั่งผลิต",
      sourceMoNo: d.mos.find((m) => !m.is_ready)?.mo_no ?? null,
    }]);
    toast.success(`ใส่ตะกร้าขอซื้อแล้ว ${fmt(qty)} ${unit} (ตะกร้ามี ${n} รายการ) — ไปกดยืนยันที่หน้า “ขอซื้อ”`);
  };

  return (
    <div className={`mt-3 rounded-lg border ${enough ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/50"}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full text-left px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-700">🧵 ใบงานที่รอวัตถุดิบนี้ ({d.mo_count} ใบ)</span>
          <div className="flex-1" />
          <span className="text-[10px] text-slate-400">{open ? "▲ ย่อ" : "▼ กาง"}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[11px]">
          <span className="text-slate-600">ต้องใช้รวม <b className="text-slate-900">{fmt(d.total_required)}</b> {unit}</span>
          <span className="text-slate-600">ยังขาด <b className="text-rose-600">{fmt(d.total_short)}</b></span>
          {incomingQty > 0 && <span className="text-slate-600">รับรอบนี้ <b className="text-blue-700">{fmt(incomingQty)}</b></span>}
          {incomingQty > 0 && (enough
            ? <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">✓ รับแล้วครบพอดี</span>
            : <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">รับแล้วยังขาดอีก {fmt(shortAfter)} {unit}</span>)}
        </div>
      </button>

      {open && (
        <div className="px-2 pb-2 space-y-1">
          {d.mos.map((m) => (
            <div key={m.mo_id} className={`flex items-center gap-2 px-2 py-1.5 rounded-md bg-white border ${m.is_ready ? "border-slate-100 opacity-60" : "border-slate-200"}`}>
              <HoverImage url={m.image} size={28} />
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-medium text-slate-800 truncate">{m.product_sku} <span className="text-slate-400 font-normal">· {m.product_name}</span></div>
                <div className="text-[10px] text-slate-400 font-mono">{m.mo_no} · ผลิต {fmt(m.mo_qty)} ชิ้น</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[11px] tabular-nums text-slate-700">ใช้ <b>{fmt(m.required)}</b> {unit}</div>
                <div className={`text-[10px] ${dueCls(m.due_date)}`}>📅 {dueText(m.due_date)}</div>
              </div>
              <div className="shrink-0 w-[64px] text-right">
                {m.is_ready
                  ? <span className="text-[10px] text-emerald-600">เตรียมครบ ✓</span>
                  : <span className="text-[10px] text-rose-600">ขาด {fmt(m.short)}</span>}
              </div>
            </div>
          ))}

          {(shortAfter > 0 || (incomingQty === 0 && d.total_short > 0)) && (
            <button type="button" onClick={addShortToCart}
              className="w-full h-8 text-[11px] font-medium rounded-md border border-indigo-200 text-indigo-700 bg-white hover:bg-indigo-50">
              🛒 ใส่ตะกร้าขอซื้อส่วนที่ขาด ({fmt(shortAfter || d.total_short)} {unit})
            </button>
          )}
          <p className="text-[10px] text-slate-400 px-1">
            เรียงใบที่ใกล้ครบกำหนดก่อน · “ขาด” = ต้องใช้ − จำนวนที่บันทึกว่ามีแล้วในใบนั้น · รับของเสร็จอย่าลืมไปติ๊ก “เตรียมแล้ว” ให้ใบที่ได้ของ
          </p>
        </div>
      )}
    </div>
  );
}
