"use client";

/**
 * หน้าสั่งซื้อ (Purchase Order) — /purchasing/orders
 * แสดง PR ที่รอออกใบสั่งซื้อ → เลือก → สร้าง PO (แยกใบตามร้านอัตโนมัติ)
 * 2 view: ตาราง (DataTable) / การ์ด (ร้าน + การ์ดแบ่ง section + ตะกร้า)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { DataTable } from "@/components/data-table";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { ImageInput } from "@/components/image-input";
import { SupplierWizard } from "@/components/supplier-wizard";
import { SupplierPicker } from "@/components/supplier-picker";
import { SkuSupplierList } from "@/components/sku-supplier-list";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import type { ColumnDef } from "@tanstack/react-table";
import type { BulkAction, RowAction } from "@/components/data-table";

type Row = {
  id: string; seller_name: string; item_sku_id: string | null; item_name: string; code: string;
  qty: number; uom: string; price_est: number; line_total: number; currency: string;
  order_date: string | null; requester: string; note: string; status: string; approved: boolean; cover_key: string | null; image_url: string | null;
  purchase_link: string | null; moq: number | null; lead_time_days: number | null;
  price_tiers: { qty: number; price: number }[];
  source_mo_no: string | null; used_for_label: string | null;
};
type CartLine = { qty: number; partial: boolean };

// ลิงก์ Taobao/Tmall → ใช้โชว์ป้าย Taobao
const TAOBAO_RE = /taobao\.com|tmall\.com|world\.taobao/i;
const isTaobaoLink = (u: string | null | undefined) => !!u && TAOBAO_RE.test(u);

// แสดงสกุลเงินเป็น "RMB" (ภายในบางที่เก็บ "YUAN" — คงข้อมูลเดิม แต่โชว์ RMB)
const curLabel = (c: string) => (c === "YUAN" ? "RMB" : c);
const money = (v: number, cur: string) => `${v.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${curLabel(cur)}`;
const today = () => new Date().toISOString().slice(0, 10);
const isCNY = (c: string) => c === "RMB" || c === "YUAN" || c === "CNY";
const noShop = (r: Row) => !r.seller_name || r.seller_name === "—" || r.seller_name === "ไม่ระบุร้าน";
// ตัด [code] นำหน้าชื่อสินค้าออก (code โชว์เป็น chip ข้างล่างอยู่แล้ว) — ถ้าตัดแล้วว่างให้คงชื่อเดิมไว้
const stripCode = (name: string) => name?.replace(/^\s*\[[^\]]*\]\s*/, "").trim() || name;
const VIEW_KEY = "po_create_view", COLS_KEY = "po_create_cols", RATE_KEY = "po_create_rate";

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
  const [mainTab, setMainTab] = useState<"shop" | "mo">("shop");
  const [cols, setCols] = useState(5);
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [activeShop, setActiveShop] = useState<string | null>(null);
  const [orderDate, setOrderDate] = useState(today);
  const [rate, setRate] = useState(5.2);
  const [cartWidth, setCartWidth] = useState(340);
  const [editRow, setEditRow] = useState<Row | null>(null);
  const [setShopRow, setSetShopRow] = useState<Row | null>(null);   // popup ตั้งร้านให้สินค้าที่ยังไม่มีร้าน
  const [buyAllShop, setBuyAllShop] = useState<{ name: string; rows: Row[] } | null>(null);
  const [linkRow, setLinkRow] = useState<Row | null>(null);          // popup ใส่ลิงก์สินค้า
  const [reviewOpen, setReviewOpen] = useState(false);               // ป๊อปทวนรายการก่อนสร้างใบสั่งซื้อ
  const [contactShop, setContactShop] = useState<{ name: string; partnerId: string | null } | null>(null);   // popup ติดต่อร้าน
  const [suppliers, setSuppliers] = useState<{ id: string; name: string; cn?: boolean }[]>([]);
  const [taobaoShops, setTaobaoShops] = useState<Set<string>>(new Set());   // ชื่อร้านที่เป็น Taobao
  const [shopQ, setShopQ] = useState("");
  const [prodQ, setProdQ] = useState("");
  const [cartQ, setCartQ] = useState("");
  const addSupplier = (s: { id: string; name: string; cn?: boolean }) => setSuppliers((arr) => arr.some((x) => x.id === s.id) ? arr : [...arr, s].sort((a, b) => a.name.localeCompare(b.name, "th")));

  // โหลดรายชื่อผู้จำหน่าย (m2o สำหรับแก้ร้าน — เลือกได้จากลิสต์เท่านั้น)
  useEffect(() => {
    const f = encodeURIComponent(JSON.stringify({ is_supplier: { type: "boolean", value: "true" } }));
    apiFetch(`/api/master-v2/partners?limit=1000&filters=${f}`).then((r) => r.json())
      .then((j) => {
        const data = (j.data ?? []) as Record<string, unknown>[];
        const nm = (p: Record<string, unknown>) => String(p.name_th ?? p.display_name ?? p.code ?? "");
        const isCn = (p: Record<string, unknown>) => p.is_taobao === true || /จีน|china/i.test(String(p.shop_country ?? "")) || String(p.default_currency ?? "") === "RMB";
        setSuppliers(data.map((p) => ({ id: String(p.id), name: nm(p), cn: isCn(p) })).filter((s) => s.name).sort((a, b) => a.name.localeCompare(b.name, "th")));
        setTaobaoShops(new Set(data.filter((p) => p.is_taobao === true).map(nm).filter(Boolean)));
      })
      .catch(() => {});
  }, []);

  // ป้าย Taobao: ดูจากลิงก์สินค้า (taobao/tmall) หรือร้านที่ตั้งว่าเป็น Taobao
  const isTaobaoRow = useCallback((r: Row) => isTaobaoLink(r.purchase_link) || taobaoShops.has(r.seller_name), [taobaoShops]);

  // กดปุ่มลิงก์: มีลิงก์ → เปิดในแท็บใหม่ ; ไม่มี → เปิด popup ใส่ลิงก์
  const onLinkClick = useCallback((r: Row) => {
    if (r.purchase_link) window.open(r.purchase_link, "_blank", "noopener");
    else setLinkRow(r);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = localStorage.getItem(VIEW_KEY); if (v === "table" || v === "card") setView(v);
    const c = Number(localStorage.getItem(COLS_KEY)); if (c >= 2 && c <= 12) setCols(c);
    const r = Number(localStorage.getItem(RATE_KEY)); if (r > 0) setRate(r);
  }, []);
  const changeView = (v: "table" | "card") => { setView(v); localStorage.setItem(VIEW_KEY, v); };
  const changeCols = (n: number) => { setCols(n); localStorage.setItem(COLS_KEY, String(n)); };
  const changeRate = (n: number) => { setRate(n); if (n > 0) localStorage.setItem(RATE_KEY, String(n)); };

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

  // ── submit PO (ใช้ร่วม: ตาราง/ตะกร้า/ซื้อทั้งร้าน) ──
  const submitPO = useCallback(async (body: Record<string, unknown>, orderedIds: string[]) => {
    setBusy(true);
    try {
      const res = await apiFetch("/api/purchasing/create-po", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, actor: user?.name }) });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      toast.success(`สร้างใบสั่งซื้อ ${(j.created ?? []).length} ใบแล้ว`);
      setCart((c) => { const n = { ...c }; orderedIds.forEach((id) => delete n[id]); return n; });
      await fetchRows();
    } catch (e) { toast.error("สร้างใบสั่งซื้อไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  }, [user?.name, toast, fetchRows]);

  // สร้าง PO แบบเต็มจำนวน (ตาราง bulk / ซื้อทั้งร้าน)
  const createPOByRows = useCallback(async (sel: Row[]) => {
    const valid = sel.filter((r) => !noShop(r));
    if (valid.length === 0) { toast.error("ไม่มีรายการที่มีร้าน (ตั้งร้านให้สินค้าก่อน)"); return; }
    const shops = [...new Set(valid.map((r) => r.seller_name))];
    const unapproved = valid.filter((r) => !r.approved).length;
    if (!confirm(`สร้างใบสั่งซื้อจาก ${valid.length} รายการ → ${shops.length} ร้าน (1 ใบ/ร้าน)?${unapproved ? `\n(มี ${unapproved} รายการยังไม่อนุมัติ → บันทึกอนุมัติให้อัตโนมัติ)` : ""}`)) return;
    await submitPO({ pr_ids: valid.map((r) => r.id) }, valid.map((r) => r.id));
  }, [submitPO, toast]);

  const bulkActions: BulkAction<Row>[] = [{ label: busy ? "กำลังสร้าง…" : "🧾 สร้างใบสั่งซื้อ (ตามร้าน)", onClick: (r) => void createPOByRows(r) }];

  // ── ตะกร้า ──
  const inCart = (id: string) => id in cart;
  const addToCart = (r: Row) => {
    if (noShop(r)) { toast.error("สินค้านี้ยังไม่มีร้าน — กด ✎ ตั้งร้านก่อน"); return; }
    setCart((c) => ({ ...c, [r.id]: { qty: r.qty, partial: false } }));
  };
  const toggleCart = (r: Row) => { if (inCart(r.id)) setCart((c) => { const n = { ...c }; delete n[r.id]; return n; }); else addToCart(r); };
  const setCartQty = (id: string, qty: number) => setCart((c) => ({ ...c, [id]: { ...c[id], qty } }));
  const setCartPartial = (id: string, partial: boolean) => setCart((c) => ({ ...c, [id]: { ...c[id], partial } }));

  const cartRows = useMemo(() => rows.filter((r) => inCart(r.id)), [rows, cart]); // eslint-disable-line react-hooks/exhaustive-deps

  // group ตะกร้าตามร้าน + ยอดต่อร้าน
  const cartByShop = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of cartRows) { const a = m.get(r.seller_name) ?? []; a.push(r); m.set(r.seller_name, a); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "th"));
  }, [cartRows]);
  const lineTotal = (r: Row) => (cart[r.id]?.qty ?? r.qty) * r.price_est;
  const grandByCur = useMemo(() => { const t: Record<string, number> = {}; for (const r of cartRows) t[r.currency] = (t[r.currency] ?? 0) + lineTotal(r); return t; }, [cartRows, cart]); // eslint-disable-line react-hooks/exhaustive-deps

  // ยืนยันจากป๊อปทวนรายการ → สร้างใบสั่งซื้อจริง (แยกใบละร้าน)
  const confirmCreatePO = useCallback(async () => {
    if (cartRows.length === 0) return;
    const items = cartRows.map((r) => ({ pr_id: r.id, qty: cart[r.id]?.qty ?? r.qty, keep_remainder: cart[r.id]?.partial ?? false }));
    await submitPO({ items, order_date: orderDate }, cartRows.map((r) => r.id));
    setReviewOpen(false);
  }, [cartRows, cart, orderDate, submitPO]);

  // ── PDF ใบขอราคา (RFQ) ส่งร้าน — เปิดหน้าพิมพ์ (Save as PDF) สองภาษาตามสกุลเงินร้าน ──
  const printRfq = useCallback((shop: string, items: Row[]) => {
    const lang = isCNY(items[0]?.currency ?? "THB") ? "en" : "th";
    const t = lang === "en"
      ? { title: "Purchase Inquiry (RFQ)", shop: "Supplier", date: "Date", no: "No.", img: "Image", code: "Code", name: "Item", qty: "Qty", link: "Link", price: "Unit Price", lead: "Lead time", note: "Remark", footer: "Please fill in unit price & lead time, then reply. Thank you.", print: "Print / Save PDF" }
      : { title: "ใบขอราคา (RFQ)", shop: "ร้าน", date: "วันที่", no: "ลำดับ", img: "รูป", code: "รหัส", name: "สินค้า", qty: "จำนวน", link: "ลิงก์", price: "ราคา/หน่วย", lead: "ลีดไทม์", note: "หมายเหตุ", footer: "กรุณากรอกราคาต่อหน่วยและลีดไทม์ แล้วส่งกลับ ขอบคุณค่ะ", print: "พิมพ์ / บันทึก PDF" };
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
    const origin = window.location.origin;
    const body = items.map((r, i) => {
      const q = cart[r.id]?.qty ?? r.qty;
      return `<tr><td>${i + 1}</td><td>${r.image_url ? `<img src="${origin}${esc(r.image_url)}"/>` : ""}</td><td>${esc(r.code || "")}</td><td>${esc(r.item_name || "")}</td><td>${q.toLocaleString()} ${esc(r.uom || "")}</td><td>${r.purchase_link ? `<a href="${esc(r.purchase_link)}">link</a>` : ""}</td><td></td><td></td><td></td></tr>`;
    }).join("");
    const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${t.title} - ${esc(shop)}</title>
      <style>body{font-family:'Sarabun','Segoe UI',Tahoma,sans-serif;padding:24px;color:#1e293b}h1{font-size:18px;margin:0 0 4px}.meta{font-size:13px;color:#475569;margin-bottom:12px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #cbd5e1;padding:6px;text-align:left;vertical-align:top}th{background:#f1f5f9}img{width:56px;height:56px;object-fit:cover}.note{margin-top:14px;font-size:12px;color:#64748b}@media print{.noprint{display:none}}</style></head>
      <body><h1>${t.title}</h1><div class="meta">${t.shop}: <b>${esc(shop)}</b> · ${t.date}: ${esc(orderDate)}</div>
      <table><thead><tr><th>${t.no}</th><th>${t.img}</th><th>${t.code}</th><th>${t.name}</th><th>${t.qty}</th><th>${t.link}</th><th>${t.price}</th><th>${t.lead}</th><th>${t.note}</th></tr></thead><tbody>${body}</tbody></table>
      <div class="note">${t.footer}</div>
      <button class="noprint" onclick="window.print()" style="margin-top:16px;padding:8px 16px;font-size:14px;cursor:pointer">🖨️ ${t.print}</button>
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) { toast.error("เบราว์เซอร์บล็อกป๊อปอัป — อนุญาตป๊อปอัปก่อน"); return; }
    w.document.write(html); w.document.close();
  }, [cart, orderDate, toast]);

  // ── ข้อมูล view การ์ด ──
  const shops = useMemo(() => {
    const m = new Map<string, { name: string; count: number; total: number; currency: string }>();
    for (const r of rows) { const s = m.get(r.seller_name) ?? { name: r.seller_name, count: 0, total: 0, currency: r.currency }; s.count += 1; s.total += r.line_total; m.set(r.seller_name, s); }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, "th"));
  }, [rows]);
  const shopNames = useMemo(() => (activeShop ? [activeShop] : shops.map((s) => s.name)), [activeShop, shops]);
  const rowsOfShop = useCallback((name: string) => rows.filter((r) => r.seller_name === name), [rows]);

  // ---- จัดกลุ่มตาม "ใบสั่งงาน" (MO) สำหรับแท็บ "จากใบสั่งงาน" ----
  const moGroups = useMemo(() => {
    const m = new Map<string, { mo: string; product: string; items: Row[] }>();
    for (const r of rows) {
      if (!r.source_mo_no) continue;
      const g = m.get(r.source_mo_no);
      if (g) { g.items.push(r); if (!g.product && r.used_for_label) g.product = r.used_for_label; }
      else m.set(r.source_mo_no, { mo: r.source_mo_no, product: r.used_for_label ?? "", items: [r] });
    }
    return [...m.values()].sort((a, b) => b.mo.localeCompare(a.mo, "th"));
  }, [rows]);
  const moCount = useMemo(() => rows.filter((r) => r.source_mo_no).length, [rows]);

  // resize ตะกร้า (ลากขอบซ้าย)
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX, startW = cartWidth;
    const move = (ev: MouseEvent) => setCartWidth(Math.min(680, Math.max(300, startW + (startX - ev.clientX))));
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };

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
            {view === "card" && (
              <label className="flex items-center gap-1.5 text-xs text-slate-500">การ์ด/แถว
                <select value={cols} onChange={(e) => changeCols(Number(e.target.value))} className="h-9 px-2 text-sm border border-slate-200 rounded-md bg-white">{[4, 6, 8, 10, 12].map((n) => <option key={n} value={n}>{n}</option>)}</select>
              </label>
            )}
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
            views={[{ id: "all", label: "ทั้งหมด" }, { id: "approved", label: "อนุมัติแล้ว", filter: (r) => (r as Row).approved }, { id: "pending", label: "ยังไม่อนุมัติ", filter: (r) => !(r as Row).approved }]}
          />
        )}

        {view === "card" && (
          loading ? <div className="text-center text-slate-400 py-16 text-sm">กำลังโหลด…</div>
          : error ? <div className="text-center text-red-500 py-16 text-sm">⚠ {error} <button onClick={fetchRows} className="underline ml-2">ลองใหม่</button></div>
          : rows.length === 0 ? <div className="text-center text-slate-300 py-16">ไม่มีรายการรอสั่งซื้อ</div>
          : (
            <div className="flex flex-col lg:flex-row gap-4">
              {/* ซ้าย: ร้าน (คลิกเลือกร้าน) */}
              <aside className="w-full lg:w-56 shrink-0">
                <div className="text-xs font-medium text-slate-500 mb-1.5">ร้านที่มีของรอสั่ง ({shops.length})</div>
                <input value={shopQ} onChange={(e) => setShopQ(e.target.value)} placeholder="🔎 ค้นหาร้าน…" className="w-full h-8 px-2 mb-2 text-xs border border-slate-200 rounded-md" />
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                  <button onClick={() => { setMainTab("shop"); setActiveShop(null); }} className={`w-full text-left px-3 py-2 text-sm border-b border-slate-100 ${mainTab === "shop" && !activeShop ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-600 hover:bg-slate-50"}`}>🛍️ ทุกร้าน ({rows.length})</button>
                  <button onClick={() => setMainTab("mo")} className={`w-full text-left px-3 py-2 text-sm border-b border-slate-100 ${mainTab === "mo" ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-600 hover:bg-slate-50"}`}>🏭 จากใบสั่งงาน ({moCount})</button>
                  {shops.filter((s) => !shopQ.trim() || s.name.toLowerCase().includes(shopQ.trim().toLowerCase())).map((s) => (
                    <button key={s.name} onClick={() => { setMainTab("shop"); setActiveShop(s.name); }} className={`w-full text-left px-3 py-2 border-b border-slate-100 last:border-0 ${mainTab === "shop" && activeShop === s.name ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                      <div className={`text-sm ${mainTab === "shop" && activeShop === s.name ? "text-blue-700 font-medium" : "text-slate-700"}`}>🏪 {s.name}</div>
                      <div className="text-[11px] text-slate-400">{s.count} รายการ · {money(s.total, s.currency)}</div>
                    </button>
                  ))}
                </div>
              </aside>

              {/* กลาง: การ์ด แบ่ง section ตามร้าน */}
              <main className="flex-1 min-w-0 space-y-4">
                <input value={prodQ} onChange={(e) => setProdQ(e.target.value)} placeholder="🔎 ค้นหาสินค้า (ชื่อ / รหัส)…" className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md" />
                {mainTab === "mo" && moGroups.length === 0 && (
                  <div className="text-center text-slate-300 py-16 border border-dashed border-slate-200 rounded-lg">
                    ยังไม่มีรายการขอซื้อที่มาจากใบสั่งงาน<br />
                    <span className="text-xs text-slate-400">เปิดใบสั่งผลิต (MO) แล้วกด “ขอซื้อ” รายการวัตถุดิบจะมาโผล่ที่นี่</span>
                  </div>
                )}
                {(mainTab === "mo"
                  ? moGroups.map((g) => ({ key: g.mo, title: `🏭 ${g.mo}`, sub: g.product, items: g.items, shopName: null as string | null }))
                  : shopNames.map((name) => ({ key: name, title: `🏪 ${name}`, sub: "", items: rowsOfShop(name), shopName: name as string | null }))
                ).map((sec) => {
                  const pq = prodQ.trim().toLowerCase();
                  const list = sec.items.filter((r) => !pq || r.item_name.toLowerCase().includes(pq) || r.code.toLowerCase().includes(pq));
                  if (list.length === 0) return null;
                  const sectionNoShop = sec.shopName ? noShop(list[0]) : true;
                  return (
                    <section key={sec.key}>
                      <div className="flex items-center justify-between mb-2">
                        <h2 className="text-sm font-semibold text-slate-800">{sec.title} {sec.sub ? <span className="text-xs font-normal text-slate-500">· ผลิต: {sec.sub}</span> : null} <span className="text-xs font-normal text-slate-400">({list.length})</span></h2>
                        {sec.shopName && !sectionNoShop && <button onClick={() => setBuyAllShop({ name: sec.shopName!, rows: list })} disabled={busy} className="h-7 px-2.5 text-xs font-medium rounded-md border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">🛒 ซื้อทั้งร้าน</button>}
                      </div>
                      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                        {list.map((r) => {
                          const on = inCart(r.id);
                          const blocked = noShop(r);
                          return (
                            <div key={r.id} onClick={() => (blocked ? setSetShopRow(r) : toggleCart(r))}
                              className={`bg-white border rounded-xl overflow-hidden cursor-pointer transition-all ${on ? "border-blue-400 ring-1 ring-blue-200" : "border-slate-200 hover:border-blue-300 hover:shadow-sm"}`}>
                              <div className="aspect-square bg-slate-50 flex items-center justify-center relative">
                                {!r.approved && <span className="absolute top-1.5 left-1.5 z-10 text-[10px] px-1 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">ยังไม่อนุมัติ</span>}
                                <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1">
                                  {isTaobaoRow(r) && <span title="Taobao" className="w-6 h-6 flex items-center justify-center rounded-full bg-orange-500 text-white text-[12px] font-bold shadow-sm leading-none">淘</span>}
                                  <button onClick={(e) => { e.stopPropagation(); onLinkClick(r); }}
                                    title={r.purchase_link ? "เปิดลิงก์สินค้า (แท็บใหม่)" : "เพิ่มลิงก์สินค้า"}
                                    className={`w-7 h-7 flex items-center justify-center rounded-full bg-white/90 border shadow-sm text-xs hover:bg-blue-50 ${r.purchase_link ? "border-blue-200 text-blue-600" : "border-slate-200 text-slate-400"}`}>🔗</button>
                                  <button onClick={(e) => { e.stopPropagation(); setEditRow(r); }} title="ดูรายละเอียด / แก้ไข"
                                    className="w-7 h-7 flex items-center justify-center rounded-full bg-white/90 border border-slate-200 shadow-sm hover:bg-blue-50 text-slate-600 text-xs">✎</button>
                                </div>
                                {r.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={r.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-slate-300 text-3xl">📦</span>}
                              </div>
                              <div className="p-2.5">
                                <div className="text-sm font-medium text-slate-800 line-clamp-2 leading-snug" title={r.item_name}>{stripCode(r.item_name)}</div>
                                {r.code && <div className="text-[11px] font-mono text-slate-500 bg-slate-50 inline-block px-1.5 py-0.5 rounded mt-0.5 max-w-full truncate">{r.code}</div>}
                                <div className="text-xs text-slate-500 mt-1">ขอซื้อ <b className="text-slate-700">{r.qty.toLocaleString()}</b> {r.uom}</div>
                                <div className="text-sm font-semibold text-blue-600 mt-0.5">{money(r.line_total, r.currency)}{isCNY(r.currency) && rate > 0 && <span className="text-[11px] font-normal text-slate-400"> ≈ ฿{Math.round(r.line_total * rate).toLocaleString()}</span>}</div>
                                <div className="text-[11px] text-slate-400">@ {money(r.price_est, r.currency)} · {r.order_date ? formatDate(r.order_date) : "—"}</div>
                                {(r.moq != null || r.lead_time_days != null) && (
                                  <div className="text-[11px] text-slate-500 mt-0.5">
                                    {r.moq != null && <span>MOQ {r.moq.toLocaleString()}</span>}
                                    {r.moq != null && r.lead_time_days != null && " · "}
                                    {r.lead_time_days != null && <span>ส่ง {r.lead_time_days} วัน</span>}
                                  </div>
                                )}
                                {r.price_tiers?.length > 0 && (
                                  <div className="mt-0.5 flex flex-wrap gap-1">
                                    {r.price_tiers.map((t, i) => (
                                      <span key={i} className="text-[10px] px-1 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100">≥{t.qty.toLocaleString()}→{t.price} {curLabel(r.currency)}</span>
                                    ))}
                                  </div>
                                )}
                                <div className={`w-full mt-2 h-8 text-xs font-medium rounded-md flex items-center justify-center ${blocked ? "bg-amber-50 text-amber-700 border border-amber-200" : on ? "bg-blue-100 text-blue-700 border border-blue-200" : "bg-blue-600 text-white"}`}>
                                  {blocked ? "📍 ตั้งร้าน" : on ? "✓ อยู่ในตะกร้า" : "+ ใส่ตะกร้า"}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </main>

              {/* ขวา: ตะกร้า (ขยายได้) */}
              <aside className="w-full shrink-0 relative" style={{ width: typeof window !== "undefined" && window.innerWidth >= 1024 ? cartWidth : undefined }}>
                <div onMouseDown={startResize} title="ลากเพื่อขยาย/ย่อ" className="hidden lg:block absolute left-0 top-0 bottom-0 w-1.5 -ml-2 cursor-col-resize hover:bg-blue-200 rounded" />
                <div className="bg-white border border-slate-200 rounded-lg sticky top-4">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <span className="font-semibold text-slate-800">ตะกร้าสั่งซื้อ ({cartRows.length})</span>
                    <label className="flex items-center gap-1 text-[11px] text-slate-400">¥→฿
                      <input type="number" value={rate} step="0.1" onChange={(e) => changeRate(Number(e.target.value))} className="w-14 h-6 px-1 text-xs border border-slate-200 rounded text-right" />
                    </label>
                  </div>
                  {cartRows.length > 0 && (
                    <div className="px-3 py-2 border-b border-slate-100">
                      <input value={cartQ} onChange={(e) => setCartQ(e.target.value)} placeholder="🔎 ค้นหาในตะกร้า…" className="w-full h-8 px-2 text-xs border border-slate-200 rounded-md" />
                    </div>
                  )}
                  <div className="max-h-[55vh] overflow-auto p-3 space-y-3">
                    {cartRows.length === 0 && <div className="text-sm text-slate-300 text-center py-8">ยังไม่มีรายการ<br />คลิกการ์ดเพื่อใส่ตะกร้า</div>}
                    {cartByShop.map(([shop, items]) => {
                      const cq = cartQ.trim().toLowerCase();
                      const shown = cq ? items.filter((r) => r.item_name.toLowerCase().includes(cq) || r.code.toLowerCase().includes(cq)) : items;
                      if (shown.length === 0) return null;
                      const subtotal = items.reduce((a, r) => a + lineTotal(r), 0);
                      const cur = items[0]?.currency ?? "THB";
                      return (
                        <div key={shop}>
                          <div className="text-xs font-medium text-slate-500 mb-1 flex items-center justify-between">
                            <span>🏪 {shop}</span>
                            <span className="text-slate-600">{money(subtotal, cur)}{isCNY(cur) && rate > 0 && <span className="text-slate-400"> ≈ ฿{Math.round(subtotal * rate).toLocaleString()}</span>}</span>
                          </div>
                          <div className="space-y-2">
                            {shown.map((r) => {
                              const cl = cart[r.id]; const remain = r.qty - (cl?.qty ?? r.qty);
                              return (
                                <div key={r.id} className="border border-slate-200 rounded-lg p-2">
                                  <div className="flex gap-2">
                                    <div className="w-10 h-10 rounded bg-slate-50 flex items-center justify-center flex-shrink-0 overflow-hidden border border-slate-100">
                                      {r.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={r.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-slate-300 text-sm">📦</span>}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm text-slate-700 line-clamp-2 leading-snug">{stripCode(r.item_name)}</div>
                                      <div className="text-[11px] text-slate-400">{r.code}</div>
                                    </div>
                                    <button onClick={() => toggleCart(r)} className="text-slate-400 hover:text-red-500 text-xs self-start">✕</button>
                                  </div>
                                  <div className="flex items-center gap-2 mt-1.5 text-xs flex-wrap">
                                    <input type="number" min={1} value={cl?.qty ?? r.qty} onChange={(e) => setCartQty(r.id, Number(e.target.value))} className="w-16 h-7 px-1.5 border border-slate-200 rounded text-right" />
                                    <span className="text-slate-400">{r.uom}</span>
                                    <span className="text-[11px] text-slate-400">/ ขอซื้อ {r.qty.toLocaleString()}</span>
                                    {remain > 0 && (
                                      <label className="flex items-center gap-1 text-[11px] text-amber-600">
                                        <input type="checkbox" checked={cl?.partial ?? false} onChange={(e) => setCartPartial(r.id, e.target.checked)} className="rounded border-slate-300" />
                                        รอซื้ออีก
                                      </label>
                                    )}
                                    <span className="ml-auto font-semibold text-slate-700">{money(lineTotal(r), r.currency)}</span>
                                  </div>
                                  {remain > 0 && cl?.partial && <div className="text-[10px] text-amber-600 mt-0.5">เหลือ {remain.toLocaleString()} {r.uom} → เปิดใบขอซื้อใหม่</div>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="p-3 border-t border-slate-100 space-y-2">
                    {Object.entries(grandByCur).map(([cur, sum]) => (
                      <div key={cur} className="flex justify-between text-sm"><span className="text-slate-500">ยอดรวม ({curLabel(cur)})</span><span className="font-bold text-blue-600">{money(sum, cur)}{isCNY(cur) && rate > 0 && <span className="text-[11px] font-normal text-slate-400"> ≈ ฿{Math.round(sum * rate).toLocaleString()}</span>}</span></div>
                    ))}
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">📅 วันที่สั่ง (ใช้กับทุกใบ)</label>
                      <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md" />
                    </div>
                    <button onClick={() => cartRows.length > 0 && setReviewOpen(true)} disabled={busy || cartRows.length === 0} className="w-full h-10 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">{busy ? "กำลังสร้าง…" : "สร้างใบสั่งซื้อ →"}</button>
                    <p className="text-[10px] text-slate-400 text-center">รายการต่างร้านจะแยกเป็นคนละใบให้อัตโนมัติ</p>
                  </div>
                </div>
              </aside>
            </div>
          )
        )}

      </div>

      {setShopRow && <SetShopModal row={setShopRow} suppliers={suppliers} onSupplierAdded={addSupplier}
        onClose={() => setSetShopRow(null)}
        onSaved={(updated) => {
          setRows((rs) => rs.map((x) => x.id === updated.id ? updated : x));
          setCart((c) => ({ ...c, [updated.id]: { qty: updated.qty, partial: false } }));
          setSetShopRow(null);
        }} />}
      {editRow && <CardEditModal row={editRow} suppliers={suppliers} onSupplierAdded={addSupplier} onClose={() => setEditRow(null)} onSaved={async () => { setEditRow(null); await fetchRows(); }} />}
      {buyAllShop && <BuyAllModal shop={buyAllShop.name} rows={buyAllShop.rows} rate={rate}
        onClose={() => setBuyAllShop(null)}
        onConfirm={async (items) => { await submitPO({ items, order_date: orderDate }, items.map((i) => i.pr_id)); setBuyAllShop(null); }} />}
      {linkRow && <LinkModal row={linkRow} onClose={() => setLinkRow(null)}
        onSaved={(url) => { const sid = linkRow.item_sku_id; setRows((rs) => rs.map((x) => x.item_sku_id === sid ? { ...x, purchase_link: url } : x)); setLinkRow(null); }} />}

      {contactShop && <ShopContactModal shopName={contactShop.name} partnerId={contactShop.partnerId} onClose={() => setContactShop(null)} />}

      {/* ป๊อปทวนรายการก่อนสร้างใบสั่งซื้อ — แยกตามร้าน (1 ใบ/ร้าน) */}
      {reviewOpen && (
        <ERPModal open onClose={() => !busy && setReviewOpen(false)} size="lg" storageKey="po-review"
          title="ทวนรายการก่อนสร้างใบสั่งซื้อ"
          description={`จะสร้าง ${cartByShop.length} ใบ (1 ใบ/ร้าน) · วันที่สั่ง ${orderDate}`}
          footer={<>
            <button onClick={() => setReviewOpen(false)} disabled={busy} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">← กลับไปแก้</button>
            <button onClick={() => void confirmCreatePO()} disabled={busy || cartRows.length === 0}
              className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{busy ? "กำลังสร้าง…" : `✓ ยืนยันสร้าง ${cartByShop.length} ใบ`}</button>
          </>}>
          <div className="space-y-3">
            {cartByShop.map(([shop, items]) => {
              const subtotal = items.reduce((s, r) => s + lineTotal(r), 0);
              const cur = items[0]?.currency ?? "THB";
              return (
                <div key={shop} className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-100 gap-2">
                    <span className="text-sm font-semibold text-slate-700 min-w-0 truncate">🏪 {shop} <span className="text-[11px] font-normal text-slate-400">({items.length} รายการ)</span></span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button type="button" onClick={() => printRfq(shop, items)} title="ใบขอราคา (PDF) ส่งร้าน"
                        className="h-7 px-2 text-[11px] font-medium rounded-md border border-slate-200 text-slate-600 hover:bg-white">📄 PDF</button>
                      <button type="button" onClick={() => setContactShop({ name: shop, partnerId: suppliers.find((s) => s.name === shop)?.id ?? null })} title="ติดต่อร้าน (Line/WeChat)"
                        className="h-7 px-2 text-[11px] font-medium rounded-md border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100">💬 ติดต่อ</button>
                      <span className="text-sm font-bold text-blue-600">{money(subtotal, cur)}{isCNY(cur) && rate > 0 && <span className="text-[11px] font-normal text-slate-400"> ≈ ฿{Math.round(subtotal * rate).toLocaleString()}</span>}</span>
                    </div>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {items.map((r) => {
                      const q = cart[r.id]?.qty ?? r.qty;
                      const partial = cart[r.id]?.partial ?? false;
                      return (
                        <div key={r.id} className="flex items-center gap-2 px-3 py-1.5">
                          <div className="w-8 h-8 rounded bg-slate-50 flex items-center justify-center flex-shrink-0 overflow-hidden">
                            {r.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={r.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-slate-300 text-xs">📦</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-slate-700 truncate">{stripCode(r.item_name)}</div>
                            <div className="text-[11px] text-slate-400">{r.code || "—"}{partial ? <span className="text-amber-600"> · สั่งไม่ครบ (ที่เหลือเปิดใบใหม่)</span> : ""}{!r.approved ? <span className="text-amber-600"> · ยังไม่อนุมัติ (อนุมัติให้อัตโนมัติ)</span> : ""}</div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-sm text-slate-700 tabular-nums">{q.toLocaleString()} {r.uom}</div>
                            <div className="text-[11px] text-slate-500 tabular-nums">{money(q * r.price_est, r.currency)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {/* ยอดรวมทั้งหมดแยกสกุลเงิน */}
            <div className="pt-2 border-t border-slate-200 space-y-0.5">
              {Object.entries(grandByCur).map(([c, sum]) => (
                <div key={c} className="flex justify-between text-sm">
                  <span className="text-slate-500">ยอดรวมทั้งหมด ({curLabel(c)})</span>
                  <span className="font-bold text-blue-600 tabular-nums">{money(sum, c)}{isCNY(c) && rate > 0 && <span className="text-[11px] font-normal text-slate-400"> ≈ ฿{Math.round(sum * rate).toLocaleString()}</span>}</span>
                </div>
              ))}
            </div>
          </div>
        </ERPModal>
      )}
    </PlaygroundShell>
  );
}

// ── popup ติดต่อร้าน (Line/WeChat/เบอร์/ชื่อ Sale) — ดู + แก้ไข ──
type Contact = { line_id: string; line_url: string; wechat_id: string; sale_name: string; phone: string; mobile: string; shop_country: string; default_currency: string };
function ShopContactModal({ shopName, partnerId, onClose }: { shopName: string; partnerId: string | null; onClose: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState(false);
  const [c, setC] = useState<Contact>({ line_id: "", line_url: "", wechat_id: "", sale_name: "", phone: "", mobile: "", shop_country: "", default_currency: "" });
  const set = (k: keyof Contact, v: string) => setC((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!partnerId) { setLoading(false); return; }
    apiFetch(`/api/master-v2/partners/${partnerId}`).then((r) => r.json()).then((j) => {
      const d = (j.data ?? {}) as Record<string, unknown>;
      setC({
        line_id: String(d.line_id ?? ""), line_url: String(d.line_url ?? ""), wechat_id: String(d.wechat_id ?? ""),
        sale_name: String(d.sale_name ?? ""), phone: String(d.phone ?? ""), mobile: String(d.mobile ?? ""),
        shop_country: String(d.shop_country ?? ""), default_currency: String(d.default_currency ?? ""),
      });
      if (!d.line_id && !d.wechat_id && !d.phone && !d.mobile && !d.sale_name) setEdit(true);   // ไม่มีข้อมูล → เปิดโหมดแก้เลย
    }).catch(() => {}).finally(() => setLoading(false));
  }, [partnerId]);

  const isCN = /จีน|china|taobao|tmall/i.test(c.shop_country) || c.default_currency === "RMB" || /taobao/i.test(shopName);
  const copy = async (txt: string, label: string) => { try { await navigator.clipboard.writeText(txt); toast.success(`คัดลอก ${label} แล้ว`); } catch { /* ignore */ } };

  const save = async () => {
    if (!partnerId) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/master-v2/partners/${partnerId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line_id: c.line_id || null, line_url: c.line_url || null, wechat_id: c.wechat_id || null, sale_name: c.sale_name || null, phone: c.phone || null, mobile: c.mobile || null, actor: user?.name }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      toast.success("บันทึกข้อมูลติดต่อแล้ว"); setEdit(false);
    } catch (e) { toast.error("บันทึกไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setSaving(false); }
  };

  const inp = "w-full h-9 px-3 text-sm border border-slate-200 rounded-md";
  const lbl = "block text-xs font-medium text-slate-600 mb-1";
  return (
    <ERPModal open onClose={onClose} size="md" storageKey="po-contact" title={`💬 ติดต่อร้าน — ${shopName}`}
      footer={partnerId ? <>
        <button onClick={onClose} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ปิด</button>
        {edit
          ? <button onClick={save} disabled={saving} className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
          : <button onClick={() => setEdit(true)} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">✎ แก้ไขข้อมูลติดต่อ</button>}
      </> : <button onClick={onClose} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ปิด</button>}>
      {!partnerId ? (
        <div className="py-6 text-center text-sm text-slate-400">ร้านนี้ไม่ใช่ผู้จำหน่ายในระบบ — เลือกร้านจากรายการก่อน ถึงจะเก็บข้อมูลติดต่อได้</div>
      ) : loading ? (
        <div className="py-6 text-center text-sm text-slate-400">กำลังโหลด…</div>
      ) : edit ? (
        <div className="space-y-3">
          <div><label className={lbl}>ชื่อ Sale</label><input value={c.sale_name} onChange={(e) => set("sale_name", e.target.value)} className={inp} placeholder="ชื่อผู้ติดต่อ" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={lbl}>เบอร์โทร</label><input value={c.phone} onChange={(e) => set("phone", e.target.value)} className={inp} /></div>
            <div><label className={lbl}>มือถือ</label><input value={c.mobile} onChange={(e) => set("mobile", e.target.value)} className={inp} /></div>
          </div>
          <div><label className={lbl}>Line ID</label><input value={c.line_id} onChange={(e) => set("line_id", e.target.value)} className={inp} placeholder="เช่น @shopname" /></div>
          <div><label className={lbl}>ลิงก์ Line / กลุ่ม (ถ้ามี)</label><input value={c.line_url} onChange={(e) => set("line_url", e.target.value)} className={inp} placeholder="https://line.me/..." /></div>
          <div><label className={lbl}>WeChat ID</label><input value={c.wechat_id} onChange={(e) => set("wechat_id", e.target.value)} className={inp} placeholder="เช่น wxid_xxx" /></div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {c.sale_name && <div className="text-sm text-slate-700">👤 Sale: <b>{c.sale_name}</b></div>}
          {/* ปุ่มหลักตามประเภทร้าน */}
          {isCN ? (
            c.wechat_id ? (
              <div className="flex items-center gap-2 p-2.5 rounded-lg border border-green-200 bg-green-50">
                <span className="text-sm flex-1">🟢 WeChat: <b>{c.wechat_id}</b></span>
                <button onClick={() => copy(c.wechat_id, "WeChat ID")} className="h-8 px-3 text-xs font-medium bg-green-600 text-white rounded-md hover:bg-green-700">คัดลอก ID</button>
              </div>
            ) : <div className="text-xs text-slate-400">ยังไม่มี WeChat — กด &quot;แก้ไขข้อมูลติดต่อ&quot; เพื่อเพิ่ม</div>
          ) : (
            (c.line_url || c.line_id) ? (
              <div className="flex items-center gap-2 p-2.5 rounded-lg border border-emerald-200 bg-emerald-50">
                <span className="text-sm flex-1">💬 Line: <b>{c.line_id || "(ลิงก์)"}</b></span>
                {c.line_url && <a href={c.line_url} target="_blank" rel="noopener noreferrer" className="h-8 px-3 text-xs font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700 flex items-center">เปิด Line</a>}
                {c.line_id && <button onClick={() => copy(c.line_id, "Line ID")} className="h-8 px-3 text-xs font-medium border border-emerald-300 text-emerald-700 rounded-md hover:bg-emerald-100">คัดลอก ID</button>}
              </div>
            ) : <div className="text-xs text-slate-400">ยังไม่มี Line — กด &quot;แก้ไขข้อมูลติดต่อ&quot; เพื่อเพิ่ม</div>
          )}
          {/* เบอร์โทร */}
          {(c.phone || c.mobile) && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200">
              <span className="text-sm flex-1">📞 {c.phone}{c.phone && c.mobile ? " · " : ""}{c.mobile}</span>
              <a href={`tel:${c.mobile || c.phone}`} className="h-8 px-3 text-xs font-medium border border-slate-200 rounded-md hover:bg-slate-50 flex items-center">โทร</a>
            </div>
          )}
        </div>
      )}
    </ERPModal>
  );
}

// ── popup ใส่/แก้ลิงก์สินค้า → บันทึกเข้า SKU จริง (purchase_link) ──
function LinkModal({ row, onClose, onSaved }: { row: Row; onClose: () => void; onSaved: (url: string | null) => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [url, setUrl] = useState(row.purchase_link ?? "");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!row.item_sku_id) { toast.error("รายการนี้ไม่ผูกกับสินค้า (SKU)"); return; }
    setSaving(true);
    try {
      const clean = url.trim() || null;
      const res = await apiFetch(`/api/master-v2/skus/${row.item_sku_id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchase_link: clean, actor: user?.name }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      toast.success("บันทึกลิงก์เข้าสินค้าแล้ว");
      onSaved(clean);
    } catch (e) { toast.error("บันทึกไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setSaving(false); }
  };
  return (
    <ERPModal open onClose={onClose} size="md" storageKey="po-link" title="🔗 ลิงก์สินค้า"
      footer={<>
        <button onClick={onClose} disabled={saving} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
        <button onClick={save} disabled={saving} className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึกลิงก์"}</button>
      </>}>
      <div className="space-y-2">
        <div className="text-sm font-medium text-slate-800">{stripCode(row.item_name)}</div>
        <div className="text-xs text-slate-400">{row.code || "—"}</div>
        <label className="block text-xs font-medium text-slate-600 mt-2">ลิงก์ร้าน/สินค้า (เก็บเข้า SKU จริง)</label>
        <input value={url} onChange={(e) => setUrl(e.target.value)} autoFocus
          placeholder="วางลิงก์ เช่น https://item.taobao.com/..." className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md" />
        <p className="text-[11px] text-slate-400">ลิงก์ Taobao/Tmall จะขึ้นป้าย 淘 ให้อัตโนมัติ · มีผลกับทุกใบที่ใช้สินค้านี้</p>
      </div>
    </ERPModal>
  );
}

// ── popup "ซื้อทั้งร้าน" — ใส่จำนวน (ตั้งต้น=ขอซื้อ) + รอซื้ออีก ต่อรายการ → ยืนยันออก PO ──
function BuyAllModal({ shop, rows, rate, onClose, onConfirm }: {
  shop: string; rows: Row[]; rate: number;
  onClose: () => void; onConfirm: (items: { pr_id: string; qty: number; keep_remainder: boolean }[]) => void | Promise<void>;
}) {
  const [lines, setLines] = useState<Record<string, { qty: number; partial: boolean }>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, { qty: r.qty, partial: false }])));
  const [saving, setSaving] = useState(false);
  const cur = rows[0]?.currency ?? "THB";
  const total = rows.reduce((a, r) => a + (lines[r.id]?.qty ?? r.qty) * r.price_est, 0);
  const submit = async () => {
    setSaving(true);
    await onConfirm(rows.map((r) => ({ pr_id: r.id, qty: lines[r.id]?.qty ?? r.qty, keep_remainder: lines[r.id]?.partial ?? false })));
    setSaving(false);
  };
  return (
    <ERPModal open onClose={onClose} size="lg" storageKey="po-buyall" title={`🛒 ซื้อทั้งร้าน: ${shop}`}
      description="ปรับจำนวนได้ (ตั้งต้น = จำนวนที่ขอซื้อ) • ติ๊ก 'รอซื้ออีก' ถ้าสั่งไม่ครบ • ยืนยันแล้วอนุมัติ+ออกใบสั่งซื้อทันที"
      footer={<>
        <button onClick={onClose} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button>
        <button onClick={submit} disabled={saving} className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? "กำลังสร้าง…" : `ยืนยันออกใบสั่งซื้อ (${rows.length})`}</button>
      </>}>
      <div className="space-y-1.5 max-h-[55vh] overflow-auto">
        {rows.map((r) => {
          const l = lines[r.id]; const remain = r.qty - (l?.qty ?? r.qty);
          return (
            <div key={r.id} className="flex items-center gap-2 border border-slate-100 rounded-lg p-2">
              <div className="w-9 h-9 rounded bg-slate-50 flex items-center justify-center flex-shrink-0 overflow-hidden border border-slate-100">
                {r.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={r.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-slate-300 text-sm">📦</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-700 line-clamp-1" title={r.item_name}>{stripCode(r.item_name)}</div>
                <div className="text-[11px] text-slate-400">{r.code} · @ {money(r.price_est, r.currency)}</div>
              </div>
              <input type="number" min={1} value={l?.qty ?? r.qty}
                onChange={(e) => setLines((p) => ({ ...p, [r.id]: { ...p[r.id], qty: Number(e.target.value) } }))}
                className="w-16 h-8 px-1.5 text-sm border border-slate-200 rounded text-right" />
              <span className="text-[11px] text-slate-400 w-20">{r.uom} <span className="block leading-tight">/ ขอซื้อ {r.qty.toLocaleString()}</span></span>
              <label className={`flex items-center gap-1 text-[11px] w-20 ${remain > 0 ? "text-amber-600" : "invisible"}`}>
                <input type="checkbox" checked={l?.partial ?? false} onChange={(e) => setLines((p) => ({ ...p, [r.id]: { ...p[r.id], partial: e.target.checked } }))} className="rounded border-slate-300" />
                รอซื้ออีก
              </label>
              <span className="text-sm font-semibold text-slate-700 w-28 text-right">
                {money((l?.qty ?? r.qty) * r.price_est, r.currency)}
                {remain > 0 && l?.partial && <span className="block text-[10px] text-amber-600 font-normal">เหลือ {remain.toLocaleString()}</span>}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex justify-end mt-3 text-sm font-bold text-blue-600">
        ยอดรวม: {money(total, cur)}{isCNY(cur) && rate > 0 && <span className="text-xs font-normal text-slate-400 ml-1">≈ ฿{Math.round(total * rate).toLocaleString()}</span>}
      </div>
    </ERPModal>
  );
}

// ── popup ตั้งร้านให้สินค้าที่ยังไม่มีร้าน (เลือกผู้จำหน่าย m2o + ราคา + เพิ่มผู้จำหน่าย) ──
function SetShopModal({ row, suppliers, onSupplierAdded, onClose, onSaved }: {
  row: Row; suppliers: { id: string; name: string; cn?: boolean }[]; onSupplierAdded: (s: { id: string; name: string; cn?: boolean }) => void;
  onClose: () => void; onSaved: (updated: Row) => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [seller, setSeller] = useState("");
  const [sellerId, setSellerId] = useState("");   // id ร้าน (ไว้ sync เข้า price list)
  const [price, setPrice] = useState(String(row.price_est || ""));
  const [cur, setCur] = useState(row.currency || "THB");
  const [saving, setSaving] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [syncCount, setSyncCount] = useState(0);

  // เก็บร้าน+ราคาเข้า "ร้านที่จำหน่าย" ของสินค้า (best-effort)
  const syncToPriceList = async (silent = false): Promise<boolean> => {
    if (!row.item_sku_id || !sellerId) return false;
    try {
      const res = await apiFetch(`/api/purchasing/sku-suppliers`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku_id: row.item_sku_id, partner_id: sellerId, price: Number(price) || null, currency: cur, default_if_none: true }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) { if (!silent) toast.error("เพิ่มเข้ารายการไม่สำเร็จ: " + (j.error ?? res.status)); return false; }
      setSyncCount((n) => n + 1);
      return true;
    } catch { return false; }
  };

  // ปุ่มลัด Taobao → หา/สร้างร้าน Taobao แล้วตั้งเป็นร้าน (m2o จริง, RMB)
  const pickTaobao = useCallback(async () => {
    try {
      const j = await apiFetch("/api/purchasing/taobao-shop", { method: "POST" }).then((r) => r.json());
      if (j.error || !j.data?.id) { toast.error("ตั้งร้าน Taobao ไม่สำเร็จ: " + (j.error ?? "")); return; }
      onSupplierAdded(j.data); setSeller(j.data.name); setSellerId(j.data.id); setCur("RMB");
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
  }, [onSupplierAdded, toast]);
  // ลิงก์เป็น taobao + ยังไม่เลือกร้าน → ตั้งร้าน Taobao ให้อัตโนมัติ (ครั้งเดียว)
  const autoTaobao = useRef(false);
  useEffect(() => {
    if (autoTaobao.current || !isTaobaoLink(row.purchase_link) || sellerId || seller) return;
    autoTaobao.current = true; void pickTaobao();
  }, [row.purchase_link, sellerId, seller, pickTaobao]);

  const save = async () => {
    if (!seller) { toast.error("เลือกร้านก่อน"); return; }
    setSaving(true);
    try {
      const priceN = Number(price) || 0;
      const res = await apiFetch(`/api/master-v2/purchase-requests-v2/${row.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seller_name: seller, price_est: priceN, currency: cur, actor: user?.name }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      await syncToPriceList(true);   // เก็บร้าน+ราคาเข้ารายการสินค้าอัตโนมัติ
      toast.success("ตั้งร้านแล้ว — ใส่ตะกร้าให้เลย");
      onSaved({ ...row, seller_name: seller, price_est: priceN, currency: cur, line_total: row.qty * priceN });
    } catch (e) { toast.error("บันทึกไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setSaving(false); }
  };

  return (
    <ERPModal open onClose={onClose} size="md" storageKey="po-set-shop" title="📍 ตั้งร้านให้สินค้า"
      footer={<>
        <button onClick={onClose} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button>
        <button onClick={save} disabled={saving} className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึก + ใส่ตะกร้า"}</button>
      </>}>
      <div className="space-y-3">
        <div>
          <div className="text-sm font-medium text-slate-800">{stripCode(row.item_name)}</div>
          <div className="text-xs text-slate-400">{row.code || "—"} · ขอซื้อ {row.qty.toLocaleString()} {row.uom}</div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">ร้าน (ผู้จำหน่าย) *</label>
          <SupplierPicker value={sellerId} suppliers={suppliers}
            onChange={(id, name) => { setSellerId(id); setSeller(name); }} onAddNew={() => setWizardOpen(true)} />
          <button type="button" onClick={() => void pickTaobao()}
            className="mt-1.5 h-7 px-2.5 text-xs font-medium rounded-md border border-orange-200 text-orange-700 bg-orange-50 hover:bg-orange-100">🛒 ตั้งเป็นร้าน Taobao</button>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">ราคา/{row.uom || "หน่วย"} ({curLabel(cur)})</label>
          <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md" placeholder="0" />
          <button type="button" onClick={() => void syncToPriceList()} disabled={!sellerId}
            title={sellerId ? "" : "เลือกร้านจากรายการก่อน"}
            className="mt-1.5 h-7 px-2.5 text-xs font-medium text-emerald-700 border border-emerald-200 rounded-md hover:bg-emerald-50 disabled:opacity-40">➕ เพิ่มร้านนี้เข้ารายการสินค้า</button>
        </div>
        {/* รายการราคาหลายร้านของสินค้านี้ — กด "ใช้ร้านนี้" เพื่อดึงร้าน+ราคามาใส่ */}
        {row.item_sku_id && (
          <SkuSupplierList skuId={row.item_sku_id} defaultOpen={false} reloadSignal={syncCount}
            onUse={(r) => { setSeller(r.partner_name); if (r.partner_id) setSellerId(r.partner_id); if (r.price != null) setPrice(String(r.price)); setCur(curLabel(r.currency)); toast.success(`ใช้ราคาจาก ${r.partner_name}`); }} />
        )}
      </div>
      {wizardOpen && <SupplierWizard onClose={() => setWizardOpen(false)} onCreated={(p) => { onSupplierAdded(p); setSeller(p.name); setSellerId(p.id); setWizardOpen(false); toast.success(`เพิ่มผู้จำหน่าย "${p.name}" แล้ว`); }} />}
    </ERPModal>
  );
}

// ── popup ดูรายละเอียด/แก้ไขรายการ (จำนวน/ราคา/หมายเหตุ + รูป SKU จริง) ──
function CardEditModal({ row, suppliers, onSupplierAdded, onClose, onSaved }: { row: Row; suppliers: { id: string; name: string; cn?: boolean }[]; onSupplierAdded: (s: { id: string; name: string; cn?: boolean }) => void; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { user } = useAuth();
  const toast = useToast();
  const [qty, setQty] = useState(String(row.qty));
  const [price, setPrice] = useState(String(row.price_est));
  const [note, setNote] = useState(row.note ?? "");
  const [seller, setSeller] = useState(row.seller_name && row.seller_name !== "—" ? row.seller_name : "");
  const [sellerId, setSellerId] = useState("");   // id ร้าน (ไว้ sync เข้า price list)
  const [cur, setCur] = useState(row.currency || "THB");
  const [imgKey, setImgKey] = useState<string | null>(row.cover_key);
  const [saving, setSaving] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [syncCount, setSyncCount] = useState(0);

  // เดา id ร้านจากชื่อเดิม เมื่อรายชื่อร้านโหลดเสร็จ (PR เก็บแค่ชื่อ)
  useEffect(() => {
    if (!sellerId && seller) { const m = suppliers.find((s) => s.name === seller); if (m) setSellerId(m.id); }
  }, [suppliers, seller, sellerId]);

  // ปุ่มลัด Taobao → หา/สร้างร้าน Taobao แล้วตั้งเป็นร้าน
  const pickTaobao = useCallback(async () => {
    try {
      const j = await apiFetch("/api/purchasing/taobao-shop", { method: "POST" }).then((r) => r.json());
      if (j.error || !j.data?.id) { toast.error("ตั้งร้าน Taobao ไม่สำเร็จ: " + (j.error ?? "")); return; }
      onSupplierAdded(j.data); setSeller(j.data.name); setSellerId(j.data.id); setCur("RMB");
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
  }, [onSupplierAdded, toast]);
  // ลิงก์เป็น taobao + ยังไม่มีร้าน → ตั้ง Taobao อัตโนมัติ (ครั้งเดียว)
  const autoTaobao = useRef(false);
  useEffect(() => {
    if (autoTaobao.current || !isTaobaoLink(row.purchase_link) || sellerId || seller) return;
    autoTaobao.current = true; void pickTaobao();
  }, [row.purchase_link, sellerId, seller, pickTaobao]);

  const syncToPriceList = async (silent = false): Promise<boolean> => {
    if (!row.item_sku_id || !sellerId) return false;
    try {
      const res = await apiFetch(`/api/purchasing/sku-suppliers`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku_id: row.item_sku_id, partner_id: sellerId, price: Number(price) || null, currency: cur, default_if_none: true }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) { if (!silent) toast.error("เพิ่มเข้ารายการไม่สำเร็จ: " + (j.error ?? res.status)); return false; }
      setSyncCount((n) => n + 1);
      return true;
    } catch { return false; }
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/master-v2/purchase-requests-v2/${row.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qty: Number(qty) || 0, price_est: Number(price) || 0, note: note || null, seller_name: seller || null, currency: cur, actor: user?.name }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      if (imgKey !== row.cover_key && row.item_sku_id) {
        await apiFetch(`/api/master-v2/skus/${row.item_sku_id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cover_image_r2_key: imgKey, actor: user?.name }),
        });
      }
      await syncToPriceList(true);   // เก็บร้าน+ราคาเข้ารายการสินค้าอัตโนมัติ
      toast.success("บันทึกแล้ว");
      await onSaved();
    } catch (e) { toast.error("บันทึกไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setSaving(false); }
  };

  return (
    <ERPModal open onClose={onClose} size="md" storageKey="po-card-edit" title="รายละเอียด / แก้ไขรายการ"
      footer={<>
        <button onClick={onClose} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button>
        <button onClick={save} disabled={saving} className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
      </>}>
      <div className="space-y-3">
        <div>
          <div className="text-sm font-medium text-slate-800">{stripCode(row.item_name)}</div>
          <div className="text-xs text-slate-400">{row.code || "—"}</div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">ร้าน (ผู้จำหน่าย)</label>
          <SupplierPicker value={sellerId} suppliers={suppliers}
            onChange={(id, name) => { setSellerId(id); setSeller(name); }} onAddNew={() => setWizardOpen(true)} />
          {!sellerId && seller && <div className="text-[11px] text-amber-600 mt-1">ร้านปัจจุบัน: {seller} (ไม่ใช่ผู้จำหน่ายในระบบ — เลือกใหม่เพื่อเพิ่มเข้ารายการได้)</div>}
          <button type="button" onClick={() => void pickTaobao()}
            className="mt-1.5 mr-1.5 h-7 px-2.5 text-xs font-medium rounded-md border border-orange-200 text-orange-700 bg-orange-50 hover:bg-orange-100">🛒 ตั้งเป็นร้าน Taobao</button>
          <button type="button" onClick={() => void syncToPriceList()} disabled={!sellerId}
            title={sellerId ? "" : "เลือกร้านจากรายการก่อน"}
            className="mt-1.5 h-7 px-2.5 text-xs font-medium text-emerald-700 border border-emerald-200 rounded-md hover:bg-emerald-50 disabled:opacity-40">➕ เพิ่มร้านนี้เข้ารายการสินค้า</button>
        </div>
        {wizardOpen && <SupplierWizard onClose={() => setWizardOpen(false)} onCreated={(p) => { onSupplierAdded(p); setSeller(p.name); setSellerId(p.id); setWizardOpen(false); toast.success(`เพิ่มผู้จำหน่าย "${p.name}" แล้ว`); }} />}
        {/* รายการราคาหลายร้านของสินค้านี้ — กด "ใช้ร้านนี้" เพื่อดึงร้าน+ราคามาใส่ */}
        {row.item_sku_id && (
          <SkuSupplierList skuId={row.item_sku_id} defaultOpen={false} reloadSignal={syncCount}
            onUse={(r) => { setSeller(r.partner_name); if (r.partner_id) setSellerId(r.partner_id); if (r.price != null) setPrice(String(r.price)); setCur(curLabel(r.currency)); toast.success(`ใช้ราคาจาก ${r.partner_name}`); }} />
        )}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">รูปสินค้า (SKU จริง)</label>
          <ImageInput value={imgKey} onChange={setImgKey} folder="products" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="block text-xs font-medium text-slate-600 mb-1">จำนวน ({row.uom || "หน่วย"})</label>
            <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md" /></div>
          <div><label className="block text-xs font-medium text-slate-600 mb-1">ราคา/{row.uom || "หน่วย"} ({curLabel(cur)})</label>
            <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md" /></div>
        </div>
        <div className="text-xs text-slate-500">ราคารวม: <b className="text-blue-600">{money((Number(qty) || 0) * (Number(price) || 0), cur)}</b></div>
        <div><label className="block text-xs font-medium text-slate-600 mb-1">หมายเหตุ</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="(ถ้ามี)" className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md" /></div>
      </div>
    </ERPModal>
  );
}
