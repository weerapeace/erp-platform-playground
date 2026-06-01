"use client";

/**
 * PR Shopping — ขอซื้อแบบช้อปปิ้งสโตร์ (2 แหล่งสินค้า)
 * - SKU จริง: การ์ด = skus_v2 โดยตรง (ค้นหา/กรอง/เลื่อนหน้า ฝั่ง server) → คลิก → popup ยืนยัน
 * - Product Group: product_groups (การ์ด) → product_variations (popup เลือกตัวเลือก)
 * Filter ฝั่งซ้ายไม่ hardcode — ติ๊กเลือก field กรองเองจากทะเบียน field (skus-v2)
 * เลือก → ตะกร้า → สร้างใบขอซื้อ (PR + lines). currency: ร้าน CN → YUAN
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { SkuFormModal } from "@/components/sku-form-modal";

type SkuInfo = { code: string | null; seller: string; country: string; price: number; currency: string; uom: string };
type Card = { id: string; name: string; sub: string | null; image_key: string | null; sku?: SkuInfo };
type Variation = { key: string; label: string; color: string | null; seller: string; country: string; price: number; currency: string; uom: string; image: string | null; variationId: string | null; skuRef: string | null };
type Line = { label: string; qty: number; uom: string; seller: string; price: number; currency: string; image: string | null; variationId: string | null; skuRef: string | null; skuId: string | null; note: string };
type Source = "sku" | "group";

// field ที่กรองได้ (ดึงจากทะเบียน field)
type FilterField = { key: string; column: string; label: string; type: string };
type ColFilter =
  | { type: "text"; value: string }
  | { type: "number"; min: string; max: string }
  | { type: "boolean"; value: "true" | "false" };

const img = (k: string | null | undefined) => (k ? `/api/r2-image?key=${encodeURIComponent(k)}` : null);
const num = (v: unknown) => Number(v ?? 0) || 0;
const PAGE = 48;
const COLS_KEY = "pr_shop_cols";
const FILT_KEY = "pr_shop_filter_keys";

export default function PurchasingShopPage() {
  const { user } = useAuth();
  const canView = usePermission("products.view");
  const [source, setSource] = useState<Source>("sku");

  // grid
  const [cards, setCards] = useState<Card[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);   // หน้า (0-based)
  const [q, setQ] = useState("");
  const [cols, setCols] = useState(4);

  // filter (SKU mode, configurable)
  const [filterFields, setFilterFields] = useState<FilterField[]>([]);
  const [activeKeys, setActiveKeys] = useState<string[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, ColFilter>>({});
  const [pickerOpen, setPickerOpen] = useState(false);

  // group-mode drill-in
  const [sel, setSel] = useState<Card | null>(null);
  const [vars, setVars] = useState<Variation[]>([]);
  const [varsLoading, setVarsLoading] = useState(false);

  // sku-mode confirm popup
  const [confirmSku, setConfirmSku] = useState<Card | null>(null);
  // ฟอร์มเพิ่ม/แก้ไขสินค้า (SKU) แบบ popup
  const [skuForm, setSkuForm] = useState<{ mode: "create" | "edit"; id?: string } | null>(null);

  // cart + save
  const [cart, setCart] = useState<Line[]>([]);
  const [partnerCountry, setPartnerCountry] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  // วันที่สั่ง — ใส่ครั้งเดียวตอนกดสร้าง ใช้กับทุกใบ (default = วันนี้)
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));

  // โหลด preference (จำนวนคอลัมน์ + filter ที่เคยเลือก)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const c = Number(localStorage.getItem(COLS_KEY)); if (c >= 2 && c <= 6) setCols(c);
    try { const k = JSON.parse(localStorage.getItem(FILT_KEY) ?? "[]"); if (Array.isArray(k)) setActiveKeys(k); } catch { /* ignore */ }
  }, []);
  const changeCols = (n: number) => { setCols(n); if (typeof window !== "undefined") localStorage.setItem(COLS_KEY, String(n)); };

  // โหลด partner country (สำหรับ currency rule) + filterable fields ของ SKU
  useEffect(() => {
    apiFetch("/api/master-v2/partners?limit=500").then(r => r.json()).then(j => {
      const m: Record<string, string> = {};
      (j.data ?? []).forEach((p: Record<string, unknown>) => { m[String(p.id)] = String(p.country ?? "TH"); });
      setPartnerCountry(m);
    }).catch(() => {});
    apiFetch("/api/admin/field-registry-v2?module=skus-v2").then(r => r.json()).then(j => {
      const ff: FilterField[] = (j.fields ?? [])
        .filter((f: Record<string, unknown>) => f.is_filterable)
        .map((f: Record<string, unknown>) => ({
          key: String(f.field_key), column: String(f.column_name ?? f.field_key),
          label: String(f.field_label ?? f.field_key), type: String(f.ui_field_type ?? "text"),
        }));
      setFilterFields(ff);
    }).catch(() => {});
  }, []);

  // แปลง activeKeys + filterValues → filters object ที่ส่งให้ API
  const builtFilters = useMemo(() => {
    const out: Record<string, ColFilter> = {};
    for (const k of activeKeys) {
      const fd = filterFields.find(f => f.key === k); if (!fd) continue;
      const v = filterValues[k];
      if (!v) continue;
      if (v.type === "boolean" && (v.value === "true" || v.value === "false")) out[fd.column] = v;
      else if (v.type === "number" && (v.min || v.max)) out[fd.column] = v;
      else if (v.type === "text" && v.value) out[fd.column] = v;
    }
    return out;
  }, [activeKeys, filterValues, filterFields]);

  // ดึงการ์ดแบบทีละหน้า (แทนที่ทั้งหน้า ไม่ใช่ต่อท้าย)
  const fetchCards = useCallback(async (pg: number) => {
    setLoading(true);
    try {
      if (source === "sku") {
        const fp = Object.keys(builtFilters).length ? `&filters=${encodeURIComponent(JSON.stringify(builtFilters))}` : "";
        const sp = q ? `&search=${encodeURIComponent(q)}` : "";
        const j = await apiFetch(`/api/master-v2/skus?limit=${PAGE}&offset=${pg * PAGE}${sp}${fp}`).then(r => r.json());
        const mapped: Card[] = (j.data ?? []).map((s: Record<string, unknown>) => {
          const sid = String(s.seller_partner_id ?? "");
          const country = partnerCountry[sid] ?? "TH";
          return {
            id: String(s.id), name: String(s.name_th || s.code || ""), sub: (s.code as string) ?? null,
            image_key: (s.cover_image_r2_key as string) ?? null,
            sku: {
              code: (s.code as string) ?? null, seller: String(s.seller_partner_label ?? "—"), country,
              price: num(s.list_price) || num(s.standard_price), currency: country === "CN" ? "YUAN" : "THB",
              uom: String(s.uom_label ?? "ชิ้น"),
            },
          } as Card;
        });
        // จัดเรียงตามความใกล้เคียงกับคำค้น: ตรงเป๊ะ → ขึ้นต้น → มีอยู่ในโค้ด → มีอยู่ในชื่อ
        if (q) {
          const ql = q.trim().toLowerCase();
          const score = (c: Card) => {
            const code = (c.sub ?? "").toLowerCase();
            const name = (c.name ?? "").toLowerCase();
            if (code === ql) return 0;
            if (name === ql) return 1;
            if (code.startsWith(ql)) return 2;
            if (name.startsWith(ql)) return 3;
            if (code.includes(ql)) return 4;
            if (name.includes(ql)) return 5;
            return 6;
          };
          mapped.sort((a, b) => score(a) - score(b));
        }
        setTotal(num(j.total) || num(j.count) || (pg * PAGE + mapped.length));
        setCards(mapped);
      } else {
        const j = await apiFetch("/api/master-v2/product-groups?limit=500").then(r => r.json());
        const mapped: Card[] = (j.data ?? []).map((g: Record<string, unknown>) => ({
          id: String(g.id), name: String(g.name ?? ""), sub: (g.brand as string) ?? null,
          image_key: (g.image_key as string) ?? null,
        }));
        setTotal(mapped.length);
        setCards(mapped);
      }
    } finally { setLoading(false); }
  }, [source, q, builtFilters, partnerCountry]);

  // refetch + reset ไปหน้าแรก เมื่อ source/filter/q เปลี่ยน (debounce สำหรับ q)
  useEffect(() => {
    setPage(0);
    const t = setTimeout(() => { void fetchCards(0); }, 300);
    return () => clearTimeout(t);
  }, [fetchCards]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE));
  const goToPage = (pg: number) => {
    const clamped = Math.min(Math.max(0, pg), totalPages - 1);
    setPage(clamped);
    void fetchCards(clamped);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  };

  // group mode: เปิด variation modal
  const openGroup = async (c: Card) => {
    setSel(c); setVars([]); setVarsLoading(true);
    try {
      const f = encodeURIComponent(JSON.stringify({ group_id: { type: "text", value: c.id } }));
      const j = await apiFetch(`/api/master-v2/product-variations?limit=200&filters=${f}`).then(r => r.json());
      setVars((j.data ?? []).map((v: Record<string, unknown>) => {
        const country = String(v.seller_country ?? "TH");
        return {
          key: String(v.id), label: String(v.variation_label ?? ""), color: (v.color as string) ?? null,
          seller: String(v.seller_name ?? "—"), country,
          price: num(v.price_est), currency: country === "CN" ? "YUAN" : String(v.currency ?? "THB"),
          uom: String(v.uom ?? "ชิ้น"), image: (v.image_key as string) ?? null,
          variationId: String(v.id), skuRef: (v.code as string) ?? null,
        } as Variation;
      }));
    } finally { setVarsLoading(false); }
  };

  const onCardClick = (c: Card) => { if (source === "sku") setConfirmSku(c); else void openGroup(c); };

  const addVariation = (c: Card, v: Variation, qty: number) => {
    setCart(p => [...p, { label: `${c.name} — ${v.label}`, qty, uom: v.uom, seller: v.seller, price: v.price, currency: v.currency, image: v.image, variationId: v.variationId, skuRef: v.skuRef, skuId: null, note: "" }]);
    setSel(null); setVars([]);
  };
  const addSku = (c: Card, qty: number, note: string) => {
    const s = c.sku!;
    setCart(p => [...p, { label: c.name, qty, uom: s.uom, seller: s.seller, price: s.price, currency: s.currency, image: c.image_key, variationId: null, skuRef: s.code, skuId: c.id, note }]);
    setConfirmSku(null);
  };

  const save = async () => {
    if (cart.length === 0) return;
    setSaving(true);
    try {
      // Logic ใหม่: 1 สินค้า = 1 ใบขอซื้อ (แยกใบ) + วันที่สั่งเดียวกันทุกใบ
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const base = String(Date.now()).slice(-4);
      let count = 0;
      for (let i = 0; i < cart.length; i++) {
        const l = cart[i];
        const prNo = `PR-${stamp}-${base}-${i + 1}`;
        // 1 ใบ = 1 สินค้า → เก็บข้อมูลสินค้าตรงๆ บนใบ (ไม่ใช้ pr_lines)
        const hr = await apiFetch("/api/master-v2/purchase-requests-v2", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          pr_no: prNo, requester: user?.name ?? "", status: "waiting", order_date: orderDate,
          item_sku_id: l.skuId, item_name: l.label, qty: l.qty, uom: l.uom,
          seller_name: l.seller, price_est: l.price, currency: l.currency, image_key: l.image,
          note: l.note || null, actor: user?.name,
        }) });
        const prId = (await hr.json()).data?.id;
        if (prId) count++;
      }
      setDone(`${count} ใบ`); setCart([]);
    } catch (e) { alert(String((e as Error).message ?? e)); }
    finally { setSaving(false); }
  };

  const toggleFilterKey = (k: string) => {
    setActiveKeys(prev => {
      const next = prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k];
      if (typeof window !== "undefined") localStorage.setItem(FILT_KEY, JSON.stringify(next));
      return next;
    });
  };
  const setFV = (k: string, v: ColFilter | null) => setFilterValues(p => { const n = { ...p }; if (v) n[k] = v; else delete n[k]; return n; });

  if (!canView) return <PlaygroundShell><AccessDenied message="ต้องมีสิทธิ์ products.view" /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* Filter sidebar */}
        <aside className="w-60 flex-shrink-0 border-r border-slate-200 p-4 overflow-auto">
          <h2 className="font-semibold text-slate-800 mb-3">🛒 ขอซื้อ</h2>
          {/* source toggle */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden mb-3 text-xs">
            <button onClick={() => setSource("sku")} className={`flex-1 py-1.5 ${source === "sku" ? "bg-blue-600 text-white" : "text-slate-600"}`}>SKU จริง</button>
            <button onClick={() => setSource("group")} className={`flex-1 py-1.5 ${source === "group" ? "bg-blue-600 text-white" : "text-slate-600"}`}>Product Group</button>
          </div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาสินค้า..."
            className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md mb-3" />

          {source === "sku" && (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-500">ตัวกรอง</span>
                <button onClick={() => setPickerOpen(true)} className="text-xs text-blue-600 hover:underline">+ เลือก filter</button>
              </div>
              {activeKeys.length === 0 && <p className="text-xs text-slate-300 mb-2">ยังไม่ได้เลือกตัวกรอง</p>}
              <div className="space-y-3">
                {activeKeys.map(k => {
                  const fd = filterFields.find(f => f.key === k); if (!fd) return null;
                  const cur = filterValues[k];
                  return (
                    <div key={k}>
                      <div className="text-xs font-medium text-slate-600 mb-1">{fd.label}</div>
                      {fd.type === "boolean" ? (
                        <select value={cur && cur.type === "boolean" ? cur.value : ""} onChange={e => setFV(k, e.target.value ? { type: "boolean", value: e.target.value as "true" | "false" } : null)}
                          className="w-full h-8 px-2 text-xs border border-slate-200 rounded-md bg-white">
                          <option value="">ทั้งหมด</option><option value="true">ใช่</option><option value="false">ไม่ใช่</option>
                        </select>
                      ) : fd.type === "number" ? (
                        <div className="flex gap-1">
                          <input type="number" placeholder="ต่ำสุด" value={cur && cur.type === "number" ? cur.min : ""} onChange={e => setFV(k, { type: "number", min: e.target.value, max: cur && cur.type === "number" ? cur.max : "" })} className="w-full h-8 px-2 text-xs border border-slate-200 rounded-md" />
                          <input type="number" placeholder="สูงสุด" value={cur && cur.type === "number" ? cur.max : ""} onChange={e => setFV(k, { type: "number", min: cur && cur.type === "number" ? cur.min : "", max: e.target.value })} className="w-full h-8 px-2 text-xs border border-slate-200 rounded-md" />
                        </div>
                      ) : (
                        <input value={cur && cur.type === "text" ? cur.value : ""} onChange={e => setFV(k, e.target.value ? { type: "text", value: e.target.value } : null)} placeholder={`ค้นหา ${fd.label}`} className="w-full h-8 px-2 text-xs border border-slate-200 rounded-md" />
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </aside>

        {/* Grid */}
        <main className="flex-1 overflow-auto p-5">
          <div className="flex items-center justify-between mb-4 gap-3">
            <h1 className="text-xl font-semibold text-slate-800">เลือกสินค้าที่ต้องการขอซื้อ</h1>
            <div className="flex items-center gap-3 flex-shrink-0">
              {source === "sku" && (
                <button onClick={() => setSkuForm({ mode: "create" })}
                  className="h-8 px-3 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">＋ เพิ่มสินค้า</button>
              )}
              {/* cols control */}
              <div className="hidden md:flex items-center gap-1 text-slate-400">
                <span className="text-xs">ขนาด</span>
                {[2, 3, 4, 5, 6].map(n => (
                  <button key={n} onClick={() => changeCols(n)} className={`w-6 h-6 text-xs rounded ${cols === n ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>{n}</button>
                ))}
              </div>
              <span className="text-sm text-slate-400">{total.toLocaleString()} รายการ</span>
            </div>
          </div>

          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {cards.map(c => (
              <button key={c.id} onClick={() => onCardClick(c)}
                className="text-left bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-blue-300 hover:shadow-md transition-all">
                <div className="aspect-square bg-slate-50 flex items-center justify-center">
                  {img(c.image_key)
                    ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={img(c.image_key)!} alt="" className="w-full h-full object-cover" />
                    : <span className="text-slate-300 text-3xl">📦</span>}
                </div>
                <div className="p-3">
                  <div className="font-medium text-slate-800 text-sm line-clamp-2">{c.name}</div>
                  {c.sku ? (
                    <>
                      {c.sub && <div className="text-[11px] font-mono text-slate-500 bg-slate-50 inline-block px-1.5 py-0.5 rounded mt-0.5 max-w-full truncate">{c.sub}</div>}
                      <div className="text-xs text-slate-400 line-clamp-1 mt-0.5">🏪 {c.sku.seller}</div>
                      <div className="text-sm font-semibold text-blue-600 mt-1">{c.sku.price.toLocaleString()} {c.sku.currency}<span className="text-xs font-normal text-slate-400"> / {c.sku.uom}</span></div>
                    </>
                  ) : (
                    <div className="text-xs text-slate-400 line-clamp-1">{c.sub || "—"}</div>
                  )}
                </div>
              </button>
            ))}
            {!loading && cards.length === 0 && <div className="col-span-full text-center text-slate-300 py-16">ไม่พบสินค้า</div>}
          </div>

          {loading && <div className="text-center text-slate-400 py-6 text-sm">กำลังโหลด…</div>}
          {source === "sku" && !loading && total > PAGE && (
            <div className="flex items-center justify-center gap-3 py-6">
              <button onClick={() => goToPage(page - 1)} disabled={page <= 0}
                className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-40">← ก่อนหน้า</button>
              <span className="text-sm text-slate-500">หน้า {page + 1} / {totalPages}</span>
              <button onClick={() => goToPage(page + 1)} disabled={page >= totalPages - 1}
                className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-40">ถัดไป →</button>
            </div>
          )}
        </main>

        {/* Cart */}
        <aside className="w-80 flex-shrink-0 border-l border-slate-200 flex flex-col">
          <div className="p-4 border-b border-slate-100 font-semibold text-slate-800">ใบขอซื้อ ({cart.length})</div>
          <div className="flex-1 overflow-auto p-3 space-y-2">
            {cart.length === 0 && <div className="text-sm text-slate-300 text-center py-8">ยังไม่มีรายการ<br />กดสินค้าทางซ้ายเพื่อเพิ่ม</div>}
            {cart.map((l, i) => (
              <div key={i} className="border border-slate-200 rounded-lg p-2">
                <div className="flex justify-between gap-2">
                  <div className="flex gap-2 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded bg-slate-50 flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {img(l.image)
                        ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={img(l.image)!} alt="" className="w-full h-full object-cover" />
                        : <span className="text-slate-300 text-sm">📦</span>}
                    </div>
                    <div className="text-sm text-slate-700 flex-1 min-w-0 line-clamp-2">{l.label}</div>
                  </div>
                  <button onClick={() => setCart(c => c.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500 text-xs">✕</button>
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                  <input type="number" value={l.qty} min={1} step="any" onChange={e => setCart(c => c.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) } : x))}
                    className="w-16 h-6 px-1 border border-slate-200 rounded" /> {l.uom}
                  <span className="ml-auto">{l.price.toLocaleString()} {l.currency}</span>
                </div>
                {l.note && <div className="text-[11px] text-amber-600 mt-0.5">📝 {l.note}</div>}
                <div className="text-[11px] text-slate-400 mt-0.5">🏪 {l.seller}</div>
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-slate-100 space-y-2">
            {done && <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-700">✅ สร้างใบขอซื้อ {done} แล้ว (แยกใบละ 1 สินค้า) — <a href="/m/purchase-requests-v2" className="underline">ดูใบขอซื้อ</a></div>}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">📅 วันที่สั่ง (ใช้กับทุกใบ)</label>
              <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md" />
            </div>
            <button onClick={save} disabled={saving || cart.length === 0}
              className="w-full h-10 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
              {saving ? "กำลังสร้าง..." : `สร้างใบขอซื้อ (${cart.length} ใบ) →`}
            </button>
          </div>
        </aside>
      </div>

      {/* Filter picker (เลือก field ที่จะใช้กรอง) */}
      {pickerOpen && (
        <div className="fixed inset-0 z-[130] bg-black/40 flex items-center justify-center p-4" onClick={() => setPickerOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-800">เลือกตัวกรอง</h3>
              <button onClick={() => setPickerOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <div className="p-4 space-y-1 max-h-[60vh] overflow-auto">
              <p className="text-xs text-slate-400 mb-2">ติ๊กเลือก field ที่อยากใช้เป็นตัวกรอง (มาจากทะเบียน field ของ SKU)</p>
              {filterFields.length === 0 && <p className="text-sm text-slate-300 py-4 text-center">— ยังไม่มี field ที่ตั้งค่าให้กรองได้ —</p>}
              {filterFields.map(f => (
                <label key={f.key} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={activeKeys.includes(f.key)} onChange={() => toggleFilterKey(f.key)} />
                  <span className="text-sm text-slate-700">{f.label}</span>
                  <span className="ml-auto text-[11px] text-slate-300">{f.type}</span>
                </label>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-slate-100 text-right">
              <button onClick={() => setPickerOpen(false)} className="px-4 h-9 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">เสร็จ</button>
            </div>
          </div>
        </div>
      )}

      {/* SKU confirm popup */}
      {confirmSku && confirmSku.sku && (
        <ConfirmSku card={confirmSku} onClose={() => setConfirmSku(null)}
          onAdd={(qty, note) => addSku(confirmSku, qty, note)}
          onEdit={() => setSkuForm({ mode: "edit", id: confirmSku.id })} />
      )}

      {/* ฟอร์มเพิ่ม/แก้ไขสินค้า (SKU) */}
      {skuForm && (
        <SkuFormModal mode={skuForm.mode} skuId={skuForm.id} onClose={() => setSkuForm(null)}
          onSaved={() => { setSkuForm(null); setConfirmSku(null); setPage(0); void fetchCards(0); }} />
      )}

      {/* Group variation modal */}
      {sel && (
        <div className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center p-4" onClick={() => { setSel(null); setVars([]); }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800">{sel.name}</h3>
              <button onClick={() => { setSel(null); setVars([]); }} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <div className="p-4 space-y-2">
              <p className="text-xs text-slate-500 mb-1">เลือกตัวเลือก (variation):</p>
              {varsLoading && <div className="text-sm text-slate-400 py-6 text-center">กำลังโหลด…</div>}
              {!varsLoading && vars.length === 0 && <div className="text-sm text-slate-300 py-6 text-center">— ยังไม่มีตัวเลือก —</div>}
              {vars.map(v => (
                <div key={v.key} className="flex items-center gap-3 border border-slate-200 rounded-lg p-2.5">
                  {img(v.image) && /* eslint-disable-next-line @next/next/no-img-element */ <img src={img(v.image)!} alt="" className="w-10 h-10 rounded object-cover border border-slate-100" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-700 line-clamp-1">{v.label}</div>
                    <div className="text-xs text-slate-400 line-clamp-1">
                      {v.color && `สี ${v.color} · `}🏪 {v.seller} ({v.country}) · {v.price.toLocaleString()} {v.currency}/{v.uom}
                    </div>
                  </div>
                  <AddBtn onAdd={(qty) => addVariation(sel, v, qty)} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </PlaygroundShell>
  );
}

function AddBtn({ onAdd }: { onAdd: (qty: number) => void }) {
  const [qty, setQty] = useState(1);
  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <input type="number" value={qty} min={1} step="any" onChange={e => setQty(Number(e.target.value))} className="w-14 h-8 px-1 text-sm border border-slate-200 rounded" />
      <button onClick={() => onAdd(qty)} className="h-8 px-3 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700">+ เพิ่ม</button>
    </div>
  );
}

function ConfirmSku({ card, onClose, onAdd, onEdit }: { card: Card; onClose: () => void; onAdd: (qty: number, note: string) => void; onEdit: () => void }) {
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const s = card.sku!;
  return (
    <div className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800 line-clamp-1">เพิ่มลงใบขอซื้อ</h3>
          <div className="flex items-center gap-2">
            <button onClick={onEdit} className="h-7 px-2.5 text-xs border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50">✎ แก้ไขสินค้า</button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
          </div>
        </div>
        <div className="p-4">
          <div className="flex gap-3">
            <div className="w-20 h-20 rounded-lg bg-slate-50 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {img(card.image_key)
                ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={img(card.image_key)!} alt="" className="w-full h-full object-cover" />
                : <span className="text-slate-300 text-2xl">📦</span>}
            </div>
            <div className="min-w-0">
              <div className="font-medium text-slate-800 text-sm">{card.name}</div>
              <div className="text-xs text-slate-400 mt-0.5">{s.code}</div>
              <div className="text-xs text-slate-500 mt-0.5">🏪 {s.seller}</div>
              <div className="text-sm font-semibold text-blue-600 mt-1">{s.price.toLocaleString()} {s.currency} / {s.uom}</div>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">จำนวน ({s.uom})</label>
              <input type="number" value={qty} min={1} step="any" onChange={e => setQty(Number(e.target.value))} className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">หมายเหตุ (ถ้ามี)</label>
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="เช่น สีพิเศษ / ด่วน" className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md" />
            </div>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button>
          <button onClick={() => onAdd(qty, note)} disabled={qty <= 0} className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">+ เพิ่มลงตะกร้า</button>
        </div>
      </div>
    </div>
  );
}
