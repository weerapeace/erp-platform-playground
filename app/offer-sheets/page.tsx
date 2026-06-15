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
  type SkuPickerValue,
  CustomerPicker, type CustomerPickerValue,
} from "@/components/pickers";
import { SkuMultiPickerModal } from "@/components/sku-multi-picker";
import { LineColumnsManager, visibleColumns, type LineColumnConfig } from "@/components/line-item-columns";
import { OFFER_ITEM_COLUMNS, DEFAULT_OFFER_COLS, offerColAlign, offerGroupValue } from "@/lib/offer-columns";
import { resolveOfferLayoutConfig } from "@/lib/offer-layout";
import {
  DEFAULT_OFFER_TEMPLATE_KEY,
  OFFER_TEMPLATES,
  getOfferTemplate,
  normalizeOfferTemplateKey,
  type OfferTemplateKey,
} from "@/lib/offer-templates";
import { exportTable } from "@/lib/export";
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
  const { user, can } = useAuth();
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [customer, setCustomer] = useState<CustomerPickerValue | null>(null);
  const [offerDate, setOfferDate] = useState(today());
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("draft");
  const [items, setItems] = useState<OfferItem[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [offerNo, setOfferNo] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [colConfig, setColConfig] = useState<LineColumnConfig>(DEFAULT_OFFER_COLS);
  const [templateKey, setTemplateKey] = useState<OfferTemplateKey>(DEFAULT_OFFER_TEMPLATE_KEY);

  // แก้ค่าตั้งคอลัมน์เฉพาะใบนี้เท่านั้น
  const updateCols = (c: LineColumnConfig) => {
    setColConfig(c);
  };
  const applyTemplate = (key: OfferTemplateKey) => {
    const template = getOfferTemplate(key);
    setTemplateKey(template.key);
    setColConfig(template.columns);
  };

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
      setColConfig(resolveOfferLayoutConfig(d.column_config));
      setTemplateKey(normalizeOfferTemplateKey(d.template_key));
      setShareToken(d.share_token ?? null);
      setOfferNo(d.offer_no ?? null);
      if (d.customer_id) setCustomer({ id: d.customer_id, code: null, name: d.customer_name ?? "" });
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [id]);

  // เพิ่มหลายตัวจาก popup — ข้ามตัวที่มีอยู่แล้ว (กันซ้ำ)
  const addSkus = (skus: SkuPickerValue[]) => {
    setItems((prev) => {
      const have = new Set(prev.map((it) => it.sku_id));
      const fresh = skus.filter((s) => !have.has(s.id)).map((sku, k) => ({
        sku_id: sku.id, sku_code: sku.code, name: sku.name,
        image_r2_key: sku.image_key ?? null, uom_name: sku.uom_name ?? null,
        color: sku.color ?? null, category: sku.category ?? null,
        unit_price: Number(sku.list_price ?? 0), qty: 1, note: null, sort_order: prev.length + k,
      }));
      return [...prev, ...fresh];
    });
  };

  const patchItem = (i: number, patch: Partial<OfferItem>) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  // ลากจัดลำดับแถว
  const onDrop = (target: number) => {
    setItems((prev) => {
      if (dragIdx === null || dragIdx === target) return prev;
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(target, 0, moved);
      return next.map((it, k) => ({ ...it, sort_order: k }));
    });
    setDragIdx(null);
  };

  // ลิงก์แชร์สาธารณะ
  const shareUrl = shareToken && typeof window !== "undefined" ? `${window.location.origin}/offer/${shareToken}` : null;
  const copyLink = async () => {
    if (!shareUrl) return;
    try { await navigator.clipboard.writeText(shareUrl); alert("คัดลอกลิงก์แล้ว ✓\n" + shareUrl); }
    catch { prompt("คัดลอกลิงก์นี้:", shareUrl); }
  };
  const shareLine = () => { if (shareUrl) window.open(`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(shareUrl)}`, "_blank"); };
  const printPdf = () => { if (shareToken) window.open(`/offer/${shareToken}?print=1`, "_blank"); };

  // ดาวน์โหลด Excel
  const exportExcel = async () => {
    await exportTable({
      format: "excel",
      filename: `offer-${offerNo ?? "draft"}`,
      rows: items.map((it) => ({
        sku_code: it.sku_code, name: it.name, uom_name: it.uom_name,
        qty: it.qty, unit_price: it.unit_price,
        line_total: Number(it.unit_price || 0) * Number(it.qty || 0),
        note: it.note,
      })),
      columns: [
        { key: "sku_code", header: "รหัส SKU" },
        { key: "name", header: "ชื่อสินค้า" },
        { key: "uom_name", header: "หน่วย" },
        { key: "qty", header: "จำนวน" },
        { key: "unit_price", header: "ราคา/หน่วย" },
        { key: "line_total", header: "รวม" },
        { key: "note", header: "หมายเหตุ" },
      ],
      context: { entityType: "offer_sheets", mode: "visible", totalRows: items.length },
      can: (p: string) => can(p as Parameters<typeof can>[0]),
    });
  };

  const grandTotal = items.reduce((s, it) => s + Number(it.unit_price || 0) * Number(it.qty || 0), 0);

  // คอลัมน์ที่ต้องแสดง (ตาม config) + การจัดกลุ่ม
  const vis = visibleColumns(OFFER_ITEM_COLUMNS, colConfig);
  const grouped = !!colConfig.groupBy;
  const groups: [string, { it: OfferItem; i: number }[]][] = (() => {
    if (!grouped) return [];
    const m = new Map<string, { it: OfferItem; i: number }[]>();
    items.forEach((it, i) => {
      const g = offerGroupValue(it, colConfig.groupBy!);
      const arr = m.get(g) ?? [];
      arr.push({ it, i });
      m.set(g, arr);
    });
    return Array.from(m.entries());
  })();

  // เนื้อหาในแต่ละช่องตามคอลัมน์
  const cellContent = (key: string, it: OfferItem, i: number) => {
    switch (key) {
      case "image":
        return imgUrl(it.image_r2_key)
          ? <img src={imgUrl(it.image_r2_key)!} alt="" className="w-10 h-10 rounded-lg object-cover border border-pink-100"
              onError={(e) => { const t = e.currentTarget as HTMLImageElement; t.onerror = null; t.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><rect width='40' height='40' rx='8' fill='%23fce7f3'/><text x='20' y='26' font-size='18' text-anchor='middle'>🖼️</text></svg>"; }} />
          : <div className="w-10 h-10 rounded-lg bg-pink-50 flex items-center justify-center text-pink-200">🖼️</div>;
      case "product":
        return (
          <div className="min-w-0">
            <div className="font-medium text-slate-700">{it.name}</div>
            <div className="font-mono text-xs text-slate-400">{it.sku_code}</div>
          </div>
        );
      case "color":    return <span className="text-slate-500">{it.color ?? "—"}</span>;
      case "category": return <span className="text-slate-500">{it.category ?? "—"}</span>;
      case "uom":      return <span className="text-slate-500">{it.uom_name ?? "—"}</span>;
      case "qty":
        return <input type="number" min={0} value={it.qty} onChange={(e) => patchItem(i, { qty: Number(e.target.value) })}
          className="w-20 h-9 px-2 rounded-lg border border-pink-200 text-center outline-none focus:border-pink-400" />;
      case "unit_price":
        return <input type="number" min={0} step="0.01" value={it.unit_price} onChange={(e) => patchItem(i, { unit_price: Number(e.target.value) })}
          className="w-28 h-9 px-2 rounded-lg border border-pink-200 text-right outline-none focus:border-pink-400" />;
      case "total":
        return <span className="font-semibold text-rose-600">{money(Number(it.unit_price || 0) * Number(it.qty || 0))}</span>;
      case "note":
        return <input value={it.note ?? ""} onChange={(e) => patchItem(i, { note: e.target.value })} placeholder="หมายเหตุ"
          className="w-full max-w-xs h-8 px-2 rounded border border-pink-100 text-xs outline-none focus:border-pink-300" />;
      default: return null;
    }
  };

  // แถวสินค้า 1 แถว (ใช้ทั้งแบบกลุ่ม/ไม่กลุ่ม) — drag เฉพาะตอนไม่จัดกลุ่ม
  const renderRow = (it: OfferItem, i: number) => (
    <tr key={i} className={`border-t border-pink-50 ${dragIdx === i ? "opacity-40" : ""}`}
      onDragOver={(e) => e.preventDefault()} onDrop={() => !grouped && onDrop(i)}>
      <td className="px-1 py-2 text-center">
        {!grouped && (
          <span draggable onDragStart={() => setDragIdx(i)} onDragEnd={() => setDragIdx(null)}
            className="cursor-grab active:cursor-grabbing text-pink-300 hover:text-pink-500 select-none" title="ลากเพื่อจัดลำดับ">⠿</span>
        )}
      </td>
      {vis.map((col) => (
        <td key={col.key} className={`px-3 py-2 ${offerColAlign(col.key)}`}>{cellContent(col.key, it, i)}</td>
      ))}
      <td className="px-3 py-2 text-center">
        <button onClick={() => removeItem(i)} className="text-slate-300 hover:text-red-500 text-lg" title="ลบแถว">✕</button>
      </td>
    </tr>
  );

  const save = async () => {
    setSaving(true);
    const body = JSON.stringify({
      title, customer_id: customer?.id ?? null, customer_name: customer?.name ?? null,
      offer_date: offerDate, note, status, items, actorName: user?.name ?? null,
      column_config: colConfig,
      template_key: templateKey,
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
      <div className="flex items-center justify-between gap-2 mb-5 flex-wrap">
        <button onClick={onBack} className="text-rose-500 hover:text-rose-600 text-sm font-medium">← กลับ</button>
        <div className="flex items-center gap-2 flex-wrap">
          {items.length > 0 && (
            <button onClick={exportExcel} className="h-10 px-4 rounded-full border border-pink-200 bg-white text-rose-500 text-sm font-medium hover:bg-pink-50">📊 Excel</button>
          )}
          {shareToken && (
            <>
              <button onClick={printPdf} className="h-10 px-4 rounded-full border border-pink-200 bg-white text-rose-500 text-sm font-medium hover:bg-pink-50">🖨️ พิมพ์ PDF</button>
              <button onClick={copyLink} className="h-10 px-4 rounded-full border border-pink-200 bg-white text-rose-500 text-sm font-medium hover:bg-pink-50">🔗 คัดลอกลิงก์</button>
              <button onClick={shareLine} className="h-10 px-4 rounded-full bg-[#06C755] text-white text-sm font-medium hover:brightness-95">แชร์ไลน์</button>
            </>
          )}
          {canEdit && (
            <button onClick={save} disabled={saving}
              className="h-10 px-6 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 text-white font-semibold shadow-lg shadow-pink-200 hover:from-pink-600 hover:to-rose-600 disabled:opacity-50 transition">
              {saving ? "กำลังบันทึก…" : "💾 บันทึก"}
            </button>
          )}
        </div>
      </div>
      {!shareToken && canEdit && (
        <p className="text-xs text-rose-300 mb-3 -mt-2">💡 บันทึกก่อน แล้วปุ่มพิมพ์ / แชร์ลิงก์ จะใช้งานได้</p>
      )}

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
          <div className="sm:col-span-2">
            <div className="block text-xs font-medium text-rose-400 mb-2">รูปแบบเอกสารใบนี้</div>
            <div className="grid sm:grid-cols-3 gap-3">
              {OFFER_TEMPLATES.map((template) => (
                <button
                  key={template.key}
                  type="button"
                  onClick={() => applyTemplate(template.key)}
                  className={`text-left rounded-xl border p-3 transition ${
                    templateKey === template.key
                      ? "border-rose-300 bg-rose-50 shadow-sm"
                      : "border-pink-100 bg-white hover:bg-pink-50/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800">{template.label}</span>
                    {templateKey === template.key && <span className="text-xs text-rose-500">ใช้อยู่</span>}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{template.description}</p>
                  <div className="mt-2 inline-flex rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-rose-500 border border-pink-100">
                    {template.bestFor}
                  </div>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-rose-300">เลือก template จะตั้งคอลัมน์ของใบนี้ใหม่ ไม่กระทบใบเสนออื่น</p>
          </div>
        </div>
      </div>

      {/* รายการสินค้า */}
      <div className="bg-white rounded-2xl border border-pink-100 shadow-sm p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <h2 className="text-lg font-bold text-rose-600 flex items-center gap-2">🛍️ รายการสินค้า</h2>
          <div className="flex items-center gap-2">
            <LineColumnsManager defs={OFFER_ITEM_COLUMNS} config={colConfig} onChange={updateCols}
              groupableKeys={["category", "color"]} canEdit={canEdit} />
            {canEdit && (
              <button onClick={() => setPickerOpen(true)}
                className="h-10 px-5 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 text-white text-sm font-semibold shadow shadow-pink-200 hover:from-pink-600 hover:to-rose-600">
                + เพิ่มสินค้า
              </button>
            )}
          </div>
        </div>

        <SkuMultiPickerModal
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onConfirm={addSkus}
          salesOnly
          excludeIds={items.map((it) => it.sku_id).filter((x): x is string => !!x)}
        />

        {items.length === 0 ? (
          <div className="py-10 text-center text-pink-300 text-sm">
            ยังไม่มีสินค้า — กดปุ่ม “เพิ่มสินค้า” เพื่อเลือกหลายรายการพร้อมกัน
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-pink-50 text-rose-500 text-left">
                  <th className="px-1 py-2 w-6"></th>
                  {vis.map((col) => (
                    <th key={col.key} className={`px-3 py-2 font-semibold ${offerColAlign(col.key)}`}>{col.label}</th>
                  ))}
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {grouped
                  ? groups.map(([gName, rows]) => (
                      <GroupBlock key={gName} name={gName} colSpan={vis.length + 2}>
                        {rows.map(({ it, i }) => renderRow(it, i))}
                      </GroupBlock>
                    ))
                  : items.map((it, i) => renderRow(it, i))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-pink-100">
                  <td colSpan={vis.length + 1} className="px-3 py-3 text-right text-lg font-bold text-rose-600">
                    <span className="font-semibold text-slate-500 text-sm mr-3">ยอดรวมทั้งหมด</span>{money(grandTotal)}
                  </td>
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

function GroupBlock({ name, colSpan, children }: { name: string; colSpan: number; children: React.ReactNode }) {
  return (
    <>
      <tr className="bg-rose-50/70">
        <td colSpan={colSpan} className="px-3 py-1.5 text-xs font-semibold text-rose-500">📂 {name}</td>
      </tr>
      {children}
    </>
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
