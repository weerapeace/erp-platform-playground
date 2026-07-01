"use client";

// สินค้าบนแพลตฟอร์ม (Platform Catalog) — ทิศอ่าน: ดูว่าแต่ละร้าน/แพลตฟอร์มมีสินค้าอะไร + ฟิลด์อะไร
// เฟสนี้ = โครง (ตาราง+หน้า+API พร้อม) ยังไม่ดึงข้อมูลจริง · นำเข้า (อัปไฟล์ export/ต่อ API) เฟสถัดไป

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { PLATFORM_SOURCE_FIELDS } from "@/lib/platform-source-fields";
import { detectProfile, profilesForPlatform, getProfile, dbRowToProfile, type ImportMatrix, type ImportProfile, type DbProfileRow } from "@/lib/platform-import-profiles";
import PlatformImportProfileManager from "@/components/platform-import-profile-manager";

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
  // คิวไฟล์ที่อ่านแล้วรอยืนยันชนิด (เลือกได้หลายไฟล์ เดาให้ทุกไฟล์ → ยืนยัน → นำเข้าตามลำดับ)
  const [queue, setQueue] = useState<{ id: number; fileName: string; matrix: ImportMatrix; profileId: string }[]>([]);
  const qid = useRef(0);
  // ชนิดไฟล์ที่ผู้ใช้สร้างเอง (custom, active) — รวมกับโปรไฟล์มาตรฐานตอนเดา/เลือก
  const [customProfiles, setCustomProfiles] = useState<ImportProfile[]>([]);
  const [showManager, setShowManager] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
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

  // โหลดชนิดไฟล์ที่ผู้ใช้สร้างเอง (เฉพาะที่เปิดใช้งาน) สำหรับใช้เดา/เลือกตอนนำเข้า
  const loadCustomProfiles = useCallback(async () => {
    if (!platformId) { setCustomProfiles([]); return; }
    try {
      const j = await apiFetch(`/api/platform-import-profiles?platform_id=${platformId}`).then((r) => r.json());
      const code = (j.platformCode as string) ?? platforms.find((p) => p.id === platformId)?.code ?? "";
      const rows = ((j.custom ?? []) as (DbProfileRow & { is_active?: boolean })[]).filter((r) => r.is_active !== false);
      setCustomProfiles(rows.map((r) => dbRowToProfile(r, code)));
    } catch { setCustomProfiles([]); }
  }, [platformId, platforms]);
  useEffect(() => { loadCustomProfiles(); }, [loadCustomProfiles]);

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

  // ขั้นที่ 1: อ่านไฟล์ (xlsx/csv) เป็น matrix ดิบ → เดาชนิดไฟล์ → เข้าคิว (รับได้หลายไฟล์)
  const importFiles = async (files: File[]) => {
    if (!platformId) { setNote("เลือกแพลตฟอร์มก่อน"); return; }
    setImporting(true); setNote(`กำลังอ่านไฟล์... (${files.length})`);
    try {
      const XLSX = await import("xlsx");
      const code = platforms.find((p) => p.id === platformId)?.code ?? "";
      const items: { id: number; fileName: string; matrix: ImportMatrix; profileId: string }[] = [];
      for (const file of files) {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" }) as ImportMatrix;
        if (matrix.length === 0) continue;
        const guessed = detectProfile(code, matrix, customProfiles);
        items.push({ id: ++qid.current, fileName: file.name, matrix, profileId: guessed.id });
      }
      if (items.length === 0) { setNote("ไม่พบข้อมูลในไฟล์ที่เลือก"); return; }
      setQueue((q) => [...q, ...items]);
      setNote(null);
    } catch (e) { setNote("อ่านไฟล์ไม่สำเร็จ: " + (e as Error).message); }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  // ขั้นที่ 2: ยืนยันแล้ว → นำเข้าทีละไฟล์ตามลำดับ (ไฟล์ระดับสินค้าก่อนระดับตัวเลือก เพื่อให้ใส่ชื่อ/รหัสก่อน)
  const confirmImportAll = async () => {
    if (queue.length === 0) return;
    const items = [...queue].sort((a, b) => {
      const la = getProfile(a.profileId, customProfiles)?.level === "variation" ? 1 : 0;
      const lb = getProfile(b.profileId, customProfiles)?.level === "variation" ? 1 : 0;
      return la - lb;
    });
    setImporting(true);
    let okFiles = 0, skipped = 0; const errors: string[] = [];
    const sum = { products: 0, created: 0, updated: 0, matched: 0 };
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const prof = getProfile(it.profileId, customProfiles);
      if (prof?.kind === "orders") { skipped++; continue; }
      setNote(`กำลังนำเข้า ${i + 1}/${items.length}: ${it.fileName} ...`);
      try {
        const r = await apiFetch("/api/platform-catalog/import", { method: "POST", body: JSON.stringify({ platform_id: platformId, brand_id: brandId || undefined, profile_id: it.profileId, matrix: it.matrix }) });
        const j = await r.json(); if (j.error) throw new Error(j.error);
        okFiles++; sum.products += j.products ?? 0; sum.created += j.created ?? 0; sum.updated += j.updated ?? 0; sum.matched += j.matched ?? 0;
      } catch (e) { errors.push(`${it.fileName}: ${(e as Error).message}`); }
    }
    setQueue([]); setImporting(false);
    let msg = `นำเข้าเสร็จ ${okFiles} ไฟล์ · รวม ${sum.products} สินค้า (เพิ่มใหม่ ${sum.created} · อัปเดต ${sum.updated}) · จับคู่ ERP ได้ ${sum.matched}`;
    if (skipped) msg += ` · ข้ามไฟล์ออเดอร์ ${skipped} (ให้ไปนำเข้าที่หน้ารับออเดอร์)`;
    if (errors.length) msg += ` · ผิดพลาด ${errors.length} ไฟล์: ${errors.join(" | ")}`;
    setNote(msg);
    await load();
  };
  const setQueueProfile = (id: number, profileId: string) => setQueue((q) => q.map((it) => it.id === id ? { ...it, profileId } : it));
  const removeFromQueue = (id: number) => setQueue((q) => q.filter((it) => it.id !== id));

  const platformCode = platforms.find((p) => p.id === platformId)?.code ?? "";
  const profileOptions = profilesForPlatform(platformCode, customProfiles);

  // ดึงสินค้าจาก LINE SHOPPING (ต่อ API จริง) → catalog + จับคู่ ERP
  const syncLine = async () => {
    if (!brandId) { setNote("เลือกแบรนด์/ร้านก่อน (คีย์ LINE ผูกกับแบรนด์)"); return; }
    setImporting(true); setNote("กำลังดึงสินค้าจาก LINE...");
    try {
      const r = await apiFetch("/api/line-shopping/sync-products", { method: "POST", body: JSON.stringify({ brand_id: brandId }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      const totalNote = j.api_total > 0 && j.api_total !== j.fetched ? ` (LINE รายงานทั้งหมด ${j.api_total})` : "";
      setNote(`ดึงจาก LINE แล้ว: ${j.fetched} สินค้า${totalNote} · เพิ่มใหม่ ${j.created} · อัปเดต ${j.updated} · จับคู่ ERP อัตโนมัติ ${j.matched}`);
      await load();
    } catch (e) { setNote("ผิดพลาด: " + (e as Error).message); }
    finally { setImporting(false); }
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
    { key: "ext", header: "รหัสบนแพลตฟอร์ม", width: "1.2fr", cell: (l) => <span className="block truncate font-mono text-xs">{l.external_product_id || "—"}</span> },
    { key: "title", header: "ชื่อสินค้า", width: "2fr", sortValue: (l) => l.title ?? "", cell: (l) => <span className="block truncate" title={l.title ?? ""}>{l.title || "—"}</span> },
    { key: "sku", header: "SKU", width: "1fr", cell: (l) => <span className="block truncate font-mono text-xs" title={l.sku_code ?? ""}>{l.sku_code || "—"}</span> },
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
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-xl font-semibold text-slate-900">🛒 สินค้าบนแพลตฟอร์ม</h1>
        <button onClick={() => setShowHelp((v) => !v)} className="shrink-0 h-8 px-3 text-sm text-sky-700 border border-sky-200 bg-sky-50 rounded-lg hover:bg-sky-100">{showHelp ? "ซ่อนวิธีใช้" : "ℹ️ วิธีใช้"}</button>
      </div>
      <p className="text-sm text-slate-500 mb-3">ดูว่าแต่ละร้าน/แพลตฟอร์มมีสินค้าอะไร + ฟิลด์อะไร — สำหรับจับคู่กับสินค้าเรา และทำ field mapping</p>

      {showHelp && (
        <div className="mb-4 border border-sky-200 bg-sky-50/60 rounded-xl p-4 text-sm text-slate-700 space-y-2">
          <p className="font-medium text-slate-800">หน้านี้ใช้ทำอะไร?</p>
          <p>รวบรวมว่าสินค้าของเราตอนนี้อยู่บนร้าน/แพลตฟอร์มไหนบ้าง (เช่น Shopee) โดย<b>อัปไฟล์ export จาก Seller Center</b> เข้ามา ระบบจะอ่านให้อัตโนมัติแล้วจับคู่กับสินค้าใน ERP</p>
          <ol className="list-decimal ml-5 space-y-1">
            <li><b>เลือกแพลตฟอร์ม + แบรนด์/ร้าน</b> ที่มุมซ้ายบนก่อน (อัปไฟล์ชุดเดียวกันให้เลือกแบรนด์เดิมทุกครั้ง)</li>
            <li>กด <b>⬆️ อัปไฟล์ export</b> แล้วเลือกไฟล์ Excel/CSV — <b>เลือกได้หลายไฟล์พร้อมกัน</b> (เช่น Shopee 5 ไฟล์: ข้อมูลพื้นฐาน/ราคา-สต๊อก/รูป/ขนส่ง/เวลาเตรียม)</li>
            <li>ระบบ<b>เดาชนิดไฟล์ให้</b> → ขึ้นรายการ “รอนำเข้า” ตรวจดูแล้วกด <b>นำเข้าทั้งหมด</b> (ข้อมูลจากทุกไฟล์จะรวมเป็นสินค้าเดียวกันตามรหัส)</li>
            <li>ดูผลที่แท็บ <b>รายการสินค้า</b> — เครื่องหมาย <span className="text-emerald-600">✓</span> ที่ช่อง “จับคู่ ERP” = ตรงกับสินค้าเราแล้ว</li>
          </ol>
          <p className="pt-1"><b>แท็บอื่น:</b> “ฟิลด์ของ…” = คอลัมน์ทั้งหมดที่อ่านได้จากไฟล์ · “จับคู่ฟิลด์” = บอกว่าจะส่งข้อมูล ERP ตัวไหนไปลงช่องไหนของแพลตฟอร์ม</p>
          <p><b>ปุ่ม ⚙️</b> = จัดการ “ชนิดไฟล์นำเข้า” เพิ่ม/แก้เองได้ถ้าแพลตฟอร์มเปลี่ยนคอลัมน์ · <b>ในตารางลากขอบหัวคอลัมน์เพื่อปรับความกว้างได้</b> (จำค่าไว้ให้)</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={platformId} onChange={(e) => setPlatformId(e.target.value)} className="h-9 border border-slate-200 rounded-md px-2 text-sm bg-white">
          {platforms.map((p) => <option key={p.id} value={p.id}>{(p.icon_key || PLATFORM_ICON[p.code] || "🏬") + " " + p.name_th}</option>)}
        </select>
        <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="h-9 border border-slate-200 rounded-md px-2 text-sm bg-white">
          <option value="">ทุกแบรนด์/ร้าน</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <div className="flex-1" />
        <input ref={fileRef} type="file" multiple accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) importFiles(fs); }} />
        <button onClick={() => fileRef.current?.click()} disabled={!canEdit || importing || !platformId} title={!canEdit ? "ไม่มีสิทธิ์นำเข้า" : "อัปไฟล์ export (Excel/CSV) จาก Seller Center — เลือกได้หลายไฟล์"} className="h-9 px-3 text-sm text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50 disabled:opacity-50">{importing ? "กำลังนำเข้า..." : "⬆️ อัปไฟล์ export"}</button>
        <button onClick={() => setShowManager(true)} disabled={!canEdit || !platformId} title="จัดการชนิดไฟล์นำเข้า (เพิ่ม/แก้เองได้)" className="h-9 px-2.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">⚙️</button>
        {platformCode === "line_shopping"
          ? <button onClick={syncLine} disabled={!canEdit || importing || !brandId} title={!brandId ? "เลือกแบรนด์/ร้านก่อน" : "ดึงสินค้าจาก LINE SHOPPING ผ่าน API"} className="h-9 px-3 text-sm text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50 disabled:opacity-50">{importing ? "กำลังดึง..." : "🟢 ดึงสินค้าจาก LINE"}</button>
          : <button disabled title="เฉพาะแพลตฟอร์มที่ต่อ API ได้" className="h-9 px-3 text-sm text-slate-400 border border-slate-200 rounded-lg cursor-not-allowed">🔗 ดึงจาก API (เฉพาะ LINE)</button>}
      </div>
      {note && <p className="text-xs text-slate-500 mb-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{note}</p>}

      {queue.length > 0 && (
        <div className="mb-3 border border-violet-200 bg-violet-50/60 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700">ไฟล์รอนำเข้า ({queue.length}) — ตรวจชนิดไฟล์ก่อนกดนำเข้า</span>
            <div className="flex gap-2">
              <button onClick={() => { setQueue([]); setNote(null); }} disabled={importing} className="h-8 px-3 text-sm text-slate-500 border border-slate-200 rounded-lg hover:bg-white disabled:opacity-50">ล้างทั้งหมด</button>
              <button onClick={confirmImportAll} disabled={importing} className="h-8 px-4 text-sm text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{importing ? "กำลังนำเข้า..." : `นำเข้าทั้งหมด (${queue.length})`}</button>
            </div>
          </div>
          <div className="space-y-1.5">
            {queue.map((it) => {
              const isOrders = getProfile(it.profileId, customProfiles)?.kind === "orders";
              return (
                <div key={it.id} className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
                  <span className="text-sm text-slate-700 truncate max-w-[16rem]" title={it.fileName}>📄 {it.fileName}</span>
                  <span className="text-slate-300">→</span>
                  <select value={it.profileId} onChange={(e) => setQueueProfile(it.id, e.target.value)} disabled={importing} className="h-8 border border-violet-200 rounded-md px-2 text-sm bg-white max-w-full">
                    {profileOptions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                  {isOrders && <span className="text-[11px] text-amber-600">ไฟล์ออเดอร์ — จะถูกข้าม</span>}
                  <div className="flex-1" />
                  <button onClick={() => removeFromQueue(it.id)} disabled={importing} className="text-slate-400 hover:text-rose-600 text-sm disabled:opacity-50" title="เอาออกจากคิว">✕</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 w-fit text-sm mb-3">
        <button onClick={() => setTab("catalog")} className={`px-3 py-1 rounded ${tab === "catalog" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}>รายการสินค้า ({summary.total})</button>
        <button onClick={() => setTab("fields")} className={`px-3 py-1 rounded ${tab === "fields" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}>ฟิลด์ของ {activePf?.name_th ?? "แพลตฟอร์ม"} ({fields.length})</button>
        <button onClick={() => setTab("mapping")} className={`px-3 py-1 rounded ${tab === "mapping" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}>จับคู่ฟิลด์ ({mappedCount}/{fields.length})</button>
      </div>

      {loading ? <p className="text-slate-400 text-sm py-8 text-center">กำลังโหลด...</p> : tab === "catalog" ? (
        listings.length === 0
          ? <div className="border border-dashed border-slate-200 rounded-xl p-10 text-center text-sm text-slate-400">ยังไม่มีข้อมูลสินค้าบนแพลตฟอร์มนี้<br />กด “⬆️ อัปไฟล์ export” ด้านบน เพื่อนำเข้าไฟล์ Excel/CSV จาก Seller Center</div>
          : <MiniTable rows={listings} columns={cols} rowKey={(l) => l.id} searchText={(l) => `${l.title ?? ""} ${l.sku_code ?? ""} ${l.external_product_id ?? ""}`} resizable storageKey="platform-catalog-listings" dense />
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

      {showManager && <PlatformImportProfileManager platformId={platformId} platformCode={platformCode} onClose={() => setShowManager(false)} onChanged={loadCustomProfiles} />}
    </div>
  );
}
