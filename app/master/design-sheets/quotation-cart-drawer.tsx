"use client";

// ============================================================
// QuotationCartDrawer — ตะกร้าใบเสนอราคา (drawer ขอบขวา) สำหรับโมดูล Design Sheets
// "ตะกร้า" = ใบเสนอราคาร่าง 1 ใบที่ active (ตัวชี้เก็บใน localStorage ที่หน้าแม่)
// โผล่แถบขอบขวาเมื่อมีรายการ · กดเปิด drawer ดู/แก้จำนวน-ราคา/ลบบรรทัด/รวมยอด
// ของจริงอยู่ใน DB ระบบขาย → ดึง/แก้ผ่าน /api/quotations/[id] (GET/PATCH) เดิม
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import type { QuoteDetail, QuoteLine } from "@/app/api/quotations/route";

const baht = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function QuotationCartDrawer({
  cartId, refreshKey, onClear, onLabel,
}: {
  cartId: string | null;
  /** เปลี่ยนค่า = บังคับโหลดใหม่ (หลังเพิ่งหย่อนสินค้าเข้าตะกร้า) */
  refreshKey: number;
  /** ตะกร้าหมดอายุ/ถูกแปลงไปแล้ว หรือกด "เริ่มใบใหม่" → ล้างตัวชี้ */
  onClear: () => void;
  /** รายงาน label ตะกร้า (เลขที่ใบ · ลูกค้า) กลับไปให้หน้าแม่โชว์ในป๊อปส่ง */
  onLabel?: (label: string | null) => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!cartId) { setQuote(null); setLines([]); onLabel?.(null); return; }
    try {
      const res = await apiFetch(`/api/quotations/${cartId}`);
      const j = await res.json();
      const q = j.data as QuoteDetail | null;
      // ใบหาย / ไม่ใช่ร่างแล้ว (ออกใบ/แปลงเป็น SO) → ตะกร้าหมดอายุ
      if (j.error || !q || q.status !== "draft") { onClear(); onLabel?.(null); setQuote(null); setLines([]); return; }
      setQuote(q); setLines(q.lines ?? []); setDirty(false);
      onLabel?.(`${q.quote_number ?? "ร่าง"}${q.customer_name ? ` · ${q.customer_name}` : ""}`);
    } catch { /* เงียบไว้ ไม่รบกวน */ }
  }, [cartId, onClear, onLabel]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const setLine = (i: number, p: Partial<QuoteLine>) => { setLines((l) => l.map((x, idx) => (idx === i ? { ...x, ...p } : x))); setDirty(true); };
  const removeLine = (i: number) => { setLines((l) => l.filter((_, idx) => idx !== i)); setDirty(true); };

  const save = async () => {
    if (!cartId) return;
    setSaving(true);
    try {
      const payload = lines.map((l) => ({
        id: l.id, product_id: l.product_id ?? null, sku: l.sku, product_name: l.product_name,
        qty: Number(l.qty) || 0, unit: l.unit, unit_price: Number(l.unit_price) || 0,
        discount_type: l.discount_type, discount_value: l.discount_value, tax_code: l.tax_code ?? null, note: l.note ?? null,
      }));
      const res = await apiFetch(`/api/quotations/${cartId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines: payload }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success("บันทึกตะกร้าแล้ว");
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_price) || 0), 0);
  const count = lines.length;

  // ไม่มีตะกร้า / ไม่มีรายการ → ไม่โชว์อะไร
  if (!cartId || !quote || count === 0) return null;

  return (
    <>
      {/* แถบลอยขอบขวา (เมื่อปิด drawer) */}
      {!open && (
        <button onClick={() => setOpen(true)} title="เปิดตะกร้าใบเสนอราคา"
          className="fixed right-0 top-1/3 z-40 flex flex-col items-center gap-1 rounded-l-xl bg-indigo-600 px-2.5 py-3 text-white shadow-lg hover:bg-indigo-700">
          <span className="text-lg leading-none">🧺</span>
          <span className="text-xs font-semibold">{count}</span>
        </button>
      )}

      {/* backdrop + drawer */}
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setOpen(false)} />
          <div className="fixed right-0 top-0 z-50 flex h-full w-[380px] max-w-[92vw] flex-col bg-white shadow-2xl">
            {/* หัว */}
            <div className="flex items-start justify-between gap-2 border-b border-slate-200 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-slate-800">🧺 ตะกร้าใบเสนอราคา</div>
                <div className="text-xs text-slate-500">{quote.quote_number ?? "(ร่าง)"} · {quote.customer_name ?? "ไม่ระบุลูกค้า"}</div>
              </div>
              <button onClick={() => setOpen(false)} className="h-7 w-7 rounded-lg text-slate-400 hover:bg-slate-100">✕</button>
            </div>

            {/* รายการ */}
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
              {lines.map((l, i) => (
                <div key={l.id ?? i} className="rounded-lg border border-slate-200 p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-slate-800">{l.product_name}</div>
                      {l.note && <div className="truncate text-xs text-slate-400">ตัวเลือก: {l.note}</div>}
                    </div>
                    <button onClick={() => removeLine(i)} title="ลบรายการ" className="h-6 w-6 shrink-0 rounded text-rose-500 hover:bg-rose-50">🗑</button>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <input type="number" min={0} step="any" value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })}
                      title="จำนวน" className="h-7 w-16 rounded border border-slate-200 px-1.5 text-right text-sm" />
                    <span className="text-xs text-slate-400">×</span>
                    <input type="number" min={0} step="any" value={l.unit_price} onChange={(e) => setLine(i, { unit_price: Number(e.target.value) })}
                      title="ราคา/หน่วย" className="h-7 w-24 rounded border border-slate-200 px-1.5 text-right text-sm" />
                    <span className="ml-auto text-sm font-medium tabular-nums text-slate-700">{baht((Number(l.qty) || 0) * (Number(l.unit_price) || 0))}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* ท้าย */}
            <div className="border-t border-slate-200 px-4 py-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">รวม {count} รายการ</span>
                <span className="text-base font-semibold tabular-nums text-slate-900">{baht(total)} ฿</span>
              </div>
              {dirty && (
                <button onClick={() => void save()} disabled={saving}
                  className="h-9 w-full rounded-lg bg-blue-600 text-sm text-white hover:bg-blue-700 disabled:opacity-50">{saving ? "กำลังบันทึก..." : "💾 บันทึกการแก้ไข"}</button>
              )}
              <div className="flex gap-2">
                <a href="/quotations" target="_blank" rel="noreferrer"
                  className="flex h-9 flex-1 items-center justify-center rounded-lg border border-indigo-300 text-sm text-indigo-700 hover:bg-indigo-50">เปิดใบเต็มในระบบขาย ↗</a>
                <button onClick={() => { onClear(); setOpen(false); toast.success("ล้างตะกร้าแล้ว (ใบยังอยู่ในระบบขาย)"); }}
                  className="h-9 rounded-lg border border-slate-300 px-3 text-sm text-slate-600 hover:bg-slate-50">เริ่มใบใหม่</button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
