"use client";

/**
 * 📝 DetailInsertButton (ของกลาง) — ปุ่ม "＋ แทรก" ข้างหัวข้อช่องคำอธิบาย → ป๊อปเลือกรายละเอียดแล้วพิมพ์บรรทัดลงให้ตรงตำแหน่งที่เลือก
 *   เปิดใช้ที่ทะเบียนฟิลด์: ui_style.insert_details = true (ตอนนี้ = Description ของ Parent SKU) — ต่อสายใน components/master-crud ที่เดียว
 *   หน้าตา (เจ้าของเลือก 2026-10-17): ซ้าย = เลือก · ขวา = ตัวอย่างคำอธิบาย (คลิกระหว่างบรรทัดเลือกตำแหน่ง · ดูไทย/EN)
 *   แท็บ: 📝 ข้อความสำเร็จรูป · 🧵 วัสดุ · 🔢 ช่อง + ตัวเลข · 📏 ขนาด/น้ำหนัก · 🎒 ใส่อะไรได้
 *     ขนาด/น้ำหนัก/ใส่อะไรได้ = ดึงค่าจากช่องของสินค้ามาให้ · แก้ในป๊อป = บันทึกกลับช่องนั้นด้วย (onApply.fields)
 *     โชว์เฉพาะเมื่อฟอร์มมีช่องนั้นและแก้ได้ (prop writable)
 *   ทุกแถวมี ✏️ → ป๊อปเล็กแก้ชื่อไทย/อังกฤษ (ปุ่มแปล) · รูปแบบบรรทัด (ช่อง) · ขนาด (ของที่ใส่ได้) · ลบ = ซ่อนจากรายการกลาง (กู้ได้)
 *     แก้ที่นี่ = แก้รายการกลาง ใช้ทุกรุ่น · ข้อความที่แทรกไปแล้วเป็นข้อความธรรมดา ไม่เปลี่ยนตาม
 * กฎคิดบรรทัด: lib/detail-snippets.ts · วัสดุ: lib/product-materials.ts · ใส่อะไรได้: lib/product-fits.ts
 */
import { Fragment, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { useTickCatalog } from "@/components/tick-list-field";
import {
  DEFAULT_SLOT_TEMPLATE,
  DEFAULT_SLOT_TEMPLATE_EN,
  composeLines,
  enInsertAt,
  insertLines,
  isSlot,
  slotText,
  splitLines,
  type SnippetItem,
} from "@/lib/detail-snippets";
import { hasMaterialPage, type MaterialRow } from "@/lib/product-materials";
import { fitLabels, fitSizeOptions, parseFits, type FitItem, type FitPick } from "@/lib/product-fits";
import { translateContent } from "@/lib/content-translate";

type Tab = "phrase" | "material" | "slot" | "size" | "fit";
type CatalogKind = "phrase" | "slot" | "material" | "fit";

const SNIP = "product_highlight_items";
const MAT = "product_materials";
const FIT = "product_fit_items";
const catalogOf = (k: CatalogKind) => (k === "material" ? MAT : k === "fit" ? FIT : SNIP);

/** ช่องขนาดของสินค้า (คอลัมน์ size_length_cm = กว้าง ตามป้ายทุกที่) */
const SIZE_FIELDS = [
  { k: "w", field: "size_length_cm", label: "กว้าง", unit: "ซม." },
  { k: "h", field: "size_height_cm", label: "สูง", unit: "ซม." },
  { k: "d", field: "size_thickness_cm", label: "หนา", unit: "ซม." },
  { k: "g", field: "weight_g", label: "น้ำหนัก", unit: "กรัม" },
] as const;
type SizeK = (typeof SIZE_FIELDS)[number]["k"];

const TABS: { key: Tab; label: string; hint: string }[] = [
  { key: "phrase", label: "📝 ข้อความ", hint: "ติ๊กได้หลายข้อ — ได้บรรทัดละข้อ" },
  { key: "material", label: "🧵 วัสดุ", hint: "ติ๊กได้หลายตัว — รวมเป็นบรรทัดเดียว \"วัสดุ: …\" · วัสดุที่มีหน้า ลูกค้ากดดูบนเว็บได้" },
  { key: "slot", label: "🔢 ช่อง", hint: "พิมพ์แค่จำนวน — ช่องที่ใส่ตัวเลขรวมเป็นบรรทัดเดียว" },
  { key: "size", label: "📏 ขนาด/น้ำหนัก", hint: "ดึงค่าจากช่องขนาดของสินค้ามาให้ · แก้ตรงนี้ = แก้ช่องของสินค้าด้วย" },
  { key: "fit", label: "🎒 ใส่อะไรได้", hint: "ติ๊กของที่ใส่ได้ (เลือกขนาดได้) · ติ๊กตรงนี้ = แก้ช่อง \"ใส่อะไรได้บ้าง\" ของสินค้าด้วย" },
];

export type DetailInsertResult = {
  th: string;
  en?: string;
  /** ช่องอื่นของสินค้าที่เปลี่ยนในป๊อป (ขนาด/น้ำหนัก = ตัวเลขหรือ null · fits = รายการหรือ null) */
  fields?: Record<string, unknown>;
};

const numStr = (v: unknown): string => {
  const n = Number(v);
  return v == null || v === "" || !isFinite(n) || n <= 0 ? "" : String(Math.round(n * 100) / 100);
};
const toggle = (ids: string[], id: string) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

export function DetailInsertButton({
  thText,
  enText,
  hasEn,
  saveLabel,
  values,
  writable,
  onApply,
}: {
  thText: string;
  enText: string;
  /** มีช่องคำอธิบายภาษาอังกฤษคู่กัน (ui_style.lang_en) */
  hasEn: boolean;
  /** หน้า "ดู" = บันทึกทันที → ปุ่มเขียน "แทรกและบันทึก" */
  saveLabel?: string;
  /** ค่าปัจจุบันของระเบียน (ขนาด/น้ำหนัก/fits) */
  values?: Record<string, unknown>;
  /** ช่องที่ป๊อปบันทึกกลับได้ (มีในฟอร์ม + แก้ได้) — ไม่มี = ไม่โชว์แท็บขนาด/ใส่อะไรได้ */
  writable?: string[];
  onApply: (next: DetailInsertResult) => Promise<boolean> | boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        data-detail-insert
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        title="เลือกรายละเอียดสำเร็จรูป / วัสดุ / จำนวนช่อง / ขนาด / ใส่อะไรได้ แล้วแทรกลงคำอธิบายตรงตำแหน่งที่เลือก"
        className="ml-1.5 inline-flex items-center rounded-full border border-orange-300 px-2 py-[1px] align-middle text-[10.5px] font-medium text-orange-600 hover:bg-orange-50"
      >
        ＋ แทรก
      </button>
      {open && (
        <DetailInsertModal
          thText={thText}
          enText={enText}
          hasEn={hasEn}
          saveLabel={saveLabel}
          values={values ?? {}}
          writable={writable ?? []}
          onApply={onApply}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function DetailInsertModal({
  thText,
  enText,
  hasEn,
  saveLabel,
  values,
  writable,
  onApply,
  onClose,
}: {
  thText: string;
  enText: string;
  hasEn: boolean;
  saveLabel?: string;
  values: Record<string, unknown>;
  writable: string[];
  onApply: (next: DetailInsertResult) => Promise<boolean> | boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const { data: snipRows, loading: snipLoading, revalidate: reloadSnips } = useTickCatalog(SNIP);
  const { data: matRows, loading: matLoading, revalidate: reloadMats } = useTickCatalog(MAT);
  const { data: fitRows, loading: fitLoading, revalidate: reloadFits } = useTickCatalog(FIT);
  const snips = (snipRows ?? []) as unknown as SnippetItem[];
  const mats = (matRows ?? []) as unknown as MaterialRow[];
  // ตุ๊กตา/ฟิกเกอร์ = ระบบคำนวณจากช่องใส่ของเอง (ไม่ติ๊ก — เหมือน FIT_CFG)
  const fitItems = ((fitRows ?? []) as (FitItem & { kind?: string | null })[]).filter((x) => x.kind !== "doll");
  const phraseItems = snips.filter((x) => !isSlot(x));
  const slotItems = snips.filter(isSlot);

  const sizeFields = SIZE_FIELDS.filter((f) => writable.includes(f.field));
  const canFit = writable.includes("fits");
  const tabs = TABS.filter((t) => (t.key === "size" ? sizeFields.length > 0 : t.key === "fit" ? canFit : true));

  const lines = useMemo(() => splitLines(thText), [thText]);
  const enLines = useMemo(() => splitLines(enText), [enText]);
  const [tab, setTab] = useState<Tab>("phrase");
  const [q, setQ] = useState("");
  const [phraseIds, setPhraseIds] = useState<string[]>([]);
  const [matIds, setMatIds] = useState<string[]>([]);
  const [slotN, setSlotN] = useState<Record<string, string>>({});
  const [at, setAt] = useState(lines.length);
  const [withEn, setWithEn] = useState(hasEn && enText.trim() !== "");
  const [view, setView] = useState<"th" | "en">("th");
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<{ kind: CatalogKind; item: Record<string, unknown> | null } | null>(null);

  // 📏 ขนาด/น้ำหนัก — เริ่มจากค่าของสินค้า · เปิดแท็บ = ตั้งใจใส่บรรทัด (ติ๊กออกได้)
  const sizeOrig = useMemo(() => Object.fromEntries(SIZE_FIELDS.map((f) => [f.k, numStr(values[f.field])])) as Record<SizeK, string>, [values]);
  const [size, setSize] = useState<Record<SizeK, string>>(sizeOrig);
  const [sizeSeen, setSizeSeen] = useState(false);
  const [useSize, setUseSize] = useState(true);
  const [useWeight, setUseWeight] = useState(true);
  // 🎒 ใส่อะไรได้ — เริ่มจากที่สินค้าติ๊กไว้
  const fitOrig = useMemo(() => parseFits(values.fits), [values.fits]);
  const [fits, setFits] = useState<FitPick[]>(fitOrig);
  const [fitSeen, setFitSeen] = useState(false);
  const [useFit, setUseFit] = useState(true);

  const openTab = (t: Tab) => {
    setTab(t);
    if (t === "size") setSizeSeen(true);
    if (t === "fit") setFitSeen(true);
  };

  const fitTh = fitLabels(fits, fitItems, "th");
  const fitEnOk = fits.every((p) => fitItems.find((x) => x.id === p.id)?.name_en?.trim());
  const sel = {
    phrases: phraseIds.map((id) => phraseItems.find((x) => x.id === id)).filter((x): x is SnippetItem => !!x),
    materials: matIds.map((id) => mats.find((x) => x.id === id)).filter((x): x is MaterialRow => !!x),
    slots: slotItems.map((item) => ({ item, n: Math.floor(Number(slotN[item.id])) || 0 })).filter((p) => p.n > 0),
    size: sizeSeen && useSize ? { w: size.w, h: size.h, d: size.d } : null,
    weight: sizeSeen && useWeight && sizeFields.some((f) => f.k === "g") ? size.g : null,
    fits: fitSeen && useFit && fitTh.length ? { th: fitTh, en: fitEnOk ? fitLabels(fits, fitItems, "en") : null } : null,
  };
  const out = composeLines(sel);

  // 🔄 ช่องของสินค้าที่จะบันทึกกลับ (เทียบค่าเดิม)
  const fields: Record<string, unknown> = {};
  const changes: string[] = [];
  for (const f of sizeFields) {
    if (size[f.k] === sizeOrig[f.k]) continue;
    fields[f.field] = size[f.k] === "" ? null : Number(size[f.k]);
    changes.push(`${f.label} ${sizeOrig[f.k] || "ว่าง"}→${size[f.k] || "ว่าง"}`);
  }
  if (canFit && JSON.stringify(fits) !== JSON.stringify(fitOrig)) {
    fields.fits = fits.length ? fits : null;
    changes.push(`ใส่อะไรได้ (${fits.length} รายการ)`);
  }
  const picked = out.th.length > 0;
  const dirty = picked || changes.length > 0;
  const enAppend = withEn && enLines.length > 0 && enLines.length !== lines.length;

  const needle = q.trim().toLowerCase();
  const match = (x: { name: string; name_en?: string | null }) => !needle || `${x.name} ${x.name_en ?? ""}`.toLowerCase().includes(needle);

  const apply = async () => {
    if (!dirty) {
      toast.warning("ยังไม่ได้เลือกรายละเอียด");
      return;
    }
    const th = picked ? insertLines(thText, out.th, at) : thText;
    const en = picked && withEn && hasEn && out.en.length ? insertLines(enText, out.en, enInsertAt(thText, enText, at)) : undefined;
    setSaving(true);
    try {
      const ok = await onApply({ th, en, ...(changes.length ? { fields } : {}) });
      if (ok !== false) onClose();
    } finally {
      setSaving(false);
    }
  };

  const reloadOf = (k: CatalogKind) => (k === "material" ? reloadMats(true) : k === "fit" ? reloadFits(true) : reloadSnips(true));
  const onEdited = async (k: CatalogKind, id: string, created: boolean) => {
    await reloadOf(k);
    if (!created) return;
    if (k === "phrase") setPhraseIds((p) => [...p, id]);
    if (k === "material") setMatIds((p) => [...p, id]);
    if (k === "fit") setFits((p) => [...p, { id }]);
  };
  const onDeleted = async (k: CatalogKind, id: string) => {
    await reloadOf(k);
    setPhraseIds((p) => p.filter((x) => x !== id));
    setMatIds((p) => p.filter((x) => x !== id));
    setSlotN((p) => ({ ...p, [id]: "" }));
    setFits((p) => p.filter((x) => x.id !== id));
  };

  const loading = (snipLoading && !snipRows) || (matLoading && !matRows) || (fitLoading && !fitRows);
  const tabInfo = TABS.find((t) => t.key === tab)!;
  const countOf = (t: Tab) =>
    t === "phrase" ? sel.phrases.length : t === "material" ? sel.materials.length : t === "slot" ? sel.slots.length : t === "size" ? (sel.size || sel.weight != null ? 1 : 0) : sel.fits ? fits.length : 0;

  const editBtn = (kind: CatalogKind, item: Record<string, unknown>) => (
    <button type="button" onClick={() => setEditor({ kind, item })} title="แก้ / ลบ รายการนี้ (รายการกลาง)" aria-label={`แก้ ${String(item.name)}`}
      className="shrink-0 rounded px-1 text-[13px] text-slate-400 hover:bg-white hover:text-slate-700">✏️</button>
  );
  const addBtn = (kind: CatalogKind, label: string) => (
    <button type="button" onClick={() => setEditor({ kind, item: null })} className="mt-1 text-xs text-orange-600 hover:underline">＋ เพิ่ม{label}ใหม่</button>
  );
  const rowCls = (on: boolean) => `flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${on ? "border-orange-300 bg-orange-50" : "border-slate-200 hover:bg-slate-50"}`;

  // ตัวอย่าง: ไทย = คลิกระหว่างบรรทัดเลือกตำแหน่ง · อังกฤษ = ดูอย่างเดียว (ตำแหน่งตามภาษาไทย)
  const pvLines = view === "en" ? enLines : lines;
  const pvNew = view === "en" ? (withEn ? out.en : []) : out.th;
  const pvAt = view === "en" ? enInsertAt(thText, enText, at) : at;

  return (
    <ERPModal
      open
      onClose={onClose}
      size="xl"
      defaultExpanded={false}
      hasUnsavedChanges={dirty}
      title="แทรกรายละเอียด"
      description="ซ้าย = เลือกรายละเอียด · ขวา = ตัวอย่างคำอธิบาย คลิกระหว่างบรรทัดเพื่อเลือกตำแหน่ง — ระบบพิมพ์บรรทัดลงให้ (แก้ต่อได้เหมือนพิมพ์เอง)"
      footer={
        <div className="flex items-center justify-end gap-2">
          <span className="mr-auto text-xs text-slate-500">
            {picked ? `จะแทรก ${out.th.length} บรรทัด` : "ยังไม่ได้เลือกบรรทัด"}
            {changes.length > 0 && ` · อัปเดตช่องสินค้า ${changes.length} ช่อง`}
          </span>
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-700 hover:bg-slate-50">
            ยกเลิก
          </button>
          <button type="button" onClick={() => void apply()} disabled={saving || !dirty} data-detail-insert-apply
            className="h-9 rounded-lg bg-orange-500 px-4 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50">
            {saving ? "กำลังบันทึก…" : saveLabel ?? "แทรก"}
          </button>
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]" data-detail-insert-modal>
        {/* ─── ซ้าย: เลือก ─── */}
        <div className="min-w-0 space-y-2.5">
          <div className="flex flex-wrap gap-1.5">
            {tabs.map((t) => (
              <button key={t.key} type="button" onClick={() => openTab(t.key)} data-insert-tab={t.key}
                className={`h-8 rounded-lg border px-2.5 text-[12.5px] font-medium ${tab === t.key ? "border-orange-300 bg-orange-50 text-orange-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                {t.label}
                {countOf(t.key) > 0 && <span className="ml-1 rounded-full bg-orange-500 px-1.5 text-[10.5px] text-white">{countOf(t.key)}</span>}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <p className="flex-1 text-[11.5px] text-slate-500">{tabInfo.hint}</p>
            {tab !== "size" && (
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา…"
                className="h-8 w-32 rounded-md border border-slate-200 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" />
            )}
          </div>

          {loading ? (
            <div className="h-40 animate-pulse rounded-lg bg-slate-100" />
          ) : (
            <div className="max-h-[22rem] space-y-1 overflow-auto pr-1">
              {tab === "phrase" && (
                <>
                  {phraseItems.filter(match).map((it) => {
                    const on = phraseIds.includes(it.id);
                    return (
                      <div key={it.id} className={rowCls(on)}>
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                          <input type="checkbox" checked={on} onChange={() => setPhraseIds((p) => toggle(p, it.id))} className="h-4 w-4 shrink-0 accent-orange-500" />
                          <span className={`flex-1 text-sm ${on ? "font-medium text-slate-800" : "text-slate-600"}`}>{it.name}</span>
                          {it.name_en ? <span className="truncate text-[11px] text-slate-400">{it.name_en}</span> : <span className="text-[11px] text-slate-300">ไม่มีอังกฤษ</span>}
                        </label>
                        {editBtn("phrase", it as unknown as Record<string, unknown>)}
                      </div>
                    );
                  })}
                  {!phraseItems.filter(match).length && <p className="py-3 text-center text-xs text-slate-400">ไม่พบข้อความ</p>}
                  {addBtn("phrase", "ข้อความ")}
                </>
              )}

              {tab === "material" && (
                <>
                  {mats.filter(match).map((m) => {
                    const on = matIds.includes(m.id);
                    const page = hasMaterialPage(m);
                    return (
                      <div key={m.id} className={rowCls(on)}>
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                          <input type="checkbox" checked={on} onChange={() => setMatIds((p) => toggle(p, m.id))} className="h-4 w-4 shrink-0 accent-orange-500" />
                          <span className={`text-sm ${on ? "font-medium text-slate-800" : "text-slate-600"}`}>{m.name}</span>
                          {m.name_en && <span className="truncate text-[11px] text-slate-400">{m.name_en}</span>}
                        </label>
                        {page ? (
                          <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] text-emerald-700" title="ชื่อวัสดุนี้บนเว็บกดไปหน้าวัสดุได้">🔗 มีหน้า</span>
                        ) : (
                          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] text-slate-500" title="ยังไม่มีคำอธิบายวัสดุ — กด ✏️ แล้วไปเขียนหน้าวัสดุ">ยังไม่มีหน้า</span>
                        )}
                        {editBtn("material", m as unknown as Record<string, unknown>)}
                      </div>
                    );
                  })}
                  {!mats.filter(match).length && <p className="py-3 text-center text-xs text-slate-400">ไม่พบวัสดุ</p>}
                  {addBtn("material", "วัสดุ")}
                </>
              )}

              {tab === "slot" && (
                <>
                  {slotItems.filter(match).map((it) => {
                    const n = Math.floor(Number(slotN[it.id])) || 0;
                    return (
                      <div key={it.id} className={rowCls(n > 0)}>
                        <span className={`min-w-0 flex-1 text-sm ${n > 0 ? "font-medium text-slate-800" : "text-slate-600"}`}>
                          {it.name}
                          {n > 0 && <span className="ml-1.5 text-[11px] font-normal text-slate-400">→ {slotText(it, n, "th")}</span>}
                        </span>
                        <input aria-label={`จำนวน ${it.name}`} type="number" inputMode="numeric" min={0} max={99} step={1} value={slotN[it.id] ?? ""} placeholder="0"
                          onChange={(e) => setSlotN((p) => ({ ...p, [it.id]: e.target.value.replace(/[^\d]/g, "").slice(0, 2) }))}
                          className="h-8 w-14 rounded-md border border-slate-200 px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-orange-400" />
                        <span className="w-6 text-xs text-slate-400">ช่อง</span>
                        {editBtn("slot", it as unknown as Record<string, unknown>)}
                      </div>
                    );
                  })}
                  {!slotItems.filter(match).length && <p className="py-3 text-center text-xs text-slate-400">ไม่พบช่อง</p>}
                  {addBtn("slot", "ช่อง")}
                </>
              )}

              {tab === "size" && (
                <div className="space-y-1.5" data-insert-size>
                  {sizeFields.map((f) => {
                    const changed = size[f.k] !== sizeOrig[f.k];
                    return (
                      <div key={f.k} className={rowCls(changed)}>
                        <span className="w-16 text-sm text-slate-700">{f.label}</span>
                        <input aria-label={f.label} inputMode="decimal" value={size[f.k]} placeholder="0"
                          onChange={(e) => setSize((p) => ({ ...p, [f.k]: e.target.value.replace(/[^\d.]/g, "").slice(0, 8) }))}
                          className="h-8 w-20 rounded-md border border-slate-200 px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-orange-400" />
                        <span className="w-9 text-xs text-slate-400">{f.unit}</span>
                        <span className={`flex-1 text-right text-[11px] ${changed ? "text-orange-700" : "text-slate-400"}`}>
                          {changed ? `เดิม ${sizeOrig[f.k] || "ว่าง"}` : sizeOrig[f.k] ? "ตรงกับสินค้า" : "สินค้ายังไม่กรอก"}
                        </span>
                      </div>
                    );
                  })}
                  <div className="space-y-1 pt-1 text-[12.5px] text-slate-600">
                    {sizeFields.some((f) => f.k !== "g") && (
                      <label className="flex cursor-pointer items-center gap-2">
                        <input type="checkbox" checked={useSize} onChange={(e) => setUseSize(e.target.checked)} className="h-4 w-4 accent-orange-500" />
                        ใส่บรรทัดขนาดลงคำอธิบาย
                      </label>
                    )}
                    {sizeFields.some((f) => f.k === "g") && (
                      <label className="flex cursor-pointer items-center gap-2">
                        <input type="checkbox" checked={useWeight} onChange={(e) => setUseWeight(e.target.checked)} className="h-4 w-4 accent-orange-500" />
                        ใส่บรรทัดน้ำหนักลงคำอธิบาย
                      </label>
                    )}
                    <p className="text-[11px] text-slate-400">ติ๊กออก = ไม่ใส่บรรทัด แต่ตัวเลขที่แก้ยังบันทึกกลับช่องของสินค้า</p>
                  </div>
                </div>
              )}

              {tab === "fit" && (
                <>
                  {fitItems.filter(match).map((it) => {
                    const pick = fits.find((p) => p.id === it.id);
                    const opts = fitSizeOptions(it);
                    return (
                      <div key={it.id} className={rowCls(!!pick)}>
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                          <input type="checkbox" checked={!!pick} onChange={() => setFits((p) => (pick ? p.filter((x) => x.id !== it.id) : [...p, { id: it.id }]))} className="h-4 w-4 shrink-0 accent-orange-500" />
                          <span className={`text-sm ${pick ? "font-medium text-slate-800" : "text-slate-600"}`}>{it.name}</span>
                          {it.name_en ? <span className="truncate text-[11px] text-slate-400">{it.name_en}</span> : <span className="text-[11px] text-slate-300">ไม่มีอังกฤษ</span>}
                        </label>
                        {pick && opts.length > 0 && (
                          <select aria-label={`ขนาด ${it.name}`} value={pick.size ?? ""} onChange={(e) => setFits((p) => p.map((x) => (x.id === it.id ? (e.target.value ? { id: it.id, size: e.target.value } : { id: it.id }) : x)))}
                            className="h-7 max-w-[7rem] rounded-md border border-slate-200 px-1 text-xs">
                            <option value="">ไม่ระบุขนาด</option>
                            {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        )}
                        {editBtn("fit", it as unknown as Record<string, unknown>)}
                      </div>
                    );
                  })}
                  {!fitItems.filter(match).length && <p className="py-3 text-center text-xs text-slate-400">ไม่พบรายการ</p>}
                  {addBtn("fit", "ของที่ใส่ได้")}
                  <label className="flex cursor-pointer items-center gap-2 pt-1 text-[12.5px] text-slate-600">
                    <input type="checkbox" checked={useFit} onChange={(e) => setUseFit(e.target.checked)} className="h-4 w-4 accent-orange-500" />
                    ใส่บรรทัด &quot;ใส่ได้: …&quot; ลงคำอธิบาย
                  </label>
                </>
              )}
            </div>
          )}
          {(tab === "phrase" || tab === "slot" || tab === "material") && (
            <a href={`/m/${tab === "material" ? MAT : SNIP}`} target="_blank" rel="noreferrer" className="block text-right text-[11px] text-slate-400 hover:text-blue-600 hover:underline">
              ดูรายการกลางทั้งหมด (รวมที่ลบไปแล้ว) ↗
            </a>
          )}
        </div>

        {/* ─── ขวา: ตัวอย่างคำอธิบาย ─── */}
        <div className="min-w-0 space-y-2 rounded-xl bg-slate-50/80 p-2.5 md:sticky md:top-0 md:self-start">
          <div className="flex items-center gap-1.5 text-[11.5px] text-slate-500">
            <span className="flex-1 font-medium text-slate-700">ตัวอย่างคำอธิบาย</span>
            {view === "th" && (
              <>
                <button type="button" onClick={() => setAt(0)} className={`rounded px-1.5 ${at === 0 ? "bg-orange-100 text-orange-700" : "hover:bg-slate-200/60"}`}>บนสุด</button>
                <button type="button" onClick={() => setAt(lines.length)} className={`rounded px-1.5 ${at === lines.length ? "bg-orange-100 text-orange-700" : "hover:bg-slate-200/60"}`}>ท้ายสุด</button>
              </>
            )}
            {hasEn && (
              <span className="ml-1 inline-flex overflow-hidden rounded-md border border-slate-200 bg-white">
                {(["th", "en"] as const).map((l) => (
                  <button key={l} type="button" onClick={() => setView(l)} data-insert-view={l}
                    className={`px-2 py-0.5 text-[11px] ${view === l ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{l === "th" ? "ไทย" : "EN"}</button>
                ))}
              </span>
            )}
          </div>
          <div className="max-h-[22rem] overflow-auto rounded-lg border border-slate-200 bg-white p-1.5 text-[13px] leading-snug" data-detail-insert-preview>
            {Array.from({ length: pvLines.length + 1 }).map((_, i) => (
              <Fragment key={i}>
                {i === pvAt ? (
                  <div className="my-0.5 rounded-md border border-dashed border-orange-300 bg-orange-50 px-2 py-1" data-insert-here>
                    {pvNew.length ? (
                      pvNew.map((l, j) => <div key={j} className="text-orange-700">{l}</div>)
                    ) : (
                      <span className="text-[11.5px] text-orange-600">
                        {view === "en" && picked ? (withEn ? "ไม่มีบรรทัดอังกฤษ (รายการยังไม่มีชื่ออังกฤษ)" : "ไม่ได้ติ๊กใส่ภาษาอังกฤษ") : "⤵ บรรทัดใหม่จะอยู่ตรงนี้"}
                      </span>
                    )}
                  </div>
                ) : view === "th" ? (
                  <button type="button" onClick={() => setAt(i)} title="แทรกตรงนี้" data-insert-gap={i}
                    className="group flex h-3 w-full items-center rounded hover:h-5 hover:bg-orange-50">
                    <span className="hidden pl-2 text-[10.5px] text-orange-600 group-hover:inline">⤵ แทรกตรงนี้</span>
                  </button>
                ) : (
                  <div className="h-1" />
                )}
                {i < pvLines.length && <div className="whitespace-pre-wrap px-2 text-slate-600">{pvLines[i] || " "}</div>}
              </Fragment>
            ))}
            {!pvLines.length && <p className="px-2 text-[11.5px] text-slate-400">{view === "en" ? "คำอธิบายอังกฤษยังว่าง" : "คำอธิบายยังว่าง — จะใส่เป็นบรรทัดแรก"}</p>}
          </div>
          {view === "en" && <p className="text-[11px] text-slate-400">ตำแหน่งฝั่งอังกฤษตามภาษาไทย (บรรทัดไม่เท่ากัน = ต่อท้าย) · สลับเป็น &quot;ไทย&quot; เพื่อเลือกตำแหน่ง</p>}

          {changes.length > 0 && (
            <p className="rounded-md bg-amber-50 px-2 py-1.5 text-[11.5px] text-amber-800" data-insert-writeback>
              🔄 บันทึกกลับช่องของสินค้าด้วย: {changes.join(" · ")}
            </p>
          )}

          {hasEn && (
            <div className="space-y-1 text-xs text-slate-600">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={withEn} onChange={(e) => setWithEn(e.target.checked)} className="h-4 w-4 accent-orange-500" />
                <span>ใส่ภาษาอังกฤษในคำอธิบายอังกฤษด้วย</span>
              </label>
              {!enText.trim() && <p className="pl-6 text-slate-400">คำอธิบายอังกฤษยังว่าง — ติ๊กแล้วจะได้แค่บรรทัดใหม่ หรือปล่อยไว้แล้วกด 🌐 แปลทั้งหมด ทีหลัง</p>}
              {withEn && out.enMissing > 0 && <p className="pl-6 text-amber-700">⚠️ {out.enMissing} บรรทัดยังไม่มีชื่ออังกฤษ — ฝั่งอังกฤษจะข้ามบรรทัดนั้น (กด ✏️ ที่รายการเพื่อใส่ชื่ออังกฤษ)</p>}
              {enAppend && <p className="pl-6 text-slate-400">จำนวนบรรทัดอังกฤษไม่เท่าภาษาไทย — ฝั่งอังกฤษจะต่อท้ายให้</p>}
            </div>
          )}
        </div>
      </div>

      {editor && (
        <CatalogItemDialog
          kind={editor.kind}
          item={editor.item}
          existing={editor.kind === "material" ? mats : editor.kind === "fit" ? fitItems : editor.kind === "slot" ? slotItems : phraseItems}
          onClose={() => setEditor(null)}
          onSaved={(id, created) => void onEdited(editor.kind, id, created)}
          onDeleted={(id) => void onDeleted(editor.kind, id)}
        />
      )}
    </ERPModal>
  );
}

/* ─────────── ✏️ ป๊อปแก้/เพิ่ม/ลบ รายการกลาง ─────────── */

const KIND_LABEL: Record<CatalogKind, string> = { phrase: "ข้อความสำเร็จรูป", slot: "ช่อง", material: "วัสดุ", fit: "ของที่ใส่ได้" };
const PLACEHOLDER: Record<CatalogKind, { th: string; en: string }> = {
  phrase: { th: "เช่น ผลิตในประเทศไทย", en: "Made in Thailand" },
  slot: { th: "เช่น ช่องใส่บัตรเครดิต", en: "card slot" },
  material: { th: "เช่น หนังวัวแท้", en: "Genuine cowhide" },
  fit: { th: "เช่น iPad", en: "iPad" },
};

function CatalogItemDialog({
  kind,
  item,
  existing,
  onClose,
  onSaved,
  onDeleted,
}: {
  kind: CatalogKind;
  item: Record<string, unknown> | null;
  existing: { id: string; name: string }[];
  onClose: () => void;
  onSaved: (id: string, created: boolean) => void;
  onDeleted: (id: string) => void;
}) {
  const toast = useToast();
  const s = (k: string) => String(item?.[k] ?? "");
  const [name, setName] = useState(s("name"));
  const [nameEn, setNameEn] = useState(s("name_en"));
  const [tpl, setTpl] = useState(s("template"));
  const [tplEn, setTplEn] = useState(s("template_en"));
  const [sizes, setSizes] = useState(s("sizes"));
  const [busy, setBusy] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const id = item ? String(item.id) : "";
  const catalog = catalogOf(kind);
  const dirty = name !== s("name") || nameEn !== s("name_en") || tpl !== s("template") || tplEn !== s("template_en") || sizes !== s("sizes");

  const translate = async () => {
    if (!name.trim()) {
      toast.warning("พิมพ์ชื่อไทยก่อน");
      return;
    }
    setTranslating(true);
    try {
      const [en] = await translateContent([name.trim()]);
      if (en) setNameEn(en);
      else toast.warning("แปลไม่ได้ — พิมพ์เองได้เลย");
    } catch {
      toast.error("แปลไม่สำเร็จ — พิมพ์เองได้เลย");
    } finally {
      setTranslating(false);
    }
  };

  const save = async () => {
    const n = name.trim();
    if (!n) {
      toast.warning("กรอกชื่อภาษาไทย");
      return;
    }
    if (existing.some((x) => x.id !== id && x.name.trim().toLowerCase() === n.toLowerCase())) {
      toast.warning(`มี "${n}" อยู่แล้ว — เลือกในรายการได้เลย`);
      return;
    }
    const body: Record<string, unknown> = { name: n, name_en: nameEn.trim() || null };
    if (kind === "slot") Object.assign(body, { template: tpl.trim() || null, template_en: tplEn.trim() || null });
    if (kind === "fit") body.sizes = sizes.trim() || null;
    if (!item) Object.assign(body, { sort_order: 500, is_active: true, ...(kind === "phrase" || kind === "slot" ? { kind } : {}) });
    setBusy(true);
    try {
      const r = await apiFetch(item ? `/api/master-v2/${catalog}/${id}` : `/api/master-v2/${catalog}`, {
        method: item ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      const newId = item ? id : String(j.data?.id ?? "");
      toast.success(item ? `แก้ "${n}" แล้ว — ใช้ได้ทุกรุ่น` : `เพิ่ม "${n}" เข้ารายการกลางแล้ว (ใช้ได้ทุกรุ่น)`);
      if (newId) onSaved(newId, !item);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const r = await apiFetch(`/api/master-v2/${catalog}/${id}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || "ลบไม่สำเร็จ");
      toast.success(`ลบ "${s("name")}" ออกจากรายการแล้ว (กู้คืนได้ที่หน้ารายการกลาง)`);
      onDeleted(id);
      setAskDelete(false);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const input = "h-9 w-full rounded-md border border-slate-200 px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400";
  return (
    <>
      <ERPModal
        open
        onClose={onClose}
        size="sm"
        defaultExpanded={false}
        hasUnsavedChanges={dirty}
        title={item ? `แก้${KIND_LABEL[kind]}` : `เพิ่ม${KIND_LABEL[kind]}ใหม่`}
        description="แก้ที่นี่ = แก้รายการกลาง ใช้ได้ทุกรุ่น · ข้อความที่แทรกลงสินค้าไปแล้วไม่เปลี่ยนตาม"
        footer={
          <div className="flex items-center gap-2">
            {item && (
              <button type="button" onClick={() => setAskDelete(true)} disabled={busy} className="h-9 rounded-lg px-3 text-sm text-rose-600 hover:bg-rose-50">
                🗑 ลบ
              </button>
            )}
            <span className="flex-1" />
            <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-700 hover:bg-slate-50">ยกเลิก</button>
            <button type="button" onClick={() => void save()} disabled={busy} data-catalog-save
              className="h-9 rounded-lg bg-slate-800 px-4 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50">
              {busy ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          </div>
        }
      >
        <div className="space-y-3" data-catalog-editor={kind}>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">ชื่อ (ไทย)</label>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={160} autoFocus placeholder={PLACEHOLDER[kind].th} className={input} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">ชื่ออังกฤษ <span className="font-normal text-slate-400">(ฝั่งคำอธิบายอังกฤษ / เว็บ /en)</span></label>
            <div className="flex gap-1.5">
              <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} maxLength={160} placeholder={PLACEHOLDER[kind].en} className={input} />
              <button type="button" onClick={() => void translate()} disabled={translating} className="h-9 shrink-0 rounded-md border border-slate-200 px-2.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                {translating ? "กำลังแปล…" : "🌐 แปล"}
              </button>
            </div>
          </div>
          {kind === "slot" && (
            <div className="space-y-2 rounded-lg bg-slate-50 p-2.5">
              <p className="text-[11.5px] text-slate-500">รูปแบบบรรทัด — <code>{"{name}"}</code> = ชื่อ · <code>{"{n}"}</code> = จำนวน · เว้นว่าง = แบบมาตรฐาน</p>
              <input value={tpl} onChange={(e) => setTpl(e.target.value)} placeholder={DEFAULT_SLOT_TEMPLATE} className={input} aria-label="รูปแบบบรรทัดไทย" />
              <input value={tplEn} onChange={(e) => setTplEn(e.target.value)} placeholder={DEFAULT_SLOT_TEMPLATE_EN} className={input} aria-label="รูปแบบบรรทัดอังกฤษ" />
              <p className="text-[11px] text-slate-400">
                ตัวอย่าง 6 ช่อง: {slotText({ id: "x", name: name || "ช่อง", name_en: nameEn, kind: "slot", template: tpl, template_en: tplEn }, 6, "th")}
                {" · "}
                {slotText({ id: "x", name: name || "ช่อง", name_en: nameEn, kind: "slot", template: tpl, template_en: tplEn }, 6, "en") ?? "— (ยังไม่มีอังกฤษ)"}
              </p>
            </div>
          )}
          {kind === "fit" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">ขนาดให้เลือก <span className="font-normal text-slate-400">(คั่นด้วยจุลภาค · ไม่มี = เว้นว่าง)</span></label>
              <input value={sizes} onChange={(e) => setSizes(e.target.value)} placeholder="เช่น 11 นิ้ว, 13 นิ้ว" className={input} />
            </div>
          )}
          {kind === "material" && item && (
            <a href={`/m/${MAT}?open=${id}`} target="_blank" rel="noreferrer" className="inline-block text-xs text-blue-600 hover:underline">
              {hasMaterialPage(item as unknown as MaterialRow) ? "แก้หน้าวัสดุ (คำอธิบาย/วิธีดูแล/รูป) ↗" : "เขียนหน้าวัสดุ (คำอธิบาย/วิธีดูแล) → ชื่อวัสดุบนเว็บกดดูได้ ↗"}
            </a>
          )}
        </div>
      </ERPModal>
      <ConfirmDialog
        open={askDelete}
        onClose={() => setAskDelete(false)}
        onConfirm={() => void remove()}
        variant="danger"
        loading={busy}
        title={`ลบ "${s("name")}"?`}
        message={`เอาออกจากรายการให้เลือก (ทุกรุ่น) — ข้อความที่แทรกลงสินค้าไปแล้วยังอยู่ครบ · กู้คืนได้ที่หน้ารายการกลาง`}
        confirmText="ลบออกจากรายการ"
      />
    </>
  );
}
