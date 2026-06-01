"use client";

/**
 * PR Shopping — ขอซื้อแบบช้อปปิ้งสโตร์
 * เลือกสินค้า (product_groups) → เลือก variation → ใส่จำนวน → ตะกร้า → สร้างใบขอซื้อ (PR)
 * currency อัตโนมัติ: ร้านประเทศ CN → YUAN
 */
import { useEffect, useMemo, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";

type Group = { id: string; code: string; name: string; brand: string | null; category: string | null; image_key: string | null };
type Variation = { id: string; variation_label: string; color: string | null; size: string | null; seller_name: string | null; seller_country: string | null; price_est: number | null; currency: string | null; uom: string | null; image_key: string | null };
type Line = { variation_id: string; item_name: string; qty: number; uom: string; seller_name: string; price_est: number; currency: string };

const img = (k: string | null | undefined) => (k ? `/api/r2-image?key=${encodeURIComponent(k)}` : null);

export default function PurchasingShopPage() {
  const { user } = useAuth();
  const canView = usePermission("products.view");
  const [groups, setGroups] = useState<Group[]>([]);
  const [q, setQ] = useState("");
  const [brand, setBrand] = useState("");
  const [sel, setSel] = useState<Group | null>(null);
  const [vars, setVars] = useState<Variation[]>([]);
  const [cart, setCart] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/master-v2/product-groups?limit=500").then(r => r.json()).then(j => setGroups(j.data ?? [])).catch(() => {});
  }, []);

  const brands = useMemo(() => [...new Set(groups.map(g => g.brand).filter(Boolean))] as string[], [groups]);
  const shown = useMemo(() => groups.filter(g =>
    (!q || g.name?.toLowerCase().includes(q.toLowerCase()) || g.code?.toLowerCase().includes(q.toLowerCase())) &&
    (!brand || g.brand === brand)
  ), [groups, q, brand]);

  const openGroup = async (g: Group) => {
    setSel(g);
    // ดึงทั้งหมดแล้ว filter ฝั่ง client (เลี่ยง ilike บน uuid column)
    const j = await apiFetch(`/api/master-v2/product-variations?limit=500`).then(r => r.json());
    setVars((j.data ?? []).filter((v: Variation & { group_id?: string }) => v.group_id === g.id));
  };

  const addToCart = (g: Group, v: Variation, qty: number) => {
    const currency = v.seller_country === "CN" ? "YUAN" : (v.currency || "THB");
    setCart(c => [...c, {
      variation_id: v.id,
      item_name: `${g.name} — ${v.variation_label}`,
      qty, uom: v.uom || "ชิ้น", seller_name: v.seller_name || "", price_est: Number(v.price_est ?? 0), currency,
    }]);
    setSel(null); setVars([]);
  };

  const save = async () => {
    if (cart.length === 0) return;
    setSaving(true);
    try {
      const prNo = "PR-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" + String(Date.now()).slice(-4);
      const hr = await apiFetch("/api/master-v2/purchase-requests-v2", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pr_no: prNo, requester: user?.name ?? "", status: "waiting", actor: user?.name }) });
      const hj = await hr.json();
      const prId = hj.data?.id;
      if (!prId) throw new Error("สร้างหัว PR ไม่สำเร็จ");
      for (const l of cart) {
        await apiFetch("/api/master-v2/pr-lines", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pr_id: prId, variation_id: l.variation_id, item_name: l.item_name, qty: l.qty, uom: l.uom, seller_name: l.seller_name, price_est: l.price_est, currency: l.currency, status: "waiting", actor: user?.name }) });
      }
      setDone(prNo); setCart([]);
    } catch (e) { alert(String((e as Error).message ?? e)); }
    finally { setSaving(false); }
  };

  if (!canView) return <PlaygroundShell><AccessDenied message="ต้องมีสิทธิ์ products.view" /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* Filter sidebar */}
        <aside className="w-60 flex-shrink-0 border-r border-slate-200 p-4 overflow-auto">
          <h2 className="font-semibold text-slate-800 mb-3">🛒 ขอซื้อ</h2>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาสินค้า..."
            className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md mb-3" />
          <div className="text-xs font-medium text-slate-500 mb-1">แบรนด์</div>
          <div className="space-y-1">
            <button onClick={() => setBrand("")} className={`block text-sm ${brand === "" ? "text-blue-600 font-medium" : "text-slate-600"}`}>ทั้งหมด</button>
            {brands.map(b => <button key={b} onClick={() => setBrand(b)} className={`block text-sm ${brand === b ? "text-blue-600 font-medium" : "text-slate-600"}`}>{b}</button>)}
          </div>
        </aside>

        {/* Product grid */}
        <main className="flex-1 overflow-auto p-5">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-semibold text-slate-800">เลือกสินค้าที่ต้องการขอซื้อ</h1>
            <span className="text-sm text-slate-400">{shown.length} รายการ</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {shown.map(g => (
              <button key={g.id} onClick={() => openGroup(g)}
                className="text-left bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-blue-300 hover:shadow-md transition-all">
                <div className="aspect-square bg-slate-50 flex items-center justify-center">
                  {img(g.image_key)
                    ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={img(g.image_key)!} alt="" className="w-full h-full object-cover" />
                    : <span className="text-slate-300 text-3xl">📦</span>}
                </div>
                <div className="p-3">
                  <div className="font-medium text-slate-800 text-sm line-clamp-1">{g.name}</div>
                  <div className="text-xs text-slate-400">{g.brand || "—"} · {g.category || ""}</div>
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
            {cart.length === 0 && <div className="text-sm text-slate-300 text-center py-8">ยังไม่มีรายการ<br/>กดสินค้าทางซ้ายเพื่อเพิ่ม</div>}
            {cart.map((l, i) => (
              <div key={i} className="border border-slate-200 rounded-lg p-2">
                <div className="flex justify-between gap-2">
                  <div className="text-sm text-slate-700 flex-1">{l.item_name}</div>
                  <button onClick={() => setCart(c => c.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500 text-xs">✕</button>
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                  <input type="number" value={l.qty} min={1} onChange={e => setCart(c => c.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) } : x))}
                    className="w-14 h-6 px-1 border border-slate-200 rounded" /> {l.uom}
                  <span className="ml-auto">{l.price_est.toLocaleString()} {l.currency}</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">🏪 {l.seller_name || "—"}</div>
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-slate-100">
            {done && <div className="mb-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-700">✅ สร้างใบขอซื้อ {done} แล้ว — ดูได้ที่ <a href="/m/purchase-requests-v2" className="underline">ใบขอซื้อ</a></div>}
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
              {vars.length === 0 && <div className="text-sm text-slate-300 py-6 text-center">— ยังไม่มีตัวเลือก —</div>}
              {vars.map(v => (
                <div key={v.id} className="flex items-center gap-3 border border-slate-200 rounded-lg p-2.5">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-700">{v.variation_label}</div>
                    <div className="text-xs text-slate-400">
                      {v.color && `สี ${v.color} · `}🏪 {v.seller_name || "—"} ({v.seller_country})
                      {" · "}{Number(v.price_est ?? 0).toLocaleString()} {v.seller_country === "CN" ? "YUAN" : (v.currency || "THB")}/{v.uom}
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
    <div className="flex items-center gap-1.5">
      <input type="number" value={qty} min={1} onChange={e => setQty(Number(e.target.value))}
        className="w-14 h-8 px-1 text-sm border border-slate-200 rounded" />
      <button onClick={() => onAdd(qty)} className="h-8 px-3 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700">+ เพิ่ม</button>
    </div>
  );
}
