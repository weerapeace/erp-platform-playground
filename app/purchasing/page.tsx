"use client";

/**
 * PR Shopping — ขอซื้อแบบช้อปปิ้งสโตร์ (2 แหล่งสินค้า)
 * - SKU จริง: parent_skus_v2 (การ์ด) → skus_v2 (variation) — ข้อมูลจริง รูป/ราคา/ร้าน
 * - Product Group: product_groups → product_variations (catalog ที่สร้างเอง)
 * เลือก → ตะกร้า → สร้างใบขอซื้อ (PR + lines). currency: ร้าน CN → YUAN
 */
import { useEffect, useMemo, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";

type Card = { id: string; name: string; brand: string | null; category: string | null; image_key: string | null };
type Variation = { key: string; label: string; color: string | null; seller: string; country: string; price: number; currency: string; uom: string; image: string | null; variationId: string | null; skuRef: string | null };
type Line = Variation & { qty: number };
type Source = "sku" | "group";

const img = (k: string | null | undefined) => (k ? `/api/r2-image?key=${encodeURIComponent(k)}` : null);
const num = (v: unknown) => Number(v ?? 0) || 0;

export default function PurchasingShopPage() {
  const { user } = useAuth();
  const canView = usePermission("products.view");
  const [source, setSource] = useState<Source>("sku");
  const [cards, setCards] = useState<Card[]>([]);
  const [q, setQ] = useState("");
  const [brand, setBrand] = useState("");
  const [sel, setSel] = useState<Card | null>(null);
  const [vars, setVars] = useState<Variation[]>([]);
  const [varsLoading, setVarsLoading] = useState(false);
  const [cart, setCart] = useState<Line[]>([]);
  const [partnerCountry, setPartnerCountry] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  // โหลด partner country (สำหรับ currency rule) ครั้งเดียว
  useEffect(() => {
    apiFetch("/api/master-v2/partners?limit=500").then(r => r.json()).then(j => {
      const m: Record<string, string> = {};
      (j.data ?? []).forEach((p: Record<string, unknown>) => { m[String(p.id)] = String(p.country ?? "TH"); });
      setPartnerCountry(m);
    }).catch(() => {});
  }, []);

  // โหลดการ์ดตามแหล่ง
  useEffect(() => {
    setCards([]); setBrand(""); setQ("");
    if (source === "sku") {
      apiFetch("/api/master-v2/parent-skus?limit=300").then(r => r.json()).then(j => {
        setCards((j.data ?? []).map((p: Record<string, unknown>) => ({
          id: String(p.id), name: String(p.name_th || p.sku_name || p.code || ""),
          brand: (p.brand_label as string) ?? null, category: (p.product_family as string) ?? null,
          image_key: (p.cover_image_r2_key as string) ?? null,
        })));
      }).catch(() => {});
    } else {
      apiFetch("/api/master-v2/product-groups?limit=500").then(r => r.json()).then(j => {
        setCards((j.data ?? []).map((g: Record<string, unknown>) => ({
          id: String(g.id), name: String(g.name ?? ""), brand: (g.brand as string) ?? null,
          category: (g.category as string) ?? null, image_key: (g.image_key as string) ?? null,
        })));
      }).catch(() => {});
    }
  }, [source]);

  const brands = useMemo(() => [...new Set(cards.map(c => c.brand).filter(Boolean))] as string[], [cards]);
  const shown = useMemo(() => cards.filter(c =>
    (!q || c.name?.toLowerCase().includes(q.toLowerCase())) && (!brand || c.brand === brand)
  ), [cards, q, brand]);

  const openCard = async (c: Card) => {
    setSel(c); setVars([]); setVarsLoading(true);
    try {
      if (source === "sku") {
        const f = encodeURIComponent(JSON.stringify({ parent_sku_id: { type: "text", value: c.id } }));
        const j = await apiFetch(`/api/master-v2/skus?limit=200&filters=${f}`).then(r => r.json());
        setVars((j.data ?? []).map((s: Record<string, unknown>) => {
          const sid = String(s.seller_partner_id ?? "");
          const country = partnerCountry[sid] ?? "TH";
          return {
            key: String(s.id), label: String(s.name_th || s.code || ""), color: (s.color as string) ?? null,
            seller: String(s.seller_partner_label ?? "—"), country,
            price: num(s.list_price) || num(s.standard_price), currency: country === "CN" ? "YUAN" : "THB",
            uom: String(s.uom_label ?? "ชิ้น"), image: (s.cover_image_r2_key as string) ?? null,
            variationId: null, skuRef: (s.code as string) ?? null,
          } as Variation;
        }));
      } else {
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
      }
    } finally { setVarsLoading(false); }
  };

  const addToCart = (c: Card, v: Variation, qty: number) => {
    setCart(p => [...p, { ...v, label: `${c.name} — ${v.label}`, qty }]);
    setSel(null); setVars([]);
  };

  const save = async () => {
    if (cart.length === 0) return;
    setSaving(true);
    try {
      const prNo = "PR-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" + String(Date.now()).slice(-4);
      const hr = await apiFetch("/api/master-v2/purchase-requests-v2", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pr_no: prNo, requester: user?.name ?? "", status: "waiting", actor: user?.name }) });
      const prId = (await hr.json()).data?.id;
      if (!prId) throw new Error("สร้างหัว PR ไม่สำเร็จ");
      for (const l of cart) {
        await apiFetch("/api/master-v2/pr-lines", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          pr_id: prId, variation_id: l.variationId, sku_ref: l.skuRef, item_name: l.label, qty: l.qty, uom: l.uom,
          seller_name: l.seller, price_est: l.price, currency: l.currency, image_key: l.image, status: "waiting", actor: user?.name,
        }) });
      }
      setDone(prNo); setCart([]);
    } catch (e) { alert(String((e as Error).message ?? e)); }
    finally { setSaving(false); }
  };

  if (!canView) return <PlaygroundShell><AccessDenied message="ต้องมีสิทธิ์ products.view" /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* Filter */}
        <aside className="w-60 flex-shrink-0 border-r border-slate-200 p-4 overflow-auto">
          <h2 className="font-semibold text-slate-800 mb-3">🛒 ขอซื้อ</h2>
          {/* source toggle */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden mb-3 text-xs">
            <button onClick={() => setSource("sku")} className={`flex-1 py-1.5 ${source === "sku" ? "bg-blue-600 text-white" : "text-slate-600"}`}>SKU จริง</button>
            <button onClick={() => setSource("group")} className={`flex-1 py-1.5 ${source === "group" ? "bg-blue-600 text-white" : "text-slate-600"}`}>Product Group</button>
          </div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาสินค้า..."
            className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md mb-3" />
          {brands.length > 0 && <>
            <div className="text-xs font-medium text-slate-500 mb-1">แบรนด์</div>
            <div className="space-y-1">
              <button onClick={() => setBrand("")} className={`block text-sm ${brand === "" ? "text-blue-600 font-medium" : "text-slate-600"}`}>ทั้งหมด</button>
              {brands.map(b => <button key={b} onClick={() => setBrand(b)} className={`block text-sm text-left ${brand === b ? "text-blue-600 font-medium" : "text-slate-600"}`}>{b}</button>)}
            </div>
          </>}
        </aside>

        {/* Grid */}
        <main className="flex-1 overflow-auto p-5">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-semibold text-slate-800">เลือกสินค้าที่ต้องการขอซื้อ</h1>
            <span className="text-sm text-slate-400">{shown.length} รายการ</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {shown.map(c => (
              <button key={c.id} onClick={() => openCard(c)}
                className="text-left bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-blue-300 hover:shadow-md transition-all">
                <div className="aspect-square bg-slate-50 flex items-center justify-center">
                  {img(c.image_key)
                    ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={img(c.image_key)!} alt="" className="w-full h-full object-cover" />
                    : <span className="text-slate-300 text-3xl">📦</span>}
                </div>
                <div className="p-3">
                  <div className="font-medium text-slate-800 text-sm line-clamp-2">{c.name}</div>
                  <div className="text-xs text-slate-400 line-clamp-1">{c.brand || "—"}{c.category ? ` · ${c.category}` : ""}</div>
                </div>
              </button>
            ))}
            {shown.length === 0 && <div className="col-span-full text-center text-slate-300 py-16">ไม่พบสินค้า</div>}
          </div>
        </main>

        {/* Cart */}
        <aside className="w-80 flex-shrink-0 border-l border-slate-200 flex flex-col">
          <div className="p-4 border-b border-slate-100 font-semibold text-slate-800">ใบขอซื้อ ({cart.length})</div>
          <div className="flex-1 overflow-auto p-3 space-y-2">
            {cart.length === 0 && <div className="text-sm text-slate-300 text-center py-8">ยังไม่มีรายการ<br />กดสินค้าทางซ้ายเพื่อเพิ่ม</div>}
            {cart.map((l, i) => (
              <div key={i} className="border border-slate-200 rounded-lg p-2">
                <div className="flex justify-between gap-2">
                  <div className="text-sm text-slate-700 flex-1 line-clamp-2">{l.label}</div>
                  <button onClick={() => setCart(c => c.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500 text-xs">✕</button>
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                  <input type="number" value={l.qty} min={1} onChange={e => setCart(c => c.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) } : x))}
                    className="w-14 h-6 px-1 border border-slate-200 rounded" /> {l.uom}
                  <span className="ml-auto">{l.price.toLocaleString()} {l.currency}</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">🏪 {l.seller}</div>
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-slate-100">
            {done && <div className="mb-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-700">✅ สร้าง {done} แล้ว — <a href="/m/purchase-requests-v2" className="underline">ดูใบขอซื้อ</a></div>}
            <button onClick={save} disabled={saving || cart.length === 0}
              className="w-full h-10 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
              {saving ? "กำลังสร้าง..." : "สร้างใบขอซื้อ →"}
            </button>
          </div>
        </aside>
      </div>

      {/* Variation modal */}
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
                  <AddBtn onAdd={(qty) => addToCart(sel, v, qty)} />
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
      <input type="number" value={qty} min={1} onChange={e => setQty(Number(e.target.value))} className="w-12 h-8 px-1 text-sm border border-slate-200 rounded" />
      <button onClick={() => onAdd(qty)} className="h-8 px-3 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700">+ เพิ่ม</button>
    </div>
  );
}
