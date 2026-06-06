"use client";

/**
 * หน้าสั่งซื้อ (Purchase Order) — /purchasing/orders
 * แสดง "ขอซื้อ (PR)" ที่รอออกใบสั่งซื้อ (po_id ว่าง) → เลือก → สร้าง PO (แยกใบตามร้านอัตโนมัติ)
 * 2 view:
 *   - ตาราง: Universal DataTable + เลือกหลายแถว → สร้าง PO
 *   - การ์ด: ซ้าย=ร้าน (ซื้อทั้งร้านได้) / กลาง=การ์ดแบ่ง section ตามร้าน / ขวา=ตะกร้า + วันที่
 * สร้าง PO ผ่าน /api/purchasing/create-po
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { DataTable } from "@/components/data-table";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { ImageInput } from "@/components/image-input";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import type { ColumnDef } from "@tanstack/react-table";
import type { BulkAction, RowAction } from "@/components/data-table";

type Row = {
  id: string; seller_name: string; item_sku_id: string | null; item_name: string; code: string;
  qty: number; uom: string; price_est: number; line_total: number; currency: string;
  order_date: string | null; requester: string; note: string; status: string; approved: boolean; cover_key: string | null; image_url: string | null;
};

const money = (v: number, cur: string) => `${v.toLocaleString()} ${cur}`;
const today = () => new Date().toISOString().slice(0, 10);
const VIEW_KEY = "po_create_view";

const COLUMNS: ColumnDef<Row>[] = [
  { accessorKey: "image_url", header: "รูป", size: 56, enableSorting: false, meta: { type: "image" } },
  { accessorKey: "seller_name", header: "ร้าน", size: 160, meta: { filterable: true }, cell: ({ getValue }) => <span className="text-sm text-slate-700">🏪 {(getValue() as string) || "—"}</span> },
  { accessorKey: "code", header: "รหัส", size: 120, cell: ({ getValue }) => <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{(getValue() as string) || "—"}</span> },
  { accessorKey: "item_name", header: "สินค้า", cell: ({ getValue }) => <span className="text-sm text-slate-800 line-clamp-1">{getValue() as string}</span> },
  { accessorKey: "qty", header: "จำนวน", size: 80, meta: { filterType: "number" }, cell: ({ getValue, row }) => <span className="text-sm tabular-nums">{(getValue() as number).toLocaleString()} <span className="text-xs text-slate-400">{row.original.uom}</span></span> },
  { accessorKey: "price_est", header: "ราคา/หน่วย", size: 110, meta: { filterType: "number" }, cell: ({ getValue, row }) => <span className="text-sm tabular-nums text-slate-600">{money(getValue() as number, row.original.currency)}</span> },
  { accessorKey: "line_total", header: "ราคารวม", size: 120, meta: { filterType: "number", summary: "sum" }, cell: ({ getValue, row }) => <span className="text-sm tabular-nums font-semibold text-blue-600">{money(getValue() as number, row.original.currency)}</span> },
  { accessorKey: "order_date", header: "วันที่สั่ง", size: 110, cell: ({ getValue }) => <span className="text-xs text-slate-500">{getValue() ? formatDate(getValue() as string) : "—"}</span> },
  { accessorKey: "requester", header: "ผู้ขอ", size: 120, meta: { filterable: true } },
  {
    accessorKey: "approved", header: "สถานะ", size: 110,
    meta: { filterable: true, filterOptions: [{ value: "true", label: "อนุมัติแล้ว" }, { value: "false", label: "ยังไม่อนุมัติ" }] },
    cell: ({ getValue }) => getValue()
      ? <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">อนุมัติแล้ว</span>
      : <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">ยังไม่อนุมัติ</span>,
  },
];

export default function PurchaseOrdersPage() {
  const { user } = useAuth();
  const canView = usePermission("products.view");
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [view, setView] = useState<"table" | "card">("card");
  const [cartIds, setCartIds] = useState<string[]>([]);
  const [activeShop, setActiveShop] = useState<string | null>(null);
  const [orderDate, setOrderDate] = useState(today);
  const [editRow, setEditRow] = useState<Row | null>(null);

  useEffect(() => { if (typeof window !== "undefined") { const v = localStorage.getItem(VIEW_KEY); if (v === "table" || v === "card") setView(v); } }, []);
  const changeView = (v: "table" | "card") => { setView(v); if (typeof window !== "undefined") localStorage.setItem(VIEW_KEY, v); };

  const fetchRows = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const j = await apiFetch("/api/purchasing/orderable").then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setRows((j.data ?? []) as Row[]);
    } catch (e) { setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"); setRows([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void fetchRows(); }, [fetchRows]);

  // สร้าง PO จากรายการที่เลือก (ใช้ทั้งตาราง/ตะกร้า/ซื้อทั้งร้าน)
  const createPO = useCallback(async (sel: Row[], dateOverride?: string) => {
    if (sel.length === 0) return;
    const shops = [...new Set(sel.map((r) => r.seller_name))];
    const unapproved = sel.filter((r) => !r.approved).length;
    if (!confirm(`สร้างใบสั่งซื้อจาก ${sel.length} รายการ → ${shops.length} ร้าน (1 ใบ/ร้าน)?${unapproved ? `\n\n(มี ${unapproved} รายการยังไม่อนุมัติ → ระบบจะบันทึกอนุมัติให้อัตโนมัติ)` : ""}`)) return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/purchasing/create-po", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pr_ids: sel.map((r) => r.id), actor: user?.name, order_date: dateOverride }),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      toast.success(`สร้างใบสั่งซื้อ ${(j.created ?? []).length} ใบแล้ว`);
      const orderedIds = new Set(sel.map((r) => r.id));
      setCartIds((c) => c.filter((id) => !orderedIds.has(id)));
      await fetchRows();
    } catch (e) { toast.error("สร้างใบสั่งซื้อไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  }, [user?.name, toast, fetchRows]);

  const bulkActions: BulkAction<Row>[] = [{ label: busy ? "กำลังสร้าง…" : "🧾 สร้างใบสั่งซื้อ (ตามร้าน)", onClick: (r) => void createPO(r) }];

  // ── ข้อมูลสำหรับ view การ์ด ──
  const shops = useMemo(() => {
    const m = new Map<string, { name: string; count: number; total: number; currency: string }>();
    for (const r of rows) {
      const s = m.get(r.seller_name) ?? { name: r.seller_name, count: 0, total: 0, currency: r.currency };
      s.count += 1; s.total += r.line_total; m.set(r.seller_name, s);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, "th"));
  }, [rows]);

  const shopNames = useMemo(() => (activeShop ? [activeShop] : shops.map((s) => s.name)), [activeShop, shops]);
  const rowsOfShop = useCallback((name: string) => rows.filter((r) => r.seller_name === name), [rows]);
  const cartRows = useMemo(() => rows.filter((r) => cartIds.includes(r.id)), [rows, cartIds]);
  const inCart = (id: string) => cartIds.includes(id);
  const toggleCart = (id: string) => setCartIds((c) => c.includes(id) ? c.filter((x) => x !== id) : [...c, id]);

  // ยอดรวมตะกร้าแยกตามสกุลเงิน
  const cartTotals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const r of cartRows) t[r.currency] = (t[r.currency] ?? 0) + r.line_total;
    return t;
  }, [cartRows]);

  if (!canView) return <PlaygroundShell><AccessDenied message="ต้องมีสิทธิ์ products.view" /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      <div className="p-5">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-slate-900">🛒 สั่งซื้อ — ออกใบสั่งซื้อจากรายการขอซื้อ</h1>
            <p className="text-sm text-slate-500 mt-0.5">เลือกรายการ → สร้างใบสั่งซื้อ (ระบบแยกใบตามร้านให้อัตโนมัติ • 1 ใบ/ร้าน)</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-sm">
              <button onClick={() => changeView("card")} className={`h-9 px-3 ${view === "card" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>▦ การ์ด</button>
              <button onClick={() => changeView("table")} className={`h-9 px-3 border-l border-slate-200 ${view === "table" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>▤ ตาราง</button>
            </div>
            <a href="/m/purchase-orders-v2" className="h-9 px-3 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 inline-flex items-center">📋 ดูใบสั่งซื้อ</a>
          </div>
        </div>

        {view === "table" && (
          <DataTable<Row>
            data={rows} columns={COLUMNS} loading={loading} error={error ?? undefined} onRetry={fetchRows}
            emptyMessage="ไม่มีรายการรอสั่งซื้อ" searchPlaceholder="ค้นหา ร้าน / สินค้า / รหัส..."
            searchableKeys={["seller_name", "item_name", "code", "requester"]} tableId="purchase-orders-create" exportFilename="รอสั่งซื้อ"
            selectable bulkActions={bulkActions}
            rowActions={[{ label: "ดู / แก้ไข", icon: "✎", onClick: (r: Row) => setEditRow(r) } as RowAction<Row>]}
            views={[
              { id: "all", label: "ทั้งหมด" },
              { id: "approved", label: "อนุมัติแล้ว", filter: (r) => (r as Row).approved },
              { id: "pending", label: "ยังไม่อนุมัติ", filter: (r) => !(r as Row).approved },
            ]}
          />
        )}

        {view === "card" && (
          loading ? <div className="text-center text-slate-400 py-16 text-sm">กำลังโหลด…</div>
          : error ? <div className="text-center text-red-500 py-16 text-sm">⚠ {error} <button onClick={fetchRows} className="underline ml-2">ลองใหม่</button></div>
          : rows.length === 0 ? <div className="text-center text-slate-300 py-16">ไม่มีรายการรอสั่งซื้อ</div>
          : (
            <div className="flex flex-col lg:flex-row gap-4">
              {/* ซ้าย: ร้าน */}
              <aside className="w-full lg:w-56 shrink-0">
                <div className="text-xs font-medium text-slate-500 mb-1.5">ร้านที่มีของรอสั่ง ({shops.length})</div>
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                  <button onClick={() => setActiveShop(null)} className={`w-full text-left px-3 py-2 text-sm border-b border-slate-100 ${!activeShop ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-600 hover:bg-slate-50"}`}>🛍️ ทุกร้าน ({rows.length})</button>
                  {shops.map((s) => (
                    <div key={s.name} className={`group border-b border-slate-100 last:border-0 ${activeShop === s.name ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                      <button onClick={() => setActiveShop(s.name)} className={`w-full text-left px-3 pt-2 text-sm ${activeShop === s.name ? "text-blue-700 font-medium" : "text-slate-700"}`}>
                        🏪 {s.name}
                        <div className="text-[11px] text-slate-400 font-normal">{s.count} รายการ · {money(s.total, s.currency)}</div>
                      </button>
                      <button onClick={() => createPO(rowsOfShop(s.name))} disabled={busy}
                        className="mx-3 mb-2 mt-1 h-7 px-2 text-[11px] font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">🛒 ซื้อทั้งหมดของร้านนี้</button>
                    </div>
                  ))}
                </div>
              </aside>

              {/* กลาง: การ์ด แบ่ง section ตามร้าน */}
              <main className="flex-1 min-w-0 space-y-5">
                {shopNames.map((name) => {
                  const list = rowsOfShop(name);
                  if (list.length === 0) return null;
                  return (
                    <section key={name}>
                      <div className="flex items-center justify-between mb-2">
                        <h2 className="text-sm font-semibold text-slate-800">🏪 {name} <span className="text-xs font-normal text-slate-400">({list.length})</span></h2>
                        <button onClick={() => createPO(list)} disabled={busy} className="h-7 px-2.5 text-xs font-medium rounded-md border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">🛒 ซื้อทั้งร้าน</button>
                      </div>
                      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}>
                        {list.map((r) => {
                          const on = inCart(r.id);
                          return (
                            <div key={r.id} className={`bg-white border rounded-xl overflow-hidden ${on ? "border-blue-400 ring-1 ring-blue-200" : "border-slate-200"}`}>
                              <div className="aspect-square bg-slate-50 flex items-center justify-center relative">
                                {!r.approved && <span className="absolute top-1.5 left-1.5 z-10 text-[10px] px-1 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">ยังไม่อนุมัติ</span>}
                                <button onClick={() => setEditRow(r)} title="ดูรายละเอียด / แก้ไข"
                                  className="absolute top-1.5 right-1.5 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-white/90 border border-slate-200 shadow-sm hover:bg-blue-50 text-slate-600 text-xs">✎</button>
                                {r.image_url
                                  ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={r.image_url} alt="" className="w-full h-full object-cover" />
                                  : <span className="text-slate-300 text-3xl">📦</span>}
                              </div>
                              <div className="p-2.5">
                                <div className="text-sm font-medium text-slate-800 line-clamp-2 leading-snug">{r.item_name}</div>
                                {r.code && <div className="text-[11px] font-mono text-slate-500 bg-slate-50 inline-block px-1.5 py-0.5 rounded mt-0.5 max-w-full truncate">{r.code}</div>}
                                <div className="text-xs text-slate-500 mt-1">ขอซื้อ <b className="text-slate-700">{r.qty.toLocaleString()}</b> {r.uom}</div>
                                <div className="text-sm font-semibold text-blue-600 mt-0.5">{money(r.line_total, r.currency)}</div>
                                <div className="text-[11px] text-slate-400">@ {money(r.price_est, r.currency)} · {r.order_date ? formatDate(r.order_date) : "—"}</div>
                                <button onClick={() => toggleCart(r.id)}
                                  className={`w-full mt-2 h-8 text-xs font-medium rounded-md ${on ? "bg-blue-100 text-blue-700 border border-blue-200" : "bg-blue-600 text-white hover:bg-blue-700"}`}>
                                  {on ? "✓ อยู่ในตะกร้า" : "+ ใส่ตะกร้า"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </main>

              {/* ขวา: ตะกร้า */}
              <aside className="w-full lg:w-80 shrink-0">
                <div className="bg-white border border-slate-200 rounded-lg sticky top-4">
                  <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-800">ตะกร้าสั่งซื้อ ({cartRows.length})</div>
                  <div className="max-h-[50vh] overflow-auto p-3 space-y-2">
                    {cartRows.length === 0 && <div className="text-sm text-slate-300 text-center py-8">ยังไม่มีรายการ<br />กด “ใส่ตะกร้า” ที่การ์ด</div>}
                    {cartRows.map((r) => (
                      <div key={r.id} className="border border-slate-200 rounded-lg p-2">
                        <div className="flex justify-between gap-2">
                          <div className="text-sm text-slate-700 flex-1 min-w-0 line-clamp-2">{r.item_name}</div>
                          <button onClick={() => toggleCart(r.id)} className="text-slate-400 hover:text-red-500 text-xs">✕</button>
                        </div>
                        <div className="flex items-center justify-between mt-1 text-xs text-slate-500">
                          <span>🏪 {r.seller_name}</span>
                          <span className="font-semibold text-slate-700">{r.qty.toLocaleString()} {r.uom} · {money(r.line_total, r.currency)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="p-3 border-t border-slate-100 space-y-2">
                    {cartRows.length > 0 && Object.entries(cartTotals).map(([cur, sum]) => (
                      <div key={cur} className="flex justify-between text-sm"><span className="text-slate-500">ยอดรวม ({cur})</span><span className="font-bold text-blue-600">{money(sum, cur)}</span></div>
                    ))}
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">📅 วันที่สั่ง (ใช้กับทุกใบ)</label>
                      <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md" />
                    </div>
                    <button onClick={() => createPO(cartRows, orderDate)} disabled={busy || cartRows.length === 0}
                      className="w-full h-10 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
                      {busy ? "กำลังสร้าง…" : "สร้างใบสั่งซื้อ →"}
                    </button>
                    <p className="text-[10px] text-slate-400 text-center">รายการต่างร้านจะแยกเป็นคนละใบให้อัตโนมัติ</p>
                  </div>
                </div>
              </aside>
            </div>
          )
        )}
      </div>

      {editRow && <CardEditModal row={editRow} onClose={() => setEditRow(null)} onSaved={async () => { setEditRow(null); await fetchRows(); }} />}
    </PlaygroundShell>
  );
}

// ── popup ดูรายละเอียด/แก้ไขรายการ (จำนวน/ราคา/หมายเหตุ + รูป SKU จริง) ──
function CardEditModal({ row, onClose, onSaved }: { row: Row; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { user } = useAuth();
  const toast = useToast();
  const [qty, setQty] = useState(String(row.qty));
  const [price, setPrice] = useState(String(row.price_est));
  const [note, setNote] = useState(row.note ?? "");
  const [imgKey, setImgKey] = useState<string | null>(row.cover_key);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/master-v2/purchase-requests-v2/${row.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qty: Number(qty) || 0, price_est: Number(price) || 0, note: note || null, actor: user?.name }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      // เปลี่ยนรูป = แก้รูปปก SKU จริง (มีผลทุกที่)
      if (imgKey !== row.cover_key && row.item_sku_id) {
        await apiFetch(`/api/master-v2/skus/${row.item_sku_id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cover_image_r2_key: imgKey, actor: user?.name }),
        });
      }
      toast.success("บันทึกแล้ว");
      await onSaved();
    } catch (e) { toast.error("บันทึกไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setSaving(false); }
  };

  return (
    <ERPModal open onClose={onClose} size="md" title="รายละเอียด / แก้ไขรายการ"
      footer={<>
        <button onClick={onClose} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button>
        <button onClick={save} disabled={saving} className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
      </>}>
      <div className="space-y-3">
        <div>
          <div className="text-sm font-medium text-slate-800">{row.item_name}</div>
          <div className="text-xs text-slate-400">{row.code || "—"} · 🏪 {row.seller_name}</div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">รูปสินค้า (SKU จริง)</label>
          <ImageInput value={imgKey} onChange={setImgKey} folder="products" />
          <p className="text-[10px] text-amber-600 mt-1">⚠ เปลี่ยนรูปนี้ = เปลี่ยนรูปปก SKU จริง มีผลทุกที่ที่ใช้สินค้านี้</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">จำนวน ({row.uom})</label>
            <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">ราคา/หน่วย ({row.currency})</label>
            <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md" />
          </div>
        </div>
        <div className="text-xs text-slate-500">ราคารวม: <b className="text-blue-600">{money((Number(qty) || 0) * (Number(price) || 0), row.currency)}</b></div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">หมายเหตุ</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="(ถ้ามี)" className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md" />
        </div>
      </div>
    </ERPModal>
  );
}
