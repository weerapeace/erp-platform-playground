"use client";

/**
 * /master/platform-categories — จับคู่หมวดหมู่แพลตฟอร์ม (เฟส 1 ออกแบบใหม่)
 * ซ้าย = "หมวดกลาง" ชุดใหม่ (owner สร้างเอง — platform_central_categories)
 * ขวา = แต่ละร้านเลือกหมวดจาก dropdown (platform_category_options · นำเข้าไฟล์ต่อร้าน)
 * layout /master ครอบ PlaygroundShell ให้แล้ว — หน้านี้ไม่ต้องครอบเอง
 */
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { PlatformIcon } from "@/components/platform-icon";
import { SearchableSelect, type SelectOption } from "@/components/searchable-select";

type Cat = { id: string; name: string };
type Platform = { id: string; code: string; name_th: string; icon_key: string | null };
type Mapping = { central_category_id: string; platform_id: string; platform_category_path: string | null };
type Opt = { external_id: string; name_en: string; name_th: string };
type PfRow = { id: string; code: string; name_th: string; icon_key: string | null; is_active: boolean; sort_order: number };

const key = (c: string, p: string) => `${c}:${p}`;
// แพลตฟอร์มที่ยึดหมวดของ Google (Merchant Center) → ดึงจาก Google Product Taxonomy อัตโนมัติได้
const GOOGLE_TAXONOMY_CODES = ["facebook", "instagram", "pinterest", "youtube"];

export default function PlatformCategoryMapPage() {
  const toast = useToast();
  const [cats, setCats] = useState<Cat[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [map, setMap] = useState<Record<string, string>>({});   // catId:pfId → path
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});   // pfId → path
  const [saving, setSaving] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [addingCat, setAddingCat] = useState(false);
  const [importOpen, setImportOpen] = useState(false);   // โมดัลนำเข้าหมวดของร้าน
  const [importPf, setImportPf] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pfOpen, setPfOpen] = useState(false);          // โมดัลตั้งค่าร้านที่แสดง
  const [allPfs, setAllPfs] = useState<PfRow[]>([]);
  const [pfBusy, setPfBusy] = useState(false);
  const [optsByPf, setOptsByPf] = useState<Record<string, SelectOption[]>>({});   // หมวดของแต่ละร้าน (สำหรับ dropdown ของกลาง)
  const optsLoaded = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await apiFetch("/api/platform-category-map").then((r) => r.json());
      setCats((j.categories ?? []) as Cat[]);
      setPlatforms((j.platforms ?? []) as Platform[]);
      const m: Record<string, string> = {};
      for (const row of (j.mappings ?? []) as Mapping[]) if (row.platform_category_path) m[key(row.central_category_id, row.platform_id)] = row.platform_category_path;
      setMap(m);
    } catch { toast.error("โหลดข้อมูลไม่สำเร็จ"); } finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  // โหลดหมวดของทุกร้านครั้งเดียว → ป้อนให้ dropdown ของกลาง (SearchableSelect)
  useEffect(() => {
    if (optsLoaded.current || platforms.length === 0) return;
    optsLoaded.current = true;
    (async () => {
      const entries = await Promise.all(platforms.map(async (p): Promise<[string, SelectOption[]]> => {
        const head: SelectOption = { value: "", label: "— ไม่จับคู่ร้านนี้ —" };
        try {
          const j = await apiFetch(`/api/platform-category-options?platform_id=${p.id}&limit=2000`).then((r) => r.json());
          const opts = ((j.categories ?? []) as Opt[]).map((o) => ({ value: `${o.external_id} · ${o.name_th || o.name_en}`, label: o.name_th || o.name_en, sub: `#${o.external_id}`, searchText: o.external_id }));
          return [p.id, [head, ...opts]];
        } catch { return [p.id, [head]]; }
      }));
      setOptsByPf(Object.fromEntries(entries));
    })();
  }, [platforms]);

  const pick = (catId: string) => { setSel(catId); const d: Record<string, string> = {}; for (const p of platforms) d[p.id] = map[key(catId, p.id)] ?? ""; setDraft(d); };
  const mappedCount = useCallback((catId: string) => platforms.reduce((n, p) => n + (map[key(catId, p.id)] ? 1 : 0), 0), [platforms, map]);
  const filtered = useMemo(() => { const s = q.trim().toLowerCase(); return s ? cats.filter((c) => c.name.toLowerCase().includes(s)) : cats; }, [cats, q]);

  // ── ตั้งค่าร้านที่แสดง (erp_platforms) ────────────────────────────
  const openPfSettings = useCallback(() => {
    setPfOpen(true);
    apiFetch("/api/platforms").then((r) => r.json()).then((j) => setAllPfs((j.data ?? []) as PfRow[])).catch(() => {});
  }, []);
  const togglePf = useCallback(async (row: PfRow) => {
    setPfBusy(true);
    try {
      await apiFetch("/api/platforms", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, is_active: !row.is_active }) });
      setAllPfs((a) => a.map((x) => (x.id === row.id ? { ...x, is_active: !x.is_active } : x)));
      await load();  // อัปเดตคอลัมน์ร้านในหน้าจับคู่ (ดึงเฉพาะที่เปิด)
    } catch { toast.error("บันทึกไม่สำเร็จ"); } finally { setPfBusy(false); }
  }, [load, toast]);
  const movePf = useCallback(async (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    setAllPfs((cur) => { if (j < 0 || j >= cur.length) return cur; const n = [...cur]; [n[idx], n[j]] = [n[j], n[idx]]; void apiFetch("/api/platforms", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order: n.map((p) => p.id) }) }).then(() => load()); return n; });
  }, [load]);

  const addCat = async () => {
    const name = newCat.trim(); if (!name) return;
    setAddingCat(true);
    try {
      const res = await apiFetch("/api/platform-central-categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const j = await res.json().catch(() => ({})); if (!res.ok || j.error) throw new Error(j.error || "เพิ่มไม่สำเร็จ");
      setNewCat(""); setCats((c) => [...c, j.data as Cat]); toast.success("เพิ่มหมวดกลางแล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ"); } finally { setAddingCat(false); }
  };
  const delCat = async (id: string, name: string) => {
    if (!window.confirm(`ลบหมวดกลาง “${name}”? (การจับคู่ของหมวดนี้จะถูกลบด้วย)`)) return;
    try {
      const res = await apiFetch(`/api/platform-central-categories?id=${id}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({})); if (!res.ok || j.error) throw new Error(j.error);
      setCats((c) => c.filter((x) => x.id !== id)); if (sel === id) setSel(null); toast.success("ลบแล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  };

  const save = async () => {
    if (!sel) return; setSaving(true);
    try {
      const entries = platforms.map((p) => ({ platform_id: p.id, path: (draft[p.id] ?? "").trim() }));
      const res = await apiFetch("/api/platform-category-map", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ central_category_id: sel, entries }) });
      const j = await res.json().catch(() => ({})); if (!res.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      setMap((prev) => { const n = { ...prev }; for (const p of platforms) { const v = (draft[p.id] ?? "").trim(); if (v) n[key(sel, p.id)] = v; else delete n[key(sel, p.id)]; } return n; });
      toast.success("บันทึกการจับคู่แล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); } finally { setSaving(false); }
  };

  // นำเข้ารายการหมวดของร้านจากไฟล์ (Excel/CSV: คอลัมน์ id + th/en · ชีต "หมวด…" หรือชีตแรก)
  const importCats = async (file: File) => {
    if (!importPf) { setImportMsg("เลือกร้านก่อน"); return; }
    setImporting(true); setImportMsg("กำลังอ่านไฟล์…");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const hit = wb.SheetNames.find((n) => /หมวด|categ/i.test(n));
      const cand = hit ? [hit] : wb.SheetNames;
      let aoa: unknown[][] = [];
      for (const sn of cand) {
        const a = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sn], { header: 1, defval: "" });
        const hdr = ((a[0] ?? []) as unknown[]).map((x) => String(x).trim().toLowerCase());
        if (hdr.includes("id") && (hdr.includes("en") || hdr.includes("th"))) { aoa = a; break; }
      }
      if (aoa.length < 2) { setImportMsg("ไม่พบชีตหมวดหมู่ (ต้องมีคอลัมน์ id + en/th)"); return; }
      const hdr = (aoa[0] as unknown[]).map((x) => String(x).trim().toLowerCase());
      const ci = { id: hdr.indexOf("id"), en: hdr.indexOf("en"), th: hdr.indexOf("th") };
      const rows = (aoa.slice(1) as unknown[][])
        .map((r) => ({ id: r[ci.id], en: ci.en >= 0 ? r[ci.en] : "", th: ci.th >= 0 ? r[ci.th] : "" }))
        .filter((r) => String(r.id ?? "").trim());
      const res = await apiFetch("/api/platform-category-options", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform_id: importPf, rows }) });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || "นำเข้าไม่สำเร็จ");
      setImportMsg(`✅ นำเข้าแล้ว ${j.imported ?? rows.length} หมวด`);
      toast.success(`นำเข้าหมวด ${platforms.find((p) => p.id === importPf)?.name_th ?? ""} แล้ว`);
    } catch (e) { setImportMsg("ผิดพลาด: " + (e instanceof Error ? e.message : "")); }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  // ดึงหมวดจาก Google Product Taxonomy อัตโนมัติ (FB/IG/Pinterest/YouTube)
  const importGoogle = async () => {
    if (!importPf) { setImportMsg("เลือกร้านก่อน"); return; }
    setImporting(true); setImportMsg("กำลังดึงจาก Google… (~5,500 หมวด)");
    try {
      const res = await apiFetch("/api/platform-category-options/import-google", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform_id: importPf }) });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || "ดึงไม่สำเร็จ");
      setImportMsg(`✅ ดึงจาก Google แล้ว ${j.imported} หมวด (เป็นภาษาอังกฤษ)`);
      toast.success("ดึงหมวดจาก Google แล้ว");
    } catch (e) { setImportMsg("ผิดพลาด: " + (e instanceof Error ? e.message : "")); } finally { setImporting(false); }
  };
  const importPfCode = platforms.find((p) => p.id === importPf)?.code ?? "";

  const selCat = cats.find((c) => c.id === sel) ?? null;

  return (
    <div className="max-w-6xl mx-auto px-5 py-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">🗂️ จับคู่หมวดหมู่แพลตฟอร์ม</h1>
          <p className="text-sm text-slate-500 mt-1">สร้าง “หมวดกลาง” ของเราเอง → จับคู่กับหมวดของแต่ละร้าน (เลือกจากรายการที่นำเข้าไว้)</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={openPfSettings}
            className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 whitespace-nowrap">⚙️ ตั้งค่าร้านที่แสดง</button>
          <button type="button" onClick={() => { setImportOpen(true); setImportMsg(null); }}
            className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 whitespace-nowrap">📂 นำเข้าหมวดของร้าน</button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 py-16 text-center">กำลังโหลด…</div>
      ) : (
        <div className="flex flex-col md:flex-row gap-4">
          {/* ซ้าย: หมวดกลาง (สร้างเอง) */}
          <div className="md:w-80 flex-shrink-0 border border-slate-200 rounded-xl overflow-hidden flex flex-col max-h-[72vh]">
            <div className="p-2 border-b border-slate-100 space-y-1.5">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`ค้นหาหมวดกลาง… (${cats.length})`}
                className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400" />
              <div className="flex gap-1.5">
                <input value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void addCat(); }} placeholder="+ ชื่อหมวดกลางใหม่…"
                  className="flex-1 h-9 px-3 text-sm border border-emerald-200 rounded-lg bg-emerald-50/40 focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                <button type="button" onClick={addCat} disabled={addingCat || !newCat.trim()}
                  className="h-9 px-3 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40">เพิ่ม</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 && <div className="text-xs text-slate-400 text-center py-6">— ยังไม่มีหมวดกลาง — พิมพ์ด้านบนเพื่อเพิ่ม</div>}
              {filtered.map((c) => {
                const n = mappedCount(c.id);
                const active = sel === c.id;
                return (
                  <div key={c.id} className={`group flex items-center gap-2 px-3 py-2 border-b border-slate-50 cursor-pointer ${active ? "bg-indigo-50" : "hover:bg-slate-50"}`} onClick={() => pick(c.id)}>
                    <span className={`flex-1 text-sm truncate ${active ? "text-indigo-700 font-medium" : "text-slate-700"}`}>{c.name}</span>
                    {n > 0
                      ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 whitespace-nowrap">{n}/{platforms.length}</span>
                      : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400 whitespace-nowrap">ยังไม่จับ</span>}
                    <button type="button" onClick={(e) => { e.stopPropagation(); void delCat(c.id, c.name); }} title="ลบหมวดกลาง"
                      className="w-5 h-5 rounded text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100">✕</button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ขวา: จับคู่ต่อร้าน (dropdown) */}
          <div className="flex-1 border border-slate-200 rounded-xl overflow-hidden flex flex-col">
            {!selCat ? (
              <div className="text-sm text-slate-400 py-20 text-center">← เลือกหมวดกลางทางซ้าย (หรือเพิ่มใหม่) เพื่อจับคู่กับแต่ละร้าน</div>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
                  <div className="text-sm font-semibold text-slate-800">หมวดกลาง: {selCat.name}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">เลือกหมวดของแต่ละร้านจาก dropdown (เว้นว่าง = ไม่จับคู่ร้านนั้น)</div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {platforms.map((p) => (
                    <div key={p.id} className="flex items-center gap-3">
                      <span className="w-32 flex-shrink-0 text-sm text-slate-700 truncate inline-flex items-center gap-1.5"><PlatformIcon code={p.code} iconKey={p.icon_key} size={16} /> {p.name_th}</span>
                      <SearchableSelect className="flex-1 min-w-0" value={draft[p.id] ?? ""} options={optsByPf[p.id] ?? []} onChange={(path) => setDraft((d) => ({ ...d, [p.id]: path }))} placeholder="— เลือกหมวดของร้านนี้ —" />
                    </div>
                  ))}
                  {platforms.length === 0 && <div className="text-xs text-slate-400 text-center py-6">ยังไม่มีแพลตฟอร์มที่เปิดใช้</div>}
                </div>
                <div className="px-4 py-3 border-t border-slate-200 flex justify-end">
                  <button type="button" onClick={save} disabled={saving}
                    className="h-9 px-5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึกการจับคู่"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {importOpen && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={() => !importing && setImportOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-800">📂 นำเข้าหมวดของร้าน</h3>
              <button type="button" onClick={() => setImportOpen(false)} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs text-slate-500">เลือกร้าน</label>
                <select value={importPf} onChange={(e) => { setImportPf(e.target.value); setImportMsg(null); }}
                  className="mt-1 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white">
                  <option value="">— เลือกร้าน —</option>
                  {platforms.map((p) => <option key={p.id} value={p.id}>{p.name_th}</option>)}
                </select>
              </div>
              <p className="text-[11px] text-slate-400">อัปไฟล์ Excel/CSV ที่มีคอลัมน์ <b>id</b> + <b>th</b>/<b>en</b> (ชีตชื่อ “หมวด…” หรือชีตแรก) — ระบบจะเพิ่ม/อัปเดตหมวดของร้านนั้น แล้วเลือกใน dropdown ได้เลย</p>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importCats(f); }} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={!importPf || importing}
                className="w-full h-10 text-sm font-medium border-2 border-dashed border-indigo-200 rounded-lg text-indigo-600 hover:bg-indigo-50 disabled:opacity-40">
                {importing ? "กำลังนำเข้า…" : "⬆️ เลือกไฟล์หมวดหมู่"}
              </button>
              {GOOGLE_TAXONOMY_CODES.includes(importPfCode) && (
                <>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400"><span className="flex-1 border-t border-slate-100" />หรือ<span className="flex-1 border-t border-slate-100" /></div>
                  <button type="button" onClick={importGoogle} disabled={importing}
                    className="w-full h-10 text-sm font-medium border-2 border-emerald-200 rounded-lg text-emerald-700 bg-emerald-50/40 hover:bg-emerald-50 disabled:opacity-40">
                    🔎 ดึงจาก Google อัตโนมัติ (~5,500 หมวด · อังกฤษ)
                  </button>
                  <p className="text-[10px] text-slate-400">ร้านนี้ใช้หมวดของ Google (Merchant Center) — ดึงจาก Google Product Taxonomy ได้เลย ไม่ต้องอัปไฟล์</p>
                </>
              )}
              {importMsg && <div className="text-xs text-slate-600">{importMsg}</div>}
            </div>
          </div>
        </div>
      )}

      {pfOpen && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={() => !pfBusy && setPfOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-800">⚙️ ตั้งค่าร้านที่แสดง</h3>
              <button type="button" onClick={() => setPfOpen(false)} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
            </div>
            <div className="p-4">
              <p className="text-[11px] text-slate-400 mb-2">เปิด/ปิด และเรียงลำดับร้าน — มีผลกับทุกที่ที่แสดง “ร้านที่เปิดใช้” (เช่น แท็บแพลตฟอร์มของสินค้า)</p>
              <div className="space-y-1">
                {allPfs.map((p, i) => (
                  <div key={p.id} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${p.is_active ? "border-slate-200" : "border-slate-100 bg-slate-50"}`}>
                    <div className="flex flex-col leading-none">
                      <button type="button" disabled={i === 0 || pfBusy} onClick={() => void movePf(i, -1)} className="text-slate-400 hover:text-slate-700 disabled:opacity-20 text-[10px]">▲</button>
                      <button type="button" disabled={i === allPfs.length - 1 || pfBusy} onClick={() => void movePf(i, 1)} className="text-slate-400 hover:text-slate-700 disabled:opacity-20 text-[10px]">▼</button>
                    </div>
                    <PlatformIcon code={p.code} iconKey={p.icon_key} size={18} />
                    <span className={`flex-1 text-sm truncate ${p.is_active ? "text-slate-700" : "text-slate-400"}`}>{p.name_th}</span>
                    <button type="button" disabled={pfBusy} onClick={() => void togglePf(p)}
                      className={`text-xs px-2.5 py-1 rounded-full border whitespace-nowrap disabled:opacity-50 ${p.is_active ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-slate-500 bg-white border-slate-200"}`}>
                      {p.is_active ? "✓ แสดง" : "ซ่อนอยู่"}
                    </button>
                  </div>
                ))}
                {allPfs.length === 0 && <div className="text-xs text-slate-400 text-center py-6">กำลังโหลด…</div>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
