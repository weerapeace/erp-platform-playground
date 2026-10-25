"use client";

/**
 * ของกลาง — "สินค้าตัวนี้ ใบสั่งผลิตไหนยังไม่ได้ขอซื้อ ขาดเท่าไร" (เลือกเป็นเหตุผลขอซื้อได้)
 * ใช้ในป๊อป "เพิ่มลงใบขอซื้อ" (/purchasing) แต่เสียบที่ไหนก็ได้ที่มีรหัสสินค้า
 *
 *   const shortage = useMoShortage(sku.code);
 *   <MoShortageList shortage={shortage} uom={sku.uom} value={moPicks} onChange={(picks, total) => ...} />
 *
 * ข้อมูลจาก /api/mo/purchase-needs?code= (ต้องซื้อ − ขอซื้อไปแล้ว ต่อใบ · ใบที่ขอครบแล้วแยกเป็น covered_mos)
 * ติ๊กใบงาน → ส่งรายการใบที่เลือก + ยอดขาดรวม (ปัดขึ้น 2 ตำแหน่ง กันซื้อขาด) กลับไปให้หน้าที่ใช้
 * ใช้ใน 2 ป๊อป: "เพิ่มลงใบขอซื้อ" (การ์ดสินค้า) + "เพิ่มวัตถุดิบลงใบขอซื้อ" (แท็บใบสั่งผลิต — ส่ง excludeMo/sameSku)
 * ใบที่สูตรใช้ต่อชิ้นสูงผิดปกติ → ป้ายเตือน + ไม่ถูกติ๊กตอน "เลือกทั้งหมด"
 * ของกลางที่ใช้: apiFetch · HoverImage (รูปสินค้าของใบงาน)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { HoverImage } from "@/components/hover-image";
import type { PurchaseNeedRow, PurchaseNeedMo } from "@/app/api/mo/purchase-needs/route";

export type MoPick = { no: string; label: string };
export type MoShortage = { row: PurchaseNeedRow | null; loading: boolean; error: boolean; reload: () => void };

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });
/** ปัดขึ้น 2 ตำแหน่ง — ยอดที่จะใส่ช่องจำนวน (7.1111 → 7.12 ไม่ให้ซื้อขาด) */
export const ceil2 = (n: number) => Math.ceil(Math.round(n * 10000) / 100) / 100;
export const moPickOf = (m: PurchaseNeedMo): MoPick => ({ no: m.mo_no, label: m.product_label ? `${m.mo_no} · ${m.product_label}` : m.mo_no });

/** โหลดใบงานที่ยังขาดสินค้าตัวนี้ (code ว่าง = ไม่โหลด) */
export function useMoShortage(code: string | null | undefined): MoShortage {
  const [row, setRow] = useState<PurchaseNeedRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!code) { setRow(null); return; }
    let alive = true;
    setLoading(true); setError(false);
    apiFetch(`/api/mo/purchase-needs?code=${encodeURIComponent(code)}`).then((r) => r.json())
      .then((j) => { if (alive) setRow(((j.data ?? []) as PurchaseNeedRow[])[0] ?? null); })
      .catch(() => { if (alive) setError(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [code, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { row, loading, error, reload };
}

/** ใบงานที่ยังขาด เรียง: ใกล้ครบกำหนดก่อน → ขาดเยอะก่อน */
export function shortMos(row: PurchaseNeedRow | null): PurchaseNeedMo[] {
  return [...(row?.mos ?? [])].sort((a, b) =>
    (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31") || b.needed - a.needed || a.mo_no.localeCompare(b.mo_no));
}

/**
 * ใบที่ "ใช้ต่อชิ้นสูงผิดปกติ" (มากกว่า 10 เท่าของค่ากลางในกลุ่ม) — มักเป็นสูตรผลิตที่ใส่ตัวเลขผิด
 * ของจริง: ผ้า RFID0001 ใบส่วนใหญ่ใช้ 0.02–0.06 หลา/ชิ้น แต่ 13 ใบใส่ 3–4 หลา/ชิ้น → ต้องซื้อพองเป็น 1,443 หลา (จริง ~54)
 */
export function oddMos(mos: PurchaseNeedMo[]): Set<string> {
  const per = mos.map((m) => m.qty_per).filter((n) => n > 0).sort((a, b) => a - b);
  if (per.length < 3) return new Set();
  const median = per[Math.floor(per.length / 2)];
  return new Set(mos.filter((m) => m.qty_per > median * 10).map((m) => m.mo_no));
}

export function MoShortageList({ shortage, uom, value, onChange, excludeMo, sameSku }: {
  shortage: MoShortage;
  /** หน่วยของสินค้า (เทียบกับหน่วยในสูตรผลิต ถ้าไม่ตรงจะเตือน) */
  uom: string;
  /** ใบสั่งผลิตที่เลือกอยู่ (อาจมีใบอื่นที่ไม่อยู่ในรายการนี้ปนอยู่ — คงไว้ไม่แตะ) */
  value: MoPick[];
  /** picks = รายการใหม่ทั้งหมด · total = ยอดขาดรวมของใบที่ติ๊กในรายการนี้ */
  onChange: (picks: MoPick[], total: number) => void;
  /** ไม่โชว์ใบนี้ในรายการ (เช่น ใบที่เปิดอยู่ในป๊อป — โชว์แยกไว้ด้านบนแล้ว) */
  excludeMo?: string | null;
  /** รหัสสินค้าของใบที่เปิดอยู่ → ใบ "รุ่นเดียวกัน" ขึ้นก่อน + ติดป้าย */
  sameSku?: string | null;
}) {
  const { row, loading, error, reload } = shortage;
  const list = useMemo(() => {
    const l = shortMos(row).filter((m) => m.mo_no !== excludeMo);
    return sameSku ? [...l.filter((m) => m.product_label === sameSku), ...l.filter((m) => m.product_label !== sameSku)] : l;
  }, [row, excludeMo, sameSku]);
  const odd = useMemo(() => oddMos(list), [list]);
  const [q, setQ] = useState("");
  const ql = q.trim().toLowerCase();
  const shown = ql ? list.filter((m) => m.mo_no.toLowerCase().includes(ql) || m.product_label.toLowerCase().includes(ql)) : list;
  const covered = (row?.covered_mos ?? []).filter((c) => c.mo_no !== excludeMo);
  const coveredQty = covered.reduce((n, c) => n + c.requested, 0);
  const listNos = useMemo(() => new Set(list.map((m) => m.mo_no)), [list]);
  const picked = new Set(value.map((v) => v.no));
  const unit = row?.uom || uom;

  const emit = (nos: Set<string>) => {
    const others = value.filter((v) => !listNos.has(v.no));   // ใบที่เลือกจากช่อง "ใบอื่น" — คงไว้
    const chosen = list.filter((m) => nos.has(m.mo_no));
    onChange([...chosen.map(moPickOf), ...others], ceil2(chosen.reduce((n, m) => n + m.needed, 0)));
  };
  const toggle = (no: string) => { const n = new Set([...picked].filter((x) => listNos.has(x))); if (n.has(no)) n.delete(no); else n.add(no); emit(n); };
  // "เลือกทั้งหมด" = ทุกใบที่เห็นอยู่ ยกเว้นใบที่สูตรผิดปกติ (กันสั่งพองเป็นพันหน่วยโดยไม่ตั้งใจ — ติ๊กเองทีละใบได้)
  const bulk = shown.filter((m) => !odd.has(m.mo_no));
  const allOn = bulk.length > 0 && bulk.every((m) => picked.has(m.mo_no));
  const toggleAll = () => {
    const n = new Set([...picked].filter((x) => listNos.has(x)));
    for (const m of bulk) { if (allOn) n.delete(m.mo_no); else n.add(m.mo_no); }
    emit(n);
  };

  if (loading && !row) return <div className="text-xs text-slate-400 py-3">กำลังดูใบงานที่ยังขาดสินค้าตัวนี้…</div>;
  if (error) return (
    <div className="text-xs text-rose-600 py-2 flex items-center gap-2">
      โหลดใบงานที่ยังขาดไม่สำเร็จ <button type="button" onClick={reload} className="underline">ลองใหม่</button>
    </div>
  );
  if (list.length === 0 && covered.length === 0) {
    return <div className="text-xs text-slate-400 py-2">ไม่มีใบสั่งผลิตที่เปิดอยู่ใช้สินค้าตัวนี้ในสูตร — เลือกใบอื่นด้านล่างได้</div>;
  }
  return (
    <div className="space-y-1.5">
      {row?.uom && uom && row.uom !== uom && (
        <div className="text-[11px] bg-amber-50 text-amber-700 border border-amber-200 rounded-md px-2 py-1">
          ⚠️ หน่วยในสูตรผลิตคือ <b>{row.uom}</b> แต่สินค้าตั้งไว้เป็น <b>{uom}</b> — ยอดที่ขาดด้านล่างนับเป็น {row.uom}
        </div>
      )}
      {list.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-slate-500">ใบงาน{excludeMo ? "อื่น" : ""}ที่ยังไม่ได้ขอซื้อตัวนี้ <b className="text-slate-700">{list.length}</b> ใบ</span>
            <button type="button" onClick={toggleAll} disabled={bulk.length === 0} className="text-blue-600 hover:underline disabled:text-slate-300 disabled:no-underline"
              title={odd.size ? "ไม่รวมใบที่ใช้ต่อชิ้นผิดปกติ (ติ๊กเองได้)" : undefined}>
              {allOn ? "ไม่เลือกทั้งหมด" : odd.size ? "เลือกทั้งหมด (ยกเว้นที่ผิดปกติ)" : "เลือกทั้งหมด"}
            </button>
          </div>
          {list.length > 8 && (
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นรหัสรุ่น / เลขใบงาน…"
              className="w-full h-8 px-2.5 text-xs border border-slate-200 rounded-md" />
          )}
          <div className="border border-slate-200 rounded-md divide-y divide-slate-100 max-h-60 overflow-auto">
            {shown.length === 0 && <div className="px-3 py-3 text-xs text-slate-400">ไม่พบใบงานที่ตรงกับ “{q}”</div>}
            {shown.map((m) => {
              const on = picked.has(m.mo_no);
              const isOdd = odd.has(m.mo_no);
              return (
                <button key={m.mo_no} type="button" onClick={() => toggle(m.mo_no)}
                  className={`w-full text-left px-2.5 py-2 flex items-center gap-2.5 hover:bg-slate-50 ${on ? "bg-blue-50/60" : ""}`}>
                  <span className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center text-[10px] font-bold ${on ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 text-transparent"}`}>✓</span>
                  {/* รูปสินค้าของใบงาน — ชี้เมาส์ดูรูปใหญ่ · แตะรูป = เต็มจอ (ไม่ติ๊กแถว) */}
                  <HoverImage url={m.product_image} size={36} previewSize={224} alt={m.product_label} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-700">
                      {m.mo_no}
                      {sameSku && m.product_label === sameSku && <span className="ml-1.5 text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded px-1.5 py-0.5">รุ่นเดียวกัน</span>}
                    </span>
                    <span className="block text-xs text-slate-500 truncate">
                      {m.product_label}{m.mo_qty ? ` · สั่งผลิต ${fmt(m.mo_qty)} ชิ้น` : ""}{m.requested > 0 ? ` · ขอไปแล้ว ${fmt(m.requested)}` : ""}
                    </span>
                    {isOdd && <span className="block text-[11px] text-amber-600">⚠️ ใช้ {fmt(m.qty_per)} {unit}/ชิ้น สูงผิดปกติ — เช็กสูตรผลิตก่อน</span>}
                  </span>
                  <span className="text-right shrink-0">
                    <span className={`block text-sm font-semibold tabular-nums ${isOdd ? "text-amber-600" : "text-rose-600"}`}>ขาด {fmt(m.needed)}</span>
                    <span className="block text-[11px] text-slate-400">{unit}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
      {covered.length > 0 && (
        <div className="text-[11px] text-slate-500" title={covered.map((c) => `${c.mo_no} · ${c.product_label} · ขอแล้ว ${fmt(c.requested)} ${unit}`).join("\n")}>
          <span className="text-emerald-600">✓</span> ขอซื้อไปแล้ว {covered.length} ใบ รวม {fmt(coveredQty)} {unit} ({covered.map((c) => c.mo_no).join(", ")}) — ไม่ต้องขอซ้ำ
        </div>
      )}
    </div>
  );
}
