"use client";

// หมวดหมู่ + คุณสมบัติ Lazada (ฐานสำหรับระบบลงสินค้า)
// ดึงต้นไม้หมวดจาก Lazada มา cache → ค้นหาหมวดปลายทาง → ดูว่าหมวดนั้นต้องกรอกคุณสมบัติอะไรบ้าง

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { AppAccessGate } from "@/components/app-access-gate";

type Cat = { id: string; name: string; path: string };
type Attr = { name: string; label: string; required: boolean; input_type: string; is_sale_prop: boolean; options: string[] };
type Brand = { id: string; name: string };

export default function LazadaCategoriesPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandId, setBrandId] = useState("");
  const [cached, setCached] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [q, setQ] = useState("");
  const [cats, setCats] = useState<Cat[]>([]);
  const [sel, setSel] = useState<Cat | null>(null);
  const [attrs, setAttrs] = useState<Attr[] | null>(null);
  const [attrLoading, setAttrLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/platform-accounts").then((r) => r.json()).then((j) => {
      const bs = (j.brands ?? []) as Brand[]; setBrands(bs); if (bs[0]) setBrandId(bs[0].id);
    }).catch(() => {});
  }, []);

  const search = useCallback(async (term: string) => {
    try {
      const j = await apiFetch(`/api/lazada/categories?search=${encodeURIComponent(term)}`).then((r) => r.json());
      setCats((j.categories ?? []) as Cat[]); setCached(j.cached ?? 0);
    } catch (e) { setMsg((e as Error).message); }
  }, []);
  useEffect(() => { const t = setTimeout(() => search(q), 300); return () => clearTimeout(t); }, [q, search]);

  const sync = async () => {
    if (!brandId) { setMsg("เลือกแบรนด์ที่เชื่อม Lazada ก่อน"); return; }
    setSyncing(true); setMsg("กำลังดึงหมวดหมู่จาก Lazada... (อาจใช้เวลาสักครู่)");
    try {
      const r = await apiFetch("/api/lazada/categories/sync", { method: "POST", body: JSON.stringify({ brand_id: brandId }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      setMsg(`✅ ดึงหมวดหมู่เสร็จ: ${j.total} หมวด (${j.leaves} หมวดปลายทางที่ลงสินค้าได้)`); search(q);
    } catch (e) { setMsg("❌ " + (e as Error).message); } finally { setSyncing(false); }
  };

  const pickCat = async (c: Cat) => {
    setSel(c); setAttrs(null); setAttrLoading(true); setMsg(null);
    try {
      const j = await apiFetch(`/api/lazada/category-attributes?brand_id=${encodeURIComponent(brandId)}&category_id=${encodeURIComponent(c.id)}`).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setAttrs((j.attributes ?? []) as Attr[]);
    } catch (e) { setMsg("❌ " + (e as Error).message); setAttrs([]); } finally { setAttrLoading(false); }
  };

  return (
    <AppAccessGate appKey="master">
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-xl font-semibold text-slate-900 mb-1">🛒 หมวดหมู่ + คุณสมบัติ Lazada</h1>
      <p className="text-sm text-slate-500 mb-4">ดึงหมวดหมู่ของ Lazada มาไว้ก่อน → ค้นหาหมวดที่จะลงสินค้า → ดูว่าหมวดนั้นบังคับกรอกอะไรบ้าง (ฐานสำหรับระบบลงสินค้า Lazada)</p>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-sm text-slate-600">แบรนด์:</span>
        <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="h-9 border border-slate-200 rounded-md px-2 text-sm bg-white min-w-[200px]">
          {brands.length === 0 && <option value="">—</option>}
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <button onClick={sync} disabled={syncing || !brandId} className="h-9 px-3 text-sm text-white rounded-lg disabled:opacity-40" style={{ background: "linear-gradient(90deg,#F57224,#0F146D)" }}>{syncing ? "กำลังดึง..." : "↻ ดึงหมวดหมู่จาก Lazada"}</button>
        <span className="text-xs text-slate-400">มีในระบบ {cached.toLocaleString()} หมวด</span>
      </div>
      {msg && <p className="text-sm text-slate-600 mb-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{msg}</p>}
      {cached === 0 && <p className="text-sm text-amber-600 mb-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">ยังไม่มีหมวดหมู่ — กด <b>“ดึงหมวดหมู่จาก Lazada”</b> ก่อน (ต้องเชื่อมต่อ Lazada ที่หน้าจัดการร้านแล้ว)</p>}

      <div className="grid md:grid-cols-2 gap-4">
        {/* ค้นหาหมวด */}
        <div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาหมวด เช่น กระเป๋า, wallet, เสื้อ..." className="w-full h-10 border border-slate-200 rounded-lg px-3 text-sm mb-2" />
          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
            {cats.length === 0 ? <p className="text-sm text-slate-400 p-3">{q ? "ไม่พบหมวดที่ตรงกับคำค้น" : "พิมพ์เพื่อค้นหา หรือเว้นว่างเพื่อดูตัวอย่าง"}</p>
              : cats.map((c) => (
                <button key={c.id} onClick={() => pickCat(c)} className={`w-full text-left px-3 py-2 hover:bg-violet-50 ${sel?.id === c.id ? "bg-violet-50" : ""}`}>
                  <div className="text-sm font-medium text-slate-700">{c.name}</div>
                  <div className="text-[11px] text-slate-400">{c.path} · <span className="font-mono">{c.id}</span></div>
                </button>
              ))}
          </div>
        </div>

        {/* คุณสมบัติของหมวดที่เลือก */}
        <div>
          {!sel ? (
            <div className="border border-dashed border-slate-200 rounded-lg p-6 text-center text-sm text-slate-400 h-full flex items-center justify-center">เลือกหมวดทางซ้ายเพื่อดูคุณสมบัติที่ต้องกรอก</div>
          ) : (
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-sm font-semibold text-slate-800 mb-0.5">{sel.name}</p>
              <p className="text-[11px] text-slate-400 mb-2">{sel.path} · <span className="font-mono">{sel.id}</span></p>
              {attrLoading ? <p className="text-sm text-slate-400">กำลังโหลดคุณสมบัติ...</p>
                : !attrs ? null
                : attrs.length === 0 ? <p className="text-sm text-slate-400">— ไม่มีคุณสมบัติ</p>
                : (
                  <div className="space-y-1.5 max-h-[55vh] overflow-y-auto">
                    <p className="text-[11px] text-slate-400">🔴 = บังคับกรอก · 🎨 = ทำให้เกิดตัวเลือกสินค้า (สี/ไซซ์)</p>
                    {attrs.map((a) => (
                      <div key={a.name} className="border border-slate-100 rounded-lg px-2.5 py-1.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {a.required && <span title="บังคับกรอก">🔴</span>}
                          {a.is_sale_prop && <span title="ตัวเลือกสินค้า (สี/ไซซ์)">🎨</span>}
                          <span className="text-sm text-slate-700">{a.label}</span>
                          <span className="text-[11px] text-slate-400">({a.input_type})</span>
                        </div>
                        {a.options.length > 0 && <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">ตัวเลือก: {a.options.slice(0, 12).join(", ")}{a.options.length > 12 ? ` … (+${a.options.length - 12})` : ""}</div>}
                      </div>
                    ))}
                  </div>
                )}
            </div>
          )}
        </div>
      </div>
    </div>
    </AppAccessGate>
  );
}
