"use client";

// สินค้าบนแพลตฟอร์ม (Platform Catalog) — ทิศอ่าน: ดูว่าแต่ละร้าน/แพลตฟอร์มมีสินค้าอะไร + ฟิลด์อะไร
// เฟสนี้ = โครง (ตาราง+หน้า+API พร้อม) ยังไม่ดึงข้อมูลจริง · นำเข้า (อัปไฟล์ export/ต่อ API) เฟสถัดไป

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { MiniTable, type MiniColumn } from "@/components/mini-table";

const PLATFORM_ICON: Record<string, string> = { shopee: "🛍️", lazada: "🛒", tiktok: "🎵", website: "🌐", instagram: "📸", facebook: "👍", line_oa: "💬", youtube: "▶️", pinterest: "📌", x: "✖️" };

type Platform = { id: string; code: string; name_th: string; icon_key: string | null };
type Brand = { id: string; name: string };
type FieldRow = { field_key: string; field_label: string | null; data_type: string | null; is_required: boolean; sample: string | null; source: string };
type Listing = { id: string; external_product_id: string | null; title: string | null; sku_code: string | null; matched_parent_sku_id: string | null; price: number | null; status: string | null };

export default function PlatformCatalogPage() {
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [platformId, setPlatformId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [tab, setTab] = useState<"catalog" | "fields">("catalog");
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [summary, setSummary] = useState({ total: 0, matched: 0 });
  const [loading, setLoading] = useState(false);

  useEffect(() => { (async () => {
    try {
      const j = await apiFetch("/api/platform-accounts").then((r) => r.json());
      const pfs = (j.platforms ?? []) as Platform[];
      setPlatforms(pfs); setBrands((j.brands ?? []) as Brand[]);
      if (pfs[0]) setPlatformId(pfs[0].id);
    } catch { /* ignore */ }
  })(); }, []);

  const load = useCallback(async () => {
    if (!platformId) return;
    setLoading(true);
    try {
      const q = new URLSearchParams({ platform_id: platformId }); if (brandId) q.set("brand_id", brandId);
      const j = await apiFetch(`/api/platform-catalog?${q}`).then((r) => r.json());
      setFields((j.fields ?? []) as FieldRow[]);
      setListings((j.listings ?? []) as Listing[]);
      setSummary(j.summary ?? { total: 0, matched: 0 });
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [platformId, brandId]);
  useEffect(() => { load(); }, [load]);

  const activePf = platforms.find((p) => p.id === platformId);
  const cols: MiniColumn<Listing>[] = [
    { key: "ext", header: "รหัสบนแพลตฟอร์ม", width: "1.2fr", cell: (l) => <span className="font-mono text-xs">{l.external_product_id || "—"}</span> },
    { key: "title", header: "ชื่อสินค้า", width: "2fr", sortValue: (l) => l.title ?? "", cell: (l) => <span className="truncate">{l.title || "—"}</span> },
    { key: "sku", header: "SKU", width: "1fr", cell: (l) => <span className="font-mono text-xs">{l.sku_code || "—"}</span> },
    { key: "price", header: "ราคา", width: "0.8fr", align: "right", sortValue: (l) => l.price ?? -1, cell: (l) => l.price != null ? <span>{l.price.toLocaleString()}฿</span> : "—" },
    { key: "match", header: "จับคู่ ERP", width: "5rem", align: "center", cell: (l) => l.matched_parent_sku_id ? <span className="text-emerald-600">✓</span> : <span className="text-slate-300">—</span> },
  ];
  const fcols: MiniColumn<FieldRow>[] = [
    { key: "key", header: "Field", width: "1.3fr", sortValue: (f) => f.field_key, cell: (f) => <span className="font-mono text-xs">{f.field_key}</span> },
    { key: "label", header: "ป้าย", width: "1.3fr", cell: (f) => f.field_label || "—" },
    { key: "type", header: "ชนิด", width: "0.8fr", cell: (f) => <span className="text-xs text-slate-500">{f.data_type || "text"}</span> },
    { key: "req", header: "บังคับ", width: "4rem", align: "center", cell: (f) => f.is_required ? <span className="text-rose-600">✓</span> : <span className="text-slate-300">—</span> },
    { key: "sample", header: "ตัวอย่าง", width: "1.5fr", cell: (f) => <span className="text-xs text-slate-400 truncate">{f.sample || "—"}</span> },
  ];

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-xl font-semibold text-slate-900 mb-1">🛒 สินค้าบนแพลตฟอร์ม</h1>
      <p className="text-sm text-slate-500 mb-4">ดูว่าแต่ละร้าน/แพลตฟอร์มมีสินค้าอะไร + ฟิลด์อะไร — สำหรับจับคู่กับสินค้าเรา และทำ field mapping</p>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={platformId} onChange={(e) => setPlatformId(e.target.value)} className="h-9 border border-slate-200 rounded-md px-2 text-sm bg-white">
          {platforms.map((p) => <option key={p.id} value={p.id}>{(p.icon_key || PLATFORM_ICON[p.code] || "🏬") + " " + p.name_th}</option>)}
        </select>
        <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="h-9 border border-slate-200 rounded-md px-2 text-sm bg-white">
          <option value="">ทุกแบรนด์/ร้าน</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <div className="flex-1" />
        <button disabled title="เฟสถัดไป" className="h-9 px-3 text-sm text-slate-400 border border-slate-200 rounded-lg cursor-not-allowed">⬆️ อัปไฟล์ export (เร็ว ๆ นี้)</button>
        <button disabled title="เฟสถัดไป — ต้องมี API key" className="h-9 px-3 text-sm text-slate-400 border border-slate-200 rounded-lg cursor-not-allowed">🔗 ดึงจาก API (เร็ว ๆ นี้)</button>
      </div>

      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 w-fit text-sm mb-3">
        <button onClick={() => setTab("catalog")} className={`px-3 py-1 rounded ${tab === "catalog" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}>รายการสินค้า ({summary.total})</button>
        <button onClick={() => setTab("fields")} className={`px-3 py-1 rounded ${tab === "fields" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}>ฟิลด์ของ {activePf?.name_th ?? "แพลตฟอร์ม"} ({fields.length})</button>
      </div>

      {loading ? <p className="text-slate-400 text-sm py-8 text-center">กำลังโหลด...</p> : tab === "catalog" ? (
        listings.length === 0
          ? <div className="border border-dashed border-slate-200 rounded-xl p-10 text-center text-sm text-slate-400">ยังไม่มีข้อมูลสินค้าบนแพลตฟอร์มนี้<br />นำเข้าได้เฟสถัดไป (อัปไฟล์ export จาก Seller Center หรือต่อ API)</div>
          : <MiniTable rows={listings} columns={cols} rowKey={(l) => l.id} searchText={(l) => `${l.title ?? ""} ${l.sku_code ?? ""} ${l.external_product_id ?? ""}`} dense />
      ) : (
        fields.length === 0
          ? <div className="border border-dashed border-slate-200 rounded-xl p-10 text-center text-sm text-slate-400">ยังไม่ทราบฟิลด์ของแพลตฟอร์มนี้<br />จะรู้อัตโนมัติเมื่ออัปไฟล์ export (หัวคอลัมน์ = ฟิลด์) เฟสถัดไป</div>
          : <MiniTable rows={fields} columns={fcols} rowKey={(f) => f.field_key} searchText={(f) => `${f.field_key} ${f.field_label ?? ""}`} dense />
      )}
    </div>
  );
}
