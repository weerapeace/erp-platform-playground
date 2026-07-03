"use client";

// มุมกลับ: สินค้าเรา (Parent SKU) ขายอยู่บนแพลตฟอร์มไหนบ้าง — /master/platform-sku
// ข้อมูลจาก /api/platform-sku-overview · เห็นต่อ SKU ว่าอยู่บนกี่ช่อง + ราคาแต่ละช่อง

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const PLATFORM_ICON: Record<string, string> = { shopee: "🛍️", lazada: "🛒", tiktok: "🎵", website: "🌐", instagram: "📸", facebook: "👍", line_oa: "💬", line_shopping: "🟢", youtube: "▶️", pinterest: "📌", x: "✖️" };

type Brand = { id: string; name: string };
type Channel = { platform_id: string; code: string; name_th: string; icon_key: string | null; count: number; price: number | null };
type Item = { parent_sku_id: string; code: string; name: string; channels: Channel[] };

export default function PlatformSkuPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandId, setBrandId] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");   // กรองเฉพาะที่ขายบนช่องนี้
  const [limit, setLimit] = useState(100);
  const [loading, setLoading] = useState(false);

  useEffect(() => { (async () => {
    try { const j = await apiFetch("/api/platform-accounts").then((r) => r.json()); setBrands((j.brands ?? []) as Brand[]); } catch { /* ignore */ }
  })(); }, []);

  const load = useCallback(async () => {
    setLoading(true); setLimit(100);
    try {
      const query = new URLSearchParams(); if (brandId) query.set("brand_id", brandId); if (q.trim()) query.set("search", q.trim());
      const j = await apiFetch(`/api/platform-sku-overview?${query}`).then((r) => r.json());
      setItems((j.items ?? []) as Item[]);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [brandId, q]);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  // ช่องทางทั้งหมดที่พบ (ไว้ทำตัวกรอง) + ยอดต่อช่อง
  const channelStats = useMemo(() => {
    const m = new Map<string, { code: string; name_th: string; icon_key: string | null; skus: number }>();
    for (const it of items) for (const c of it.channels) {
      const e = m.get(c.platform_id) ?? { code: c.code, name_th: c.name_th, icon_key: c.icon_key, skus: 0 };
      e.skus += 1; m.set(c.platform_id, e);
    }
    return [...m.entries()].map(([id, v]) => ({ platform_id: id, ...v })).sort((a, b) => b.skus - a.skus);
  }, [items]);

  const shown = platformFilter ? items.filter((it) => it.channels.some((c) => c.platform_id === platformFilter)) : items;
  const icon = (c: Channel) => c.icon_key || PLATFORM_ICON[c.code] || "🏬";

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-xl font-semibold text-slate-900">🧬 สินค้าเราขายที่ไหนบ้าง</h1>
        <Link href="/master/platform-catalog" className="shrink-0 h-8 px-3 text-sm text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50 leading-8">สินค้าบนแพลตฟอร์ม →</Link>
      </div>
      <p className="text-sm text-slate-500 mb-4">ดูจากฝั่งสินค้าเรา — แต่ละ Parent SKU ขายอยู่บนช่องทางไหน ราคาช่องละเท่าไหร่ (เฉพาะที่จับคู่แล้ว)</p>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="h-9 border border-slate-200 rounded-md px-2 text-sm bg-white">
          <option value="">ทุกแบรนด์/ร้าน</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 ค้นหารหัส/ชื่อสินค้า..." className="h-9 flex-1 min-w-[180px] border border-slate-200 rounded-md px-3 text-sm" />
      </div>

      {/* ตัวกรองช่องทาง (ชิป) */}
      {channelStats.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <button onClick={() => setPlatformFilter("")} className={`h-7 px-2.5 rounded-full text-xs border ${!platformFilter ? "bg-violet-600 text-white border-violet-600" : "bg-white border-slate-200 text-slate-600"}`}>ทั้งหมด ({items.length})</button>
          {channelStats.map((c) => (
            <button key={c.platform_id} onClick={() => setPlatformFilter(platformFilter === c.platform_id ? "" : c.platform_id)} className={`h-7 px-2.5 rounded-full text-xs border ${platformFilter === c.platform_id ? "bg-violet-600 text-white border-violet-600" : "bg-white border-slate-200 text-slate-600"}`}>
              {(c.icon_key || PLATFORM_ICON[c.code] || "🏬")} {c.name_th} ({c.skus})
            </button>
          ))}
        </div>
      )}

      {loading ? <p className="text-slate-400 text-sm py-10 text-center">กำลังโหลด...</p>
        : shown.length === 0 ? <div className="border border-dashed border-slate-200 rounded-xl p-10 text-center text-sm text-slate-400">ยังไม่มีสินค้าที่จับคู่กับแพลตฟอร์ม<br /><span className="text-slate-300">ไปจับคู่ที่หน้า “จับคู่สินค้าเร็ว” ก่อน</span></div>
        : (
          <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
            {shown.slice(0, limit).map((it) => (
              <div key={it.parent_sku_id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 hover:bg-slate-50/50">
                <div className="flex-1 min-w-[200px]">
                  <div className="text-sm text-slate-800 truncate" title={it.name}><span className="font-mono text-xs text-slate-500">{it.code}</span> · {it.name || "—"}</div>
                  <div className="text-[11px] text-slate-400">ขาย {it.channels.length} ช่องทาง</div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {it.channels.map((c) => (
                    <span key={c.platform_id} className="inline-flex items-center gap-1 text-xs bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5" title={`${c.name_th}${c.count > 1 ? ` · ${c.count} รายการ` : ""}`}>
                      <span>{icon(c)}</span>
                      <span className="text-slate-600">{c.price != null ? `${c.price.toLocaleString()}฿` : "—"}</span>
                      {c.count > 1 && <span className="text-[10px] text-slate-400">×{c.count}</span>}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {shown.length > limit && <button onClick={() => setLimit((l) => l + 200)} className="w-full py-2.5 text-sm text-violet-600 hover:bg-violet-50">แสดงเพิ่ม ({shown.length - limit} รายการ)</button>}
          </div>
        )}
    </div>
  );
}
