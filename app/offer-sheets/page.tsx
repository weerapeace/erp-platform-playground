"use client";

/**
 * รายการสินค้าเสนอลูกค้า B2B 🌸 — App "งานอื่นๆ"
 *
 * - เลือกลูกค้า (CustomerPicker) + เลือกสินค้า (SkuPicker) เพิ่มลงตาราง
 * - ดึงราคาขายอัตโนมัติ ปรับได้รายแถว · บันทึกลง DB
 * - ทุกข้อมูลผ่าน API กลาง /api/offer-sheets (ไม่ query Supabase ตรง)
 *
 * เปิดที่ /offer-sheets (หรือในแอปเดี่ยว /app/misc)
 */

import { useCallback, useEffect, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import {
  SkuPicker, type SkuPickerValue,
  CustomerPicker, type CustomerPickerValue,
} from "@/components/pickers";
import type { OfferItem, OfferListItem } from "@/app/api/offer-sheets/route";

// ============================================================
// helpers
// ============================================================

const money = (n: number) =>
  Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const imgUrl = (key: string | null | undefined) =>
  key ? `/api/r2-image?key=${encodeURIComponent(key)}` : null;

const today = () => new Date().toISOString().slice(0, 10);

const STATUS_LABEL: Record<string, string> = { draft: "ฉบับร่าง", sent: "ส่งแล้ว" };

// ============================================================
// page
// ============================================================

export default function OfferSheetsPage() {
  const { can } = useAuth();
  const canView = can("offers.view");
  const canEdit = can("offers.edit");

  const [view, setView] = useState<"list" | "edit">("list");
  const [editingId, setEditingId] = useState<string | null>(null);

  if (!canView) {
    return (
      <PlaygroundShell>
        <div className="p-10 text-center text-slate-500">
          <div className="text-4xl mb-2">🔒</div>
          คุณไม่มีสิทธิ์ดูรายการสินค้าเสนอ (offers.view)
        </div>
      </PlaygroundShell>
    );
  }

  return (
    <PlaygroundShell>
      <div className="min-h-full bg-gradient-to-b from-pink-50 to-rose-50/40">
        {view === "list" ? (
          <OfferList
            canEdit={canEdit}
            onNew={() => { setEditingId(null); setView("edit"); }}
            onOpen={(id) => { setEditingId(id); setView("edit"); }}
          />
        ) : (
          <OfferEditor
            id={editingId}
            canEdit={canEdit}
            onBack={() => setView("list")}
          />
        )}
      </div>
    </PlaygroundShell>
  );
}

// ============================================================
// List
// ============================================================

function OfferList({ canEdit, onNew, onOpen }: {
  canEdit: boolean;
  onNew: () => void;
  onOpen: (id: string) => void;
}) {
  const [rows, setRows] = useState<OfferListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await apiFetch(`/api/offer-sheets?search=${encodeURIComponent(search)}`);
      const j = await res.json();
      if (j.error) setErr(j.error); else setRows(j.data ?? []);
    } catch { setErr("โหลดข้อมูลไม่สำเร็จ"); }
    setLoading(false);
  }, [search]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const del = async (id: string, label: string) => {
    if (!confirm(`ลบใบเสนอ "${label}" ?\nการลบนี้กู้คืนไม่ได้`)) return;
    const res = await apiFetch(`/api/offer-sheets/${id}`, { method: "DELETE" });
    const j = await res.json();
    if (j.error) alert("ลบไม่สำเร็จ: " + j.error); else load();
  };

  return (
    <div className="max-w-6xl mx-auto p-5 sm:p-8">
      {/* หัวข้อ */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-rose-600 flex items-center gap-2">🌸 รายการสินค้าเสนอลูกค้า</h1>
          <p className="text-sm text-rose-400 mt-0.5">รวมสินค้าเป็นใบเสนอน่ารัก ๆ ส่งให้ลูกค้า B2B</p>
        </div>
        {canEdit && (
          <button onClick={onNew}
            className="h-11 px-5 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 text-white font-semibold shadow-lg shadow-pink-200 hover:from-pink-600 hover:to-rose-600 transition">
            + สร้างใบเสนอ
          </button>
        )}
      </div>

      {/* ค้นหา */}
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 ค้นหา เลขที่ / ชื่อเรื่อง / ลูกค้า..."
        className="w-full sm:w-96 h-11 px-4 rounded-full border border-pink-200 bg-white/80 focus:border-pink-400 focus:ring-2 focus:ring-pink-100 outline-none mb-5 text-sm" />

      {/* ตาราง */}
      <div className="bg-white rounded-2xl border border-pink-100 shadow-sm overflow-hidden">
        {err && <div className="p-4 text-sm text-red-500 bg-red-50">{err}</div>}
        {loading ? (
          <div className="p-10 text-center text-pink-300 text-sm">กำลังโหลด…</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-pink-300">
            <div className="text-4xl mb-2">🛍️</div>
            <div className="text-sm">ยังไม่มีใบเสนอ — กด “สร้างใบเสนอ” เพื่อเริ่ม</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-pink-50 text-rose-500 text-left">
                <th className="px-4 py-3 font-semibold">เลขที่</th>
                <th className="px-4 py-3 font-semibold">ชื่อเรื่อง</th>
                <th className="px-4 py-3 font-semibold">ลูกค้า</th>
                <th className="px-4 py-3 font-semibold text-center">วันที่</th>
                <th className="px-4 py-3 font-semibold text-center">รายการ</th>
                <th className="px-4 py-3 font-semibold text-right">ยอดรวม</th>
                <th className="px-4 py-3 font-semibold text-center">สถานะ</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-pink-50 hover:bg-pink-50/40 cursor-pointer" onClick={() => onOpen(r.id)}>
                  <td className="px-4 py-3 font-mono text-xs text-rose-500">{r.offer_no ?? "—"}</td>
                  <td className="px-4 py-3 font-medium text-slate-700">{r.title || <span className="text-slate-300">(ไม่มีชื่อ)</span>}</td>
                  <td className="px-4 py-3 text-slate-600">{r.customer_name ?? "—"}</td>
                  <td className="px-4 py-3 text-center text-slate-500">{r.offer_date}</td>
                  <td className="px-4 py-3 text-center text-slate-500">{r.item_count}</td>
                  <td className="px-4 py-3 text-right font-semibold text-rose-600">{money(r.grand_total)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${r.status === "sent" ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"}`}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    {canEdit && (
                      <button onClick={() => del(r.id, r.title || r.offer_no || "")}
                        className="text-slate-300 hover:text-red-500 text-lg" title="ลบ">🗑️</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Editor
// ============================================================

function OfferEditor({ id, canEdit, onBack }: {
  id: string | null;
  canEdit: boolean;
  onBack: () => void;
}) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [customer, setCustomer] = useState<CustomerPickerValue | null>(null);
  const [offerDate, setOfferDate] = useState(today());
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("draft");
  const [items, setItems] = useState<OfferItem[]>([]);

  // โหลดใบเดิม
  useEffect(() => {
    if (!id) return;
    let alive = true;
    (async () => {
      const res = await apiFetch(`/api/offer-sheets/${id}`);
      const j = await res.json();
      if (!alive || !j.data) { setLoading(false); return; }
      const d = j.data;
      setTitle(d.title ?? "");
      setOfferDate(d.offer_date ?? today());
      setNote(d.note ?? "");
      setStatus(d.status ?? "draft");
      setItems((d.items ?? []) as OfferItem[]);
      if (d.customer_id) setCustomer({ id: d.customer_id, code: null, name: d.customer_name ?? "" });
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [id]);

  const addSku = (sku: SkuPickerValue | null) => {
    if (!sku) return;
    setItems((prev) => [...prev, {
      sku_id: sku.id, sku_code: sku.code, name: sku.name,
      image_r2_key: sku.image_key ?? null, uom_name: sku.uom_name ?? null,
      unit_price: Number(sku.list_price ?? 0), qty: 1, note: null, sort_order: prev.length,
    }]);
  };

  const patchItem = (i: number, patch: Partial<OfferItem>) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const grandTotal = items.reduce((s, it) => s + Number(it.unit_price || 0) * Number(it.qty || 0), 0);

  const save = async () => {
    setSaving(true);
    const body = JSON.stringify({
      title, customer_id: customer?.id ?? null, customer_name: customer?.name ?? null,
      offer_date: offerDate, note, status, items, actorName: user?.name ?? null,
    });
    const res = id
      ? await apiFetch(`/api/offer-sheets/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body })
      : await apiFetch(`/api/offer-sheets`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    const j = await res.json();
    setSaving(false);
    if (j.error) { alert("บันทึกไม่สำเร็จ: " + j.error); return; }
    onBack();
  };

  if (loading) return <div className="p-10 text-center text-pink-300 text-sm">กำลังโหลด…</div>;

  return (
    <div className="max-w-5xl mx-auto p-5 sm:p-8">
      {/* แถบบน */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <button onClick={onBack} className="text-rose-500 hover:text-rose-600 text-sm font-medium">← กลับ</button>
        {canEdit && (
          <button onClick={save} disabled={saving}
            className="h-11 px-6 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 text-white font-semibold shadow-lg shadow-pink-200 hover:from-pink-600 hover:to-rose-600 disabled:opacity-50 transition">
            {saving ? "กำลังบันทึก…" : "💾 บันทึก"}
          </button>
        )}
      </div>

      {/* หัวเอกสาร */}
      <div className="bg-white rounded-2xl border border-pink-100 shadow-sm p-5 sm:p-6 mb-5">
        <h2 className="text-lg font-bold text-rose-600 mb-4 flex items-center gap-2">🌸 ข้อมูลใบเสนอ</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="ชื่อเรื่อง">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น สินค้าแนะนำเดือนนี้"
              className="w-full h-10 px-3 rounded-lg border border-pink-200 focus:border-pink-400 focus:ring-2 focus:ring-pink-100 outline-none text-sm" />
          </Field>
          <Field label="ลูกค้า">
            <CustomerPicker value={customer} onChange={setCustomer} />
          </Field>
          <Field label="วันที่">
            <input type="date" value={offerDate} onChange={(e) => setOfferDate(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-pink-200 focus:border-pink-400 focus:ring-2 focus:ring-pink-100 outline-none text-sm" />
          </Field>
          <Field label="สถานะ">
            <select value={status} onChange={(e) => setStatus(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-pink-200 focus:border-pink-400 outline-none text-sm bg-white">
              <option value="draft">ฉบับร่าง</option>
              <option value="sent">ส่งแล้ว</option>
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="หมายเหตุ">
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="ข้อความถึงลูกค้า / เงื่อนไข"
                className="w-full px-3 py-2 rounded-lg border border-pink-200 focus:border-pink-400 focus:ring-2 focus:ring-pink-100 outline-none text-sm" />
            </Field>
          </div>
        </div>
      </div>

      {/* รายการสินค้า */}
      <div className="bg-white rounded-2xl border border-pink-100 shadow-sm p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-bold text-rose-600 flex items-center gap-2">🛍️ รายการสินค้า</h2>
          <div className="w-72">
            {canEdit && <SkuPicker value={null} onChange={addSku} salesOnly placeholder="+ เพิ่มสินค้า (ค้นหา SKU)" />}
          </div>
        </div>

        {items.length === 0 ? (
          <div className="py-10 text-center text-pink-300 text-sm">
            ยังไม่มีสินค้า — ค้นหาแล้วเลือกจากช่อง “เพิ่มสินค้า” ด้านบน
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-pink-50 text-rose-500 text-left">
                  <th className="px-3 py-2 font-semibold">สินค้า</th>
                  <th className="px-3 py-2 font-semibold text-center w-20">หน่วย</th>
                  <th className="px-3 py-2 font-semibold text-center w-24">จำนวน</th>
                  <th className="px-3 py-2 font-semibold text-right w-32">ราคา/หน่วย</th>
                  <th className="px-3 py-2 font-semibold text-right w-32">รวม</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} className="border-t border-pink-50">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        {imgUrl(it.image_r2_key)
                          ? <img src={imgUrl(it.image_r2_key)!} alt="" className="w-10 h-10 rounded-lg object-cover border border-pink-100 flex-shrink-0" />
                          : <div className="w-10 h-10 rounded-lg bg-pink-50 flex items-center justify-center text-pink-200 flex-shrink-0">🖼️</div>}
                        <div className="min-w-0">
                          <div className="font-medium text-slate-700 truncate">{it.name}</div>
                          <div className="font-mono text-xs text-slate-400">{it.sku_code}</div>
                          <input value={it.note ?? ""} onChange={(e) => patchItem(i, { note: e.target.value })} placeholder="หมายเหตุ"
                            className="mt-1 w-full max-w-xs h-7 px-2 rounded border border-pink-100 text-xs outline-none focus:border-pink-300" />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center text-slate-500">{it.uom_name ?? "—"}</td>
                    <td className="px-3 py-2 text-center">
                      <input type="number" min={0} value={it.qty} onChange={(e) => patchItem(i, { qty: Number(e.target.value) })}
                        className="w-20 h-9 px-2 rounded-lg border border-pink-200 text-center outline-none focus:border-pink-400" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input type="number" min={0} step="0.01" value={it.unit_price} onChange={(e) => patchItem(i, { unit_price: Number(e.target.value) })}
                        className="w-28 h-9 px-2 rounded-lg border border-pink-200 text-right outline-none focus:border-pink-400" />
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-rose-600">{money(Number(it.unit_price || 0) * Number(it.qty || 0))}</td>
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => removeItem(i)} className="text-slate-300 hover:text-red-500 text-lg" title="ลบแถว">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-pink-100">
                  <td colSpan={4} className="px-3 py-3 text-right font-semibold text-slate-500">ยอดรวมทั้งหมด</td>
                  <td className="px-3 py-3 text-right text-lg font-bold text-rose-600">{money(grandTotal)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-rose-400 mb-1">{label}</span>
      {children}
    </label>
  );
}
