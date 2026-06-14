"use client";

/**
 * ใบปะหน้ากล่อง (Carton Labels / Shipping Mark)
 *
 * - ฟอร์มหัว: จาก (default ISG) · ส่ง (เลือกลูกค้า/แก้ได้) · PO No. · STYLE NO. (เลือก SKU/แก้ได้) · COLOR (auto จาก SKU/แก้ได้)
 * - กรอกจำนวนทั้งหมด + จำนวนต่อกล่อง → แตกเป็นหลายกล่องอัตโนมัติ (กล่องสุดท้ายเป็นเศษ)
 * - Preview แก้ได้: เพิ่ม/ลบกล่อง + แก้จำนวนรายกล่อง + เตือนเมื่อรวมไม่ตรง (เกิน/ขาด)
 * - บันทึกไว้ใช้ซ้ำ + พิมพ์ A5 แนวนอน (กล่องละ 1 ใบ) ผ่าน /print/carton-label/[id]
 *
 * ใช้ของกลาง: CustomerPicker, SkuPicker, Toast · เก็บใน DB ผ่าน /api/carton-labels
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { CustomerPicker, SkuPicker } from "@/components/pickers";
import type { CustomerPickerValue, SkuPickerValue } from "@/components/pickers";
import { apiFetch } from "@/lib/api";
import type { CartonLabelRow, CartonItem } from "@/app/api/carton-labels/route";
import type { SODetail, SOLine, SOListItem } from "@/app/api/sales-orders/route";

const DEFAULT_FROM = "หจก. ไอ.เอส.จี เทรดดิ้ง";
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const N = (v: number | string) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

// แตกจำนวนทั้งหมด/ต่อกล่อง → รายการกล่อง (กล่องสุดท้าย = เศษ)
function autoSplit(total: number, per: number): CartonItem[] {
  if (per <= 0 || total <= 0) return [];
  const full = Math.floor(total / per);
  const rem = total - full * per;
  const arr: CartonItem[] = Array.from({ length: full }, () => ({ qty: per }));
  if (rem > 0) arr.push({ qty: rem });
  return arr;
}

type FormState = {
  from_text: string; to_text: string; customer_id: string | null;
  po_no: string; sku_id: string | null; style_no: string; color: string;
  total_qty: number; per_carton: number; cartons: CartonItem[];
};
const emptyForm = (): FormState => ({
  from_text: DEFAULT_FROM, to_text: "", customer_id: null,
  po_no: "", sku_id: null, style_no: "", color: "",
  total_qty: 0, per_carton: 0, cartons: [],
});

export default function CartonLabelsPage() {
  const toast = useToast();
  const [view, setView] = useState<"list" | "edit">("list");
  const [rows, setRows] = useState<CartonLabelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [customer, setCustomer] = useState<CustomerPickerValue | null>(null);
  const [sku, setSku] = useState<SkuPickerValue | null>(null);
  const [saving, setSaving] = useState(false);
  const [delId, setDelId] = useState<string | null>(null);
  // ดึงจากใบขาย (Sales Order)
  const [soOpen, setSoOpen] = useState(false);
  const [soRows, setSoRows] = useState<SOListItem[]>([]);
  const [soLoading, setSoLoading] = useState(false);
  const [soSearch, setSoSearch] = useState("");
  const [linePick, setLinePick] = useState<SODetail | null>(null);   // ใบที่มีหลายรายการ → ให้เลือก

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  // ── โหลดรายการที่บันทึกไว้ ──
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/carton-labels?search=${encodeURIComponent(search)}`);
      const j = await res.json();
      setRows(j.data ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [search]);
  useEffect(() => { if (view === "list") void load(); }, [view, load]);

  // ── เปิดสร้างใหม่ / เปิดแก้ ──
  const openNew = () => { setEditId(null); setForm(emptyForm()); setCustomer(null); setSku(null); setView("edit"); };
  const openEdit = async (id: string) => {
    try {
      const res = await apiFetch(`/api/carton-labels/${id}`); const j = await res.json();
      const d = j.data as CartonLabelRow;
      setEditId(id);
      setForm({
        from_text: d.from_text || DEFAULT_FROM, to_text: d.to_text ?? "", customer_id: d.customer_id,
        po_no: d.po_no ?? "", sku_id: d.sku_id, style_no: d.style_no ?? "", color: d.color ?? "",
        total_qty: d.total_qty, per_carton: d.per_carton, cartons: Array.isArray(d.cartons) ? d.cartons : [],
      });
      setCustomer(d.customer_id ? ({ id: d.customer_id, code: null, name: d.to_text ?? "" } as CustomerPickerValue) : null);
      setSku(d.sku_id ? ({ id: d.sku_id, code: "", name: d.style_no ?? "" } as SkuPickerValue) : null);
      setView("edit");
    } catch { toast.error("เปิดเอกสารไม่สำเร็จ"); }
  };

  // ── ดึงจากใบขาย (Sales Order) ──
  const loadSo = useCallback(async (q: string) => {
    setSoLoading(true);
    try { const res = await apiFetch(`/api/sales-orders?limit=300&search=${encodeURIComponent(q)}`); const j = await res.json(); setSoRows(j.data ?? []); }
    catch { /* ignore */ } finally { setSoLoading(false); }
  }, []);
  const openSo = () => { setSoSearch(""); setSoOpen(true); void loadSo(""); };
  const applyLine = (l: SOLine) => {
    setSku(l.product_id ? ({ id: l.product_id, code: l.sku ?? "", name: l.product_name } as SkuPickerValue) : null);
    setForm((f) => ({ ...f, sku_id: l.product_id ?? null, style_no: l.product_name || (l.sku ?? ""), total_qty: N(l.qty) }));
    setLinePick(null);
    toast.success("ดึงจากใบขายแล้ว — ใส่จำนวนต่อกล่องแล้วกดสร้างกล่อง");
  };
  const pickSo = async (id: string) => {
    try {
      const res = await apiFetch(`/api/sales-orders/${id}`); const j = await res.json();
      const d = j.data as SODetail;
      setCustomer(d.customer_id ? ({ id: d.customer_id, code: d.customer_code, name: d.customer_name ?? "" } as CustomerPickerValue) : null);
      setForm((f) => ({ ...f, customer_id: d.customer_id, to_text: d.customer_name ?? f.to_text }));
      setSoOpen(false);
      const lines = Array.isArray(d.lines) ? d.lines : [];
      if (lines.length === 1) applyLine(lines[0]);
      else if (lines.length > 1) setLinePick(d);
      else toast.success("ดึงลูกค้าจากใบขายแล้ว (ใบนี้ไม่มีรายการสินค้า)");
    } catch { toast.error("ดึงใบขายไม่สำเร็จ"); }
  };

  // ── เลือกลูกค้า/SKU → เติมค่าให้ (ยังแก้เองได้) ──
  const onPickCustomer = (v: CustomerPickerValue | null) => { setCustomer(v); set("customer_id", v?.id ?? null); if (v) set("to_text", v.name); };
  const onPickSku = (v: SkuPickerValue | null) => {
    setSku(v); set("sku_id", v?.id ?? null);
    if (v) { set("style_no", v.name || v.code); if (v.color) set("color", v.color); }
  };

  // ── รายการกล่อง ──
  const regenCartons = () => {
    const arr = autoSplit(N(form.total_qty), N(form.per_carton));
    if (arr.length === 0) { toast.error("กรอกจำนวนทั้งหมด + จำนวนต่อกล่องก่อน"); return; }
    set("cartons", arr);
  };
  const addCarton = () => set("cartons", [...form.cartons, { qty: N(form.per_carton) || 0 }]);
  const updCarton = (i: number, qty: number) => set("cartons", form.cartons.map((c, idx) => idx === i ? { qty } : c));
  const delCarton = (i: number) => set("cartons", form.cartons.filter((_, idx) => idx !== i));

  const cartonSum = useMemo(() => form.cartons.reduce((s, c) => s + N(c.qty), 0), [form.cartons]);
  const diff = N(form.total_qty) - cartonSum;   // >0 ขาด · <0 เกิน · 0 พอดี

  // ── บันทึก ──
  const save = async (): Promise<string | null> => {
    if (!form.style_no.trim()) { toast.error("กรอก STYLE NO. ก่อน"); return null; }
    if (form.cartons.length === 0) { toast.error("ยังไม่มีกล่อง — กดสร้างกล่องก่อน"); return null; }
    setSaving(true);
    try {
      const url = editId ? `/api/carton-labels/${editId}` : "/api/carton-labels";
      const method = editId ? "PATCH" : "POST";
      const res = await apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success("บันทึกแล้ว");
      const id = editId ?? j.id;
      setEditId(id);
      return id;
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); return null; }
    finally { setSaving(false); }
  };
  const saveAndBack = async () => { const id = await save(); if (id) setView("list"); };
  const saveAndPrint = async () => { const id = await save(); if (id) window.open(`/print/carton-label/${id}`, "_blank"); };

  const confirmDelete = async () => {
    if (!delId) return;
    try { const res = await apiFetch(`/api/carton-labels/${delId}`, { method: "DELETE" }); const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success("ลบแล้ว"); setDelId(null); await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); setDelId(null); }
  };

  // ───────────────────────── LIST ─────────────────────────
  if (view === "list") {
    return (
      <div className="max-w-[1100px] mx-auto px-5 py-5">
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">🏷️ ใบปะหน้ากล่อง</h1>
            <p className="text-sm text-slate-500 mt-0.5">สร้าง/พิมพ์ใบแปะหน้ากล่อง (Shipping Mark) · บันทึกไว้ใช้ซ้ำได้</p>
          </div>
          <button onClick={openNew} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">➕ สร้างใบปะหน้ากล่อง</button>
        </div>

        <div className="mb-3">
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="ค้นหา PO / STYLE / ผู้รับ…" className="w-full max-w-sm h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-[12px]">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">PO No.</th>
                <th className="px-3 py-2 font-medium">STYLE NO.</th>
                <th className="px-3 py-2 font-medium">ส่ง</th>
                <th className="px-3 py-2 font-medium text-right">รวม</th>
                <th className="px-3 py-2 font-medium text-right">กล่อง</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">กำลังโหลด…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">ยังไม่มีใบปะหน้ากล่อง — กด “สร้างใบปะหน้ากล่อง”</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-[12px]">{r.po_no || "—"}</td>
                  <td className="px-3 py-2">{r.style_no || "—"}</td>
                  <td className="px-3 py-2 text-slate-600 truncate max-w-[220px]">{r.to_text || "—"}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.total_qty)}</td>
                  <td className="px-3 py-2 text-right">{Array.isArray(r.cartons) ? r.cartons.length : 0}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(r.id)} className="text-[12px] px-2 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-white">เปิด</button>
                      <a href={`/print/carton-label/${r.id}`} target="_blank" rel="noreferrer" className="text-[12px] px-2 py-1 rounded-md border border-indigo-200 text-indigo-700 hover:bg-indigo-50">🖨️ พิมพ์</a>
                      <button onClick={() => setDelId(r.id)} className="text-[12px] px-2 py-1 rounded-md border border-slate-200 text-slate-400 hover:text-rose-600">🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {delId && (
          <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setDelId(null)}>
            <div className="bg-white rounded-xl shadow-xl p-5 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-semibold text-slate-800 mb-2">ลบใบปะหน้ากล่อง</h3>
              <p className="text-sm text-slate-600 mb-4">ต้องการลบรายการนี้ใช่ไหม</p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setDelId(null)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ยกเลิก</button>
                <button onClick={confirmDelete} className="h-9 px-4 text-sm bg-rose-600 text-white rounded-lg hover:bg-rose-700">ลบ</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ───────────────────────── EDITOR ─────────────────────────
  const inputCls = "w-full h-10 px-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500";
  return (
    <div className="max-w-[1100px] mx-auto px-5 py-5">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button onClick={() => setView("list")} className="h-9 px-3 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">← กลับ</button>
          <h1 className="text-xl font-semibold text-slate-800">{editId ? "แก้ใบปะหน้ากล่อง" : "สร้างใบปะหน้ากล่อง"}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={saveAndBack} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "💾 บันทึก"}</button>
          <button onClick={saveAndPrint} disabled={saving} className="h-9 px-4 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">🖨️ บันทึก & พิมพ์</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── ฟอร์มหัวเอกสาร ── */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold text-slate-700">ข้อมูลใบปะหน้ากล่อง</span>
            <button onClick={openSo} className="text-[12px] px-2.5 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50">📄 ดึงจากใบขาย</button>
          </div>
          <label className="block"><span className="text-[11px] text-slate-500">จาก</span>
            <input value={form.from_text} onChange={(e) => set("from_text", e.target.value)} className={inputCls} /></label>

          <div>
            <span className="text-[11px] text-slate-500">ส่ง (เลือกลูกค้า — แก้ได้)</span>
            <div className="mt-0.5"><CustomerPicker value={customer} onChange={onPickCustomer} /></div>
            <input value={form.to_text} onChange={(e) => set("to_text", e.target.value)} placeholder="ชื่อผู้รับ (พิมพ์/แก้ได้)" className={`${inputCls} mt-1.5`} />
          </div>

          <label className="block"><span className="text-[11px] text-slate-500">PO No.</span>
            <input value={form.po_no} onChange={(e) => set("po_no", e.target.value)} className={inputCls} /></label>

          <div>
            <span className="text-[11px] text-slate-500">STYLE NO. (เลือก SKU — แก้ได้)</span>
            <div className="mt-0.5"><SkuPicker value={sku} onChange={onPickSku} /></div>
            <input value={form.style_no} onChange={(e) => set("style_no", e.target.value)} placeholder="STYLE NO. (พิมพ์/แก้ได้)" className={`${inputCls} mt-1.5`} />
          </div>

          <label className="block"><span className="text-[11px] text-slate-500">COLOR (ดึงจาก SKU — แก้ได้)</span>
            <input value={form.color} onChange={(e) => set("color", e.target.value)} className={inputCls} /></label>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <label className="block"><span className="text-[11px] text-slate-500">จำนวนทั้งหมด</span>
              <input type="number" min={0} value={form.total_qty} onChange={(e) => set("total_qty", N(e.target.value))} className={`${inputCls} text-right`} /></label>
            <label className="block"><span className="text-[11px] text-slate-500">จำนวนต่อกล่อง</span>
              <input type="number" min={0} value={form.per_carton} onChange={(e) => set("per_carton", N(e.target.value))} className={`${inputCls} text-right`} /></label>
          </div>
          <button onClick={regenCartons} className="w-full h-9 text-sm font-medium border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-50">↻ สร้าง/คำนวณกล่องอัตโนมัติ</button>
        </div>

        {/* ── Preview กล่อง (แก้ได้) ── */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-slate-700">กล่องทั้งหมด ({form.cartons.length})</span>
            <button onClick={addCarton} className="text-[12px] px-2 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">+ เพิ่มกล่อง</button>
          </div>

          {/* แถบเตือนกันพลาด */}
          {form.cartons.length > 0 && (
            <div className={`text-[12px] rounded-lg px-3 py-2 mb-2 ${diff === 0 ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
              รวมในกล่อง {fmt(cartonSum)} / ทั้งหมด {fmt(N(form.total_qty))}
              {diff === 0 ? " · พอดี ✓" : diff > 0 ? ` · ⚠️ ขาดอีก ${fmt(diff)}` : ` · ⚠️ เกิน ${fmt(-diff)}`}
            </div>
          )}

          <div className="space-y-1.5 max-h-[420px] overflow-auto pr-1">
            {form.cartons.map((c, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5">
                <span className="text-[12px] text-slate-400 font-mono w-12">{i + 1}/{form.cartons.length}</span>
                <span className="text-[11px] text-slate-400 flex-1">CARTON NO.</span>
                <input type="number" min={0} value={c.qty} onChange={(e) => updCarton(i, N(e.target.value))}
                  className="w-24 h-8 px-2 text-right text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <span className="text-[11px] text-slate-400">pcs.</span>
                <button onClick={() => delCarton(i)} className="text-slate-400 hover:text-rose-600 px-1">✕</button>
              </div>
            ))}
            {form.cartons.length === 0 && <div className="text-center text-xs text-slate-400 py-10">ยังไม่มีกล่อง — กรอกจำนวนแล้วกด “สร้าง/คำนวณกล่อง”</div>}
          </div>

          {/* ตัวอย่างใบ (กล่องแรก) */}
          {form.cartons.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <div className="text-[11px] text-slate-400 mb-1.5">ตัวอย่างใบปะหน้ากล่อง (ใบที่ 1)</div>
              <div className="border-2 border-slate-300 rounded-lg p-3 text-[12px] leading-relaxed">
                <div className="grid grid-cols-[80px_1fr] gap-y-0.5">
                  {([
                    ["จาก", form.from_text],
                    ["ส่ง", form.to_text],
                    ["PO No.", form.po_no],
                    ["STYLE NO.", form.style_no],
                    ["COLOR", form.color],
                    ["QUANTITY", fmt(form.cartons[0].qty)],
                    ["CARTON NO.", `1/${form.cartons.length}`],
                  ] as [string, string][])
                    .filter(([, v]) => String(v ?? "").trim() !== "")
                    .map(([k, v]) => (
                      <div key={k} className="contents">
                        <span className="text-slate-500">{k}</span>
                        <span className="font-medium">{v}</span>
                      </div>
                    ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">* ฟิลด์ที่เว้นว่างจะไม่แสดงในใบพิมพ์</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ดึงจากใบขาย — เลือกใบ */}
      <ERPModal open={soOpen} onClose={() => setSoOpen(false)} size="lg" title="📄 ดึงจากใบขาย (Sales Order)"
        footer={<button onClick={() => setSoOpen(false)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ปิด</button>}>
        <div className="space-y-3">
          <input value={soSearch} onChange={(e) => setSoSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && loadSo(soSearch)}
            placeholder="ค้นหาเลขที่บิล / ลูกค้า… (กด Enter)" className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <div className="max-h-[55vh] overflow-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-[11px] text-slate-500"><tr className="text-left">
                <th className="px-3 py-2 font-medium">เลขที่บิล</th><th className="px-3 py-2 font-medium">ลูกค้า</th>
                <th className="px-3 py-2 font-medium text-right">รายการ</th><th className="px-3 py-2 font-medium text-right">ยอดรวม</th>
              </tr></thead>
              <tbody>
                {soLoading ? <tr><td colSpan={4} className="text-center py-10 text-slate-400">กำลังโหลด…</td></tr>
                : soRows.length === 0 ? <tr><td colSpan={4} className="text-center py-10 text-slate-400">ไม่พบใบขาย</td></tr>
                : soRows.map((r) => (
                  <tr key={r.id} onClick={() => pickSo(r.id)} className="border-t border-slate-100 hover:bg-indigo-50/60 cursor-pointer">
                    <td className="px-3 py-2 font-mono text-[12px]">{r.so_number ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-700">{r.customer_name ?? "—"}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{r.line_count}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-600">{fmt(r.grand_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </ERPModal>

      {/* ดึงจากใบขาย — เลือกรายการสินค้า (กรณีหลายรายการ) */}
      <ERPModal open={linePick !== null} onClose={() => setLinePick(null)} size="md" title="เลือกรายการสินค้าจากใบขาย"
        footer={<button onClick={() => setLinePick(null)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ยกเลิก</button>}>
        <div className="space-y-1.5">
          <p className="text-[12px] text-slate-500">ใบขายนี้มีหลายรายการ — เลือก 1 รายการเพื่อทำใบปะหน้ากล่อง</p>
          {(linePick?.lines ?? []).map((l, i) => (
            <button key={l.id ?? i} onClick={() => applyLine(l)}
              className="w-full text-left rounded-lg border border-slate-200 px-3 py-2 hover:border-indigo-300 hover:bg-indigo-50/40">
              <div className="text-sm font-medium text-slate-800">{l.product_name}</div>
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span className="font-mono">{l.sku ?? "—"}</span><span>จำนวน {fmt(N(l.qty))}</span>
              </div>
            </button>
          ))}
        </div>
      </ERPModal>
    </div>
  );
}
