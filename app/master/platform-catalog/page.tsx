"use client";

// สินค้าบนแพลตฟอร์ม (Platform Catalog) — ทิศอ่าน: ดูว่าแต่ละร้าน/แพลตฟอร์มมีสินค้าอะไร + ฟิลด์อะไร
// เฟสนี้ = โครง (ตาราง+หน้า+API พร้อม) ยังไม่ดึงข้อมูลจริง · นำเข้า (อัปไฟล์ export/ต่อ API) เฟสถัดไป

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { PLATFORM_SOURCE_FIELDS } from "@/lib/platform-source-fields";

const PLATFORM_ICON: Record<string, string> = { shopee: "🛍️", lazada: "🛒", tiktok: "🎵", website: "🌐", instagram: "📸", facebook: "👍", line_oa: "💬", youtube: "▶️", pinterest: "📌", x: "✖️" };

type Platform = { id: string; code: string; name_th: string; icon_key: string | null };
type Brand = { id: string; name: string };
type FieldRow = { field_key: string; field_label: string | null; data_type: string | null; is_required: boolean; sample: string | null; source: string };
type Listing = { id: string; external_product_id: string | null; title: string | null; sku_code: string | null; matched_parent_sku_id: string | null; price: number | null; status: string | null };

export default function PlatformCatalogPage() {
  const { can } = useAuth();
  const canEdit = can("products.platforms.edit");
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [platformId, setPlatformId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [tab, setTab] = useState<"catalog" | "fields" | "mapping">("catalog");
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
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
      const [j, mj] = await Promise.all([
        apiFetch(`/api/platform-catalog?${q}`).then((r) => r.json()),
        apiFetch(`/api/platform-field-mappings?platform_id=${platformId}`).then((r) => r.json()),
      ]);
      setFields((j.fields ?? []) as FieldRow[]);
      setListings((j.listings ?? []) as Listing[]);
      setSummary(j.summary ?? { total: 0, matched: 0 });
      setMappings((mj.mappings ?? {}) as Record<string, string>);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [platformId, brandId]);
  useEffect(() => { load(); }, [load]);

  // อัปไฟล์ export (xlsx/csv) → แกะหัวคอลัมน์+แถวฝั่ง client → ส่งเข้า import API
  const importFile = async (file: File) => {
    if (!platformId) { setNote("เลือกแพลตฟอร์มก่อน"); return; }
    setImporting(true); setNote("กำลังอ่านไฟล์...");
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
      const headers = ((aoa[0] ?? []) as unknown[]).map((h) => String(h ?? "").trim()).filter(Boolean);
      if (headers.length === 0) { setNote("ไม่พบหัวคอลัมน์ในไฟล์"); return; }
      const rows = (aoa.slice(1) as unknown[][])
        .filter((r) => r.some((c) => String(c ?? "").trim() !== ""))
        .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
      const r = await apiFetch("/api/platform-catalog/import", { method: "POST", body: JSON.stringify({ platform_id: platformId, brand_id: brandId || undefined, headers, rows }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      setNote(`นำเข้าแล้ว: ${j.listings} สินค้า · ${j.fields} ฟิลด์ · จับคู่ ERP ได้ ${j.matched}`);
      await load();
    } catch (e) { setNote("ผิดพลาด: " + (e as Error).message); }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const saveMapping = async (platform_field_key: string, source_key: string) => {
    setMappings((m) => { const n = { ...m }; if (source_key) n[platform_field_key] = source_key; else delete n[platform_field_key]; return n; });
    try {
      const r = await apiFetch("/api/platform-field-mappings", { method: "PATCH", body: JSON.stringify({ platform_id: platformId, platform_field_key, source_key }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
    } catch (e) { setNote("บันทึก mapping ไม่สำเร็จ: " + (e as Error).message); }
  };
  const mappedCount = fields.filter((f) => mappings[f.field_key]).length;

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
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); }} />
        <button onClick={() => fileRef.current?.click()} disabled={!canEdit || importing || !platformId} title={!canEdit ? "ไม่มีสิทธิ์นำเข้า" : "อัปไฟล์ export (Excel/CSV) จาก Seller Center"} className="h-9 px-3 text-sm text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50 disabled:opacity-50">{importing ? "กำลังนำเข้า..." : "⬆️ อัปไฟล์ export"}</button>
        <button disabled title="เฟสถัดไป — ต้องมี API key" className="h-9 px-3 text-sm text-slate-400 border border-slate-200 rounded-lg cursor-not-allowed">🔗 ดึงจาก API (เร็ว ๆ นี้)</button>
      </div>
      {note && <p className="text-xs text-slate-500 mb-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{note}</p>}

      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 w-fit text-sm mb-3">
        <button onClick={() => setTab("catalog")} className={`px-3 py-1 rounded ${tab === "catalog" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}>รายการสินค้า ({summary.total})</button>
        <button onClick={() => setTab("fields")} className={`px-3 py-1 rounded ${tab === "fields" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}>ฟิลด์ของ {activePf?.name_th ?? "แพลตฟอร์ม"} ({fields.length})</button>
        <button onClick={() => setTab("mapping")} className={`px-3 py-1 rounded ${tab === "mapping" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}>จับคู่ฟิลด์ ({mappedCount}/{fields.length})</button>
      </div>

      {loading ? <p className="text-slate-400 text-sm py-8 text-center">กำลังโหลด...</p> : tab === "catalog" ? (
        listings.length === 0
          ? <div className="border border-dashed border-slate-200 rounded-xl p-10 text-center text-sm text-slate-400">ยังไม่มีข้อมูลสินค้าบนแพลตฟอร์มนี้<br />กด “⬆️ อัปไฟล์ export” ด้านบน เพื่อนำเข้าไฟล์ Excel/CSV จาก Seller Center</div>
          : <MiniTable rows={listings} columns={cols} rowKey={(l) => l.id} searchText={(l) => `${l.title ?? ""} ${l.sku_code ?? ""} ${l.external_product_id ?? ""}`} dense />
      ) : tab === "fields" ? (
        fields.length === 0
          ? <div className="border border-dashed border-slate-200 rounded-xl p-10 text-center text-sm text-slate-400">ยังไม่ทราบฟิลด์ของแพลตฟอร์มนี้<br />อัปไฟล์ export แล้วระบบจะอ่านหัวคอลัมน์เป็นฟิลด์ให้อัตโนมัติ</div>
          : <MiniTable rows={fields} columns={fcols} rowKey={(f) => f.field_key} searchText={(f) => `${f.field_key} ${f.field_label ?? ""}`} dense />
      ) : (
        fields.length === 0
          ? <div className="border border-dashed border-slate-200 rounded-xl p-10 text-center text-sm text-slate-400">ยังไม่ทราบฟิลด์ของแพลตฟอร์มนี้<br />อัปไฟล์ export ก่อน แล้วค่อยจับคู่ฟิลด์</div>
          : (
            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
              <div className="flex items-center gap-3 px-3 py-2 bg-slate-50 text-[11px] text-slate-400 font-medium">
                <span className="flex-1">ฟิลด์ของ {activePf?.name_th}</span>
                <span className="text-slate-300">←</span>
                <span className="w-64">เอาข้อมูล ERP ตัวไหนมาใส่</span>
              </div>
              {fields.map((f) => (
                <div key={f.field_key} className="flex items-center gap-3 px-3 py-2">
                  <span className="flex-1 min-w-0"><span className="font-mono text-xs text-slate-700">{f.field_key}</span>{f.is_required && <span className="ml-1 text-[10px] text-rose-500">*</span>}{f.field_label && f.field_label !== f.field_key && <span className="text-[11px] text-slate-400 ml-1 truncate">({f.field_label})</span>}</span>
                  <span className="text-slate-300">←</span>
                  <select value={mappings[f.field_key] ?? ""} disabled={!canEdit} onChange={(e) => saveMapping(f.field_key, e.target.value)} className="w-64 h-8 border border-slate-200 rounded-md px-2 text-sm bg-white shrink-0">
                    <option value="">— ไม่ใช้ —</option>
                    {["Parent SKU", "SKU (สี)", "อื่นๆ"].map((g) => (
                      <optgroup key={g} label={g}>
                        {PLATFORM_SOURCE_FIELDS.filter((s) => s.group === g).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )
      )}
    </div>
  );
}
