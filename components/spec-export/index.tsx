"use client";
/**
 * 📤 หน้า "ส่งออกรายละเอียดสินค้า" — เลือกหลายรุ่น → ภาษา → ช่อง → แบบแสดง → ดาวน์โหลด Excel
 *   หน้า: app/master/parent-skus/export · เปิดจากปุ่มในหน้า Parent SKUs (ติ๊กหลายแถวแล้วกด "ส่งออกรายละเอียด")
 *   ของกลางที่ใช้: FieldChipsPicker (ป๊อปเลือกช่องแบ่งหมวด) · MarketingSkuPickerModal (เลือกหลายรุ่น) · ERPModal/ConfirmDialog
 *     · useToast · Icon · r2ImageUrl · กฎ lib/spec-export · สร้างไฟล์ lib/spec-export-xlsx · แปล /api/ai/translate
 *     · บันทึกคำแปลกลับ PATCH /api/master-v2 (audit ของกลาง)
 *   สิทธิ์: ดู/ส่งออก products.view · บันทึกชุดช่อง + AI แปลแล้วบันทึกกลับ = products.edit · ช่องราคา/ต้นทุนตามทะเบียนฟิลด์
 *   คู่มือ: docs/spec-export.md
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { FieldChipsPicker, type PickableField } from "@/components/field-chips-picker";
import { MarketingSkuPickerModal, type SkuPickerCatalog } from "@/components/marketing-sku-picker-modal";
import { r2ImageUrl } from "@/lib/r2-image";
import {
  buildSheetPlan, cleanPresetConfig, DEFAULT_PRESET_CONFIG, SPEC_CAT_LABEL, SPEC_CATS, SPEC_EXPORT_IDS_KEY, specFileName,
  type SpecField, type SpecPresetConfig, type SpecProduct, type SheetPlan,
} from "@/lib/spec-export";

const LAST_CFG_KEY = "spec-export-last-config";
const PREVIEW_ROWS = 40;

type Preset = { id: string; name: string; config: SpecPresetConfig };

const readSession = (k: string): string[] => {
  try { const v = JSON.parse(sessionStorage.getItem(k) ?? "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; }
};

function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; label: string }[] }) {
  return (
    <div className="inline-flex flex-wrap overflow-hidden rounded-lg border border-slate-200 bg-white">
      {options.map((o) => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)}
          className={`px-3 py-1.5 text-xs ${value === o.v ? "bg-blue-50 font-medium text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SpecExportView() {
  const { can, ready } = useAuth();
  const toast = useToast();
  const canEdit = can("products.edit");

  const [fields, setFields] = useState<SpecField[] | null>(null);
  const [fieldsErr, setFieldsErr] = useState<string | null>(null);
  const [ids, setIds] = useState<string[]>([]);
  const [cfg, setCfg] = useState<SpecPresetConfig>(DEFAULT_PRESET_CONFIG);
  const [products, setProducts] = useState<SpecProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [excludeKids, setExcludeKids] = useState<Set<string>>(new Set());
  const [pickOpen, setPickOpen] = useState(false);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetId, setPresetId] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [delPreset, setDelPreset] = useState<Preset | null>(null);
  const [busy, setBusy] = useState<string | null>(null);   // ข้อความตอนกำลังทำ (ดาวน์โหลด/แปล)
  const [translateAsk, setTranslateAsk] = useState(false);
  const inited = useRef(false);

  // ── เริ่มต้น: รายการรุ่นจากหน้า Parent SKUs (หรือ ?ids=) + ค่าที่ใช้ล่าสุด ──
  useEffect(() => {
    if (inited.current) return;
    inited.current = true;
    const q = new URLSearchParams(window.location.search).get("ids");
    const fromQuery = q ? q.split(",").filter(Boolean) : [];
    setIds(fromQuery.length ? fromQuery : readSession(SPEC_EXPORT_IDS_KEY));
    try { const last = localStorage.getItem(LAST_CFG_KEY); if (last) setCfg(cleanPresetConfig(JSON.parse(last))); } catch { /* ใช้ค่าเริ่มต้น */ }
  }, []);
  useEffect(() => { try { sessionStorage.setItem(SPEC_EXPORT_IDS_KEY, JSON.stringify(ids)); } catch { /* ไม่เป็นไร */ } }, [ids]);
  useEffect(() => { try { localStorage.setItem(LAST_CFG_KEY, JSON.stringify(cfg)); } catch { /* ไม่เป็นไร */ } }, [cfg]);

  // ── รายการช่อง + ชุดช่อง ──
  useEffect(() => {
    if (!ready) return;   // รอรู้ตัวตนก่อน (สิทธิ์จริงตรวจที่ server)
    (async () => {
      try {
        const j = await (await apiFetch("/api/parent-skus/spec-export")).json() as { fields?: SpecField[]; error?: string };
        if (j.error || !j.fields) throw new Error(j.error || "โหลดรายการช่องไม่สำเร็จ");
        setFields(j.fields);
      } catch (e) { setFieldsErr(e instanceof Error ? e.message : "โหลดรายการช่องไม่สำเร็จ"); }
      try {
        const j = await (await apiFetch("/api/parent-skus/spec-export/presets")).json() as { data?: Preset[] };
        setPresets(j.data ?? []);
      } catch { /* ไม่มีชุด = ใช้ค่าเริ่มต้น */ }
    })();
  }, [ready]);

  const fieldMap = useMemo(() => new Map((fields ?? []).map((f) => [f.key, f])), [fields]);
  /** ช่องที่เลือก (เฉพาะที่มีสิทธิ์/มีอยู่จริง) ตามลำดับที่ติ๊ก */
  const chosen = useMemo(() => cfg.fields.map((k) => fieldMap.get(k)).filter((f): f is SpecField => !!f), [cfg.fields, fieldMap]);
  const chosenKeys = useMemo(() => chosen.map((f) => f.key), [chosen]);
  const droppedKeys = useMemo(() => (fields ? cfg.fields.filter((k) => !fieldMap.has(k)) : []), [cfg.fields, fieldMap, fields]);

  // ── โหลดข้อมูลตัวอย่าง (รุ่น/ช่อง/ภาษาเปลี่ยน) ──
  const loadSeq = useRef(0);
  const loadData = useCallback(async (purpose: "preview" | "export"): Promise<SpecProduct[] | null> => {
    if (!ids.length || !chosenKeys.length) return [];
    const res = await apiFetch("/api/parent-skus/spec-export", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, fields: chosenKeys, lang: cfg.lang, mode: cfg.mode, images: cfg.images, purpose }),
    });
    const j = await res.json().catch(() => ({})) as { products?: SpecProduct[]; error?: string };
    if (!res.ok || j.error) throw new Error(j.error || `โหลดข้อมูลไม่สำเร็จ (${res.status})`);
    return j.products ?? [];
  }, [ids, chosenKeys, cfg.lang, cfg.mode, cfg.images]);

  useEffect(() => {
    if (!fields) return;
    const seq = ++loadSeq.current;
    const t = setTimeout(async () => {
      setLoading(true); setLoadErr(null);
      try { const p = await loadData("preview"); if (seq === loadSeq.current && p) setProducts(p); }
      catch (e) { if (seq === loadSeq.current) setLoadErr(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"); }
      finally { if (seq === loadSeq.current) setLoading(false); }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, ids.join(","), chosenKeys.join(","), cfg.lang]);

  const plan: SheetPlan = useMemo(() => buildSheetPlan({
    fields: chosen, lang: cfg.lang, mode: cfg.mode, merge: cfg.merge, products,
    excludeKids, hideInactiveKids: cfg.hideInactiveKids,
  }), [chosen, cfg.lang, cfg.mode, cfg.merge, cfg.hideInactiveKids, products, excludeKids]);

  const set = <K extends keyof SpecPresetConfig>(k: K, v: SpecPresetConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));

  // ── เลือกรุ่น ──
  const loadCatalog = useCallback(async (): Promise<SkuPickerCatalog> => {
    let j: { data?: SkuPickerCatalog; error?: string };
    try { j = await (await apiFetch("/api/parent-skus/spec-export?catalog=1")).json(); }
    catch { throw new Error("โหลดรายการรุ่นไม่สำเร็จ ลองใหม่อีกครั้ง"); }
    if (j.error || !j.data) throw new Error(j.error || "โหลดรายการรุ่นไม่สำเร็จ ลองใหม่อีกครั้ง");
    return j.data;
  }, []);

  // ── ชุดช่อง ──
  const applyPreset = (p: Preset) => { setPresetId(p.id); setCfg(cleanPresetConfig(p.config)); };
  const savePreset = async (asNew: boolean) => {
    setSaveErr(null);
    const name = saveName.trim();
    if (asNew && !name) { setSaveErr("ตั้งชื่อชุดก่อน"); return; }
    const url = asNew ? "/api/parent-skus/spec-export/presets" : `/api/parent-skus/spec-export/presets/${presetId}`;
    const res = await apiFetch(url, { method: asNew ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(asNew ? { name, config: cfg } : { config: cfg }) });
    const j = await res.json().catch(() => ({})) as { data?: Preset; error?: string };
    if (!res.ok || !j.data) { if (asNew) setSaveErr(j.error || "บันทึกไม่สำเร็จ"); else toast.error(j.error || "บันทึกไม่สำเร็จ"); return; }
    setPresets((list) => asNew ? [...list, j.data!] : list.map((p) => (p.id === j.data!.id ? j.data! : p)));
    setPresetId(j.data.id);
    setSaveOpen(false); setSaveName("");
    toast.success(asNew ? `บันทึกชุด "${j.data.name}" แล้ว` : `อัปเดตชุด "${j.data.name}" แล้ว`);
  };
  const removePreset = async (p: Preset) => {
    const res = await apiFetch(`/api/parent-skus/spec-export/presets/${p.id}`, { method: "DELETE" });
    const j = await res.json().catch(() => ({})) as { error?: string };
    if (!res.ok || j.error) { toast.error(j.error || "ลบไม่สำเร็จ"); return; }
    setPresets((list) => list.filter((x) => x.id !== p.id));
    if (presetId === p.id) setPresetId(null);
    toast.success(`ลบชุด "${p.name}" แล้ว`);
  };
  const activePreset = presets.find((p) => p.id === presetId) ?? null;
  const presetDirty = !!activePreset && JSON.stringify(cleanPresetConfig(activePreset.config)) !== JSON.stringify(cfg);

  // ── AI แปลช่องที่ยังไม่แปล แล้วบันทึกกลับเข้าสินค้า ──
  const translateMissing = async () => {
    setTranslateAsk(false);
    const items = plan.missing;
    if (!items.length) return;
    let done = 0, failed = 0;
    // ข้อความต้นฉบับ (ฝั่งไทย) ของแต่ละช่อง
    const srcOf = (m: SheetPlan["missing"][number]) => {
      const p = products.find((x) => x.id === m.productId);
      const vals = m.level === "parent" ? p?.values : p?.kids.find((k) => k.id === m.rowId)?.values;
      const th = String(vals?.[m.column] ?? "").trim();
      return (th || String(vals?.[m.enColumn] ?? "")).slice(0, 4000);   // ไทยว่าง = แปลจากค่าที่ใส่ไว้ในช่องอังกฤษ (ยังเป็นภาษาไทย)
    };
    try {
      for (let i = 0; i < items.length; i += 20) {
        const part = items.slice(i, i + 20);
        setBusy(`กำลังแปล ${Math.min(i + part.length, items.length)}/${items.length} ช่อง…`);
        const res = await apiFetch("/api/ai/translate", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ place: "fields", texts: part.map(srcOf), to: "en", kind: "content" }),
        });
        const j = await res.json().catch(() => ({})) as { data?: { translated_list?: string[] }; error?: string };
        const list = j.data?.translated_list ?? [];
        if (!res.ok || j.error) { failed += part.length; continue; }
        await Promise.all(part.map(async (m, k) => {
          const out = String(list[k] ?? "").trim();
          if (!out) { failed++; return; }
          const entity = m.level === "parent" ? "parent-skus" : "skus";
          const r = await apiFetch(`/api/master-v2/${entity}/${m.rowId}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [m.enColumn]: out }),
          });
          if (!r.ok) { failed++; return; }
          done++;
        }));
      }
      const fresh = await loadData("preview");
      if (fresh) setProducts(fresh);
      if (done) toast.success(`แปลและบันทึกเข้าสินค้าแล้ว ${done} ช่อง${failed ? ` · ไม่สำเร็จ ${failed}` : ""}`);
      else toast.error(`แปลไม่สำเร็จ ${failed} ช่อง ลองใหม่อีกครั้ง`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "แปลไม่สำเร็จ");
    } finally { setBusy(null); }
  };

  // ── ดาวน์โหลด ──
  const download = async () => {
    if (!ids.length) { toast.warning("ยังไม่ได้เลือกสินค้า"); return; }
    if (!chosen.length) { toast.warning("ยังไม่ได้เลือกช่อง"); return; }
    setBusy("กำลังเตรียมข้อมูล…");
    try {
      const fresh = await loadData("export");   // ข้อมูลล่าสุด + บันทึกประวัติการส่งออก
      const p = buildSheetPlan({ fields: chosen, lang: cfg.lang, mode: cfg.mode, merge: cfg.merge, products: fresh ?? [], excludeKids, hideInactiveKids: cfg.hideInactiveKids });
      const { buildSpecXlsx, downloadBlob } = await import("@/lib/spec-export-xlsx");
      const blob = await buildSpecXlsx({
        plan: p, images: cfg.images, twoTier: cfg.twoTier,
        onProgress: (d, t) => setBusy(`กำลังใส่รูป ${d}/${t}…`),
      });
      downloadBlob(blob, `${specFileName(cfg.lang)}.xlsx`);
      toast.success(`ดาวน์โหลดแล้ว — ${fresh?.length ?? 0} รุ่น ${p.rows.length} แถว`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "สร้างไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally { setBusy(null); }
  };

  // ── ป๊อปเลือกช่อง ──
  const pickFields: PickableField[] = useMemo(() => {
    const parentLabels = new Set((fields ?? []).filter((f) => f.level === "parent").map((f) => f.label));
    const order = new Map(SPEC_CATS.map((c, i) => [c.key, i]));
    const sorted = [...(fields ?? [])].sort((x, y) => (order.get(x.cat) ?? 99) - (order.get(y.cat) ?? 99));   // หมวดเรียงตามงาน (ข้อมูลหลักก่อน)
    return sorted.map((f) => ({
    key: f.key, label: f.level === "sku" && parentLabels.has(f.label) ? `${f.label} (SKU ลูก)` : f.label, group: f.cat,
    hint: [f.enColumn ? "TH/EN" : "", f.perm ? "ต้องมีสิทธิ์" : "", f.kind === "image" ? "รูป" : ""].filter(Boolean).join(" · ") || undefined,
  }));
  }, [fields]);

  const totalKids = products.reduce((a, p) => a + p.kids.length, 0);
  const missingCount = plan.missing.length;
  const imgCount = plan.rows.reduce((a, r) => a + r.filter((c) => c.image && c.v).length, 0);

  // ─────────────────────────────── UI ───────────────────────────────
  return (
    <div className="mx-auto max-w-[1400px] space-y-3 px-3 py-4 sm:px-5">
      {/* หัวหน้า */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/master/parent-skus" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="กลับหน้า Parent SKUs"><Icon value="i:arrow-left" /></Link>
        <div className="mr-auto">
          <h1 className="text-lg font-semibold text-slate-800">ส่งออกรายละเอียดสินค้า</h1>
          <p className="text-xs text-slate-500">เลือกหลายรุ่น → ภาษา → ช่อง → ดาวน์โหลดเป็นไฟล์ Excel ส่งลูกค้า/ตัวแทน/แพลตฟอร์ม</p>
        </div>
      </div>

      {/* ชุดช่อง */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-2.5">
        <span className="mr-1 text-xs text-slate-500">ชุดช่อง:</span>
        {presets.length === 0 && <span className="text-xs text-slate-400">ยังไม่มีชุดที่บันทึก</span>}
        {presets.map((p) => (
          <span key={p.id} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${p.id === presetId ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-blue-300"}`}>
            <button type="button" onClick={() => applyPreset(p)}>{p.name}{p.id === presetId && presetDirty ? " •" : ""}</button>
            {canEdit && <button type="button" onClick={() => setDelPreset(p)} className="text-slate-400 hover:text-rose-600" aria-label={`ลบชุด ${p.name}`}><Icon value="i:x" /></button>}
          </span>
        ))}
        {canEdit && presetDirty && <button type="button" onClick={() => void savePreset(false)} className="rounded-full border border-blue-200 px-2.5 py-1 text-xs text-blue-700 hover:bg-blue-50">บันทึกทับชุดนี้</button>}
        {canEdit && <button type="button" onClick={() => { setSaveErr(null); setSaveName(""); setSaveOpen(true); }} className="rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:border-blue-400 hover:text-blue-700"><Icon value="i:plus" /> บันทึกเป็นชุดใหม่</button>}
      </div>

      {/* ตัวเลือก */}
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3 rounded-xl border border-slate-200 bg-white p-3">
        <div><p className="mb-1 text-[11px] text-slate-500">ภาษา</p>
          <Seg value={cfg.lang} onChange={(v) => set("lang", v)} options={[{ v: "th", label: "ไทย" }, { v: "en", label: "English" }, { v: "both", label: "ทั้งคู่" }]} /></div>
        <div><p className="mb-1 text-[11px] text-slate-500">แสดงแบบไหน</p>
          <Seg value={cfg.mode} onChange={(v) => set("mode", v)} options={[{ v: "parent", label: "1 รุ่น = 1 แถว" }, { v: "summary", label: "1 รุ่น = 1 แถว + สรุปสี" }, { v: "kids", label: "แยกแถวตาม SKU ลูก" }]} /></div>
        {cfg.mode === "kids" && <div><p className="mb-1 text-[11px] text-slate-500">ช่องของรุ่นแม่</p>
          <Seg value={cfg.merge ? "merge" : "repeat"} onChange={(v) => set("merge", v === "merge")} options={[{ v: "merge", label: "รวมเป็นช่องเดียว" }, { v: "repeat", label: "ซ้ำทุกแถว" }]} /></div>}
        <div><p className="mb-1 text-[11px] text-slate-500">รูปในไฟล์</p>
          <Seg value={cfg.images} onChange={(v) => set("images", v)} options={[{ v: "embed", label: "ฝังรูปเล็ก" }, { v: "link", label: "ลิงก์รูป" }, { v: "none", label: "ไม่ใส่" }]} /></div>
        <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" className="accent-blue-600" checked={cfg.twoTier} onChange={(e) => set("twoTier", e.target.checked)} />หัวตาราง 2 ชั้น</label>
        {cfg.mode !== "parent" && <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" className="accent-blue-600" checked={cfg.hideInactiveKids} onChange={(e) => set("hideInactiveKids", e.target.checked)} />ซ่อนสีที่เลิกขาย</label>}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* ซ้าย: สินค้า + ช่อง */}
        <div className="min-w-0 space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
              <span className="mr-auto">สินค้าที่เลือก ({ids.length} รุ่น{totalKids ? ` · ${totalKids} สี` : ""})</span>
              {ids.length > 0 && <button type="button" onClick={() => { setIds([]); setProducts([]); }} className="text-slate-400 hover:text-rose-600">ล้าง</button>}
              <button type="button" onClick={() => setPickOpen(true)} className="font-medium text-blue-600 hover:underline"><Icon value="i:plus" /> เพิ่ม</button>
            </div>
            {ids.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">
                ยังไม่ได้เลือกสินค้า<br />กด &quot;เพิ่ม&quot; หรือไปหน้า Parent SKUs ติ๊กหลายแถวแล้วกด &quot;ส่งออกรายละเอียด&quot;
              </div>
            )}
            <div className="max-h-[420px] space-y-0.5 overflow-y-auto lg:max-h-[520px]">
              {ids.map((id) => {
                const p = products.find((x) => x.id === id);
                return (
                  <div key={id} className="border-t border-slate-100 py-1.5 first:border-t-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-md bg-slate-100 text-slate-300">
                        {p?.image ? <img src={r2ImageUrl(p.image, 80) ?? ""} alt="" className="h-full w-full object-cover" loading="lazy" /> : <Icon value="i:photo" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-mono text-slate-700">{p?.code ?? "…"}</span>
                        <span className="block truncate text-slate-400">{p?.name ?? ""}</span>
                      </span>
                      <button type="button" onClick={() => setIds((l) => l.filter((x) => x !== id))} className="p-1 text-slate-300 hover:text-rose-600" aria-label="เอาออก"><Icon value="i:x" /></button>
                    </div>
                    {cfg.mode === "kids" && p && p.kids.length > 0 && (
                      <div className="mt-1 space-y-0.5 pl-10">
                        {p.kids.filter((k) => !(cfg.hideInactiveKids && !k.active)).map((k) => (
                          <label key={k.id} className="flex items-center gap-1.5 text-[11px] text-slate-500">
                            <input type="checkbox" className="accent-blue-600" checked={!excludeKids.has(k.id)}
                              onChange={(e) => setExcludeKids((s) => { const n = new Set(s); if (e.target.checked) n.delete(k.id); else n.add(k.id); return n; })} />
                            <span className="font-mono">{k.code}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="mb-2 text-xs text-slate-500">ช่องที่ใส่ในไฟล์ (เรียงตามลำดับที่ติ๊ก)</p>
            {fieldsErr && <p className="text-xs text-rose-600">{fieldsErr}</p>}
            {!fields && !fieldsErr && <p className="text-xs text-slate-400">กำลังโหลดรายการช่อง…</p>}
            {fields && (
              <FieldChipsPicker value={chosenKeys} onChange={(keys) => set("fields", keys)} fields={pickFields} groups={SPEC_CAT_LABEL}
                groupNav groupToggle compact showKeys={false}
                title="เลือกช่องที่ใส่ในไฟล์" description="ติ๊กช่องที่จะใส่ — เรียงคอลัมน์ตามลำดับที่ติ๊ก · TH/EN = ออกตามภาษาที่เลือก · ช่อง SKU ลูกใช้กับแบบแยกแถวตามสี"
                addLabel={`＋ เลือกช่อง (${chosenKeys.length}/${fields.length})`} searchPlaceholder="ค้นหาช่อง เช่น วัสดุ, ราคา" unit="ช่อง" />
            )}
            {droppedKeys.length > 0 && <p className="mt-2 text-[11px] text-amber-600">ข้าม {droppedKeys.length} ช่องในชุดนี้ (ไม่มีสิทธิ์ดู หรือช่องถูกลบแล้ว)</p>}
          </div>
        </div>

        {/* ขวา: เตือน + ตัวอย่าง + ดาวน์โหลด */}
        <div className="min-w-0 space-y-3">
          {missingCount > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <Icon value="i:alert-triangle" />
              <span className="mr-auto">ยังไม่แปลอังกฤษ {missingCount} ช่อง (ช่องสีเหลือง) — ส่งออกได้ แต่ช่องนั้นจะว่าง</span>
              {canEdit && <button type="button" disabled={!!busy} onClick={() => setTranslateAsk(true)} className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 font-medium hover:bg-amber-100 disabled:opacity-50"><Icon value="i:world" /> ให้ AI แปลช่องที่ว่าง</button>}
            </div>
          )}
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="mr-auto">ตัวอย่างไฟล์ (หน้าตาใน Excel){plan.rows.length > PREVIEW_ROWS ? ` · โชว์ ${PREVIEW_ROWS} จาก ${plan.rows.length} แถว` : ` · ${plan.rows.length} แถว`}</span>
              {loading && <span className="text-blue-600">กำลังโหลด…</span>}
              <span className="text-violet-600">สีม่วง = ช่องของ SKU ลูก</span>
            </div>
            {loadErr && <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{loadErr} <button type="button" className="underline" onClick={() => setCfg((c) => ({ ...c }))}>ลองใหม่</button></div>}
            {!loadErr && (ids.length === 0 || chosen.length === 0) && <div className="py-10 text-center text-xs text-slate-400">{ids.length === 0 ? "เลือกสินค้าก่อน แล้วตัวอย่างไฟล์จะขึ้นตรงนี้" : "เลือกช่องที่จะใส่ในไฟล์ก่อน"}</div>}
            {!loadErr && ids.length > 0 && chosen.length > 0 && <PreviewTable plan={plan} twoTier={cfg.twoTier} images={cfg.images} />}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="text-xs text-slate-500">{specFileName(cfg.lang)}.xlsx{cfg.images === "embed" && imgCount > 0 ? ` · ${imgCount} รูป` : ""}</span>
            <button type="button" disabled={!!busy || loading || !ids.length || !chosen.length} onClick={() => void download()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              <Icon value="i:download" /> {busy ?? "ดาวน์โหลด Excel"}
            </button>
          </div>
        </div>
      </div>

      <MarketingSkuPickerModal open={pickOpen} onClose={() => setPickOpen(false)} title="เลือกสินค้าที่จะส่งออก"
        load={loadCatalog} takenIds={ids}
        taken={{ badge: "เลือกแล้ว", short: "เลือกแล้ว", hide: "ซ่อนที่เลือกแล้ว", row: "✓ เลือกแล้ว" }}
        confirmText={(n) => (n ? `เพิ่ม ${n} รุ่น` : "เพิ่ม")} busyText="กำลังเพิ่ม…"
        onConfirm={async (picked) => { setIds((l) => [...l, ...picked.filter((x) => !l.includes(x))]); }}
        tabPrefKey="spec_export_pick_tab" colsPrefKey="spec-export-pick" showFullPageLink={false} />

      <ERPModal open={saveOpen} onClose={() => setSaveOpen(false)} title="บันทึกเป็นชุดใหม่" size="sm"
        description="ชุดนี้จำ ช่อง + ภาษา + แบบแสดง + รูป ไว้ใช้ซ้ำ · ทุกคนในทีมเห็นและใช้ได้"
        footer={<div className="flex w-full justify-end gap-2">
          <button type="button" onClick={() => setSaveOpen(false)} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">ยกเลิก</button>
          <button type="button" onClick={() => void savePreset(true)} className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700">บันทึก</button>
        </div>}>
        <input autoFocus value={saveName} onChange={(e) => { setSaveName(e.target.value); setSaveErr(null); }} maxLength={80}
          onKeyDown={(e) => { if (e.key === "Enter") void savePreset(true); }}
          placeholder="เช่น ส่งตัวแทนต่างประเทศ" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
        {saveErr && <p className="mt-1 text-xs text-rose-600">{saveErr}</p>}
      </ERPModal>

      <ConfirmDialog open={!!delPreset} onClose={() => setDelPreset(null)} onConfirm={() => { const p = delPreset; setDelPreset(null); if (p) void removePreset(p); }}
        title="ลบชุดช่องนี้?" message={`ชุด "${delPreset?.name ?? ""}" จะหายจากรายการของทุกคนในทีม`} confirmText="ลบชุด" variant="danger" />

      <ConfirmDialog open={translateAsk} onClose={() => setTranslateAsk(false)} onConfirm={() => void translateMissing()}
        title={`ให้ AI แปล ${missingCount} ช่อง?`}
        message="AI แปลจากข้อความไทยของแต่ละสินค้า แล้วบันทึกเป็นภาษาอังกฤษกลับเข้าสินค้าเลย (ครั้งหน้าไม่ต้องแปลอีก) · มีค่าใช้ AI เล็กน้อย · แก้คำแปลทีหลังได้ในป๊อป Parent SKU"
        confirmText="แปลและบันทึก" />
    </div>
  );
}

/** ตารางตัวอย่าง — หน้าตาเหมือนในไฟล์ (หัว 2 ชั้น · ช่องรวม · รูป · ช่องยังไม่แปลสีเหลือง) */
function PreviewTable({ plan, twoTier, images }: { plan: SheetPlan; twoTier: boolean; images: "embed" | "link" | "none" }) {
  const cols = plan.columns.map((c, i) => ({ c, i })).filter(({ c }) => !(images === "none" && c.kind === "image"));
  const rows = plan.rows.slice(0, PREVIEW_ROWS);
  // ช่องที่ถูกรวม: (แถว,คอลัมน์) ที่ต้องข้าม + rowSpan ของช่องบนสุด
  const span = new Map<string, number>(), skip = new Set<string>();
  for (const m of plan.merges) {
    if (m.r1 >= PREVIEW_ROWS) continue;
    span.set(`${m.r1}:${m.c1}`, Math.min(m.r2, PREVIEW_ROWS - 1) - m.r1 + 1);
    for (let r = m.r1 + 1; r <= Math.min(m.r2, PREVIEW_ROWS - 1); r++) skip.add(`${r}:${m.c1}`);
  }
  const head = "border border-slate-200 px-2 py-1.5 text-left font-medium whitespace-nowrap";
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-[11px]">
        <thead>
          {twoTier && (
            <tr>
              {plan.bands.map((b, i) => {
                const n = cols.filter(({ i: ci }) => ci >= b.c1 && ci <= b.c2).length;
                return n ? <th key={i} colSpan={n} className={`${head} text-center ${b.level === "sku" ? "bg-violet-50 text-violet-700" : "bg-slate-50 text-slate-600"}`}>{b.label}</th> : null;
              })}
            </tr>
          )}
          <tr>{cols.map(({ c, i }) => <th key={i} className={`${head} ${c.level === "sku" ? "bg-violet-50 text-violet-700" : "bg-slate-50 text-slate-600"}`}>{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className={plan.productStarts.includes(r) && r > 0 ? "border-t-2 border-slate-300" : ""}>
              {cols.map(({ c, i }) => {
                if (skip.has(`${r}:${i}`)) return null;
                const cell = row[i];
                const rs = span.get(`${r}:${i}`);
                const cls = `border border-slate-200 px-2 py-1 align-top ${cell.missing ? "bg-amber-50 text-amber-700" : "text-slate-700"}`;
                let body: React.ReactNode = cell.v == null ? "" : String(cell.v);
                if (cell.image) body = cell.v ? (images === "embed"
                  ? <img src={r2ImageUrl(String(cell.v), 80) ?? ""} alt="" className="h-10 w-10 rounded object-cover" loading="lazy" />
                  : <span className="text-blue-600 underline">ลิงก์รูป</span>) : "";
                else if (cell.missing && cell.v == null) body = "ยังไม่แปล";
                const text = typeof body === "string";
                return <td key={i} rowSpan={rs} className={cls} title={text && body ? String(body) : undefined}>
                  {text ? <span className="block max-w-[280px] truncate">{body}</span> : body}
                </td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
