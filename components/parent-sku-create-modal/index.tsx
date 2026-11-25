"use client";

/**
 * ParentSkuCreateModal (ของกลาง) — ป๊อป "＋ เพิ่ม Parent SKU"
 * บันทึกผ่าน POST /api/master-v2/parent-skus (ด่านสิทธิ์ products.create + audit log ฝั่ง server)
 * onCreated ได้ Parent ตัวที่สร้าง (id/รหัส/ชื่อ/รูป) → ผู้เรียกเอาไปผูกต่อได้ เช่น ผูกเข้างาน Creative
 * ใช้ที่: หน้า SKU (แท็บเลือกดูตามแท็ก) · กล่อง Parent SKU ใน drawer งาน
 *
 * รอบปรับใหญ่ (เจ้าของขอ 2026-11-25):
 *   • สลับภาษาทั้งป๊อป ไทย / EN / ไทย|EN (จำต่อคน · useUserPref)
 *   • รหัส: พิมพ์ตัวหน้า (CVB) → บอกเลขล่าสุด + ปุ่ม "ใช้ CVB17 (ถัดไป)" · ซ้ำ = กรอบแดง สร้างไม่ได้ · ข้ามเลข = เตือน
 *     (ตัวเช็กกลาง GET /api/design-sheets/parent-sku-check — ตัวเดียวกับใบออกแบบ/Wizard SKU)
 *   • แบรนด์: ปุ่มแบรนด์ที่ใช้ล่าสุด (จำต่อคน) + dropdown แบรนด์อื่น
 *   • หมวดกลางสำหรับลงขาย (CentralCategoryPicker) แทนหมวดสินค้าเดิม · หมวดสินค้าเดิม (product_family) เดาจากหมวดกลางให้
 *   • ช่วยตั้งชื่อ: คอลเลกชัน · ชนิด · วัสดุ (หลายข้อ) · จุดเด่น (หลายข้อ) เป็น dropdown ค้นหาได้ (SearchableSelect)
 *     → ต่อเป็นชื่อไทย + ชื่อ EN (lib/parent-name-builder) แก้ต่อเองได้ · ชิ้นที่ยังไม่มีคำ EN มีปุ่มแปลให้
 *   • ⚙ ตั้งค่ารายการจุดเด่น (คลังประโยคกลาง product_highlight_items — ตัวเดียวกับป๊อป AI/รายละเอียดติ๊ก) แก้ไทย+EN · เรียง · ลบ · ย้อนกลับได้
 *   • เอาชื่อรุ่นก่อน (ตัวหน้าเดียวกัน) มาแก้ · เตือนชื่อซ้ำ
 *   • คอลเลกชัน/วัสดุ/จุดเด่นที่เลือก บันทึกลงรุ่นด้วย (collection_id · materials · highlights)
 */
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { usePermission } from "@/components/auth";
import { SearchableSelect, SearchableMultiSelect } from "@/components/searchable-select";
import { useTickCatalog } from "@/components/tick-list-field";
import { findParentSkuByCode, type ParentSkuPickerValue } from "@/components/pickers";
import { useUserPref } from "@/lib/use-user-pref";
import { suggestMaterials, type MaterialRow } from "@/lib/product-materials";
import { isPhrase } from "@/lib/detail-snippets";
import { buildParentName, guessFamily, swapCodeInName, NAME_MAX } from "@/lib/parent-name-builder";
import type { ParentSkuCheck } from "@/app/api/design-sheets/parent-sku-check/route";

const CentralCategoryPicker = dynamic(() => import("@/components/central-category-picker").then((m) => m.CentralCategoryPicker), { ssr: false });

type Lang = "th" | "en" | "both";
type Brand = { id: string; name: string };
type Collection = { id: string; name: string; brand_id: string | null; is_active?: boolean | null };
type Cat = { id: string; name: string };
type Hl = { id: string; name: string; name_en?: string | null; kind?: string | null; sort_order?: number | null; is_active?: boolean | null };

const parseLang = (v: unknown): Lang | null => (v === "th" || v === "en" || v === "both" ? v : null);
const parseStrList = (v: unknown): string[] | null => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 6) : null);

/** แปลหลายคำ ไทย → อังกฤษ ครั้งเดียว (/api/ai/translate) · แปลไม่ได้ = ค่าว่าง */
async function translateEn(texts: string[]): Promise<string[]> {
  if (!texts.length) return [];
  const j = await apiFetch("/api/ai/translate", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texts, to: "en", kind: "labels", place: "product" }) }).then((r) => r.json());
  const out = (j?.data?.translated_list ?? []) as unknown[];
  return texts.map((_, i) => String(out[i] ?? "").trim());
}

export function ParentSkuCreateModal({ onClose, onCreated, defaultBrandId, defaultCode }: {
  onClose: () => void;
  onCreated: (p: ParentSkuPickerValue) => void;
  /** เติมแบรนด์ไว้ก่อน (เช่น แบรนด์ของงาน) — เปลี่ยนได้ */
  defaultBrandId?: string | null;
  defaultCode?: string;
}) {
  const toast = useToast();
  const canEditCatalog = usePermission("products.edit");
  const [lang, setLang] = useUserPref<Lang>("parent_create_lang", "th", parseLang);
  const [recentBrands, setRecentBrands] = useUserPref<string[]>("parent_create_brands", [], parseStrList);
  const L = (th: string, en: string) => (lang === "en" ? en : lang === "both" ? `${th} · ${en}` : th);
  const showTh = lang !== "en";
  const showEn = lang !== "th";

  // ── ข้อมูลตั้งต้น ──
  const [brands, setBrands] = useState<Brand[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const { data: matRows, revalidate: reloadMats } = useTickCatalog("product_materials");
  const { data: hlRows, revalidate: reloadHls } = useTickCatalog("product_highlight_items");
  const mats = useMemo(() => ((matRows ?? []) as unknown as MaterialRow[]).filter((m) => m.is_active !== false), [matRows]);
  const hls = useMemo(() => ((hlRows ?? []) as unknown as Hl[]).filter((x) => x.is_active !== false && isPhrase(x)), [hlRows]);
  useEffect(() => {
    apiFetch("/api/brands").then((r) => r.json()).then((j) => { if (Array.isArray(j.data)) setBrands(j.data as Brand[]); }).catch(() => {});
    apiFetch("/api/master-v2/collections?limit=1000").then((r) => r.json()).then((j) => { if (Array.isArray(j.data)) setCollections((j.data as Collection[]).filter((c) => c.is_active !== false)); }).catch(() => {});
    apiFetch("/api/platform-central-categories").then((r) => r.json()).then((j) => setCats((j.data ?? []) as Cat[])).catch(() => {});
  }, []);

  // ── ค่าที่กรอก ──
  const [code, setCode] = useState(defaultCode ?? "");
  const [brandId, setBrandId] = useState(defaultBrandId ?? "");
  useEffect(() => { if (!defaultBrandId && !brandId && recentBrands[0]) setBrandId(recentBrands[0]); }, [recentBrands]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [catId, setCatId] = useState<string | null>(null);
  const [collectionId, setCollectionId] = useState("");
  const [typeTh, setTypeTh] = useState("");
  const [matIds, setMatIds] = useState<string[]>([]);
  const [hlIds, setHlIds] = useState<string[]>([]);
  const [enMap, setEnMap] = useState<Record<string, string>>({});   // คำ EN ที่แปลเพิ่ม { ไทย: EN }
  const [nameTh, setNameTh] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [touchedTh, setTouchedTh] = useState(false);
  const [touchedEn, setTouchedEn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyTr, setBusyTr] = useState(false);
  const [hlCfgOpen, setHlCfgOpen] = useState(false);

  const brand = brands.find((b) => b.id === brandId) ?? null;
  const cat = cats.find((c) => c.id === catId) ?? null;
  const collection = collections.find((c) => c.id === collectionId) ?? null;
  // เลือกหมวดกลาง → ชนิดตามหมวด (ถ้ายังไม่ได้เลือกชนิดเอง)
  useEffect(() => { if (cat && !typeTh) setTypeTh(cat.name); }, [cat?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── รหัส: เช็กซ้ำ/เลขถัดไป (หน่วง 350ms) ──
  const [check, setCheck] = useState<ParentSkuCheck | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    const c = code.trim();
    if (!c) { setCheck(null); return; }
    let off = false;
    setChecking(true);
    const tm = setTimeout(() => {
      apiFetch(`/api/design-sheets/parent-sku-check?code=${encodeURIComponent(c)}`).then((r) => r.json())
        .then((j) => { if (!off) setCheck((j.data ?? null) as ParentSkuCheck | null); })
        .catch(() => { if (!off) setCheck(null); })
        .finally(() => { if (!off) setChecking(false); });
    }, 350);
    return () => { off = true; clearTimeout(tm); };
  }, [code]);
  const codeUp = code.trim().toUpperCase();
  const codeHasNum = /\d$/.test(codeUp);
  const codeExists = !!check?.exists && codeHasNum;

  // ── ชิ้นส่วนชื่อ → ชื่อไทย/EN ──
  const pickedMats = matIds.flatMap((id) => mats.filter((m) => m.id === id));
  const pickedHls = hlIds.flatMap((id) => hls.filter((h) => h.id === id));
  const enOf = (th: string, own?: string | null) => (own?.trim() || enMap[th] || "").trim();
  const typeEn = typeTh ? enOf(typeTh) : "";
  const missingEn = [
    ...(typeTh && !typeEn ? [typeTh] : []),
    ...pickedMats.filter((m) => !enOf(m.name, m.name_en)).map((m) => m.name),
    ...pickedHls.filter((h) => !enOf(h.name, h.name_en)).map((h) => h.name),
  ];
  const builtTh = buildParentName({ brand: brand?.name, collection: collection?.name, type: typeTh, materials: pickedMats.map((m) => m.name), highlights: pickedHls.map((h) => h.name), code: codeUp });
  const builtEn = buildParentName({
    brand: brand?.name, collection: collection?.name, type: typeEn,
    materials: pickedMats.map((m) => enOf(m.name, m.name_en)).filter(Boolean), highlights: pickedHls.map((h) => enOf(h.name, h.name_en)).filter(Boolean), code: codeUp,
  }, "en");
  useEffect(() => { if (!touchedTh) setNameTh(builtTh); }, [builtTh, touchedTh]);
  useEffect(() => { if (!touchedEn) setNameEn(builtEn); }, [builtEn, touchedEn]);
  const translateMissing = async () => {
    if (!missingEn.length) return;
    setBusyTr(true);
    try {
      const out = await translateEn(missingEn);
      setEnMap((p) => ({ ...p, ...Object.fromEntries(missingEn.map((th, i) => [th, out[i]]).filter(([, en]) => en)) }));
    } catch { toast.error(L("แปลไม่สำเร็จ", "Translate failed")); }
    finally { setBusyTr(false); }
  };

  // ── เตือนชื่อซ้ำ (หน่วง 500ms) ──
  const [dupName, setDupName] = useState<string | null>(null);
  useEffect(() => {
    const n = nameTh.trim();
    if (n.length < 6) { setDupName(null); return; }
    let off = false;
    const tm = setTimeout(() => {
      apiFetch(`/api/master-v2/parent-skus?${new URLSearchParams({ search: n.slice(0, 80), limit: "5" })}`).then((r) => r.json())
        .then((j) => {
          if (off) return;
          const hit = ((j.data ?? []) as { code?: string; name_th?: string }[]).find((x) => String(x.name_th ?? "").trim().toLowerCase() === n.toLowerCase());
          setDupName(hit ? String(hit.code ?? "") : null);
        }).catch(() => {});
    }, 500);
    return () => { off = true; clearTimeout(tm); };
  }, [nameTh]);

  // ── เอาชื่อรุ่นก่อน (ตัวหน้าเดียวกัน) มาแก้ ──
  const prevCode = check?.latest && check.latest.toUpperCase() !== codeUp ? check.latest : null;
  const copyPrev = async () => {
    if (!prevCode) return;
    try {
      const p = await findParentSkuByCode(prevCode);
      if (!p?.id) throw new Error(L("ไม่พบรุ่นก่อน", "Previous model not found"));
      const j = await apiFetch(`/api/master-v2/parent-skus/${encodeURIComponent(p.id)}`).then((r) => r.json());
      const row = (j.data ?? {}) as Record<string, unknown>;
      const s = (k: string) => (typeof row[k] === "string" ? (row[k] as string) : "");
      if (s("brand_id")) setBrandId(s("brand_id"));
      if (s("platform_category_id")) setCatId(s("platform_category_id"));
      if (s("collection_id")) setCollectionId(s("collection_id"));
      if (s("materials")) setMatIds(suggestMaterials(s("materials"), mats).map((m) => m.id));
      const hl = Array.isArray(row.highlights) ? (row.highlights as { id?: string }[]).map((x) => String(x?.id ?? "")).filter((id) => hls.some((h) => h.id === id)) : [];
      if (hl.length) setHlIds(hl);
      const target = codeHasNum ? codeUp : check?.suggested ?? codeUp;
      if (!codeHasNum && check?.suggested) setCode(check.suggested);
      if (s("name_th")) { setNameTh(swapCodeInName(s("name_th"), prevCode, target)); setTouchedTh(true); }
      if (s("name_en")) { setNameEn(swapCodeInName(s("name_en"), prevCode, target)); setTouchedEn(true); }
      toast.success(L(`ดึงชื่อ ${prevCode} มาแล้ว — แก้ต่อได้เลย`, `Copied ${prevCode} — edit as needed`));
    } catch (e) { toast.error(e instanceof Error ? e.message : L("ดึงไม่สำเร็จ", "Couldn't copy")); }
  };

  // ── เพิ่มรายการใหม่จาก dropdown ──
  const createRow = async (entity: string, body: Record<string, unknown>): Promise<string | null> => {
    try {
      const r = await apiFetch(`/api/master-v2/${entity}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok || j.error || !j.data?.id) throw new Error(j.error || L("เพิ่มไม่สำเร็จ", "Couldn't add"));
      return String(j.data.id);
    } catch (e) { toast.error(e instanceof Error ? e.message : L("เพิ่มไม่สำเร็จ", "Couldn't add")); return null; }
  };
  const addCollection = async (q: string) => {
    const name = q.trim(); if (!name) return;
    const id = await createRow("collections", { name, brand_id: brandId || null, is_active: true });
    if (id) { setCollections((p) => [...p, { id, name, brand_id: brandId || null }]); setCollectionId(id); }
  };
  const addMaterial = async (q: string) => {
    const name = q.trim(); if (!name) return;
    const id = await createRow("product_materials", { name, sort_order: 500, is_active: true });
    if (id) { await reloadMats(true); setMatIds((p) => [...p, id]); }
  };
  const addHighlight = async (q: string) => {
    const name = q.trim(); if (!name) return;
    const id = await createRow("product_highlight_items", { name, kind: "phrase", sort_order: 500, is_active: true });
    if (id) { await reloadHls(true); setHlIds((p) => [...p, id]); }
  };

  // ── บันทึก ──
  const save = async () => {
    if (!codeUp) { toast.error(L("กรอกรหัส Parent SKU", "Enter the Parent SKU code")); return; }
    if (codeExists) { toast.error(L(`รหัส ${codeUp} มีแล้ว`, `${codeUp} already exists`)); return; }
    if (!nameTh.trim()) { toast.error(L("กรอกชื่อสินค้า (ไทย)", "Enter the Thai product name")); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/master-v2/parent-skus", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: codeUp, name_th: nameTh.trim(), name_en: nameEn.trim() || null, brand_id: brandId || null,
          product_family: guessFamily(cat?.name || typeTh), platform_category_id: catId,
          collection_id: collectionId || null,
          materials: pickedMats.length ? pickedMats.map((m) => m.name).join(", ") : null,
          highlights: pickedHls.length ? pickedHls.map((h) => ({ id: h.id })) : null,
          is_active: true,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error || L("สร้างไม่สำเร็จ", "Couldn't create"));
      const row = (j.data ?? {}) as Record<string, unknown>;
      if (brandId) setRecentBrands([brandId, ...recentBrands.filter((x) => x !== brandId)].slice(0, 4));
      toast.success(L("สร้าง Parent SKU แล้ว", "Parent SKU created"));
      onCreated({ id: String(row.id ?? ""), code: String(row.code ?? codeUp), name: String(row.name_th ?? nameTh.trim()), image_key: (row.cover_image_r2_key as string | null) ?? null });
    } catch (e) { toast.error(e instanceof Error ? e.message : L("สร้างไม่สำเร็จ", "Couldn't create")); }
    finally { setSaving(false); }
  };

  // แบรนด์ปุ่มลัด: ใช้ล่าสุดของคนนี้ก่อน แล้วเติมแบรนด์แรก ๆ ให้ครบ 4
  const brandPills = [...recentBrands.map((id) => brands.find((b) => b.id === id)).filter((b): b is Brand => !!b), ...brands]
    .filter((b, i, a) => a.findIndex((x) => x.id === b.id) === i).slice(0, 4);
  const colOpts = collections.filter((c) => !brandId || !c.brand_id || c.brand_id === brandId).map((c) => ({ value: c.id, label: c.name }));
  const typeOpts = [...new Set([...(typeTh ? [typeTh] : []), ...cats.map((c) => c.name)])].map((n) => ({ value: n, label: n }));
  const matOpts = mats.map((m) => ({ value: m.id, label: lang === "en" && m.name_en?.trim() ? m.name_en : m.name, sub: (lang === "en" ? m.name : m.name_en) ?? undefined, searchText: `${m.name} ${m.name_en ?? ""} ${m.aliases ?? ""}` }));
  const hlOpts = hls.map((h) => ({ value: h.id, label: lang === "en" && h.name_en?.trim() ? h.name_en : h.name, sub: (lang === "en" ? h.name : h.name_en) ?? undefined, searchText: `${h.name} ${h.name_en ?? ""}` }));

  const label = "text-xs text-slate-500";
  const counter = (s: string) => <span className={`text-[11px] ${s.length > NAME_MAX ? "text-rose-600" : "text-slate-400"}`}>{s.length}/{NAME_MAX}</span>;
  return (
    <ERPModal open onClose={() => !saving && onClose()} size="md" title={L("＋ เพิ่ม Parent SKU", "＋ Add Parent SKU")}
      footer={<div className="flex justify-end gap-2 w-full">
        <button onClick={() => !saving && onClose()} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 max-sm:flex-1">{L("ยกเลิก", "Cancel")}</button>
        <button onClick={save} disabled={saving || codeExists} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 max-sm:flex-1">{saving ? L("กำลังสร้าง…", "Creating…") : L("สร้าง", "Create")}</button>
      </div>}>
      {/* สลับภาษาทั้งป๊อป (จำต่อคน) */}
      <div className="flex justify-end mb-2">
        <span className="inline-flex overflow-hidden rounded-lg border border-indigo-200 text-[12px]" data-parent-create-lang>
          {(["th", "en", "both"] as Lang[]).map((k) => (
            <button key={k} type="button" onClick={() => setLang(k)} className={`h-7 px-2.5 ${k !== "th" ? "border-l border-indigo-200" : ""} ${lang === k ? "bg-indigo-600 text-white" : "bg-white text-indigo-700 hover:bg-indigo-50"}`}>
              {k === "th" ? "ไทย" : k === "en" ? "EN" : "ไทย | EN"}
            </button>
          ))}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* รหัส */}
        <label className="block"><span className={label}>{L("รหัส Parent SKU", "Parent SKU code")} *</span>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={L("พิมพ์ตัวหน้า เช่น CVB", "Type the prefix, e.g. CVB")}
            className={`mt-0.5 w-full h-9 px-2 text-sm font-mono border rounded-lg ${codeExists ? "border-rose-400 bg-rose-50/40" : "border-slate-200"}`} data-parent-create-code />
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px]" data-parent-code-hint>
            {checking && <span className="text-slate-400">{L("กำลังเช็ก…", "Checking…")}</span>}
            {!checking && codeExists && <span className="text-rose-600">✕ {L(`${codeUp} มีแล้ว`, `${codeUp} already exists`)}</span>}
            {!checking && !codeExists && codeHasNum && check?.skipped && <span className="text-amber-600">⚠ {L(`ข้ามเลข (ล่าสุด ${check.latest})`, `Skipped numbers (latest ${check.latest})`)}</span>}
            {!checking && !codeExists && codeHasNum && check && !check.skipped && <span className="text-emerald-700">✓ {L("ใช้ได้", "Available")}{check.latest ? L(` (ล่าสุด ${check.latest})`, ` (latest ${check.latest})`) : ""}</span>}
            {!checking && !codeHasNum && check?.latest && <span className="text-slate-500">{L(`ล่าสุด ${check.latest}`, `Latest ${check.latest}`)}</span>}
            {!checking && check?.suggested && check.suggested !== codeUp && (!codeHasNum || codeExists || check.skipped) && (
              <button type="button" onClick={() => setCode(check.suggested ?? "")} className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-indigo-700 hover:bg-indigo-100">
                {L(`ใช้ ${check.suggested} (ถัดไป)`, `Use ${check.suggested} (next)`)}
              </button>
            )}
          </span>
        </label>
        {/* หมวดกลาง */}
        <div><span className={label}>{L("หมวดกลางสำหรับลงขาย", "Central listing category")}</span>
          <div className="mt-0.5"><CentralCategoryPicker value={catId} onChange={setCatId} showMap={false} placeholder={L("— เลือกหมวดกลาง —", "— Pick a category —")} /></div>
        </div>
        {/* แบรนด์ */}
        <div className="sm:col-span-2"><span className={label}>{L("แบรนด์", "Brand")}</span>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {brandPills.map((b) => (
              <button key={b.id} type="button" onClick={() => setBrandId(brandId === b.id ? "" : b.id)}
                className={`h-7 px-2.5 rounded-full border text-[12px] ${brandId === b.id ? "bg-indigo-600 border-indigo-600 text-white" : "bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100"}`}>{b.name}</button>
            ))}
            <select value={brandPills.some((b) => b.id === brandId) ? "" : brandId} onChange={(e) => setBrandId(e.target.value)} className="h-7 px-1.5 text-[12px] border border-slate-200 rounded-lg bg-white">
              <option value="">{L("แบรนด์อื่น ▾", "Other brand ▾")}</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        </div>
        {/* ช่วยตั้งชื่อ */}
        <div className="sm:col-span-2 rounded-xl border border-dashed border-indigo-300 bg-indigo-50/30 p-2.5 space-y-2" data-parent-name-helper>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-600">{L("ช่วยตั้งชื่อ", "Name helper")}</span>
            {prevCode && (
              <button type="button" onClick={() => void copyPrev()} className="h-7 px-2.5 rounded-full border border-indigo-200 bg-white text-[12px] text-indigo-700 hover:bg-indigo-50">
                ⧉ {L(`เอาชื่อ ${prevCode} มาแก้`, `Start from ${prevCode}`)}
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div><span className={label}>{L("คอลเลกชัน", "Collection")}</span>
              <SearchableSelect value={collectionId} options={colOpts} onChange={setCollectionId} placeholder={L("— เลือก/พิมพ์ใหม่ —", "— Pick or type —")}
                onCreate={(q) => void addCollection(q)} createLabel={L("เพิ่มคอลเลกชัน", "Add collection")} createPermission="products.edit" />
            </div>
            <div><span className={label}>{L("ชนิด", "Type")}</span>
              <SearchableSelect value={typeTh} options={typeOpts} onChange={setTypeTh} placeholder={L("— จากหมวดกลาง —", "— From the category —")}
                onCreate={(q) => setTypeTh(q.trim())} createLabel={L("ใช้คำนี้", "Use this")} />
              {showEn && typeTh && <span className="block mt-0.5 text-[11px] text-sky-700">{typeEn || L("⚠ ยังไม่มีคำ EN", "⚠ No English yet")}</span>}
            </div>
            <div><span className={label}>{L("วัสดุ (หลายข้อ)", "Material (multi)")}</span>
              <SearchableMultiSelect values={matIds} options={matOpts} onChange={setMatIds} maxChips={3} placeholder={L("— เลือกวัสดุ —", "— Pick materials —")}
                onCreate={canEditCatalog ? (q) => void addMaterial(q) : undefined} />
            </div>
            <div><span className={`${label} flex items-center justify-between`}>{L("จุดเด่น (หลายข้อ)", "Highlights (multi)")}
                {canEditCatalog && <button type="button" onClick={() => setHlCfgOpen((v) => !v)} className="text-[11px] text-indigo-600 hover:underline">⚙ {L("ตั้งค่ารายการ", "Edit list")}</button>}
              </span>
              <SearchableMultiSelect values={hlIds} options={hlOpts} onChange={setHlIds} maxChips={3} placeholder={L("— เลือกจุดเด่น —", "— Pick highlights —")}
                onCreate={canEditCatalog ? (q) => void addHighlight(q) : undefined} />
            </div>
          </div>
          {hlCfgOpen && <HighlightListEditor items={hls} L={L} onSaved={() => void reloadHls(true)} />}
          {showEn && missingEn.length > 0 && (
            <p className="text-[11.5px] text-amber-700 flex flex-wrap items-center gap-1.5">
              ⚠ {L("ยังไม่มีคำ EN:", "No English for:")} {missingEn.join(", ")}
              <button type="button" disabled={busyTr} onClick={() => void translateMissing()} className="rounded-full border border-amber-300 bg-white px-2 py-0.5 text-amber-800 hover:bg-amber-50 disabled:opacity-50">
                {busyTr ? L("กำลังแปล…", "Translating…") : L("แปลให้", "Translate")}
              </button>
            </p>
          )}
          {(showTh || !nameTh.trim()) && (
            <label className="block"><span className={`${label} flex items-center justify-between`}>{L("ชื่อสินค้า (ไทย)", "Product name (TH)")} *{counter(nameTh)}</span>
              <input value={nameTh} onChange={(e) => { setNameTh(e.target.value); setTouchedTh(true); }} className="mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white" data-parent-name-th />
              {touchedTh && nameTh !== builtTh && builtTh && <button type="button" onClick={() => setTouchedTh(false)} className="mt-0.5 text-[11px] text-indigo-600 hover:underline">↺ {L("ใช้ชื่อจากชิ้นส่วน", "Use the built name")}</button>}
            </label>
          )}
          {showEn && (
            <label className="block"><span className={`${label} flex items-center justify-between`}>{L("ชื่อสินค้า (EN)", "Product name (EN)")}{counter(nameEn)}</span>
              <input value={nameEn} onChange={(e) => { setNameEn(e.target.value); setTouchedEn(true); }} className="mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white" data-parent-name-en />
              {touchedEn && nameEn !== builtEn && builtEn && <button type="button" onClick={() => setTouchedEn(false)} className="mt-0.5 text-[11px] text-indigo-600 hover:underline">↺ {L("ใช้ชื่อจากชิ้นส่วน", "Use the built name")}</button>}
            </label>
          )}
          {dupName && <p className="text-[11.5px] text-amber-700">⚠ {L(`ชื่อนี้ตรงกับรุ่น ${dupName} ที่มีอยู่แล้ว`, `Same name as existing ${dupName}`)}</p>}
        </div>
      </div>
      <p className="text-[11px] text-slate-400 mt-2">{L("สร้างแล้วแก้รายละเอียดเพิ่ม (รูป/ราคา/แท็ก) ได้ที่ตัวแก้สินค้า", "Add more details (images/price/tags) in the product editor afterwards")}</p>
    </ERPModal>
  );
}

/** ⚙ ตั้งค่ารายการจุดเด่น (คลังประโยคกลาง product_highlight_items ชนิดข้อความ) — แก้ไทย/EN · เรียง · ลบ (ปิดใช้) · บันทึกแล้วย้อนกลับได้ */
function HighlightListEditor({ items, L, onSaved }: { items: Hl[]; L: (th: string, en: string) => string; onSaved: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState(() => items.map((x) => ({ id: x.id, name: x.name, name_en: x.name_en ?? "", gone: false })));
  const [busy, setBusy] = useState(false);
  const move = (i: number, d: -1 | 1) => setRows((p) => { const n = [...p]; const j = i + d; if (j < 0 || j >= n.length) return p; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const put = (i: number, patch: Partial<{ name: string; name_en: string; gone: boolean }>) => setRows((p) => p.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const patchRow = (id: string, body: Record<string, unknown>) => apiFetch(`/api/master-v2/product_highlight_items/${encodeURIComponent(id)}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }).then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || "save failed"); });
  const translate = async () => {
    const need = rows.map((r, i) => ({ r, i })).filter(({ r }) => !r.gone && r.name.trim() && !r.name_en.trim());
    if (!need.length) { toast.info(L("ช่อง EN กรอกครบแล้ว", "English is already filled")); return; }
    setBusy(true);
    try { const out = await translateEn(need.map(({ r }) => r.name.trim())); need.forEach(({ i }, k) => { if (out[k]) put(i, { name_en: out[k] }); }); }
    catch { toast.error(L("แปลไม่สำเร็จ", "Translate failed")); }
    finally { setBusy(false); }
  };
  const save = async () => {
    const before = new Map(items.map((x, i) => [x.id, { name: x.name, name_en: x.name_en ?? "", sort_order: x.sort_order ?? i * 10, is_active: true }]));
    const changes = rows.map((r, i) => ({ id: r.id, body: { name: r.name.trim(), name_en: r.name_en.trim() || null, sort_order: i * 10, is_active: !r.gone } }))
      .filter(({ id, body }) => { const b = before.get(id); return !!b && (b.name !== body.name || (b.name_en || null) !== body.name_en || b.sort_order !== body.sort_order || !body.is_active); })
      .filter(({ body }) => body.name);
    if (!changes.length) { toast.info(L("ไม่มีอะไรเปลี่ยน", "Nothing changed")); return; }
    setBusy(true);
    try {
      for (const c of changes) await patchRow(c.id, c.body);
      onSaved();
      toast.undo(L(`บันทึกรายการจุดเด่นแล้ว (${changes.length} ข้อ)`, `Highlights saved (${changes.length})`), async () => {
        try {
          for (const c of changes) { const b = before.get(c.id); if (b) await patchRow(c.id, { ...b, name_en: b.name_en || null }); }
          onSaved();
        } catch (e) { toast.error(e instanceof Error ? e.message : L("ย้อนกลับไม่สำเร็จ", "Undo failed")); }
      });
    } catch (e) { toast.error(e instanceof Error ? e.message : L("บันทึกไม่สำเร็จ", "Save failed")); }
    finally { setBusy(false); }
  };
  return (
    <div className="rounded-lg border border-indigo-200 bg-white p-2 space-y-1" data-highlight-list-editor>
      <p className="text-[11px] text-slate-500">{L("รายการจุดเด่นกลาง — ใช้ร่วมกับป๊อป AI และ \"รายละเอียดเพิ่ม (ติ๊ก)\" ของทุกรุ่น", "Shared highlight list — also used by the AI popup and every model's tick list")}</p>
      <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
        {rows.map((r, i) => (
          <div key={r.id} className={`grid grid-cols-[16px_1fr_auto] sm:grid-cols-[16px_1fr_1fr_auto] gap-1 items-center ${r.gone ? "opacity-40" : ""}`}>
            <span className="flex flex-col">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="text-[9px] leading-none text-slate-400 disabled:opacity-30" aria-label={L("เลื่อนขึ้น", "Move up")}>▲</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} className="text-[9px] leading-none text-slate-400 disabled:opacity-30" aria-label={L("เลื่อนลง", "Move down")}>▼</button>
            </span>
            <input value={r.name} onChange={(e) => put(i, { name: e.target.value })} disabled={r.gone} className="h-7 px-2 text-[12px] border border-slate-200 rounded min-w-0" />
            <button type="button" onClick={() => put(i, { gone: !r.gone })} className="sm:order-last h-7 px-1.5 text-[12px] text-rose-500 hover:bg-rose-50 rounded" aria-label={L("ลบ", "Delete")}>{r.gone ? "↺" : "✕"}</button>
            <input value={r.name_en} onChange={(e) => put(i, { name_en: e.target.value })} disabled={r.gone} placeholder="EN" className="col-start-2 sm:col-start-auto h-7 px-2 text-[12px] border border-slate-200 rounded bg-sky-50/40 min-w-0" />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <button type="button" onClick={() => void translate()} disabled={busy} className="h-7 px-2.5 text-[12px] rounded-md border border-sky-200 text-sky-700 hover:bg-sky-50 disabled:opacity-50">{L("แปล EN ที่ว่าง", "Fill English")}</button>
        <button type="button" onClick={() => void save()} disabled={busy} className="h-7 px-3 text-[12px] rounded-md bg-indigo-600 text-white disabled:opacity-50">{busy ? L("กำลังบันทึก…", "Saving…") : L("บันทึกรายการ", "Save list")}</button>
      </div>
    </div>
  );
}
