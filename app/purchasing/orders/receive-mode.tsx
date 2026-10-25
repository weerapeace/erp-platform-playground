"use client";

/**
 * หน้าสั่งซื้อ — โหมด 📥 รับของ (สลับจากหัวหน้า "สั่งซื้อ | รับของ")
 * รายการ = บรรทัดใบสั่งซื้อที่ยังรับไม่ครบ (/api/purchasing/receivable ตัวเดียวกับหน้ารับสินค้า · นับ PO ร่างด้วย)
 * ซ้าย: ร้านที่มีของรอรับ (ไทย/จีน) + จากใบสั่งงาน · กลาง: การ์ด (กด = ใส่ตะกร้ารับ ค่าเริ่มต้นรับครบ · ✎ = กรอกละเอียด) · ขวา: ตะกร้ารับของ
 * ตะกร้า/บันทึก = ของกลาง components/receive-line-modal/receive-cart (ตัวเดียวกับป๊อปตะกร้าหน้ารับสินค้า)
 *  → บังคับแนบใบรับของ + บิล · 1 ใบสั่งซื้อ = 1 ใบรับ GR · บวกสต๊อก · audit · แจ้งไลน์ (API /api/purchasing/receive)
 */
import { Fragment, useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { usePermission } from "@/components/auth";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { ReceiveLineFields, type ReceiveInput } from "@/components/receive-line-modal";
import { useReceiveCart, groupReceiveByPo, ReceiveCartMeta, ReceiveAttachBox, ReceiveCartRows, type ReceiveCartItem } from "@/components/receive-line-modal/receive-cart";
import { ReceiveBackfillModal } from "@/components/receive-line-modal/backfill-modal";
import { PoDetailModal } from "@/components/po-detail-modal";
import { GrDetailModal } from "@/components/gr-detail-modal";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";

type RecvItem = ReceiveCartItem & {
  seller_name: string; code: string; image_url: string | null; image_from_parent?: boolean;
  po_status: string; currency: string; order_date: string | null; expected_date: string | null;
  source_mo_no: string | null; used_for_label: string | null;
};
type RecvSort = "age" | "name" | "po" | "remaining";

const SORT_KEY = "po_recv_sort", CART_KEY = "po_recv_cart";
const stripCode = (name: string) => name?.replace(/^\s*\[[^\]]*\]\s*/, "").trim() || name;
/** สั่งมาแล้วกี่วัน (นับวันตามปฏิทินเครื่อง ไม่เพี้ยน timezone) */
const ageDays = (d: string | null) => {
  if (!d) return null;
  const [y, m, dd] = d.slice(0, 10).split("-").map(Number);
  if (!y || !m || !dd) return null;
  const t = new Date();
  return Math.round((Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) - Date.UTC(y, m - 1, dd)) / 86400000);
};
function ageBadge(days: number | null): { text: string; cls: string } | null {
  if (days == null) return null;
  if (days <= 7) return { text: `สั่งมา ${days} วัน`, cls: "bg-slate-50 text-slate-500 border-slate-200" };
  if (days <= 30) return { text: `ค้าง ${days} วัน`, cls: "bg-amber-50 text-amber-700 border-amber-200" };
  return { text: `ค้าง ${days} วัน`, cls: "bg-red-50 text-red-700 border-red-200" };
}

export function ReceiveMode({ cols, isChineseShop }: { cols: number; isChineseShop: (name: string, currency: string) => boolean }) {
  const toast = useToast();
  const canReceive = usePermission("products.edit");   // สิทธิ์เดียวกับ API รับของ
  const canBackfill = usePermission("po.receive_backfill");   // 🧹 เคลียร์ของค้างเก่า (รับย้อนหลังไม่ต้องแนบ)
  const [backfillOpen, setBackfillOpen] = useState(false);
  const rc = useReceiveCart();
  const [items, setItems] = useState<RecvItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mainTab, setMainTab] = useState<"shop" | "mo">("shop");
  const [activeShop, setActiveShop] = useState<string | null>(null);
  const [shopQ, setShopQ] = useState("");
  const [prodQ, setProdQ] = useState("");
  const [sort, setSort] = useState<RecvSort>("age");
  const [cart, setCart] = useState<Record<string, ReceiveInput>>({});   // po_line_id → จำนวนรับ/เสีย (อยู่ในตะกร้า = มี key)
  const [detail, setDetail] = useState<{ it: RecvItem; inp: ReceiveInput } | null>(null);   // ป๊อปกรอกละเอียด (ของกลาง ReceiveLineFields)
  const [poView, setPoView] = useState<string | null>(null);
  const [grOpen, setGrOpen] = useState<string | null>(null);
  const [doneGrs, setDoneGrs] = useState<string[]>([]);
  const [doneBatch, setDoneBatch] = useState<string | null>(null);   // เลขชุดรับ (หลายใบสั่งซื้อในครั้งเดียว)
  const [shopDrawerOpen, setShopDrawerOpen] = useState(false);
  const [cartSheetOpen, setCartSheetOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const j = await apiFetch("/api/purchasing/receivable").then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setItems((j.data ?? []) as RecvItem[]);
    } catch (e) { setError(String((e as Error)?.message ?? e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // จำการเรียง + กู้คืน draft ตะกร้ารับ (เผลอรีเฟรช จำนวนที่กรอกไม่หาย — ไฟล์แนบต้องแนบใหม่)
  useEffect(() => {
    const s = localStorage.getItem(SORT_KEY); if (s === "age" || s === "name" || s === "po" || s === "remaining") setSort(s);
    try { const d = JSON.parse(localStorage.getItem(CART_KEY) ?? "{}"); if (d && typeof d === "object") setCart(d as Record<string, ReceiveInput>); } catch { /* ignore */ }
  }, []);
  useEffect(() => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* ignore */ } }, [cart]);
  // ตัดรายการที่ไม่รอรับแล้ว (รับครบ/ยกเลิกจากที่อื่น) ออกจาก draft
  useEffect(() => {
    if (loading || error) return;
    const ids = new Set(items.map((i) => i.id));
    const dropped = Object.keys(cart).filter((id) => !ids.has(id));
    if (dropped.length) setCart((c) => { const n = { ...c }; dropped.forEach((id) => delete n[id]); return n; });
  }, [items, loading, error, cart]);
  const changeSort = (s: RecvSort) => { setSort(s); localStorage.setItem(SORT_KEY, s); };

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const fullInput = (it: RecvItem): ReceiveInput => ({ recv: String(it.remaining), def: "0" });
  const toggleCart = (it: RecvItem) => setCart((c) => { const n = { ...c }; if (n[it.id]) delete n[it.id]; else n[it.id] = fullInput(it); return n; });
  const addAll = (list: RecvItem[]) => setCart((c) => { const n = { ...c }; for (const it of list) if (!n[it.id]) n[it.id] = fullInput(it); return n; });
  const removeFromCart = (id: string) => setCart((c) => { const n = { ...c }; delete n[id]; return n; });
  const setInput = (id: string, patch: Partial<ReceiveInput>) => setCart((c) => (c[id] ? { ...c, [id]: { ...c[id], ...patch } } : c));

  // ── ร้าน (ซ้าย) + ใบสั่งงาน ──
  const shops = useMemo(() => {
    const m = new Map<string, { name: string; count: number; cn: boolean; pos: Set<string> }>();
    for (const it of items) {
      const s = m.get(it.seller_name) ?? { name: it.seller_name, count: 0, cn: false, pos: new Set<string>() };
      s.count += 1; s.pos.add(it.po_id); s.cn = s.cn || isChineseShop(it.seller_name, it.currency);
      m.set(it.seller_name, s);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, "th"));
  }, [items, isChineseShop]);
  const shopsByOrigin = useMemo(() => {
    const q = shopQ.trim().toLowerCase();
    const f = shops.filter((s) => !q || s.name.toLowerCase().includes(q));
    return { th: f.filter((s) => !s.cn), cn: f.filter((s) => s.cn) };
  }, [shops, shopQ]);
  const moGroups = useMemo(() => {
    const m = new Map<string, { mo: string; product: string; items: RecvItem[] }>();
    for (const it of items) {
      if (!it.source_mo_no) continue;
      const g = m.get(it.source_mo_no);
      if (g) { g.items.push(it); if (!g.product && it.used_for_label) g.product = it.used_for_label; }
      else m.set(it.source_mo_no, { mo: it.source_mo_no, product: it.used_for_label ?? "", items: [it] });
    }
    return [...m.values()].sort((a, b) => b.mo.localeCompare(a.mo, "th"));
  }, [items]);
  const moCount = useMemo(() => items.filter((i) => i.source_mo_no).length, [items]);

  const sortList = useCallback((list: RecvItem[]) => {
    const arr = [...list];
    if (sort === "name") arr.sort((a, b) => stripCode(a.item_name).localeCompare(stripCode(b.item_name), "th"));
    else if (sort === "po") arr.sort((a, b) => a.po_no.localeCompare(b.po_no));
    else if (sort === "remaining") arr.sort((a, b) => b.remaining - a.remaining);
    else arr.sort((a, b) => String(a.order_date ?? "9999").localeCompare(String(b.order_date ?? "9999")) || a.po_no.localeCompare(b.po_no));   // ค้างนานสุดก่อน
    return arr;
  }, [sort]);

  // ร้านที่เลือกไว้รับครบหมดแล้ว (หายจากลิสต์หลังบันทึก) → กลับไปโชว์ทุกร้าน ไม่ปล่อยจอว่าง
  const shopSel = activeShop && shops.some((s) => s.name === activeShop) ? activeShop : null;
  const sections = mainTab === "mo"
    ? moGroups.map((g) => ({ key: g.mo, title: `🏭 ${g.mo}`, sub: g.product, items: g.items }))
    : (shopSel ? shops.filter((s) => s.name === shopSel) : shops).map((s) => ({ key: s.name, title: `🏪 ${s.name}`, sub: "", items: items.filter((i) => i.seller_name === s.name) }));

  // ── ตะกร้า (ขวา) ──
  const cartList = useMemo(() => {
    const list = Object.keys(cart).map((id) => byId.get(id)).filter(Boolean) as RecvItem[];
    return list.sort((a, b) => a.seller_name.localeCompare(b.seller_name, "th") || a.po_no.localeCompare(b.po_no));
  }, [cart, byId]);
  const poCount = useMemo(() => groupReceiveByPo(cartList, cart).size, [cartList, cart]);

  const save = async () => {
    const r = await rc.save(cartList, cart);
    if (!r || r.grNos.length === 0) return;
    toast.success(`รับของแล้ว ${r.grNos.length} ใบรับ${r.batchNo ? ` · ชุด ${r.batchNo}` : ""} · ${r.grNos.join(", ")}`);
    setDoneGrs(r.grNos); setDoneBatch(r.batchNo);
    const saved = new Set(r.savedPoIds);
    setCart((c) => { const n = { ...c }; for (const id of Object.keys(n)) if (saved.has(byId.get(id)?.po_id ?? "")) delete n[id]; return n; });
    if (!r.failed) setCartSheetOpen(false);
    await load();
  };

  return (
    <>
      {loading ? <div className="text-center text-slate-400 py-16 text-sm">กำลังโหลด…</div>
      : error ? <div className="text-center text-red-500 py-16 text-sm">⚠ โหลดรายการรอรับไม่สำเร็จ: {error} <button onClick={() => void load()} className="underline ml-2">ลองใหม่</button></div>
      : (
        <div className="flex flex-col xl:flex-row gap-4">
          {/* ซ้าย: ร้านที่มีของรอรับ — จอ < xl เป็นลิ้นชัก (เหมือนโหมดสั่งซื้อ) */}
          <aside className={`fixed top-14 bottom-0 left-0 z-40 w-72 max-w-[85%] bg-white overflow-auto p-4 shadow-xl transition-transform duration-300 ${shopDrawerOpen ? "translate-x-0" : "-translate-x-full"} xl:static xl:top-auto xl:bottom-auto xl:z-auto xl:w-56 xl:max-w-none xl:translate-x-0 xl:shadow-none xl:p-0 xl:overflow-visible xl:shrink-0`}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-xs font-medium text-slate-500">ร้านที่มีของรอรับ ({shops.length})</div>
              <button onClick={() => setShopDrawerOpen(false)} className="xl:hidden text-slate-400 hover:text-slate-600 text-lg leading-none" aria-label="ปิด">✕</button>
            </div>
            <input value={shopQ} onChange={(e) => setShopQ(e.target.value)} placeholder="🔎 ค้นหาร้าน…" className="w-full h-8 px-2 mb-2 text-xs border border-slate-200 rounded-md" />
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <button onClick={() => { setMainTab("shop"); setActiveShop(null); setShopDrawerOpen(false); }} className={`w-full text-left px-3 py-2 text-sm border-b border-slate-100 ${mainTab === "shop" && !shopSel ? "bg-emerald-50 text-emerald-700 font-medium" : "text-slate-600 hover:bg-slate-50"}`}>🛍️ ทุกร้าน ({items.length})</button>
              <button onClick={() => { setMainTab("mo"); setShopDrawerOpen(false); }} className={`w-full text-left px-3 py-2 text-sm border-b border-slate-100 ${mainTab === "mo" ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-600 hover:bg-slate-50"}`}>🏭 จากใบสั่งงาน ({moCount})</button>
              {([["🇹🇭 ร้านไทย", shopsByOrigin.th], ["🇨🇳 ร้านจีน", shopsByOrigin.cn]] as const).map(([label, list]) => list.length === 0 ? null : (
                <div key={label}>
                  <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 bg-slate-50 border-b border-slate-100 uppercase tracking-wide">{label} ({list.length})</div>
                  {list.map((s) => {
                    const on = mainTab === "shop" && activeShop === s.name;
                    return (
                      <button key={s.name} onClick={() => { setMainTab("shop"); setActiveShop(s.name); setShopDrawerOpen(false); }} className={`w-full text-left px-3 py-2 border-b border-slate-100 last:border-0 ${on ? "bg-emerald-50" : "hover:bg-slate-50"}`}>
                        <div className={`text-sm ${on ? "text-emerald-700 font-medium" : "text-slate-700"}`}>🏪 {s.name}</div>
                        <div className="text-[11px] text-slate-400">{s.count} รายการ · {s.pos.size} ใบสั่งซื้อ</div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </aside>

          {/* กลาง: การ์ดรอรับ แบ่ง section ตามร้าน / ใบสั่งงาน */}
          <main className="flex-1 min-w-0 space-y-4">
            <div className="flex items-center gap-2">
              <button onClick={() => setShopDrawerOpen(true)} className="xl:hidden flex items-center gap-1.5 h-9 px-3 text-sm border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50 flex-shrink-0 whitespace-nowrap">
                🏪 {mainTab === "mo" ? "ใบสั่งงาน" : shopSel ?? "ทุกร้าน"}
              </button>
              <input value={prodQ} onChange={(e) => setProdQ(e.target.value)} placeholder="🔎 ค้นหาสินค้า (ชื่อ / รหัส / เลขใบสั่งซื้อ)…" className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md" />
              <select value={sort} onChange={(e) => changeSort(e.target.value as RecvSort)} title="เรียงการ์ด" className="h-9 px-2 text-sm border border-slate-200 rounded-md bg-white shrink-0">
                <option value="age">ค้างนานสุดก่อน</option>
                <option value="po">เลขใบสั่งซื้อ</option>
                <option value="name">ชื่อสินค้า</option>
                <option value="remaining">รอรับมากสุดก่อน</option>
              </select>
              {canBackfill && <button onClick={() => setBackfillOpen(true)} title="ของค้างรับเก่า: รับย้อนหลัง (ไม่ต้องแนบเอกสาร ใส่เหตุผล) / ยกเลิก" className="h-9 px-3 text-sm border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50 shrink-0 whitespace-nowrap">🧹 เคลียร์ของค้างเก่า</button>}
            </div>

            {doneGrs.length > 0 && (
              <div className="px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700 flex items-center gap-2 flex-wrap">
                <span>✅ รับสินค้าแล้ว {doneGrs.length} ใบรับ{doneBatch ? ` · ชุด ${doneBatch}` : ""}</span>
                {doneBatch && <a href={`/print/goods-receipt/${encodeURIComponent(doneBatch)}`} target="_blank" rel="noreferrer" className="h-7 px-2.5 inline-flex items-center text-xs font-medium rounded-md border border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-50">🖨 พิมพ์รวมทั้งชุด</a>}
                {doneGrs.map((no) => (
                  <Fragment key={no}>
                    <button type="button" onClick={() => setGrOpen(no)} className="h-7 px-2.5 inline-flex items-center text-xs rounded-md border border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-100">✎ ดู / แก้ใบรับ {no}</button>
                    <a href={`/print/goods-receipt/${encodeURIComponent(no)}`} target="_blank" rel="noreferrer" className="h-7 px-2.5 inline-flex items-center text-xs rounded-md border border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-100">🖨 พิมพ์</a>
                  </Fragment>
                ))}
                <a href="/purchasing/vouchers" className="h-7 px-2.5 inline-flex items-center text-xs rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">🧾 ไปออกใบสำคัญรับ (ใส่ราคา)</a>
                <button onClick={() => setDoneGrs([])} className="ml-auto text-emerald-600 hover:text-emerald-800" aria-label="ปิด">✕</button>
              </div>
            )}

            {items.length === 0 && <div className="text-center text-slate-300 py-16 border border-dashed border-slate-200 rounded-lg">ไม่มีของค้างรับ — ใบสั่งซื้อทุกใบรับครบแล้ว</div>}
            {mainTab === "mo" && moGroups.length === 0 && items.length > 0 && (
              <div className="text-center text-slate-300 py-16 border border-dashed border-slate-200 rounded-lg">ยังไม่มีของรอรับที่มาจากใบสั่งงาน</div>
            )}

            {sections.map((sec) => {
              const pq = prodQ.trim().toLowerCase();
              const list = sortList(sec.items.filter((it) => !pq || it.item_name.toLowerCase().includes(pq) || it.code.toLowerCase().includes(pq) || it.po_no.toLowerCase().includes(pq)));
              if (list.length === 0) return null;
              const allIn = list.every((it) => cart[it.id]);
              return (
                <section key={sec.key}>
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <h2 className="text-sm font-semibold text-slate-800">{sec.title} {sec.sub ? <span className="text-xs font-normal text-slate-500">· ผลิต: {sec.sub}</span> : null} <span className="text-xs font-normal text-slate-400">({list.length})</span></h2>
                    <button onClick={() => addAll(list)} disabled={allIn} title="ใส่ทุกรายการในกลุ่มนี้ลงตะกร้ารับ (รับครบ)" className="h-7 px-2.5 text-xs font-medium rounded-md border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 shrink-0">{allIn ? "✓ อยู่ในตะกร้าครบ" : mainTab === "mo" ? "📥 รับทั้งใบงาน" : "📥 รับทั้งร้าน"}</button>
                  </div>
                  <div className="grid gap-3 grid-cols-2 sm:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": cols } as CSSProperties}>
                    {list.map((it) => {
                      const inp = cart[it.id];
                      const age = ageBadge(ageDays(it.order_date));
                      return (
                        <div key={it.id} onClick={() => toggleCart(it)}
                          className={`bg-white border rounded-xl overflow-hidden cursor-pointer transition-all ${inp ? "border-emerald-400 ring-1 ring-emerald-200" : "border-slate-200 hover:border-emerald-300 hover:shadow-sm"}`}>
                          <div className="aspect-square bg-slate-50 flex items-center justify-center relative">
                            {it.qty_received > 0 && <span className="absolute top-1.5 left-1.5 z-10 text-[10px] px-1 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">รับไปบางส่วน</span>}
                            <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1">
                              <button onClick={(e) => { e.stopPropagation(); setPoView(it.po_id); }} title={`ดูใบสั่งซื้อ ${it.po_no}`}
                                className="w-7 h-7 flex items-center justify-center rounded-full bg-white/90 border border-slate-200 shadow-sm hover:bg-blue-50 text-xs">🧾</button>
                              <button onClick={(e) => { e.stopPropagation(); setDetail({ it, inp: cart[it.id] ?? fullInput(it) }); }} title="กรอกรับละเอียด (ของเสีย / รับไม่ครบ / ใบงานที่รอของนี้)"
                                className="w-7 h-7 flex items-center justify-center rounded-full bg-white/90 border border-slate-200 shadow-sm hover:bg-emerald-50 text-slate-600 text-xs">✎</button>
                            </div>
                            {it.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={it.image_url} alt="" loading="lazy" className="w-full h-full object-cover" /> : <span className="text-slate-300 text-3xl">📦</span>}
                            {it.image_from_parent && <span className="absolute bottom-1 left-1 text-[9px] px-1 rounded bg-white/90 text-slate-500 border border-slate-200">รูปตัวแม่</span>}
                          </div>
                          <div className="p-2.5">
                            <div className="text-sm font-medium text-slate-800 line-clamp-2 leading-snug" title={it.item_name}>{stripCode(it.item_name)}</div>
                            {it.code && <div className="text-[11px] font-mono text-slate-500 bg-slate-50 inline-block px-1.5 py-0.5 rounded mt-0.5 max-w-full truncate">{it.code}</div>}
                            <div className="text-lg font-bold text-emerald-600 mt-1 leading-tight">รอรับ {it.remaining.toLocaleString()} <span className="text-sm font-medium">{it.uom}</span></div>
                            <div className="text-[11px] text-slate-500">สั่ง {it.qty.toLocaleString()}{it.qty_received > 0 && <span className="text-emerald-600"> · รับแล้ว {it.qty_received.toLocaleString()}</span>}</div>
                            <div className="text-[11px] text-slate-400 truncate">{it.po_no} · {it.order_date ? formatDate(it.order_date) : "—"}</div>
                            {(age || it.expected_date) && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {age && <span className={`text-[10px] px-1.5 py-0.5 rounded border ${age.cls}`}>{age.text}</span>}
                                {it.expected_date && <span className="text-[10px] px-1.5 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-200">คาดเข้า {formatDate(it.expected_date)}</span>}
                              </div>
                            )}
                            <div className={`w-full mt-2 h-8 text-xs font-medium rounded-md flex items-center justify-center ${inp ? "bg-emerald-100 text-emerald-700 border border-emerald-200" : "bg-emerald-600 text-white"}`}>
                              {inp ? `✓ ในตะกร้ารับ (${Number(inp.recv || 0).toLocaleString()})` : "+ ใส่ตะกร้ารับ"}
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

          {/* ขวา: ตะกร้ารับของ (ของกลาง) — จอ < xl เป็นแผ่นเลื่อนขึ้นจากล่าง */}
          <aside className={`fixed inset-x-0 bottom-0 z-40 h-[85%] bg-white rounded-t-2xl shadow-2xl flex flex-col transition-transform duration-300 ${cartSheetOpen ? "translate-y-0" : "translate-y-full"} xl:static xl:inset-auto xl:h-auto xl:rounded-none xl:shadow-none xl:translate-y-0 xl:block xl:shrink-0 xl:w-[360px]`}>
            <div className="bg-white border border-slate-200 rounded-lg xl:sticky xl:top-14 flex flex-col flex-1 min-h-0 xl:block">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <span className="font-semibold text-slate-800">🧺 ตะกร้ารับของ ({cartList.length})</span>
                <button onClick={() => setCartSheetOpen(false)} className="xl:hidden text-slate-400 hover:text-slate-600 text-lg leading-none" aria-label="ปิดตะกร้า">✕</button>
              </div>
              <div className="flex-1 overflow-auto xl:flex-none xl:max-h-[40vh] p-3">
                {cartList.length === 0
                  ? <div className="text-sm text-slate-300 text-center py-8">ยังไม่มีรายการ<br />กดการ์ดเพื่อใส่ตะกร้ารับ</div>
                  : <ReceiveCartRows compact items={cartList} inputs={cart} onInput={setInput} onRemove={(it) => removeFromCart(it.id)} />}
              </div>
              <div className="p-3 border-t border-slate-100 space-y-3 overflow-auto">
                <ReceiveCartMeta cart={rc} compact />
                <ReceiveAttachBox cart={rc} compact />
                {rc.err && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">⚠️ {rc.err}</div>}
                {!canReceive && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">ต้องมีสิทธิ์ products.edit ถึงจะบันทึกรับของได้</div>}
                <button onClick={() => void save()} disabled={rc.saving || cartList.length === 0 || !canReceive}
                  className="w-full h-10 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40">{rc.saving ? "กำลังบันทึก…" : `✓ บันทึกรับสินค้า (${cartList.length})`}</button>
                <p className="text-[10px] text-slate-400 text-center">{poCount > 0 ? `จะออกใบรับ ${poCount} ใบ (แยกตามใบสั่งซื้อ)` : "รายการต่างใบสั่งซื้อจะแยกเป็นคนละใบรับให้อัตโนมัติ"}</p>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* จอ < xl: ฉากหลังมืดตอนเปิดลิ้นชัก/ตะกร้า + ปุ่มตะกร้ารับลอย */}
      {(shopDrawerOpen || cartSheetOpen) && (
        <div className="xl:hidden fixed inset-0 z-30 bg-black/40" onClick={() => { setShopDrawerOpen(false); setCartSheetOpen(false); }} />
      )}
      {!cartSheetOpen && !loading && !error && (
        <button onClick={() => setCartSheetOpen(true)}
          className="xl:hidden fixed bottom-5 right-5 z-30 h-14 pl-4 pr-5 rounded-full bg-emerald-600 text-white shadow-lg flex items-center gap-2 active:scale-95 transition-transform">
          <span className="relative flex items-center">
            🧺
            {cartList.length > 0 && <span className="absolute -top-2.5 -right-3 min-w-[20px] h-5 px-1 rounded-full bg-rose-500 text-white text-xs font-medium flex items-center justify-center">{cartList.length}</span>}
          </span>
          <span className="text-sm font-medium">ตะกร้ารับ</span>
        </button>
      )}

      {/* ป๊อปกรอกละเอียด — ของกลาง ReceiveLineFields (รับ/เสีย · รับไม่ครบ: รอรับเพิ่ม/ปิดบิล · ใบงานที่รอวัตถุดิบนี้) */}
      {detail && (() => {
        const { it, inp } = detail;
        return (
          <ERPModal open onClose={() => setDetail(null)} size="md" storageKey="po-recv-line"
            title="📥 รับของรายการนี้" description={`🏪 ${it.seller_name} · ${it.po_no}`}
            footer={<>
              <button onClick={() => setPoView(it.po_id)} className="mr-auto px-3 h-9 text-xs font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50">🧾 ดูใบสั่งซื้อ</button>
              {cart[it.id] && <button onClick={() => { removeFromCart(it.id); setDetail(null); }} className="px-3 h-9 text-xs border border-slate-200 text-slate-500 rounded-lg hover:text-red-600 hover:bg-red-50">เอาออกจากตะกร้า</button>}
              <button onClick={() => setDetail(null)} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button>
              <button onClick={() => { setCart((c) => ({ ...c, [it.id]: inp })); setDetail(null); }} className="px-5 h-9 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">✓ ใส่ตะกร้ารับ</button>
            </>}>
            <div className="flex gap-3">
              <div className="w-20 h-20 rounded-lg bg-slate-50 flex items-center justify-center overflow-hidden border border-slate-100 shrink-0">
                {it.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={it.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-slate-300 text-2xl">📦</span>}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-800 leading-snug">{stripCode(it.item_name)}</div>
                {it.code && <div className="text-[11px] font-mono text-slate-500 mt-0.5">{it.code}</div>}
                <div className="text-sm text-slate-600 mt-1">
                  คงเหลือรอรับ <b className="text-slate-900">{it.remaining.toLocaleString()}</b> {it.uom}
                  <span className="text-slate-400"> · สั่ง {it.qty.toLocaleString()}</span>
                  {it.qty_received > 0 && <span className="text-emerald-600"> · รับแล้ว {it.qty_received.toLocaleString()}</span>}
                </div>
              </div>
            </div>
            <ReceiveLineFields remaining={it.remaining} uom={it.uom} code={it.code || null} poLineId={it.id} poNo={it.po_no}
              value={inp} onChange={(p) => setDetail((d) => (d ? { ...d, inp: { ...d.inp, ...p } } : d))} autoFocus />
            <div className="mt-2 text-[11px] text-slate-400">กด <b>ใส่ตะกร้ารับ</b> แล้วเลือกรายการอื่นต่อได้ → แนบใบรับของ + บิล แล้วกดบันทึกในตะกร้า</div>
          </ERPModal>
        );
      })()}
      {backfillOpen && <ReceiveBackfillModal onClose={() => setBackfillOpen(false)} onDone={() => void load()} />}
      {poView && <PoDetailModal poId={poView} onClose={() => setPoView(null)} onSaved={() => void load()} />}
      {grOpen && <GrDetailModal grId={grOpen} onClose={() => setGrOpen(null)} onSaved={() => void load()} />}
    </>
  );
}
