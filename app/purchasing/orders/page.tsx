"use client";

/**
 * หน้าสั่งซื้อ (Purchase Order) — /purchasing/orders
 * แสดง PR ที่รอออกใบสั่งซื้อ → เลือก → สร้าง PO (แยกใบตามร้านอัตโนมัติ)
 * 2 view: ตาราง (DataTable) / การ์ด (ร้าน + การ์ดแบ่ง section + ตะกร้า)
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { DataTable } from "@/components/data-table";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { ImageInput } from "@/components/image-input";
import { SupplierWizard } from "@/components/supplier-wizard";
import { SupplierPicker } from "@/components/supplier-picker";
import { SkuPicker, type SkuPickerValue } from "@/components/pickers";
import { SkuSupplierList } from "@/components/sku-supplier-list";
import nextDynamic from "next/dynamic";
import { ApproveActions, RejectedPanel, DeleteButton, BulkApproveBar } from "./approval";
import { PieceworkFromPoModal, type PieceFromPoInit } from "../piecework-from-po-modal";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import type { ColumnDef } from "@tanstack/react-table";
import type { BulkAction, RowAction } from "@/components/data-table";
// drawer เก่าตัวจริงของ MasterCRUD — dynamic กัน import วน + โหลดเฉพาะตอนเปิด
const MasterRecordDrawer = nextDynamic(() => import("@/components/master-crud").then((m) => m.MasterRecordDrawer), { ssr: false });

type Row = {
  id: string; seller_name: string; item_sku_id: string | null; item_name: string; code: string;
  qty: number; uom: string; price_est: number; line_total: number; currency: string;
  order_date: string | null; requester: string; note: string; status: string; approved: boolean; cover_key: string | null; image_url: string | null;
  purchase_link: string | null; moq: number | null; lead_time_days: number | null;
  price_tiers: { qty: number; price: number }[];
  source_mo_no: string | null; used_for_label: string | null;
  supplier_sku_code: string | null; name_cn: string | null; name_en: string | null; purchase_uom_en: string | null;   // ใบ PO ร้านจีน
};
type CartLine = { qty: number; partial: boolean };
// รายการที่ resolve แล้วสำหรับพิมพ์ PO (ไทย=ชื่อ/รหัสเรา · จีน=ชื่อจีน+อังกฤษ/รหัสร้าน)
type PoPrintItem = { image_url: string | null; code: string; name: string; name_en?: string | null; qty: number; uom: string; price: number; currency: string };

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
const VIEW_KEY = "po_create_view", COLS_KEY = "po_create_cols", RATE_KEY = "po_create_rate", CART_KEY = "po_create_cart", SORT_KEY = "po_create_sort";
type SortKey = "date" | "name" | "qty" | "price";
type CreatedPO = { id: string; po_no: string; seller_name: string; currency: string; grand_total: number; line_count: number };
type ShareItem = { name: string; code: string; qty: number; uom: string };

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
  const [cols, setCols] = useState(4);
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [activeShop, setActiveShop] = useState<string | null>(null);
  const [orderDate, setOrderDate] = useState(today);
  const [rate, setRate] = useState(5.2);
  const [cartWidth, setCartWidth] = useState(340);
  const [editRow, setEditRow] = useState<Row | null>(null);
  const [pieceInit, setPieceInit] = useState<PieceFromPoInit>(null);   // ทำรายการเป็นงานเหมา
  const [setShopRow, setSetShopRow] = useState<Row | null>(null);   // popup ตั้งร้านให้สินค้าที่ยังไม่มีร้าน
  const [rejectedOpen, setRejectedOpen] = useState(false);          // ป๊อปแท็บ "รายการไม่อนุมัติ"
  const [buyAllShop, setBuyAllShop] = useState<{ name: string; rows: Row[] } | null>(null);
  const [linkRow, setLinkRow] = useState<Row | null>(null);          // popup ใส่ลิงก์สินค้า
  const [reviewOpen, setReviewOpen] = useState(false);               // ป๊อปทวนรายการก่อนสร้างใบสั่งซื้อ
  const [contactShop, setContactShop] = useState<{ name: string; partnerId: string | null } | null>(null);   // popup ติดต่อร้าน
  const [cnBuilder, setCnBuilder] = useState<{ shop: string; items: Row[] } | null>(null);   // หน้าต่างเตรียมใบ PO ร้านจีน
  const [suppliers, setSuppliers] = useState<{ id: string; name: string; cn?: boolean }[]>([]);
  const [taobaoShops, setTaobaoShops] = useState<Set<string>>(new Set());   // ชื่อร้านที่เป็น Taobao
  const [shopQ, setShopQ] = useState("");
  const [prodQ, setProdQ] = useState("");
  const [cartQ, setCartQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [selectMode, setSelectMode] = useState(false);                 // โหมดเลือกหลายชิ้น (ตั้งร้าน/ราคา Mass)
  // responsive (จอ < xl): รายชื่อร้านเป็นลิ้นชัก + ตะกร้าสั่งซื้อเป็นแผ่นเลื่อนขึ้น (กดจากปุ่มลอย)
  const [shopDrawerOpen, setShopDrawerOpen] = useState(false);
  const [cartSheetOpen, setCartSheetOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkShop, setBulkShop] = useState<Row[] | null>(null);        // popup ตั้งร้าน/ราคา หลายชิ้น
  const [createdPOs, setCreatedPOs] = useState<CreatedPO[] | null>(null);   // การ์ดใบสั่งซื้อหลังสร้างสำเร็จ (พิมพ์/แชร์ไลน์)
  const shareItemsRef = useRef<Record<string, ShareItem[]>>({});            // seller_name → รายการ (ไว้ทำข้อความแชร์)
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
    const sk = localStorage.getItem(SORT_KEY); if (sk === "date" || sk === "name" || sk === "qty" || sk === "price") setSortKey(sk);
    // กู้คืน draft ตะกร้า (เผลอปิดหน้า/รีเฟรช ของไม่หาย)
    try {
      const d = JSON.parse(localStorage.getItem(CART_KEY) ?? "{}") as Record<string, CartLine>;
      const n = d && typeof d === "object" ? Object.keys(d).length : 0;
      if (n > 0) { setCart(d); toast.info(`🛒 กู้คืนตะกร้าค้าง ${n} รายการ`); }
    } catch { /* ignore */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // เซฟ draft ตะกร้าอัตโนมัติทุกครั้งที่เปลี่ยน (สั่งสำเร็จ = รายการถูกเอาออก → draft อัปเดตตาม)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* ignore */ }
  }, [cart]);

  // ตัดรายการที่ไม่อยู่ในรายการรอสั่งแล้ว (ถูกสั่ง/ยกเลิกโดยคนอื่น) ออกจาก draft — กันของผีค้างในตะกร้า
  useEffect(() => {
    if (loading || error) return;
    const ids = new Set(rows.map((r) => r.id));
    const dropped = Object.keys(cart).filter((id) => !ids.has(id));
    if (dropped.length === 0) return;
    setCart((c) => { const n = { ...c }; dropped.forEach((id) => delete n[id]); return n; });
    toast.warning(`ตัด ${dropped.length} รายการออกจากตะกร้า (ถูกสั่งซื้อ/ยกเลิกไปแล้ว)`);
  }, [rows, loading, error, cart, toast]);

  const changeView = (v: "table" | "card") => { setView(v); localStorage.setItem(VIEW_KEY, v); };
  const changeCols = (n: number) => { setCols(n); localStorage.setItem(COLS_KEY, String(n)); };
  const changeRate = (n: number) => { setRate(n); if (n > 0) localStorage.setItem(RATE_KEY, String(n)); };
  const changeSort = (s: SortKey) => { setSortKey(s); localStorage.setItem(SORT_KEY, s); };
  // เลือกหลายชิ้น (Mass)
  const toggleSelect = (id: string) => setSelectedIds((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const exitSelect = () => { setSelectMode(false); setSelectedIds(new Set()); };
  const selectedRows = useMemo(() => rows.filter((r) => selectedIds.has(r.id)), [rows, selectedIds]);
  // เรียงรายการในแต่ละ section (วันที่สั่งใหม่ก่อน / ชื่อ / จำนวนมากก่อน / ราคารวมมากก่อน)
  const sortList = useCallback((list: Row[]) => {
    const arr = [...list];
    if (sortKey === "name") arr.sort((a, b) => a.item_name.localeCompare(b.item_name, "th"));
    else if (sortKey === "qty") arr.sort((a, b) => b.qty - a.qty);
    else if (sortKey === "price") arr.sort((a, b) => b.line_total - a.line_total);
    else arr.sort((a, b) => String(b.order_date ?? "").localeCompare(String(a.order_date ?? "")));   // date
    return arr;
  }, [sortKey]);

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

  // ── submit PO (ใช้ร่วม: ตาราง/ตะกร้า/ซื้อทั้งร้าน) — shareRows: รายการที่สั่ง (ไว้ทำข้อความแชร์ตามร้าน) ──
  const submitPO = useCallback(async (body: Record<string, unknown>, orderedIds: string[], shareRows?: { seller_name: string; qty: number; item_name: string; code: string; uom: string }[]) => {
    setBusy(true);
    try {
      const res = await apiFetch("/api/purchasing/create-po", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, actor: user?.name }) });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      const created = (j.created ?? []) as CreatedPO[];
      // จัดรายการตามร้าน ไว้ทำข้อความแชร์ในการ์ด
      const byShop: Record<string, ShareItem[]> = {};
      for (const r of (shareRows ?? [])) { (byShop[r.seller_name] ??= []).push({ name: stripCode(r.item_name), code: r.code, qty: r.qty, uom: r.uom }); }
      shareItemsRef.current = byShop;
      toast.success(`สร้างใบสั่งซื้อ ${created.length} ใบแล้ว`);
      setCart((c) => { const n = { ...c }; orderedIds.forEach((id) => delete n[id]); return n; });
      if (created.length > 0) setCreatedPOs(created);
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
    await submitPO({ pr_ids: valid.map((r) => r.id) }, valid.map((r) => r.id), valid.map((r) => ({ seller_name: r.seller_name, qty: r.qty, item_name: r.item_name, code: r.code, uom: r.uom })));
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
    await submitPO({ items, order_date: orderDate }, cartRows.map((r) => r.id),
      cartRows.map((r) => ({ seller_name: r.seller_name, qty: cart[r.id]?.qty ?? r.qty, item_name: r.item_name, code: r.code, uom: r.uom })));
    setReviewOpen(false);
  }, [cartRows, cart, orderDate, submitPO]);

  // ── PDF ใบขอราคา (RFQ) ส่งร้าน — เปิดหน้าพิมพ์ (Save as PDF) สองภาษาตามสกุลเงินร้าน ──
  // พิมพ์ "ใบสั่งซื้อ (ร่าง)" PDF — A4 แนวตั้ง · ร้านไทย=ไทย · ร้านจีน=จีน+อังกฤษ · toggle ราคา · ปุ่มบันทึกเป็นรูป
  const printPo = useCallback((shop: string, items: PoPrintItem[], opts: { cn: boolean; showPrice: boolean }) => {
    const { cn, showPrice } = opts;
    const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
    const origin = window.location.origin;
    const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const cur = cn ? "¥" : "฿";
    const L = cn
      ? { title: "采购单", company: "I.S.G. Trading Co., Ltd.", subtitle: "Purchase Order", draft: "草稿 DRAFT", date: "日期 Date", supplier: "供应商 Supplier", currency: "货币 Currency",
          base: ['序号<span class="en">No.</span>','图片<span class="en">Image</span>','编码<span class="en">Code</span>','品名<span class="en">Item</span>','数量<span class="en">Qty</span>','单位<span class="en">Unit</span>'], price: ['单价<span class="en">Unit Price</span>','金额<span class="en">Amount</span>'],
          total: "总计 Total", s1: "采购 Buyer", s2: "审批 Approver", s3: "供应商确认 Supplier",
          remark: "备注 Remark: 请确认价格与交期 Please confirm price &amp; lead time · 由 ERP 系统生成", print: "打印 / Print PDF", img: "保存图片 / Save Image" }
      : { title: "ใบสั่งซื้อ", company: "บริษัท ไอ.เอส.จี. เทรดดิ้ง จำกัด", subtitle: "Purchase Order", draft: "ร่าง", date: "วันที่", supplier: "ผู้จำหน่าย", currency: "สกุลเงิน",
          base: ["ลำดับ","รูป","รหัส","รายการสินค้า","จำนวน","หน่วย"], price: ["ราคา/หน่วย","จำนวนเงิน"],
          total: "ยอดรวมทั้งสิ้น", s1: "ผู้สั่งซื้อ", s2: "ผู้อนุมัติ", s3: "ผู้จำหน่าย (รับทราบ)",
          remark: "หมายเหตุ: กรุณายืนยันราคาและกำหนดส่งกลับ · เอกสารออกจากระบบ ERP", print: "พิมพ์ / บันทึก PDF", img: "บันทึกเป็นรูป" };
    const cols = showPrice ? [...L.base, ...L.price] : L.base;
    let grand = 0;
    const body = items.map((r, i) => {
      const amt = r.qty * (r.price || 0); grand += amt;
      const nameCell = (cn && r.name_en) ? `${esc(r.name)}<span class="en">${esc(r.name_en)}</span>` : esc(r.name);
      const priceCells = showPrice ? `<td class="r">${fmt(r.price || 0)}</td><td class="r">${fmt(amt)}</td>` : "";
      return `<tr><td class="c">${i + 1}</td><td class="c">${r.image_url ? `<img src="${origin}${esc(r.image_url)}"/>` : ""}</td><td>${esc(r.code || "")}</td><td>${nameCell}</td><td class="r">${r.qty.toLocaleString()}</td><td class="c">${esc(r.uom || "")}</td>${priceCells}</tr>`;
    }).join("");
    const totalRow = showPrice ? `<div class="totwrap"><div class="tot"><span>${L.total} (${cur})</span><span>${fmt(grand)}</span></div></div>` : "";
    const fname = "PO_" + String(shop).replace(/[\\/:*?"<>|]/g, "_") + ".png";
    const html = `<!doctype html><html lang="${cn ? "zh" : "th"}"><head><meta charset="utf-8"><title>${esc(L.title)} - ${esc(shop)}</title>
      <style>
        @page{size:A4;margin:12mm}
        body{font-family:'Sarabun','Microsoft YaHei','Segoe UI',Tahoma,sans-serif;padding:16px;color:#1e293b;font-size:12px;background:#f1f5f9}
        .doc{max-width:186mm;margin:0 auto;background:#fff;padding:20px 22px;border-radius:6px}
        .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #334155;padding-bottom:10px;margin-bottom:12px}
        .co{font-size:15px;font-weight:700;color:#0f172a}.title{text-align:right}.title .t1{font-size:20px;font-weight:700;color:#c2410c}.title .t2{font-size:11px;color:#64748b;margin-top:2px}
        .draft{display:inline-block;border:1.5px solid #f59e0b;color:#b45309;background:#fffbeb;border-radius:4px;padding:0 6px;font-size:11px;font-weight:700;margin-left:6px}
        .meta{display:grid;grid-template-columns:1fr 1fr;gap:2px 16px;font-size:12px;color:#334155;margin-bottom:12px}.meta b{color:#0f172a}
        table{width:100%;border-collapse:collapse;font-size:11.5px}th,td{border:1px solid #cbd5e1;padding:5px 7px;vertical-align:middle}th{background:#f1f5f9;text-align:center;color:#334155}
        td.r{text-align:right;font-variant-numeric:tabular-nums}td.c{text-align:center}img{width:40px;height:40px;object-fit:cover;border-radius:4px}
        .en{color:#94a3b8;font-weight:400;font-size:9px;display:block}
        .totwrap{display:flex;justify-content:flex-end;margin-top:10px}.tot{min-width:240px;border-top:1.5px solid #334155;padding-top:6px;display:flex;justify-content:space-between;font-size:15px;font-weight:700;color:#0f172a}
        .foot{display:flex;justify-content:space-between;gap:20px;margin-top:28px}.sign{flex:1;text-align:center;font-size:11px;color:#475569}.sign .ln{border-bottom:1px solid #94a3b8;height:34px;margin-bottom:5px}
        .note{font-size:10.5px;color:#64748b;margin-top:12px}
        @media print{body{background:#fff;padding:0}.doc{max-width:none;padding:0;border-radius:0}.noprint{display:none}}
      </style></head>
      <body>
        <div class="doc">
          <div class="head"><div><div class="co">🏢 ${esc(L.company)}</div></div>
            <div class="title"><div class="t1">${L.title}</div><div class="t2">${cn ? "" : L.subtitle + " · "}${L.date}: ${esc(orderDate)} <span class="draft">${L.draft}</span></div></div></div>
          <div class="meta"><div>${L.supplier}: <b>${esc(shop)}</b></div><div>${L.currency}: <b>${cur} ${esc(items[0]?.currency || "")}</b></div></div>
          <table><thead><tr>${cols.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>
          ${totalRow}
          <div class="foot"><div class="sign"><div class="ln"></div>${L.s1}</div><div class="sign"><div class="ln"></div>${L.s2}</div><div class="sign"><div class="ln"></div>${L.s3}</div></div>
          <div class="note">${L.remark}</div>
        </div>
        <div class="noprint" style="max-width:186mm;margin:12px auto 0;display:flex;gap:8px">
          <button onclick="window.print()" style="padding:8px 16px;font-size:14px;cursor:pointer">🖨️ ${L.print}</button>
          <button onclick="saveImg()" style="padding:8px 16px;font-size:14px;cursor:pointer">🖼️ ${L.img}</button>
        </div>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
        <script>function saveImg(){var el=document.querySelector('.doc');if(!window.html2canvas){alert('loading…');return;}html2canvas(el,{scale:2,backgroundColor:'#ffffff',useCORS:true}).then(function(c){var a=document.createElement('a');a.download=${JSON.stringify(fname)};a.href=c.toDataURL('image/png');a.click();});}</script>
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) { toast.error("เบราว์เซอร์บล็อกป๊อปอัป — อนุญาตป๊อปอัปก่อน"); return; }
    w.document.write(html); w.document.close();
  }, [orderDate, toast]);

  // สร้างรายการพิมพ์ PO จาก rows (ไทย) — ชื่อ/รหัสเรา · จำนวนจากตะกร้า
  const poItemsTH = useCallback((items: Row[]): PoPrintItem[] => items.map((r) => ({
    image_url: r.image_url, code: r.code, name: stripCode(r.item_name), qty: cart[r.id]?.qty ?? r.qty, uom: r.uom, price: r.price_est, currency: r.currency,
  })), [cart]);

  // ร้านไหนเป็นจีน: ป้าย Taobao / สกุล RMB / ตั้งค่า cn ในผู้จำหน่าย
  const cnSupplierNames = useMemo(() => new Set(suppliers.filter((s) => s.cn).map((s) => s.name)), [suppliers]);
  const isChineseShop = useCallback((name: string, currency: string) =>
    taobaoShops.has(name) || cnSupplierNames.has(name) || isCNY(currency), [taobaoShops, cnSupplierNames]);

  // ── ข้อมูล view การ์ด ──
  const shops = useMemo(() => {
    const m = new Map<string, { name: string; count: number; total: number; currency: string }>();
    for (const r of rows) { const s = m.get(r.seller_name) ?? { name: r.seller_name, count: 0, total: 0, currency: r.currency }; s.count += 1; s.total += r.line_total; m.set(r.seller_name, s); }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, "th"));
  }, [rows]);
  // แยกร้านไทย/จีน สำหรับลิสต์ซ้าย
  const shopsByOrigin = useMemo(() => {
    const q = shopQ.trim().toLowerCase();
    const filtered = shops.filter((s) => !q || s.name.toLowerCase().includes(q));
    return {
      th: filtered.filter((s) => !isChineseShop(s.name, s.currency)),
      cn: filtered.filter((s) => isChineseShop(s.name, s.currency)),
    };
  }, [shops, shopQ, isChineseShop]);
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
              <>
                <label className="flex items-center gap-1.5 text-xs text-slate-500">เรียงตาม
                  <select value={sortKey} onChange={(e) => changeSort(e.target.value as SortKey)} className="h-9 px-2 text-sm border border-slate-200 rounded-md bg-white">
                    <option value="date">วันที่สั่ง</option>
                    <option value="name">ชื่อสินค้า</option>
                    <option value="qty">จำนวน</option>
                    <option value="price">ราคารวม</option>
                  </select>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-500">การ์ด/แถว
                  <select value={cols} onChange={(e) => changeCols(Number(e.target.value))} className="h-9 px-2 text-sm border border-slate-200 rounded-md bg-white">{[4, 6, 8, 10, 12].map((n) => <option key={n} value={n}>{n}</option>)}</select>
                </label>
                <button onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
                  className={`h-9 px-3 text-sm font-medium rounded-lg border ${selectMode ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>☑️ เลือกหลายชิ้น</button>
              </>
            )}
            <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-sm">
              <button onClick={() => changeView("card")} className={`h-9 px-3 ${view === "card" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>▦ การ์ด</button>
              <button onClick={() => changeView("table")} className={`h-9 px-3 border-l border-slate-200 ${view === "table" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>▤ ตาราง</button>
            </div>
            <button onClick={() => setRejectedOpen(true)} className="h-9 px-3 text-sm font-medium border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50 inline-flex items-center whitespace-nowrap">🚫 รายการไม่อนุมัติ</button>
            <a href="/m/purchase-orders-v2" className="h-9 px-3 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 inline-flex items-center">📋 ดูใบสั่งซื้อ</a>
          </div>
        </div>

        {/* ป๊อปแท็บ "รายการไม่อนุมัติ" + กู้คืน — โหลดใหม่หน้าหลักเมื่อกู้คืน */}
        <RejectedPanel open={rejectedOpen} onClose={() => setRejectedOpen(false)} onChanged={fetchRows} />

        {view === "table" && (
          <DataTable<Row>
            data={rows} columns={COLUMNS} loading={loading} error={error ?? undefined} onRetry={fetchRows}
            emptyMessage="ไม่มีรายการรอสั่งซื้อ" searchPlaceholder="ค้นหา ร้าน / สินค้า / รหัส..."
            searchableKeys={["seller_name", "item_name", "code", "requester"]} tableId="purchase-orders-create" exportFilename="รอสั่งซื้อ"
            selectable bulkActions={bulkActions}
            rowActions={[
              { label: "ดู / แก้ไข", icon: "✎", onClick: (r: Row) => setEditRow(r) } as RowAction<Row>,
              { label: "ทำเป็นงานเหมา", icon: "🧵", onClick: (r: Row) => setPieceInit({ job_name: r.item_name ?? "", rate: Number(r.price_est) || 0 }) } as RowAction<Row>,
            ]}
            views={[{ id: "all", label: "ทั้งหมด" }, { id: "approved", label: "อนุมัติแล้ว", filter: (r) => (r as Row).approved }, { id: "pending", label: "ยังไม่อนุมัติ", filter: (r) => !(r as Row).approved }]}
          />
        )}

        {view === "card" && (
          loading ? <div className="text-center text-slate-400 py-16 text-sm">กำลังโหลด…</div>
          : error ? <div className="text-center text-red-500 py-16 text-sm">⚠ {error} <button onClick={fetchRows} className="underline ml-2">ลองใหม่</button></div>
          : rows.length === 0 ? <div className="text-center text-slate-300 py-16">ไม่มีรายการรอสั่งซื้อ</div>
          : (
            <div className="flex flex-col xl:flex-row gap-4">
              {/* ซ้าย: ร้าน — จอ < xl เป็นลิ้นชักเลื่อนจากซ้าย (เปิดด้วยปุ่ม "ร้าน") · xl เป็นคอลัมน์ */}
              <aside className={`fixed top-14 bottom-0 left-0 z-40 w-72 max-w-[85%] bg-white overflow-auto p-4 shadow-xl transition-transform duration-300 ${shopDrawerOpen ? "translate-x-0" : "-translate-x-full"} xl:static xl:top-auto xl:bottom-auto xl:z-auto xl:w-56 xl:max-w-none xl:translate-x-0 xl:shadow-none xl:p-0 xl:overflow-visible xl:shrink-0`}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-xs font-medium text-slate-500">ร้านที่มีของรอสั่ง ({shops.length})</div>
                  <button onClick={() => setShopDrawerOpen(false)} className="xl:hidden text-slate-400 hover:text-slate-600 text-lg leading-none" aria-label="ปิด">✕</button>
                </div>
                <input value={shopQ} onChange={(e) => setShopQ(e.target.value)} placeholder="🔎 ค้นหาร้าน…" className="w-full h-8 px-2 mb-2 text-xs border border-slate-200 rounded-md" />
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                  <button onClick={() => { setMainTab("shop"); setActiveShop(null); setShopDrawerOpen(false); }} className={`w-full text-left px-3 py-2 text-sm border-b border-slate-100 ${mainTab === "shop" && !activeShop ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-600 hover:bg-slate-50"}`}>🛍️ ทุกร้าน ({rows.length})</button>
                  <button onClick={() => { setMainTab("mo"); setShopDrawerOpen(false); }} className={`w-full text-left px-3 py-2 text-sm border-b border-slate-100 ${mainTab === "mo" ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-600 hover:bg-slate-50"}`}>🏭 จากใบสั่งงาน ({moCount})</button>
                  {([["🇹🇭 ร้านไทย", shopsByOrigin.th], ["🇨🇳 ร้านจีน", shopsByOrigin.cn]] as const).map(([label, list]) => list.length === 0 ? null : (
                    <div key={label}>
                      <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 bg-slate-50 border-b border-slate-100 uppercase tracking-wide">{label} ({list.length})</div>
                      {list.map((s) => (
                        <button key={s.name} onClick={() => { setMainTab("shop"); setActiveShop(s.name); setShopDrawerOpen(false); }} className={`w-full text-left px-3 py-2 border-b border-slate-100 last:border-0 ${mainTab === "shop" && activeShop === s.name ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                          <div className={`text-sm ${mainTab === "shop" && activeShop === s.name ? "text-blue-700 font-medium" : "text-slate-700"}`}>🏪 {s.name}</div>
                          <div className="text-[11px] text-slate-400">{s.count} รายการ · {money(s.total, s.currency)}</div>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </aside>

              {/* กลาง: การ์ด แบ่ง section ตามร้าน */}
              <main className="flex-1 min-w-0 space-y-4">
                {/* จอ < xl: ปุ่มเปิดลิ้นชักร้าน + โชว์ร้านที่เลือกอยู่ */}
                <div className="flex items-center gap-2">
                  <button onClick={() => setShopDrawerOpen(true)} className="xl:hidden flex items-center gap-1.5 h-9 px-3 text-sm border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50 flex-shrink-0 whitespace-nowrap">
                    🏪 {mainTab === "mo" ? "ใบสั่งงาน" : activeShop ? activeShop : "ทุกร้าน"}
                  </button>
                  <input value={prodQ} onChange={(e) => setProdQ(e.target.value)} placeholder="🔎 ค้นหาสินค้า (ชื่อ / รหัส)…" className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md" />
                </div>
                {selectMode && (
                  <div className="sticky top-14 z-10 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-blue-800">เลือก {selectedIds.size} รายการ</span>
                    <div className="ml-auto flex items-center gap-2">
                      <button onClick={() => selectedRows.length > 0 && setBulkShop(selectedRows)} disabled={selectedIds.size === 0}
                        className="h-8 px-3 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">📍 ตั้งร้าน / ราคา ({selectedIds.size})</button>
                      <BulkApproveBar ids={[...selectedIds]} onDone={() => { setSelectedIds(new Set()); void fetchRows(); }} />
                      <button onClick={() => setSelectedIds(new Set())} disabled={selectedIds.size === 0} className="h-8 px-3 text-xs font-medium rounded-md border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-40">ล้างเลือก</button>
                      <button onClick={exitSelect} className="h-8 px-3 text-xs font-medium rounded-md border border-slate-200 text-slate-600 hover:bg-white">ออกจากโหมดเลือก</button>
                    </div>
                  </div>
                )}
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
                  const list = sortList(sec.items.filter((r) => !pq || r.item_name.toLowerCase().includes(pq) || r.code.toLowerCase().includes(pq)));
                  if (list.length === 0) return null;
                  const sectionNoShop = sec.shopName ? noShop(list[0]) : true;
                  return (
                    <section key={sec.key}>
                      <div className="flex items-center justify-between mb-2">
                        <h2 className="text-sm font-semibold text-slate-800">{sec.title} {sec.sub ? <span className="text-xs font-normal text-slate-500">· ผลิต: {sec.sub}</span> : null} <span className="text-xs font-normal text-slate-400">({list.length})</span></h2>
                        {sec.shopName && !sectionNoShop && <button onClick={() => setBuyAllShop({ name: sec.shopName!, rows: list })} disabled={busy} className="h-7 px-2.5 text-xs font-medium rounded-md border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">🛒 ซื้อทั้งร้าน</button>}
                      </div>
                      <div className="grid gap-3 grid-cols-2 sm:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": cols } as CSSProperties}>
                        {list.map((r) => {
                          const on = inCart(r.id);
                          const blocked = noShop(r);
                          const picked = selectedIds.has(r.id);
                          return (
                            <div key={r.id} onClick={() => (selectMode ? toggleSelect(r.id) : blocked ? setSetShopRow(r) : toggleCart(r))}
                              className={`bg-white border rounded-xl overflow-hidden cursor-pointer transition-all ${selectMode && picked ? "border-blue-500 ring-2 ring-blue-300" : on ? "border-blue-400 ring-1 ring-blue-200" : "border-slate-200 hover:border-blue-300 hover:shadow-sm"}`}>
                              <div className="aspect-square bg-slate-50 flex items-center justify-center relative">
                                {selectMode && (
                                  <span className={`absolute top-1.5 left-1.5 z-20 w-6 h-6 rounded-md flex items-center justify-center text-sm font-bold shadow-sm ${picked ? "bg-blue-600 text-white" : "bg-white/90 border border-slate-300 text-transparent"}`}>✓</span>
                                )}
                                {!selectMode && !r.approved && <span className="absolute top-1.5 left-1.5 z-10 text-[10px] px-1 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">ยังไม่อนุมัติ</span>}
                                <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1">
                                  {isTaobaoRow(r) && <span title="Taobao" className="w-6 h-6 flex items-center justify-center rounded-full bg-orange-500 text-white text-[12px] font-bold shadow-sm leading-none">淘</span>}
                                  <button onClick={(e) => { e.stopPropagation(); onLinkClick(r); }}
                                    title={r.purchase_link ? "เปิดลิงก์สินค้า (แท็บใหม่)" : "เพิ่มลิงก์สินค้า"}
                                    className={`w-7 h-7 flex items-center justify-center rounded-full bg-white/90 border shadow-sm text-xs hover:bg-blue-50 ${r.purchase_link ? "border-blue-200 text-blue-600" : "border-slate-200 text-slate-400"}`}>🔗</button>
                                  <button onClick={(e) => { e.stopPropagation(); setEditRow(r); }} title="ดูรายละเอียด / แก้ไข"
                                    className="w-7 h-7 flex items-center justify-center rounded-full bg-white/90 border border-slate-200 shadow-sm hover:bg-blue-50 text-slate-600 text-xs">✎</button>
                                  {!selectMode && <ApproveActions prId={r.id} approved={r.approved} onChanged={fetchRows} compact stop />}
                                </div>
                                {r.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={r.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-slate-300 text-3xl">📦</span>}
                              </div>
                              <div className="p-2.5">
                                <div className="text-sm font-medium text-slate-800 line-clamp-2 leading-snug" title={r.item_name}>{stripCode(r.item_name)}</div>
                                {r.code && <div className="text-[11px] font-mono text-slate-500 bg-slate-50 inline-block px-1.5 py-0.5 rounded mt-0.5 max-w-full truncate">{r.code}</div>}
                                <div className="text-lg font-bold text-orange-600 mt-1 leading-tight">ขอซื้อ {r.qty.toLocaleString()} <span className="text-sm font-medium">{r.uom}</span></div>
                                <div className="text-xs font-medium text-slate-800 mt-0.5">{money(r.line_total, r.currency)}{isCNY(r.currency) && rate > 0 && <span className="text-[11px] font-normal text-slate-400"> ≈ ฿{Math.round(r.line_total * rate).toLocaleString()}</span>}</div>
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

              {/* ขวา: ตะกร้า — จอ < xl เป็นแผ่นเลื่อนขึ้นจากล่าง (เปิดด้วยปุ่มตะกร้าลอย) · xl เป็นคอลัมน์ขวา (ขยายได้) */}
              <aside className={`fixed inset-x-0 bottom-0 z-40 h-[85%] bg-white rounded-t-2xl shadow-2xl flex flex-col transition-transform duration-300 ${cartSheetOpen ? "translate-y-0" : "translate-y-full"} xl:static xl:inset-auto xl:h-auto xl:rounded-none xl:shadow-none xl:translate-y-0 xl:block xl:shrink-0 xl:relative`}
                style={{ width: typeof window !== "undefined" && window.innerWidth >= 1280 ? cartWidth : undefined }}>
                <div onMouseDown={startResize} title="ลากเพื่อขยาย/ย่อ" className="hidden xl:block absolute left-0 top-0 bottom-0 w-1.5 -ml-2 cursor-col-resize hover:bg-blue-200 rounded" />
                {/* top-14 เผื่อพ้นแถบ App tabs (sticky top-0) ของ shell */}
                <div className="bg-white border border-slate-200 rounded-lg xl:sticky xl:top-14 flex flex-col flex-1 min-h-0 xl:block">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <span className="font-semibold text-slate-800">ตะกร้าสั่งซื้อ ({cartRows.length})</span>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1 text-[11px] text-slate-400">¥→฿
                        <input type="number" value={rate} step="0.1" onChange={(e) => changeRate(Number(e.target.value))} className="w-14 h-6 px-1 text-xs border border-slate-200 rounded text-right" />
                      </label>
                      <button onClick={() => setCartSheetOpen(false)} className="xl:hidden text-slate-400 hover:text-slate-600 text-lg leading-none" aria-label="ปิดตะกร้า">✕</button>
                    </div>
                  </div>
                  {cartRows.length > 0 && (
                    <div className="px-3 py-2 border-b border-slate-100">
                      <input value={cartQ} onChange={(e) => setCartQ(e.target.value)} placeholder="🔎 ค้นหาในตะกร้า…" className="w-full h-8 px-2 text-xs border border-slate-200 rounded-md" />
                    </div>
                  )}
                  <div className="flex-1 overflow-auto xl:flex-none xl:max-h-[55vh] p-3 space-y-3">
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

        {/* จอ < xl: ฉากหลังมืดตอนเปิดลิ้นชัก/ตะกร้า + ปุ่มตะกร้าลอย (เฉพาะมุมมองการ์ด) */}
        {view === "card" && (shopDrawerOpen || cartSheetOpen) && (
          <div className="xl:hidden fixed inset-0 z-30 bg-black/40" onClick={() => { setShopDrawerOpen(false); setCartSheetOpen(false); }} />
        )}
        {view === "card" && !cartSheetOpen && (
          <button onClick={() => setCartSheetOpen(true)}
            className="xl:hidden fixed bottom-5 right-5 z-30 h-14 pl-4 pr-5 rounded-full bg-blue-600 text-white shadow-lg flex items-center gap-2 active:scale-95 transition-transform">
            <span className="relative flex items-center">
              🛒
              {cartRows.length > 0 && (
                <span className="absolute -top-2.5 -right-3 min-w-[20px] h-5 px-1 rounded-full bg-rose-500 text-white text-xs font-medium flex items-center justify-center">{cartRows.length}</span>
              )}
            </span>
            <span className="text-sm font-medium">ตะกร้า</span>
          </button>
        )}

      </div>

      {setShopRow && <SetShopModal row={setShopRow} suppliers={suppliers} onSupplierAdded={addSupplier}
        onApprovalChanged={() => { setSetShopRow(null); void fetchRows(); }}
        onClose={() => setSetShopRow(null)}
        onSaved={(updated) => {
          setRows((rs) => rs.map((x) => x.id === updated.id ? updated : x));
          setCart((c) => ({ ...c, [updated.id]: { qty: updated.qty, partial: false } }));
          setSetShopRow(null);
        }} />}
      {editRow && <CardEditModal row={editRow} suppliers={suppliers} onSupplierAdded={addSupplier} onClose={() => setEditRow(null)} onSaved={async () => { setEditRow(null); await fetchRows(); }} />}
      <PieceworkFromPoModal init={pieceInit} onClose={() => setPieceInit(null)} />
      {bulkShop && <BulkSetShopModal rows={bulkShop} suppliers={suppliers} onSupplierAdded={addSupplier}
        onClose={() => setBulkShop(null)}
        onSaved={async () => { setBulkShop(null); exitSelect(); await fetchRows(); }} />}
      {buyAllShop && <BuyAllModal shop={buyAllShop.name} rows={buyAllShop.rows} rate={rate}
        onClose={() => setBuyAllShop(null)}
        onConfirm={async (items) => {
          const byId = new Map(buyAllShop.rows.map((r) => [r.id, r]));
          const share = items.map((i) => { const r = byId.get(i.pr_id); return { seller_name: r?.seller_name ?? buyAllShop.name, qty: i.qty, item_name: r?.item_name ?? "", code: r?.code ?? "", uom: r?.uom ?? "" }; });
          await submitPO({ items, order_date: orderDate }, items.map((i) => i.pr_id), share); setBuyAllShop(null);
        }} />}
      {createdPOs && <PoSuccessModal pos={createdPOs} shareItems={shareItemsRef.current} rate={rate} actor={user?.name ?? ""} onClose={() => setCreatedPOs(null)} />}
      {linkRow && <LinkModal row={linkRow} onClose={() => setLinkRow(null)}
        onSaved={(url) => { const sid = linkRow.item_sku_id; setRows((rs) => rs.map((x) => x.item_sku_id === sid ? { ...x, purchase_link: url } : x)); setLinkRow(null); }} />}

      {contactShop && <ShopContactModal shopName={contactShop.name} partnerId={contactShop.partnerId} onClose={() => setContactShop(null)} />}
      {cnBuilder && <CnPoBuilder shop={cnBuilder.shop} items={cnBuilder.items} printPo={printPo} onSaved={() => void fetchRows()} onClose={() => setCnBuilder(null)} />}

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
                      <button type="button" onClick={() => {
                        if (isChineseShop(shop, items[0]?.currency ?? "THB")) setCnBuilder({ shop, items });
                        else printPo(shop, poItemsTH(items), { cn: false, showPrice: true });
                      }} title="ใบสั่งซื้อ (PDF) — ร้านไทย=ไทย · ร้านจีน=เปิดหน้าต่างเตรียมข้อมูล (จีน+อังกฤษ)"
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
          {/* Line + WeChat ทั้งคู่ (ร้านจีนเอา WeChat ขึ้นก่อน · ร้านไทยเอา Line ขึ้นก่อน) */}
          {(() => {
            const lineBlock = (c.line_url || c.line_id) ? (
              <div key="line" className="flex items-center gap-2 p-2.5 rounded-lg border border-emerald-200 bg-emerald-50">
                <span className="text-sm flex-1">💬 Line: <b>{c.line_id || "(ลิงก์)"}</b></span>
                {c.line_url && <a href={c.line_url} target="_blank" rel="noopener noreferrer" className="h-8 px-3 text-xs font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700 flex items-center">เปิด Line</a>}
                {c.line_id && <button onClick={() => copy(c.line_id, "Line ID")} className="h-8 px-3 text-xs font-medium border border-emerald-300 text-emerald-700 rounded-md hover:bg-emerald-100">คัดลอก ID</button>}
              </div>
            ) : <div key="line" className="text-xs text-slate-400 px-1 py-0.5">💬 ยังไม่มี Line — กด &quot;แก้ไขข้อมูลติดต่อ&quot; เพื่อเพิ่ม</div>;
            const wechatBlock = c.wechat_id ? (
              <div key="wc" className="flex items-center gap-2 p-2.5 rounded-lg border border-green-200 bg-green-50">
                <span className="text-sm flex-1">🟢 WeChat: <b>{c.wechat_id}</b></span>
                <button onClick={() => copy(c.wechat_id, "WeChat ID")} className="h-8 px-3 text-xs font-medium bg-green-600 text-white rounded-md hover:bg-green-700">คัดลอก ID</button>
              </div>
            ) : <div key="wc" className="text-xs text-slate-400 px-1 py-0.5">🟢 ยังไม่มี WeChat — กด &quot;แก้ไขข้อมูลติดต่อ&quot; เพื่อเพิ่ม</div>;
            return isCN ? [wechatBlock, lineBlock] : [lineBlock, wechatBlock];
          })()}
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

// ── หน้าต่างเตรียมใบสั่งซื้อร้านจีน — แก้รหัสร้าน/ชื่อจีน/อังกฤษ/หน่วย + แปล + บันทึกกลับ SKU → ออก PDF ──
function CnPoBuilder({ shop, items, printPo, onSaved, onClose }: {
  shop: string; items: Row[];
  printPo: (shop: string, items: PoPrintItem[], opts: { cn: boolean; showPrice: boolean }) => void;
  onSaved: () => void; onClose: () => void;
}) {
  const toast = useToast();
  type ER = { id: string; sku_id: string | null; our_code: string; our_name: string; supplier_sku_code: string; name_cn: string; name_en: string; qty: number; uom: string; uom_en: string; price: number; currency: string; image_url: string | null };
  const [rows, setRows] = useState<ER[]>(() => items.map((r) => ({
    id: r.id, sku_id: r.item_sku_id, our_code: r.code, our_name: stripCode(r.item_name),
    supplier_sku_code: r.supplier_sku_code ?? "", name_cn: r.name_cn ?? "", name_en: r.name_en ?? "",
    qty: r.qty, uom: r.uom, uom_en: r.purchase_uom_en ?? "", price: r.price_est, currency: r.currency, image_url: r.image_url,
  })));
  const [showPrice, setShowPrice] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const patch = (id: string, p: Partial<ER>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); toast.success("คัดลอกแล้ว"); } catch { /* ignore */ } };
  const tr = async (text: string): Promise<string> => {
    const res = await apiFetch("/api/ai/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, to: "en" }) });
    const j = await res.json().catch(() => ({})); return String(j?.data?.translated ?? "").trim();
  };
  const transName = async (r: ER) => { const s = r.name_cn || r.our_name; if (!s) return; setBusy(true); try { const t = await tr(s); if (t) patch(r.id, { name_en: t }); } catch { toast.error("แปลไม่สำเร็จ"); } finally { setBusy(false); } };
  const transUom = async (r: ER) => { if (!r.uom) return; setBusy(true); try { const t = await tr(r.uom); if (t) patch(r.id, { uom_en: t }); } catch { toast.error("แปลไม่สำเร็จ"); } finally { setBusy(false); } };
  const transAll = async () => {
    setBusy(true);
    try {
      const next = [...rows];
      for (let i = 0; i < next.length; i++) {
        const r = next[i];
        if (!r.name_en && (r.name_cn || r.our_name)) { const t = await tr(r.name_cn || r.our_name); if (t) next[i] = { ...next[i], name_en: t }; }
        if (!r.uom_en && r.uom) { const t = await tr(r.uom); if (t) next[i] = { ...next[i], uom_en: t }; }
      }
      setRows(next); toast.success("แปลครบแล้ว");
    } catch { toast.error("แปลบางรายการไม่สำเร็จ"); } finally { setBusy(false); }
  };
  const saveSku = async () => {
    setSaving(true);
    try {
      const payload = rows.filter((r) => r.sku_id).map((r) => ({ sku_id: r.sku_id, supplier_sku_code: r.supplier_sku_code, name_cn: r.name_cn, name_en: r.name_en, purchase_uom_en: r.uom_en }));
      if (payload.length === 0) { toast.info("ไม่มีรายการที่ผูก SKU ให้บันทึก"); setSaving(false); return; }
      const res = await apiFetch("/api/purchasing/sku-cn-fields", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: payload }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? "save failed");
      toast.success(`บันทึกกลับ SKU ${j.saved} รายการแล้ว`); onSaved();
    } catch (e) { toast.error("บันทึกไม่สำเร็จ: " + String((e as Error).message ?? e)); } finally { setSaving(false); }
  };
  const genPdf = () => printPo(shop, rows.map((r) => ({
    image_url: r.image_url, code: r.supplier_sku_code || r.our_code, name: r.name_cn || r.our_name, name_en: r.name_en || null,
    qty: r.qty, uom: r.uom_en || r.uom, price: r.price, currency: r.currency,
  })), { cn: true, showPrice });

  const inpc = "w-full h-8 px-2 text-sm border border-slate-200 rounded-md";
  return (
    <ERPModal open onClose={onClose} size="lg" storageKey="cn-po-builder" title={`🇨🇳 เตรียมใบสั่งซื้อ — ${shop}`}
      description={`${rows.length} รายการ · แก้ชื่อ/รหัส/หน่วย + แปลอังกฤษ ก่อนออก PDF`}
      footer={<>
        <button onClick={saveSku} disabled={saving} className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50 mr-auto">{saving ? "กำลังบันทึก…" : "💾 บันทึกกลับ SKU"}</button>
        <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ปิด</button>
        <button onClick={genPdf} className="h-9 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">📄 สร้าง PDF</button>
      </>}>
      <div className="flex items-center gap-3 flex-wrap mb-2.5 text-sm">
        <label className="flex items-center gap-1.5 text-slate-600"><input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} /> แสดงราคาในใบ</label>
        <button onClick={() => void transAll()} disabled={busy} className="ml-auto h-8 px-3 text-xs font-medium rounded-lg border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50">{busy ? "กำลังแปล…" : "🌐 แปลทั้งหมด → EN"}</button>
      </div>
      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="w-full text-sm" style={{ minWidth: 720 }}>
          <thead><tr className="bg-slate-50 text-[11px] text-slate-500">
            <th className="text-left px-2 py-1.5 font-medium">รหัสร้าน (供应商编码)</th>
            <th className="text-left px-2 py-1.5 font-medium">ชื่อจีน 品名</th>
            <th className="text-left px-2 py-1.5 font-medium">ชื่ออังกฤษ</th>
            <th className="text-right px-2 py-1.5 font-medium">จำนวน</th>
            <th className="text-left px-2 py-1.5 font-medium">หน่วย (EN)</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-2 py-1.5 align-top">
                  <div className="flex items-center gap-1">
                    <input value={r.supplier_sku_code} onChange={(e) => patch(r.id, { supplier_sku_code: e.target.value })} placeholder={r.our_code} className={inpc} style={{ width: 100 }} />
                    <button onClick={() => copy(r.supplier_sku_code || r.our_code)} title="คัดลอกรหัส" className="h-8 w-8 shrink-0 border border-slate-200 rounded-md text-slate-500 hover:bg-slate-50">⎘</button>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">เรา: {r.our_code || "—"}</div>
                </td>
                <td className="px-2 py-1.5 align-top"><input value={r.name_cn} onChange={(e) => patch(r.id, { name_cn: e.target.value })} placeholder={r.our_name} className={inpc} style={{ minWidth: 130 }} /></td>
                <td className="px-2 py-1.5 align-top">
                  <div className="flex items-center gap-1">
                    <input value={r.name_en} onChange={(e) => patch(r.id, { name_en: e.target.value })} placeholder="English name" className={inpc} style={{ minWidth: 150 }} />
                    <button onClick={() => void transName(r)} disabled={busy} title="แปล→อังกฤษ" className="h-8 px-2 shrink-0 text-[11px] border border-indigo-200 text-indigo-700 rounded-md hover:bg-indigo-50 disabled:opacity-50">แปล</button>
                  </div>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-700 align-top">{r.qty.toLocaleString()}</td>
                <td className="px-2 py-1.5 align-top">
                  <div className="flex items-center gap-1">
                    <input value={r.uom_en} onChange={(e) => patch(r.id, { uom_en: e.target.value })} placeholder={r.uom} className={inpc} style={{ width: 90 }} />
                    <button onClick={() => void transUom(r)} disabled={busy} title="แปลหน่วย→อังกฤษ" className="h-8 px-2 shrink-0 text-[11px] border border-indigo-200 text-indigo-700 rounded-md hover:bg-indigo-50 disabled:opacity-50">แปล</button>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">ไทย: {r.uom || "—"}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-400 mt-2">💡 &quot;บันทึกกลับ SKU&quot; = เก็บรหัสร้าน/ชื่อจีน/อังกฤษ/หน่วย ไว้ครั้งหน้าไม่ต้องกรอกซ้ำ · แปลผ่าน AI (มีตัวสำรอง Google)</p>
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
function SetShopModal({ row, suppliers, onSupplierAdded, onClose, onSaved, onApprovalChanged }: {
  row: Row; suppliers: { id: string; name: string; cn?: boolean }[]; onSupplierAdded: (s: { id: string; name: string; cn?: boolean }) => void;
  onClose: () => void; onSaved: (updated: Row) => void; onApprovalChanged: () => void;
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
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-800">{stripCode(row.item_name)}</div>
            <div className="text-xs text-slate-400">{row.code || "—"} · ขอซื้อ {row.qty.toLocaleString()} {row.uom}</div>
          </div>
          <div className="shrink-0"><ApproveActions prId={row.id} approved={row.approved} onChanged={onApprovalChanged} /></div>
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

// ── popup ตั้งร้าน/ราคา หลายชิ้นพร้อมกัน (Mass) — เลือกร้าน 1 ร้าน + ราคา → ใส่ให้ทุกชิ้นที่เลือก ──
function BulkSetShopModal({ rows, suppliers, onSupplierAdded, onClose, onSaved }: {
  rows: Row[]; suppliers: { id: string; name: string; cn?: boolean }[]; onSupplierAdded: (s: { id: string; name: string; cn?: boolean }) => void;
  onClose: () => void; onSaved: () => void | Promise<void>;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [seller, setSeller] = useState("");
  const [sellerId, setSellerId] = useState("");
  const [price, setPrice] = useState("");      // เว้นว่าง = ไม่แก้ราคา (คงราคาเดิมของแต่ละชิ้น)
  const [cur, setCur] = useState("THB");
  const [setPriceOn, setSetPriceOn] = useState(false);   // ติ๊กถ้าต้องการตั้งราคาเดียวให้ทุกชิ้น
  const [wizardOpen, setWizardOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const pickTaobao = useCallback(async () => {
    try {
      const j = await apiFetch("/api/purchasing/taobao-shop", { method: "POST" }).then((r) => r.json());
      if (j.error || !j.data?.id) { toast.error("ตั้งร้าน Taobao ไม่สำเร็จ: " + (j.error ?? "")); return; }
      onSupplierAdded(j.data); setSeller(j.data.name); setSellerId(j.data.id); setCur("RMB");
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
  }, [onSupplierAdded, toast]);

  const save = async () => {
    if (!seller) { toast.error("เลือกร้านก่อน"); return; }
    setSaving(true);
    const priceN = setPriceOn ? (Number(price) || 0) : null;
    let ok = 0, fail = 0;
    try {
      for (const r of rows) {
        try {
          const body: Record<string, unknown> = { seller_name: seller, currency: cur, actor: user?.name };
          if (priceN != null) body.price_est = priceN;     // ตั้งราคาเดียว · ไม่ติ๊ก = คงราคาเดิม
          const res = await apiFetch(`/api/master-v2/purchase-requests-v2/${r.id}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
          });
          const j = await res.json().catch(() => ({}));
          if (!res.ok || j.error) { fail++; continue; }
          // เก็บร้าน+ราคาเข้ารายการสินค้า (best-effort)
          if (r.item_sku_id && sellerId) {
            await apiFetch(`/api/purchasing/sku-suppliers`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sku_id: r.item_sku_id, partner_id: sellerId, price: priceN ?? r.price_est ?? null, currency: cur, default_if_none: true }),
            }).catch(() => {});
          }
          ok++;
        } catch { fail++; }
      }
      if (ok > 0) toast.success(`ตั้งร้านให้ ${ok} รายการแล้ว${fail ? ` (พลาด ${fail})` : ""}`);
      else toast.error("ตั้งร้านไม่สำเร็จทั้งหมด");
      await onSaved();
    } finally { setSaving(false); }
  };

  return (
    <ERPModal open onClose={onClose} size="md" storageKey="po-bulk-shop" title={`📍 ตั้งร้าน/ราคา ${rows.length} รายการ`}
      description="เลือกร้าน 1 ร้าน → ระบบตั้งให้ทุกชิ้นที่เลือก (ติ๊กถ้าจะตั้งราคาเดียวกันด้วย)"
      footer={<>
        <button onClick={onClose} disabled={saving} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
        <button onClick={() => void save()} disabled={saving || !seller} className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : `ตั้งร้านให้ ${rows.length} รายการ`}</button>
      </>}>
      <div className="space-y-3">
        <div className="max-h-28 overflow-auto text-xs text-slate-500 border border-slate-100 rounded-lg p-2 space-y-0.5">
          {rows.map((r) => <div key={r.id} className="truncate">• {stripCode(r.item_name)} <span className="text-slate-300">({r.code || "—"})</span></div>)}
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">ร้าน (ผู้จำหน่าย) *</label>
          <SupplierPicker value={sellerId} suppliers={suppliers} onChange={(id, name) => { setSellerId(id); setSeller(name); }} onAddNew={() => setWizardOpen(true)} />
          <button type="button" onClick={() => void pickTaobao()} className="mt-1.5 h-7 px-2.5 text-xs font-medium rounded-md border border-orange-200 text-orange-700 bg-orange-50 hover:bg-orange-100">🛒 ตั้งเป็นร้าน Taobao</button>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={setPriceOn} onChange={(e) => setSetPriceOn(e.target.checked)} className="rounded border-slate-300" />
          ตั้งราคาเดียวกันให้ทุกชิ้น
        </label>
        {setPriceOn && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">ราคา/หน่วย ({curLabel(cur)})</label>
            <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md" placeholder="0" />
          </div>
        )}
        {!setPriceOn && <p className="text-[11px] text-slate-400">ไม่ติ๊ก = คงราคาเดิมของแต่ละชิ้น เปลี่ยนแค่ร้าน</p>}
      </div>
      {wizardOpen && <SupplierWizard onClose={() => setWizardOpen(false)} onCreated={(p) => { onSupplierAdded(p); setSeller(p.name); setSellerId(p.id); setWizardOpen(false); toast.success(`เพิ่มผู้จำหน่าย "${p.name}" แล้ว`); }} />}
    </ERPModal>
  );
}

// ── popup "สร้างใบสั่งซื้อสำเร็จ" — การ์ดต่อใบ (พิมพ์ / แชร์ไลน์ / คัดลอกข้อความ ส่ง supplier) ──
function PoSuccessModal({ pos, shareItems, rate, onClose }: {
  pos: CreatedPO[]; shareItems: Record<string, ShareItem[]>; rate: number; actor: string; onClose: () => void;
}) {
  const toast = useToast();
  // ข้อความสรุปใบ (ไว้แชร์ไลน์/คัดลอก ส่งร้าน)
  const buildText = (p: CreatedPO) => {
    const items = shareItems[p.seller_name] ?? [];
    const lines = items.map((it, i) => `${i + 1}. ${it.name}${it.code ? ` (${it.code})` : ""} x ${it.qty.toLocaleString()} ${it.uom}`.trim());
    const total = `${money(p.grand_total, p.currency)}`;
    return [`🧾 ใบสั่งซื้อ ${p.po_no}`, `🏪 ${p.seller_name}`, items.length ? "รายการ:" : "", ...lines, `รวม ${total}`].filter(Boolean).join("\n");
  };
  const shareLine = (p: CreatedPO) => window.open(`https://line.me/R/share?text=${encodeURIComponent(buildText(p))}`, "_blank", "noopener");
  const copyText = async (p: CreatedPO) => { try { await navigator.clipboard.writeText(buildText(p)); toast.success("คัดลอกข้อความแล้ว — วางส่งร้านได้เลย"); } catch { toast.error("คัดลอกไม่สำเร็จ"); } };
  const printPo = (p: CreatedPO) => window.open(`/print/purchase-order/${p.id}`, "_blank", "noopener");

  return (
    <ERPModal open onClose={onClose} size="lg" storageKey="po-success"
      title={`✅ สร้างใบสั่งซื้อสำเร็จ ${pos.length} ใบ`}
      description="พิมพ์ส่งร้าน หรือกดแชร์ไลน์ / คัดลอกข้อความส่งให้ supplier ได้เลย"
      footer={<button onClick={onClose} className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">เสร็จ</button>}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {pos.map((p) => {
          const items = shareItems[p.seller_name] ?? [];
          return (
            <div key={p.id} className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2.5">
                <div className="font-mono text-sm font-semibold">{p.po_no}</div>
                <div className="text-xs opacity-90 truncate">🏪 {p.seller_name}</div>
              </div>
              <div className="p-3">
                {items.length > 0 ? (
                  <div className="space-y-1 max-h-40 overflow-auto">
                    {items.map((it, i) => (
                      <div key={i} className="flex justify-between gap-2 text-xs">
                        <span className="text-slate-700 truncate">{i + 1}. {it.name} {it.code && <span className="text-slate-400">({it.code})</span>}</span>
                        <span className="text-slate-600 tabular-nums shrink-0">{it.qty.toLocaleString()} {it.uom}</span>
                      </div>
                    ))}
                  </div>
                ) : <div className="text-xs text-slate-400">{p.line_count} รายการ</div>}
                <div className="mt-2 pt-2 border-t border-slate-100 flex justify-between text-sm">
                  <span className="text-slate-500">ยอดรวม</span>
                  <span className="font-bold text-blue-600">{money(p.grand_total, p.currency)}{isCNY(p.currency) && rate > 0 && <span className="text-[11px] font-normal text-slate-400"> ≈ ฿{Math.round(p.grand_total * rate).toLocaleString()}</span>}</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-1.5">
                  <button onClick={() => printPo(p)} className="h-8 text-xs font-medium rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">🖨️ พิมพ์</button>
                  <button onClick={() => shareLine(p)} className="h-8 text-xs font-medium rounded-md bg-green-600 text-white hover:bg-green-700">💬 แชร์ไลน์</button>
                  <button onClick={() => void copyText(p)} className="h-8 text-xs font-medium rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">📋 คัดลอก</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
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
  const [skuEdit, setSkuEdit] = useState(false);          // popup แก้สินค้า (SKU จริง) — RelationPeek โหมดแก้เร็ว
  const skuChanged = useRef(false);                       // แก้ SKU แล้ว → ปิดเมื่อไหร่ค่อยรีเฟรชหน้า
  const [changeSkuOpen, setChangeSkuOpen] = useState(false);   // เปิด picker "เปลี่ยนสินค้า"
  const [swap, setSwap] = useState<{ id: string; name: string; code: string; uom: string } | null>(null);   // สินค้าใหม่ที่เลือก (มีผลเมื่อกด "บันทึก")

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

  // เปลี่ยนสินค้าของรายการนี้เป็น SKU อื่น — ดึงข้อมูล SKU ใหม่มาอัปเดตราคา/หน่วย/รูป (มีผลเมื่อกด "บันทึก")
  const onPickNewSku = useCallback(async (v: SkuPickerValue | null) => {
    setChangeSkuOpen(false);
    if (!v) return;
    try {
      const j = await apiFetch(`/api/master-v2/skus/${v.id}`).then((r) => r.json());
      const s = (j.data ?? {}) as Record<string, unknown>;
      const rmb = Number(s.rmb_cost) || 0;
      const isYuan = rmb > 0;   // สินค้าจีน = มีราคาหยวน → ใช้ ¥
      setSwap({ id: v.id, name: String(s.name_th ?? v.name), code: String(s.code ?? v.code), uom: String(s.uom_label ?? v.uom_name ?? "") });
      setImgKey((s.cover_image_r2_key as string) ?? v.image_key ?? null);
      setPrice(String(isYuan ? rmb : (Number(s.list_price) || Number(s.standard_price) || 0)));
      setCur(isYuan ? "RMB" : "THB");
    } catch {
      setSwap({ id: v.id, name: v.name, code: v.code, uom: v.uom_name ?? "" });
      setImgKey(v.image_key ?? null);
      if (v.list_price != null) setPrice(String(v.list_price));
    }
    toast.success('เลือกสินค้าใหม่แล้ว — กด "บันทึก" เพื่อยืนยันการเปลี่ยน');
  }, [toast]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/master-v2/purchase-requests-v2/${row.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qty: Number(qty) || 0, price_est: Number(price) || 0, note: note || null, seller_name: seller || null, currency: cur, actor: user?.name,
          ...(swap ? { item_sku_id: swap.id, item_name: swap.name, uom: swap.uom || row.uom || null } : {}) }),
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
        <div className="mr-auto"><DeleteButton prId={row.id} onDeleted={() => void onSaved()} /></div>
        <button onClick={onClose} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button>
        <button onClick={save} disabled={saving} className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
      </>}>
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-800">{stripCode(row.item_name)}</div>
            <div className="text-xs text-slate-400">{row.code || "—"}</div>
          </div>
          {row.item_sku_id && (
            <div className="flex items-center gap-1.5 shrink-0">
              <button type="button" onClick={() => setChangeSkuOpen((o) => !o)}
                title="เปลี่ยนรายการนี้เป็นสินค้าอื่น (เลือก SKU ใหม่)"
                className="h-7 px-2.5 text-xs font-medium rounded-md border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100">🔄 เปลี่ยนสินค้า</button>
              <button type="button" onClick={() => setSkuEdit(true)}
                title="ดู/แก้รายละเอียดสินค้าตัวจริง (มีผลกับทุกใบที่ใช้สินค้านี้)"
                className="h-7 px-2.5 text-xs font-medium rounded-md border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100">📄 รายละเอียดสินค้า</button>
            </div>
          )}
        </div>
        {/* เปลี่ยนสินค้า: เลือก SKU อื่นมาแทนในรายการนี้ (จำนวน/หมายเหตุเดิมคงไว้ · มีผลเมื่อกดบันทึก) */}
        {changeSkuOpen && row.item_sku_id && (
          <div className="px-2.5 py-2 rounded-md bg-slate-50 border border-slate-200 space-y-1.5">
            <div className="text-[11px] text-slate-500">เลือกสินค้าที่จะใช้แทน:</div>
            <SkuPicker value={null} onChange={onPickNewSku} placeholder="ค้นหา SKU (รหัส / ชื่อ)..." />
          </div>
        )}
        {swap && (
          <div className="px-2.5 py-1.5 rounded-md bg-blue-50 border border-blue-200 text-[11px] text-blue-700 flex items-center gap-1.5 flex-wrap">
            🔄 จะเปลี่ยนเป็น <b>{stripCode(swap.name)}</b> <span className="text-blue-400">({swap.code || "—"})</span> — กด &quot;บันทึก&quot; เพื่อยืนยัน
            <button type="button" onClick={() => setSwap(null)} className="ml-auto text-blue-400 hover:text-red-500 underline">ยกเลิกการเปลี่ยน</button>
          </div>
        )}
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

      {/* popup แก้สินค้า (SKU จริง) — drawer เก่าตัวจริงของ MasterCRUD เปิดโหมดแก้เลย */}
      {skuEdit && row.item_sku_id && (
        <MasterRecordDrawer moduleKey="skus-v2" recordId={row.item_sku_id} startInEdit
          title="SKU"
          onChanged={() => { skuChanged.current = true; }}
          onClose={() => { setSkuEdit(false); if (skuChanged.current) void onSaved(); }} />
      )}
    </ERPModal>
  );
}
