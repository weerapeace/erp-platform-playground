"use client";

/**
 * ของกลาง — popup "รายละเอียดใบสั่งซื้อ" (PoDetailModal) + โหมดแก้ไข + ภาษีมูลค่าเพิ่ม
 *
 * เดิมฝังอยู่ในหน้าแดชบอร์ดจัดซื้อไฟล์เดียว พอหน้ารายการ PO ต้องใช้ด้วยจึงย้ายมาเป็นของกลาง
 * (กฎ CLAUDE.md: ใช้เกิน 1 ที่ = ต้องเป็นของกลาง แก้ที่เดียวทุกหน้าเปลี่ยนตาม)
 *
 * โหมดแก้ไข (2026-08-03 ตามที่เจ้าของขอ):
 *   - แก้หัวใบ: ร้าน · วันที่สั่ง · กำหนดของเข้า · หมายเหตุ
 *   - แก้รายการ: ชื่อ/จำนวน/หน่วย/ราคา · เพิ่ม/ลบบรรทัด
 *   - ปุ่มภาษี: ไม่มี VAT / VAT 7% (แยก "ราคารวม VAT แล้ว" กับ "ยังไม่รวม")
 *   บันทึกผ่าน PATCH /api/purchasing/po-edit (คิดยอดด้วยของกลาง lib/po-total + กันแก้ของที่รับมาแล้ว)
 *
 * ใช้ที่: /purchasing/dashboard (กดแถวในรายการ) · /purchasing/po-list (กดแถวในตาราง)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { HoverImage } from "@/components/hover-image";
import { apiFetch } from "@/lib/api";
import { computePoTotals } from "@/lib/po-total";
import type { PoDetail } from "@/app/api/purchasing/po-detail/route";

const baht = (n: number | null | undefined) => `฿${Math.round(Number(n ?? 0)).toLocaleString("th-TH")}`;
const thDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "—";
const isCNY = (c: unknown) => ["RMB", "YUAN", "CNY"].includes(String(c ?? "").toUpperCase());
const n2 = (s: string) => { const v = Number(s); return isFinite(v) ? v : 0; };
const fmt = (n: number) => Number(n || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });

type EditLine = { key: string; id?: string; name: string; qty: string; uom: string; price: string; received: number };
const newKey = () => `n${Math.random().toString(36).slice(2, 9)}`;

export function PoDetailModal({ poId, onClose, footer, onSaved }: {
  poId: string;
  onClose: () => void;
  /** ปุ่มเสริมท้าย popup (เช่น พิมพ์ / ส่งไลน์) — หน้าที่เรียกส่งเข้ามาเอง */
  footer?: React.ReactNode;
  /** เรียกหลังบันทึกแก้ไขสำเร็จ (ให้หน้าที่เรียกรีเฟรชตาราง) */
  onSaved?: () => void;
}) {
  const [d, setD] = useState<PoDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ---- ฟอร์มแก้ไข ----
  const [seller, setSeller] = useState("");
  const [orderDate, setOrderDate] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [note, setNote] = useState("");
  const [vatRate, setVatRate] = useState(0);
  const [vatIncluded, setVatIncluded] = useState(false);
  const [lines, setLines] = useState<EditLine[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`/api/purchasing/po-detail?id=${encodeURIComponent(poId)}`);
      const j = await r.json();
      setD((j.data ?? null) as PoDetail | null);
    } catch { setD(null); }
    finally { setLoading(false); }
  }, [poId]);

  useEffect(() => { void load(); }, [load]);

  /** เปิดโหมดแก้ไข → ถ่ายค่าปัจจุบันลงฟอร์ม */
  const startEdit = useCallback(() => {
    if (!d) return;
    setSeller(d.seller ?? "");
    setOrderDate(d.order_date ?? "");
    setExpectedDate(d.expected_date ?? "");
    setNote(d.note ?? "");
    setVatRate(d.vat_rate ?? 0);
    setVatIncluded(!!d.vat_included);
    setLines(d.lines.map((l) => ({
      key: newKey(), id: l.id, name: l.name, qty: String(l.qty),
      uom: l.uom ?? "", price: String(l.price || ""), received: l.received,
    })));
    setErr(null);
    setEditing(true);
  }, [d]);

  const sym = d && isCNY(d.currency) ? "¥" : "฿";
  const setLine = (key: string, patch: Partial<EditLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const totals = useMemo(
    () => computePoTotals(lines.reduce((a, l) => a + n2(l.qty) * n2(l.price), 0), vatRate, vatIncluded),
    [lines, vatRate, vatIncluded],
  );

  const save = useCallback(async () => {
    if (!d) return;
    setSaving(true); setErr(null);
    try {
      const res = await apiFetch("/api/purchasing/po-edit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          po_id: d.id,
          header: {
            seller_name: seller.trim(),
            order_date: orderDate || null,
            expected_date: expectedDate || null,
            note: note.trim() || null,
            vat_rate: vatRate,
            vat_included: vatIncluded,
          },
          lines: lines.filter((l) => l.name.trim() && n2(l.qty) > 0).map((l) => ({
            id: l.id, item_name: l.name.trim(), qty: n2(l.qty),
            uom: l.uom.trim() || null, price: n2(l.price),
          })),
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) { setErr(j.error ?? "บันทึกไม่สำเร็จ"); return; }
      setEditing(false);
      await load();
      onSaved?.();
    } catch { setErr("บันทึกไม่สำเร็จ — ลองใหม่อีกครั้ง"); }
    finally { setSaving(false); }
  }, [d, seller, orderDate, expectedDate, note, vatRate, vatIncluded, lines, load, onSaved]);

  const inp = "h-8 px-2 text-sm border border-slate-200 rounded-md";
  const lbl = "block text-[11px] font-medium text-slate-500 mb-0.5";

  return (
    <ERPModal
      open onClose={onClose} size="lg"
      title={d ? `📦 ใบสั่งซื้อ ${d.po_no}` : "รายละเอียดใบสั่งซื้อ"}
      description={d?.seller ? `🏪 ${d.seller}` : undefined}
      hasUnsavedChanges={editing}
      footer={
        <div className="flex items-center justify-between w-full gap-2">
          <div className="text-sm">
            {editing && (
              <span className="text-slate-600">
                รวม <b className="tabular-nums text-slate-900">{sym}{fmt(totals.total)}</b>
                {vatRate > 0 && <span className="text-slate-400"> (ก่อนภาษี {sym}{fmt(totals.subtotal)} + VAT {sym}{fmt(totals.vat)})</span>}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {editing ? (
              <>
                <button onClick={() => { setEditing(false); setErr(null); }}
                  className="h-9 px-4 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm">ยกเลิก</button>
                <button onClick={() => void save()} disabled={saving}
                  className="h-9 px-5 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-50">
                  {saving ? "กำลังบันทึก…" : "✓ บันทึกการแก้ไข"}
                </button>
              </>
            ) : (
              <>
                {d && (
                  <button onClick={startEdit}
                    className="h-9 px-4 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm hover:bg-slate-50">
                    ✎ แก้ไข
                  </button>
                )}
                {footer}
              </>
            )}
          </div>
        </div>
      }
    >
      {loading ? <div className="py-10 text-center text-sm text-slate-400">กำลังโหลด…</div>
        : !d ? <div className="py-10 text-center text-sm text-slate-400">ไม่พบใบสั่งซื้อ</div>
        : editing ? (
        // ---------------- โหมดแก้ไข ----------------
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="col-span-2"><label className={lbl}>ร้าน / ผู้จำหน่าย</label>
              <input value={seller} onChange={(e) => setSeller(e.target.value)} className={inp + " w-full"} /></div>
            <div><label className={lbl}>วันที่สั่ง</label>
              <input type="date" value={orderDate ? orderDate.slice(0, 10) : ""} onChange={(e) => setOrderDate(e.target.value)} className={inp + " w-full"} /></div>
            <div><label className={lbl}>กำหนดของเข้า</label>
              <input type="date" value={expectedDate ? expectedDate.slice(0, 10) : ""} onChange={(e) => setExpectedDate(e.target.value)} className={inp + " w-full"} /></div>
          </div>

          {/* ภาษี */}
          <div className="border border-slate-200 rounded-lg p-2.5">
            <div className="text-[11px] font-medium text-slate-500 mb-1.5">ภาษีมูลค่าเพิ่ม</div>
            <div className="flex flex-wrap items-center gap-1.5">
              {[0, 7].map((r) => (
                <button key={r} type="button" onClick={() => setVatRate(r)}
                  className={`h-8 px-3 text-sm rounded-md border ${vatRate === r
                    ? "bg-blue-50 border-blue-300 text-blue-700 font-medium" : "bg-white border-slate-200 text-slate-500"}`}>
                  {r === 0 ? "ไม่มีภาษี" : `VAT ${r}%`}
                </button>
              ))}
              <input type="number" step="any" value={vatRate === 0 || vatRate === 7 ? "" : String(vatRate)}
                onChange={(e) => setVatRate(n2(e.target.value))} placeholder="อื่น ๆ %"
                className={inp + " w-24 text-right tabular-nums"} />
              {vatRate > 0 && (
                <div className="flex gap-1 ml-1">
                  {[{ v: false, t: "ราคายังไม่รวม VAT" }, { v: true, t: "ราคารวม VAT แล้ว" }].map((o) => (
                    <button key={String(o.v)} type="button" onClick={() => setVatIncluded(o.v)}
                      className={`h-8 px-3 text-xs rounded-md border ${vatIncluded === o.v
                        ? "bg-emerald-50 border-emerald-300 text-emerald-700 font-medium" : "bg-white border-slate-200 text-slate-500"}`}>
                      {o.t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* รายการ */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="hidden sm:grid grid-cols-[1fr_70px_70px_90px_90px_32px] gap-2 px-2.5 py-1.5 bg-slate-50 text-[11px] font-medium text-slate-500">
              <div>สินค้า</div><div className="text-right">จำนวน</div><div>หน่วย</div>
              <div className="text-right">ราคา/หน่วย</div><div className="text-right">รวม</div><div />
            </div>
            <div className="divide-y divide-slate-100 max-h-[38vh] overflow-y-auto">
              {lines.map((l) => (
                <div key={l.key} className="grid grid-cols-2 sm:grid-cols-[1fr_70px_70px_90px_90px_32px] gap-2 px-2.5 py-1.5 items-center">
                  <input value={l.name} onChange={(e) => setLine(l.key, { name: e.target.value })}
                    className={inp + " col-span-2 sm:col-span-1 w-full"} placeholder="ชื่อสินค้า" />
                  <input type="number" step="any" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })}
                    className={inp + " w-full text-right tabular-nums"} />
                  <input value={l.uom} onChange={(e) => setLine(l.key, { uom: e.target.value })}
                    className={inp + " w-full"} placeholder="หน่วย" />
                  <input type="number" step="any" value={l.price} onChange={(e) => setLine(l.key, { price: e.target.value })}
                    className={inp + " w-full text-right tabular-nums"} placeholder="0" />
                  <div className="text-sm text-right tabular-nums text-slate-700">{sym}{fmt(n2(l.qty) * n2(l.price))}</div>
                  <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                    disabled={l.received > 0} title={l.received > 0 ? `รับของมาแล้ว ${l.received} — ลบไม่ได้` : "ลบรายการ"}
                    className="h-7 w-7 rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-25 disabled:hover:bg-transparent">🗑</button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setLines((ls) => [...ls, { key: newKey(), name: "", qty: "1", uom: "", price: "", received: 0 }])}
              className="w-full h-8 text-xs text-blue-600 hover:bg-blue-50 border-t border-slate-100">+ เพิ่มรายการ</button>
          </div>

          <div><label className={lbl}>หมายเหตุ</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} className={inp + " w-full"} placeholder="(ถ้ามี)" /></div>

          {lines.some((l) => l.received > 0) && (
            <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              ⚠️ ใบนี้รับของมาบางส่วนแล้ว — รายการที่รับแล้วลบไม่ได้ และตั้งจำนวนต่ำกว่าที่รับมาไม่ได้
            </div>
          )}
          {err && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-2 py-1.5">⚠️ {err}</div>}
        </div>
      ) : (
        // ---------------- โหมดดู ----------------
        <div className="space-y-3">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm bg-slate-50 rounded-lg px-3 py-2">
            <div><span className="text-slate-400">ยอดรวม (บาท) </span><b className="tabular-nums text-slate-800">{baht(d.amount_thb)}</b></div>
            {d.vat_rate > 0 && (
              <div className="text-slate-600">
                <span className="text-slate-400">ภาษี </span>VAT {d.vat_rate}%
                <span className="text-slate-400"> ({d.vat_included ? "รวมในราคาแล้ว" : "บวกเพิ่ม"}) </span>
                <span className="tabular-nums">{sym}{fmt(d.vat_amount)}</span>
              </div>
            )}
            {d.order_date && <div><span className="text-slate-400">วันที่สั่ง </span>{thDate(d.order_date)}</div>}
            {d.payment_status === "paid"
              ? <div className="text-emerald-700 font-medium">✓ จ่ายแล้ว {d.paid_date ? thDate(d.paid_date) : ""}{d.paid_amount_thb ? ` · ${baht(d.paid_amount_thb)}` : ""}</div>
              : <div className="text-rose-600 font-medium">● ยังไม่จ่าย{d.payment_due_date ? ` · ครบกำหนด ${thDate(d.payment_due_date)}` : ""}</div>}
            {d.expected_date && <div><span className="text-slate-400">ของเข้า </span>{thDate(d.expected_date)}</div>}
            <div><span className="text-slate-400">รายการ </span>{d.lines.length}</div>
          </div>
          {d.note && <div className="text-xs text-slate-500 px-1">📝 {d.note}</div>}
          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-[55vh] overflow-y-auto">
            {d.lines.length === 0 ? <div className="p-4 text-center text-sm text-slate-400">ไม่มีรายการสินค้า</div>
              : d.lines.map((l, i) => (
              <div key={i} className="flex items-center gap-3 p-2">
                <HoverImage url={l.img} size={40} previewSize={320} alt={l.name} fallback="📦" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-slate-700 truncate">{l.name || "—"}</div>
                  <div className="text-[11px] text-slate-400">
                    {l.sku ? <span className="font-mono">{l.sku} · </span> : null}
                    จำนวน {l.qty.toLocaleString("th-TH")}{l.uom ? ` ${l.uom}` : ""}
                    {l.received > 0 && <> · รับแล้ว {l.received.toLocaleString("th-TH")}</>}
                    {l.done ? <span className="text-emerald-600"> · ✓ รับครบ</span> : <span className="text-amber-600"> · ค้างรับ</span>}
                  </div>
                </div>
                <div className="text-sm tabular-nums text-slate-600 shrink-0">
                  {l.total > 0 ? `${sym}${Math.round(l.total).toLocaleString("th-TH")}` : <span className="text-amber-600 text-xs">⚠ ยังไม่มีราคา</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </ERPModal>
  );
}

export default PoDetailModal;
