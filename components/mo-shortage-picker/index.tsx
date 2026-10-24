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

export function MoShortageList({ shortage, uom, value, onChange }: {
  shortage: MoShortage;
  /** หน่วยของสินค้า (เทียบกับหน่วยในสูตรผลิต ถ้าไม่ตรงจะเตือน) */
  uom: string;
  /** ใบสั่งผลิตที่เลือกอยู่ (อาจมีใบอื่นที่ไม่อยู่ในรายการนี้ปนอยู่ — คงไว้ไม่แตะ) */
  value: MoPick[];
  /** picks = รายการใหม่ทั้งหมด · total = ยอดขาดรวมของใบที่ติ๊กในรายการนี้ */
  onChange: (picks: MoPick[], total: number) => void;
}) {
  const { row, loading, error, reload } = shortage;
  const list = useMemo(() => shortMos(row), [row]);
  const covered = row?.covered_mos ?? [];
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
  const allOn = list.length > 0 && list.every((m) => picked.has(m.mo_no));
  const toggleAll = () => emit(allOn ? new Set() : new Set(list.map((m) => m.mo_no)));

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
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">ใบงานที่ยังไม่ได้ขอซื้อตัวนี้ <b className="text-slate-700">{list.length}</b> ใบ</span>
            <button type="button" onClick={toggleAll} className="text-blue-600 hover:underline">{allOn ? "ไม่เลือกทั้งหมด" : "เลือกทั้งหมด"}</button>
          </div>
          <div className="border border-slate-200 rounded-md divide-y divide-slate-100 max-h-60 overflow-auto">
            {list.map((m) => {
              const on = picked.has(m.mo_no);
              return (
                <button key={m.mo_no} type="button" onClick={() => toggle(m.mo_no)}
                  className={`w-full text-left px-2.5 py-2 flex items-center gap-2.5 hover:bg-slate-50 ${on ? "bg-blue-50/60" : ""}`}>
                  <span className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center text-[10px] font-bold ${on ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 text-transparent"}`}>✓</span>
                  {/* รูปสินค้าของใบงาน — ชี้เมาส์ดูรูปใหญ่ · แตะรูป = เต็มจอ (ไม่ติ๊กแถว) */}
                  <HoverImage url={m.product_image} size={36} previewSize={224} alt={m.product_label} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-700">{m.mo_no}</span>
                    <span className="block text-xs text-slate-500 truncate">
                      {m.product_label}{m.mo_qty ? ` · สั่งผลิต ${fmt(m.mo_qty)} ชิ้น` : ""}{m.requested > 0 ? ` · ขอไปแล้ว ${fmt(m.requested)}` : ""}
                    </span>
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block text-sm font-semibold text-rose-600 tabular-nums">ขาด {fmt(m.needed)}</span>
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
