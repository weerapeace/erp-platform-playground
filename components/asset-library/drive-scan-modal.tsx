"use client";
// คลังไฟล์: สแกนโฟลเดอร์ Google Drive แล้วนำเข้า — แยกจาก index.tsx (Y1)
import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n";
import { ERPModal } from "@/components/modal";
import { type AssetSize } from "@/app/api/assets/shared";
import { Spinner, LoadingOverlay } from "@/components/spinner";
import type { AssetCollection } from "@/app/api/assets/collections/route";
import { type LookupItem, DEFAULT_DPI } from "./asset-shared";
import { CollectionMultiSelect, ArtTypeMultiSelect, SizesEditor, ParentSkuField, TagPickerField } from "./asset-fields";

// ── หาโฟลเดอร์ Drive ที่ยังไม่เชื่อม → สแกน → กรอกรายละเอียด → นำเข้า ──
export type ScanFolder = { folderId: string; folderName: string; folderLink: string; typeSubName: string; artworkType: string; master_path: string; newCount?: number; total?: number };

export type ImportRow = { key: string; folderName: string; folderLink: string; master_path: string; fileId: string; fileName: string; title: string; types: string[]; sizes: AssetSize[]; parentCodes: string[] };

export function DriveScanModal({ artTypes, presetFolder, onClose, onDone }: { artTypes: LookupItem[]; presetFolder?: { folderId: string; folderName: string; folderLink: string } | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [brandId, setBrandId] = useState("");
  const t = useT();
  const [scanning, setScanning] = useState(false);
  const [folders, setFolders] = useState<ScanFolder[] | null>(null);
  const [scanned, setScanned] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<"scan" | "form">(presetFolder ? "form" : "scan");   // preset = เจาะโฟลเดอร์เดียว ข้ามขั้นสแกน
  const [loadingImgs, setLoadingImgs] = useState(!!presetFolder);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [artTypeList, setArtTypeList] = useState<LookupItem[]>(artTypes);
  const [cols, setCols] = useState<AssetCollection[]>([]);
  const [batchAlbums, setBatchAlbums] = useState<string[]>([]);
  const [batchTags, setBatchTags] = useState<string[]>([]);
  const [batchKw, setBatchKw] = useState("");
  const [batchTypes, setBatchTypes] = useState<string[]>([]);       // ชนิด → ใส่ทุกใบ
  const [batchParents, setBatchParents] = useState<string[]>([]);   // Parent SKU → ใส่ทุกใบ
  const [impProg, setImpProg] = useState<{ done: number; total: number } | null>(null);   // ความคืบหน้านำเข้า (ยิงทีละชุด)
  useEffect(() => { apiFetch("/api/brands").then((r) => r.json()).then((j) => setBrands(((j.data ?? []) as { id: string; name: string; hide_in_artwork?: boolean }[]).filter((b) => !b.hide_in_artwork))).catch(() => {}); }, []);
  useEffect(() => { apiFetch("/api/assets/collections").then((r) => r.json()).then((j) => setCols((j.data ?? []) as AssetCollection[])).catch(() => {}); }, []);
  useEffect(() => { setArtTypeList((cur) => { const s = new Set(cur.map((t) => t.name)); return [...cur, ...artTypes.filter((t) => !s.has(t.name))]; }); }, [artTypes]);

  const scan = async () => {
    if (!brandId) { toast.error(t("เลือกแบรนด์ก่อน", "Select a brand first")); return; }
    setScanning(true); setFolders(null); setSel(new Set()); setStep("scan");
    try {
      const res = await apiFetch("/api/assets/drive-scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_id: brandId }) });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || t("สแกนไม่สำเร็จ", "Scan failed"));
      const fs = (j.folders ?? []) as ScanFolder[];
      setFolders(fs); setScanned(j.scanned ?? 0); setSel(new Set(fs.map((f) => f.folderId)));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("สแกนไม่สำเร็จ", "Scan failed")); }
    finally { setScanning(false); }
  };

  // ดึงรูปในโฟลเดอร์ที่เลือก (เฉพาะที่ยังไม่ลงคลัง) → สร้างแถวฟอร์ม (1 แถว/รูป) · คืน true ถ้ามีรูปใหม่
  const buildRows = async (picked: ScanFolder[]): Promise<boolean> => {
    setLoadingImgs(true);
    try {
      const res = await apiFetch("/api/drive/folder-images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder_ids: picked.map((f) => f.folderId), only_new: true }) });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || t("ดึงรูปไม่สำเร็จ", "Failed to fetch images"));
      const imgMap = (j.images ?? {}) as Record<string, { id: string; name: string; width?: number; height?: number }[]>;
      const r2 = (v: number) => Math.round(v * 100) / 100;
      const sizesFrom = (w?: number, h?: number): AssetSize[] => (w && h) ? [{ label: "ขนาด #1", w: r2(w / DEFAULT_DPI * 2.54), h: r2(h / DEFAULT_DPI * 2.54), unit: "cm" }] : [];   // px÷300×2.54 (งาน export 300 DPI)
      const newRows: ImportRow[] = []; let n = 0;
      for (const f of picked) for (const img of (imgMap[f.folderId] ?? [])) {
        newRows.push({ key: `r${n++}`, folderName: f.folderName, folderLink: f.folderLink, master_path: f.master_path, fileId: img.id, fileName: img.name, title: img.name.replace(/\.[^.]+$/, "").trim() || f.folderName, types: f.artworkType ? [f.artworkType] : [], sizes: sizesFrom(img.width, img.height), parentCodes: [] });
      }
      if (!newRows.length) { toast.error(t("ไม่มีรูปใหม่ที่ยังไม่ลงในโฟลเดอร์นี้ — ลงครบแล้ว", "No new images left to add in this folder — all done")); return false; }
      setRows(newRows); setStep("form"); return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : t("ดึงรูปไม่สำเร็จ", "Failed to fetch images")); return false; }
    finally { setLoadingImgs(false); }
  };

  // ไปขั้นกรอกรายละเอียด (โหมดสแกนทั้งแบรนด์): เอาโฟลเดอร์ที่ติ๊กไว้
  const toForm = async () => {
    const picked = (folders ?? []).filter((f) => sel.has(f.folderId));
    if (!picked.length) { toast.error(t("เลือกโฟลเดอร์ก่อน", "Select a folder first")); return; }
    await buildRows(picked);
  };

  // โหมดเจาะโฟลเดอร์เดียว (จากมุมมองโฟลเดอร์) → ดึงรูปยังไม่ลงของโฟลเดอร์นั้นทันที ไม่มีรูปใหม่ก็ปิด
  const presetRan = useRef(false);
  useEffect(() => {
    if (!presetFolder || presetRan.current) return;
    presetRan.current = true;
    (async () => {
      const ok = await buildRows([{ folderId: presetFolder.folderId, folderName: presetFolder.folderName, folderLink: presetFolder.folderLink, typeSubName: "", artworkType: "", master_path: "" }]);
      if (!ok) onClose();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetFolder]);

  const setRow = (key: string, patch: Partial<ImportRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // นำเข้า — ยิงทีละชุด (4 รูป/รอบ) กัน timeout รูปเยอะ · อ่าน response แบบกัน JSON พัง
  const doImport = async () => {
    if (!rows.length) { toast.error(t("ไม่มีรายการ", "Nothing to import")); return; }
    setImporting(true);
    const items = rows.map((r) => ({ fileId: r.fileId, fileName: r.fileName, folderLink: r.folderLink, master_path: r.master_path, title: r.title, artwork_types: r.types, sizes: r.sizes, parent_sku_codes: r.parentCodes }));
    const CHUNK = 4;
    let imported = 0, failed = 0;
    try {
      for (let i = 0; i < items.length; i += CHUNK) {
        setImpProg({ done: i, total: items.length });
        const slice = items.slice(i, i + CHUNK);
        const res = await apiFetch("/api/assets/drive-import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_id: brandId, items: slice, tags: batchTags, keywords: batchKw.trim(), collection_ids: batchAlbums }) });
        const txt = await res.text();
        let j: { imported?: number; failed?: number; error?: string };
        try { j = txt ? JSON.parse(txt) : {}; }
        catch { throw new Error(res.status >= 500 ? t("เซิร์ฟเวอร์ทำงานนานเกินไป — ลองแบ่งนำเข้าน้อยลง", "The server took too long — try importing fewer at a time") : (txt.slice(0, 100) || t("ตอบกลับไม่ถูกต้อง", "Invalid response"))); }
        if (!res.ok || j.error) throw new Error(j.error || t("นำเข้าไม่สำเร็จ", "Import failed"));
        imported += j.imported ?? 0; failed += j.failed ?? 0;
      }
      setImpProg(null);
      toast.success(`${t("นำเข้า", "Imported")} ${imported} ${t("รูปแล้ว", "images")}${failed ? ` · ${t("ล้มเหลว", "failed")} ${failed}` : ""}`);
      onDone();
    } catch (e) {
      setImpProg(null);
      toast.error(`${e instanceof Error ? e.message : t("นำเข้าไม่สำเร็จ", "Import failed")}${imported ? ` ${t("(นำเข้าไปแล้ว", "(imported")} ${imported} ${t("ก่อนหยุด)", "before stopping)")}` : ""}`);
    } finally { setImporting(false); }
  };

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const busy = scanning || loadingImgs || importing;

  return (
    <ERPModal open onClose={onClose} title={presetFolder ? `${t("🔍 หารูปที่ยังไม่ลงในโฟลเดอร์", "🔍 Find images not yet added in folder")} “${presetFolder.folderName}”` : t("🔍 หารูปใน Drive ที่ยังไม่ลงคลัง", "🔍 Find Drive images not yet in the library")} size="xl"
      description={presetFolder ? t("รูปในโฟลเดอร์นี้ที่ยังไม่ได้ลงคลัง — กรอกรายละเอียดแล้วนำเข้าได้เลย", "Images in this folder not yet in the library — fill in details and import") : step === "scan" ? t("เลือกแบรนด์ → สแกน → เลือกโฟลเดอร์ที่มีรูปยังไม่ลง → กรอกรายละเอียดก่อนนำเข้า", "Pick a brand → scan → select folders with images not yet added → fill in details before importing") : t("กรอกรายละเอียดแต่ละรูป (เหมือนเพิ่มรูปใหม่) แล้วนำเข้า", "Fill in details for each image (like adding a new image), then import")}
      footer={
        step === "scan" ? (
          <div className="flex items-center justify-between w-full">
            <span className="text-[12px] text-slate-400">{folders ? `${t("มีรูปใหม่", "New images in")} ${folders.length} ${t("โฟลเดอร์ · เลือก", "folders · selected")} ${sel.size}` : ""}</span>
            <div className="flex gap-2">
              <button onClick={onClose} disabled={busy} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ปิด", "Close")}</button>
              <button onClick={toForm} disabled={busy || !sel.size} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{t("ถัดไป — กรอกรายละเอียด", "Next — fill in details")} ({sel.size})</button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between w-full">
            <button onClick={() => (presetFolder ? onClose() : setStep("scan"))} disabled={busy} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{presetFolder ? t("ปิด", "Close") : t("‹ กลับ", "‹ Back")}</button>
            <button onClick={doImport} disabled={busy || !rows.length} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-2">{importing && <Spinner />}{importing ? t("กำลังนำเข้า…", "Importing…") : `${t("นำเข้า", "Import")} ${rows.length} ${t("รูป", "images")}`}</button>
          </div>
        )
      }>
      {busy && <LoadingOverlay message={scanning ? t("กำลังสแกน Drive…", "Scanning Drive…") : loadingImgs ? t("กำลังดึงรายการรูป…", "Loading image list…") : impProg ? `${t("กำลังนำเข้า", "Importing")} ${impProg.done}/${impProg.total} ${t("รูป…", "images…")}` : t("กำลังนำเข้า + ดึงรูป…", "Importing + fetching images…")} />}

      {step === "scan" ? (
        <>
          <div className="flex items-end gap-2 mb-3">
            <label className="flex-1 text-[12px] text-slate-500">{t("แบรนด์", "Brand")}
              <select value={brandId} onChange={(e) => { setBrandId(e.target.value); setFolders(null); }}
                className="mt-0.5 w-full h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white">
                <option value="">{t("— เลือกแบรนด์ —", "— Select brand —")}</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select></label>
            <button onClick={scan} disabled={scanning || !brandId} className="h-9 px-4 text-sm font-medium border border-indigo-200 text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 disabled:opacity-50">{t("🔍 สแกน", "🔍 Scan")}</button>
          </div>
          {folders === null ? (
            <p className="text-[12px] text-slate-400 py-8 text-center">{t("เลือกแบรนด์แล้วกด “สแกน”", "Pick a brand then click “Scan”")}</p>
          ) : folders.length === 0 ? (
            <p className="text-[13px] text-emerald-600 py-8 text-center">{t("🎉 รูปในโฟลเดอร์ลงคลังครบแล้ว (สแกน", "🎉 All images in the folders are in the library (scanned")} {scanned} {t("โฟลเดอร์)", "folders)")}</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[12px] text-slate-600">{t("เจอ", "Found")} <b>{folders.length}</b> {t("โฟลเดอร์ที่มีรูปยังไม่ลง (จาก", "folders with images not yet added (of")} {scanned})</p>
                <div className="flex gap-2 text-[11px]">
                  <button onClick={() => setSel(new Set(folders.map((f) => f.folderId)))} className="text-indigo-600 hover:underline">{t("เลือกทั้งหมด", "Select all")}</button>
                  <button onClick={() => setSel(new Set())} className="text-slate-500 hover:underline">{t("ไม่เลือก", "Clear")}</button>
                </div>
              </div>
              <div className="space-y-1 max-h-[46vh] overflow-y-auto pr-1">
                {folders.map((f) => (
                  <label key={f.folderId} className={`flex items-center gap-2 rounded-lg border p-2 cursor-pointer ${sel.has(f.folderId) ? "border-indigo-300 bg-indigo-50/40" : "border-slate-200"}`}>
                    <input type="checkbox" checked={sel.has(f.folderId)} onChange={() => toggle(f.folderId)} className="w-4 h-4 accent-indigo-600 shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="text-[13px] text-slate-700 truncate block">📁 {f.folderName}</span>
                      <span className="text-[10px] text-slate-400 font-mono truncate block">{f.typeSubName}{f.artworkType && f.artworkType !== f.typeSubName ? ` · ${f.artworkType}` : ""}</span>
                    </span>
                    {f.newCount != null && (
                      <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200" title={`${t("ในโฟลเดอร์มี", "Folder has")} ${f.total ?? "?"} ${t("รูป", "images")}`}>
                        +{f.newCount} {t("รูปใหม่", "new")}{f.total != null && f.total > f.newCount ? ` / ${f.total}` : ""}
                      </span>
                    )}
                    <a href={f.folderLink} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-[11px] text-indigo-600 hover:underline shrink-0">{t("เปิด ›", "Open ›")}</a>
                  </label>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <div className="space-y-3">
          {/* batch ใช้กับทุกรูป */}
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 space-y-2.5">
            <p className="text-[11px] font-medium text-slate-500">{t("ใช้กับทุกรูป", "Applies to all images")}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-[12px] text-slate-500">{t("อัลบั้ม", "Album")}
                <div className="mt-0.5"><CollectionMultiSelect value={batchAlbums} collections={cols} onChange={setBatchAlbums} onCreated={(c) => setCols((cur) => [...cur, c])} /></div></div>
              <div className="text-[12px] text-slate-500">{t("แท็ก", "Tags")}
                <div className="mt-0.5"><TagPickerField value={batchTags} onChange={setBatchTags} /></div></div>
            </div>
            <label className="block text-[12px] text-slate-500">{t("คำค้นเพิ่มเติม (keyword)", "Extra keywords")}
              <input value={batchKw} onChange={(e) => setBatchKw(e.target.value)} placeholder={t("เช่น flower ดอกไม้ summer", "e.g. flower summer")}
                className="mt-0.5 w-full h-9 px-3 text-[12px] border border-slate-200 rounded-lg" /></label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 border-t border-slate-200/70">
              <div className="text-[12px] text-slate-500">
                <div className="flex items-center gap-2">{t("ชนิด (ใส่ทุกใบ)", "Type (apply to all)")}
                  {batchTypes.length > 0 && rows.length > 0 && <button type="button" onClick={() => setRows((rs) => rs.map((r) => ({ ...r, types: [...batchTypes] })))} className="text-[10px] text-indigo-600 hover:underline">{t("→ ใส่ทุกใบ", "→ Apply to all")}</button>}</div>
                <div className="mt-0.5"><ArtTypeMultiSelect value={batchTypes} types={artTypeList} onChange={setBatchTypes} onCreated={(t) => setArtTypeList((c) => [...c, t])} /></div>
              </div>
              <div className="text-[12px] text-slate-500">
                <div className="flex items-center gap-2">Parent SKU {t("(ใส่ทุกใบ)", "(apply to all)")}
                  {batchParents.length > 0 && rows.length > 0 && <button type="button" onClick={() => setRows((rs) => rs.map((r) => ({ ...r, parentCodes: [...batchParents] })))} className="text-[10px] text-indigo-600 hover:underline">{t("→ ใส่ทุกใบ", "→ Apply to all")}</button>}</div>
                <div className="mt-0.5"><ParentSkuField value={batchParents} onChange={setBatchParents} /></div>
              </div>
            </div>
          </div>

          <div className="space-y-2.5 max-h-[52vh] overflow-y-auto pr-1">
            {rows.map((r) => (
              <div key={r.key} className="border border-slate-200 rounded-lg p-2.5">
                <div className="flex items-start gap-2.5">
                  <img src={`/api/drive/thumb?id=${encodeURIComponent(r.fileId)}&w=180`} alt="" loading="lazy"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
                    className="w-14 h-14 object-contain rounded border border-slate-200 bg-slate-50 shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <input value={r.title} onChange={(e) => setRow(r.key, { title: e.target.value })} placeholder={t("ชื่อรูป", "Image name")}
                        className="flex-1 h-8 px-2 text-[12px] border border-slate-200 rounded" />
                      <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} title={t("เอาออก", "Remove")}
                        className="h-7 w-7 text-rose-500 hover:bg-rose-50 rounded shrink-0">🗑</button>
                    </div>
                    <ArtTypeMultiSelect value={r.types} types={artTypeList} onChange={(v) => setRow(r.key, { types: v })} onCreated={(t) => setArtTypeList((c) => [...c, t])} />
                    <p className="text-[10px] text-slate-400 font-mono truncate">📁 {r.folderName} · {r.fileName}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mt-2">
                  <div><p className="text-[11px] text-slate-500 mb-1">{t("📐 ขนาด (กว้าง × สูง)", "📐 Size (W × H)")}</p><SizesEditor value={r.sizes} onChange={(v) => setRow(r.key, { sizes: v })} /></div>
                  <div><p className="text-[11px] text-slate-500 mb-1">{t("📦 Parent SKU ที่ใช้", "📦 Parent SKUs used")}</p><ParentSkuField value={r.parentCodes} onChange={(v) => setRow(r.key, { parentCodes: v })} /></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </ERPModal>
  );
}
