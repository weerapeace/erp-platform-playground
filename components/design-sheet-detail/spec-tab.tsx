"use client";

/**
 * แท็บ "📐 รายละเอียดงาน" ในใบงานออกแบบ — รอบ 1 (เจ้าของขอ 2026-11-05)
 *
 * รูปหลายหน้า (เลือกจากรูปในใบงาน / อัปโหลดเพิ่ม) → วาดบนรูป (สี่เหลี่ยม · วงกลม · ข้อความ · เส้น)
 * + หมุดวัตถุดิบ (ผูก SKU ผ่าน ComponentPicker) + สรุปวัตถุดิบรวมทุกหน้า
 * + ตารางสี (รอบ 2 · spec-colors.tsx) · บันทึกทั้งชุดผ่าน PUT /api/design-sheets/[id]/spec
 * + รอบ 3: สรุปวัตถุดิบ → ส่งไปตีราคา (onSendToCost ของหน้าแม่) / สร้างสูตร BOM (BomFromCostWizard) · พิมพ์ (/print/design-sheet/[id]?mode=spec)
 *
 * ของกลางที่ใช้: ImageMarkup (+Toolbar) · ComponentPicker · ERPModal · ConfirmDialog · ImageManager · useToast
 */
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { ImageMarkup, ImageMarkupToolbar } from "@/components/image-markup";
import { ComponentPicker } from "@/components/material-picker";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { ImageManager } from "@/components/image-manager";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import { MARKUP_COLORS, newMarkupId, type MarkupSelection, type MarkupShape, type MarkupTool } from "@/lib/image-markup";
import type { SpecPage, SpecPin, SpecPutPage } from "@/app/api/design-sheets/[id]/spec/route";
import { cleanSpecColors, EMPTY_SPEC_COLORS, type SpecColorTable } from "@/lib/design-sheet-spec-colors";
import { SpecColorTableEditor } from "./spec-colors";
import { BomFromCostWizard } from "./bom-from-cost-wizard";
import { summarizeSpecPins, specMaterialItems, fmtSpecQty, type SpecMaterialItem } from "@/lib/design-sheet-spec";
import type { DesignSheetImage } from "@/app/api/design-sheets/[id]/images/route";

type Pin = Omit<SpecPin, "id" | "page_id" | "no"> & { key: string };
type Page = Omit<SpecPage, "id" | "sort_order"> & { key: string; pins: Pin[] };

const fmtQty = (n: number) => (Math.round(n * 1000) / 1000).toLocaleString("th-TH");

export function DesignSheetSpecTab({ sheetId, canEdit, onDirtyChange, saveRef, onSendToCost, costSkuIds = [] }: {
  sheetId: string;
  canEdit: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  /** ปุ่ม "บันทึกแล้วปิด" ของป๊อปใบงาน เรียกบันทึกแท็บนี้ได้ */
  saveRef?: MutableRefObject<(() => Promise<boolean>) | null>;
  /** รอบ 3: ส่งวัตถุดิบจากสรุปไปเป็นบรรทัดในแท็บตีราคา (หน้าแม่สร้างบรรทัด + สลับไปแท็บตีราคา) */
  onSendToCost?: (items: SpecMaterialItem[]) => Promise<void> | void;
  /** SKU ที่มีในแท็บตีราคาอยู่แล้ว (ตั้งต้นไม่ติ๊ก กันซ้ำ) */
  costSkuIds?: string[];
}) {
  const t = useT();
  const toast = useToast();
  const [pages, setPages] = useState<Page[]>([]);
  const [cur, setCur] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tool, setTool] = useState<MarkupTool>("pin");
  const [color, setColor] = useState<string>(MARKUP_COLORS[0]);
  const [sel, setSel] = useState<MarkupSelection | null>(null);
  const [hist, setHist] = useState<Page[][]>([]);
  const [pickOpen, setPickOpen] = useState(false);
  const [delPage, setDelPage] = useState<number | null>(null);
  const [colors, setColors] = useState<SpecColorTable>(EMPTY_SPEC_COLORS);   // ตารางสี (รอบ 2)
  const pinRowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const load = useCallback(async () => {
    setLoading(true); setLoadErr(null);
    try {
      const j = await apiFetch(`/api/design-sheets/${sheetId}/spec`).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      const pins = (j.pins ?? []) as SpecPin[];
      setPages(((j.pages ?? []) as SpecPage[]).map((p) => ({
        key: p.id ?? newMarkupId(), title: p.title, image_key: p.image_key, image_url: p.image_url,
        image_w: p.image_w, image_h: p.image_h, shapes: Array.isArray(p.shapes) ? p.shapes : [],
        pins: pins.filter((x) => x.page_id === p.id).map((x) => ({
          key: x.id ?? newMarkupId(), x: Number(x.x), y: Number(x.y), part_name: x.part_name,
          sku_id: x.sku_id, sku_code: x.sku_code, sku_name: x.sku_name, sku_image_key: x.sku_image_key ?? null,
          qty: x.qty == null ? null : Number(x.qty), uom: x.uom, note: x.note,
        })),
      })));
      setColors(cleanSpecColors(j.colors));
      setCur(0); setHist([]); setDirty(false); setSel(null);
    } catch (e) { setLoadErr(e instanceof Error ? e.message : t("โหลดไม่ได้", "Could not load")); }
    finally { setLoading(false); }
  }, [sheetId, t]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  // เปลี่ยนแปลงทุกครั้งผ่านตัวนี้ → เก็บประวัติไว้ย้อนกลับ (สูงสุด 50 ขั้น)
  const change = useCallback((next: Page[]) => {
    setHist((h) => [...h.slice(-49), pages]);
    setPages(next); setDirty(true);
  }, [pages]);
  const undo = () => {
    if (!hist.length) return;
    const prev = hist[hist.length - 1];
    setHist((h) => h.slice(0, -1)); setPages(prev); setDirty(true); setSel(null);
    setCur((c) => Math.min(c, Math.max(0, prev.length - 1)));
  };
  const page = pages[cur] ?? null;
  const patchPage = (patch: Partial<Page>) => change(pages.map((p, i) => (i === cur ? { ...p, ...patch } : p)));
  const patchPin = (pageIdx: number, key: string, patch: Partial<Pin>) =>
    change(pages.map((p, i) => (i !== pageIdx ? p : { ...p, pins: p.pins.map((x) => (x.key === key ? { ...x, ...patch } : x)) })));

  // เลขหมุดเรียงทั้งใบ (หน้า 1 ก่อน แล้วหน้า 2 …)
  const pinNo = useMemo(() => {
    const m = new Map<string, number>(); let n = 0;
    for (const p of pages) for (const x of p.pins) m.set(x.key, ++n);
    return m;
  }, [pages]);

  const deleteSelected = () => {
    if (!sel || !page) return;
    if (sel.kind === "shape") patchPage({ shapes: page.shapes.filter((s) => s.id !== sel.id) });
    else patchPage({ pins: page.pins.filter((x) => x.key !== sel.id) });
    setSel(null);
  };

  const addPin = (pt: { x: number; y: number }) => {
    if (!page) return;
    const pin: Pin = { key: newMarkupId(), x: pt.x, y: pt.y, part_name: null, sku_id: null, sku_code: null, sku_name: null, sku_image_key: null, qty: null, uom: null, note: null };
    patchPage({ pins: [...page.pins, pin] });
    setSel({ kind: "pin", id: pin.key });
  };

  // เลือกหมุด (จากรูปหรือรายการ) → เลื่อนรายการให้เห็น
  const selectPin = (pageIdx: number, key: string) => {
    if (pageIdx !== cur) setCur(pageIdx);
    setSel({ kind: "pin", id: key });
  };
  useEffect(() => {
    if (sel?.kind === "pin") pinRowRefs.current[sel.id]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [sel]);

  const addPageFromImage = (img: DesignSheetImage) => {
    const next: Page = { key: newMarkupId(), title: t(`รูปที่ ${pages.length + 1}`, `Image ${pages.length + 1}`), image_key: img.key, image_url: img.url, image_w: null, image_h: null, shapes: [], pins: [] };
    change([...pages, next]); setCur(pages.length); setSel(null); setPickOpen(false);
  };

  const save = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    try {
      const body: { pages: SpecPutPage[]; colors: SpecColorTable } = {
        colors,
        pages: pages.map((p) => ({
          title: p.title, image_key: p.image_key, image_url: p.image_url, image_w: p.image_w, image_h: p.image_h, shapes: p.shapes,
          pins: p.pins.map((x) => ({ x: x.x, y: x.y, part_name: x.part_name, sku_id: x.sku_id, sku_code: x.sku_code, sku_name: x.sku_name, qty: x.qty, uom: x.uom, note: x.note })),
        })),
      };
      const j = await apiFetch(`/api/design-sheets/${sheetId}/spec`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setDirty(false);
      toast.success(t(`บันทึกรายละเอียดงานแล้ว (${j.pages} รูป · ${j.pins} หมุด)`, `Job details saved (${j.pages} images · ${j.pins} pins)`));
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("บันทึกไม่สำเร็จ", "Save failed"));
      return false;
    } finally { setSaving(false); }
  }, [pages, colors, sheetId, toast, t]);
  useEffect(() => { if (saveRef) saveRef.current = save; }, [save, saveRef]);

  // ตารางสี: ชื่อส่วนประกอบจากหมุด (ไว้ดึงเป็นแถว) + รูปที่ใช้ดูดสี
  const pinParts = useMemo(() => pages.flatMap((p) => p.pins.map((x) => x.part_name ?? "")).filter(Boolean), [pages]);
  const imageKeys = useMemo(() => pages.map((p) => p.image_key).filter((k): k is string => !!k), [pages]);

  // สรุปวัตถุดิบ: รวมหมุดที่ใช้ SKU เดียวกัน (ทุกหน้า) · จำนวนรวมแยกตามหน่วย
  const summary = useMemo(() => summarizeSpecPins(pages.flatMap((p) => p.pins.map((x) => ({ ...x, no: pinNo.get(x.key) ?? 0 })))), [pages, pinNo]);
  const materialItems = useMemo(() => specMaterialItems(summary.rows), [summary]);

  // รอบ 3: ส่งไปตีราคา (เลือกรายการ) · สร้างสูตร BOM · พิมพ์
  const [sendOpen, setSendOpen] = useState(false);
  const [sendSel, setSendSel] = useState<Set<number>>(new Set());
  const [sending, setSending] = useState(false);
  const [bomOpen, setBomOpen] = useState(false);
  const openSend = () => {
    const have = new Set(costSkuIds);
    setSendSel(new Set(materialItems.map((it, i) => (have.has(it.sku_id) ? -1 : i)).filter((i) => i >= 0)));
    setSendOpen(true);
  };
  const doSend = async () => {
    if (!onSendToCost) return;
    setSending(true);
    try { await onSendToCost(materialItems.filter((_, i) => sendSel.has(i))); setSendOpen(false); }
    finally { setSending(false); }
  };
  const openPrint = () => {
    if (dirty) { toast.error(t("มีแก้ไขที่ยังไม่บันทึก — กด 💾 บันทึกรายละเอียดงาน ก่อนพิมพ์", "Unsaved changes — save job details before printing")); return; }
    window.open(`/print/design-sheet/${sheetId}?mode=spec`, "_blank", "noopener");
  };

  if (loading) return <div className="py-10 text-center text-sm text-slate-400">{t("กำลังโหลดรายละเอียดงาน…", "Loading job details…")}</div>;
  if (loadErr) return (
    <div className="py-8 text-center space-y-2">
      <p className="text-sm text-rose-600">{t("โหลดรายละเอียดงานไม่ได้", "Could not load job details")} — {loadErr}</p>
      <button type="button" onClick={() => void load()} className="h-8 px-3 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ลองใหม่", "Retry")}</button>
    </div>
  );

  const pickModal = (
    <ERPModal open={pickOpen} onClose={() => setPickOpen(false)} size="lg" title={t("เลือกรูปมาทำรายละเอียดงาน", "Pick an image for job details")}
      description={t("กดรูปเพื่อเพิ่มเป็นหน้าใหม่ · อัปโหลดรูปใหม่ได้ด้านล่าง (รูปจะเข้าแกลเลอรีของใบงานด้วย)", "Click an image to add it as a page · upload new images below (they also go into the sheet gallery)")}>
      <SheetImagePicker sheetId={sheetId} onPick={addPageFromImage} usedKeys={new Set(pages.map((p) => p.image_key ?? p.image_url))} />
    </ERPModal>
  );

  const emptyBox = pages.length === 0 ? (
    <div className="py-10 text-center border-2 border-dashed border-slate-200 rounded-xl space-y-2">
      <p className="text-sm font-medium text-slate-600">{t("ยังไม่มีรูปในรายละเอียดงาน", "No images in job details yet")}</p>
      <p className="text-xs text-slate-400">{t("เลือกรูปจากใบงาน แล้ววาดชี้จุด + ปักหมุดวัตถุดิบ (ผูก SKU) ได้เลย", "Pick an image from this sheet, then mark it up and pin materials (linked to SKUs)")}</p>
      {canEdit && (
        <button type="button" onClick={() => setPickOpen(true)} className="h-9 px-4 text-sm font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 inline-flex items-center gap-1.5">
          <Icon name="image" /> {t("เลือกรูป / อัปโหลด", "Pick / upload image")}
        </button>
      )}
    </div>
  ) : null;

  const markupPins = (page?.pins ?? []).map((x) => ({ id: x.key, x: x.x, y: x.y, label: String(pinNo.get(x.key) ?? ""), muted: !x.sku_id }));

  return (
    <div className="space-y-3">
      {emptyBox ?? (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* ── ซ้าย: หน้ารูป + เครื่องมือ + รูปที่วาด ── */}
        <div className="space-y-2 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {pages.map((p, i) => (
              <button key={p.key} type="button" onClick={() => { setCur(i); setSel(null); }}
                className={`h-11 pl-1 pr-2.5 inline-flex items-center gap-1.5 rounded-lg border text-xs ${i === cur ? "border-violet-400 bg-violet-50 text-violet-700 font-medium" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.image_url} alt="" className="h-9 w-9 rounded-md object-cover bg-slate-100" />
                <span className="max-w-[7rem] truncate">{p.title || t(`รูปที่ ${i + 1}`, `Image ${i + 1}`)}</span>
                {p.pins.length > 0 && <span className="text-[10px] text-slate-400">· {p.pins.length}</span>}
              </button>
            ))}
            {canEdit && (
              <button type="button" onClick={() => setPickOpen(true)} title={t("เพิ่มรูป (เลือกจากใบงาน / อัปโหลด)", "Add image (from sheet / upload)")}
                className="h-11 px-3 inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 text-xs text-slate-500 hover:bg-slate-50">
                <Icon name="add" /> {t("เพิ่มรูป", "Add image")}
              </button>
            )}
          </div>

          {page && canEdit && (
            <div className="flex items-center gap-2 flex-wrap">
              <input value={page.title ?? ""} onChange={(e) => patchPage({ title: e.target.value })} placeholder={t("ชื่อรูป เช่น ด้านหน้า", "Image name, e.g. Front")}
                className="h-8 w-40 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400" />
              <ImageMarkupToolbar tool={tool} onTool={(x) => { setTool(x); }} color={color} onColor={setColor}
                onUndo={undo} canUndo={hist.length > 0} onDelete={deleteSelected} canDelete={!!sel} pinLabel={t("หมุดวัตถุดิบ", "Material pin")} />
              <button type="button" onClick={() => setDelPage(cur)} title={t("เอารูปนี้ออกจากรายละเอียดงาน (รูปในใบงานยังอยู่)", "Remove this image from job details (sheet image stays)")}
                className="ml-auto h-8 px-2 text-xs text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50 inline-flex items-center gap-1">
                <Icon name="delete" /> {t("เอารูปออก", "Remove image")}
              </button>
            </div>
          )}

          {page && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
              <ImageMarkup src={page.image_url} alt={page.title ?? ""} shapes={page.shapes} pins={markupPins}
                editable={canEdit} tool={tool} color={color} selected={sel}
                onSelect={(s) => setSel(s)}
                onShapesChange={(shapes: MarkupShape[]) => patchPage({ shapes })}
                onPinAdd={addPin}
                onPinMove={(id, pt) => patchPin(cur, id, pt)}
                onDeleteSelected={deleteSelected}
                onImageLoad={(w, h) => { if (page.image_w !== w || page.image_h !== h) setPages((ps) => ps.map((p, i) => (i === cur ? { ...p, image_w: w, image_h: h } : p))); }} />
            </div>
          )}
          {canEdit && (
            <p className="text-[11px] text-slate-400">
              {tool === "pin" ? t("กดบนรูปเพื่อปักหมุด แล้วเลือก SKU วัตถุดิบด้านขวา · ลากหมุดเพื่อย้าย", "Click the image to drop a pin, then choose the material SKU on the right · drag pins to move")
                : tool === "select" ? t("ลากของที่วาดเพื่อย้าย · ดับเบิลคลิกข้อความเพื่อแก้ · กด Delete เพื่อลบที่เลือก", "Drag drawings to move · double-click text to edit · press Delete to remove the selection")
                : tool === "text" ? t("กดบนรูปแล้วพิมพ์ข้อความ กด Enter", "Click the image, type, then press Enter")
                : t("ลากบนรูปเพื่อวาด", "Drag on the image to draw")}
            </p>
          )}
        </div>

        {/* ── ขวา: รายการหมุด + สรุปวัตถุดิบ ── */}
        <div className="space-y-3 min-w-0">
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1">{t("หมุดวัตถุดิบ", "Material pins")} ({pinNo.size})</div>
            {pinNo.size === 0 && <p className="text-xs text-slate-400 py-2">{canEdit ? t("ยังไม่มีหมุด — เลือกเครื่องมือหมุดแล้วกดบนรูป", "No pins yet — choose the pin tool and click the image") : t("ยังไม่มีหมุด", "No pins yet")}</p>}
            <div className="divide-y divide-slate-100">
              {pages.map((p, pi) => p.pins.map((x) => {
                const no = pinNo.get(x.key);
                const on = sel?.kind === "pin" && sel.id === x.key;
                return (
                  <div key={x.key} ref={(el) => { pinRowRefs.current[x.key] = el; }} onClick={() => selectPin(pi, x.key)}
                    className={`py-2 px-1.5 rounded-lg cursor-pointer ${on ? "bg-violet-50" : "hover:bg-slate-50"}`}>
                    <div className="flex items-center gap-2">
                      <span className={`shrink-0 w-6 h-6 rounded-full text-white text-xs font-bold inline-flex items-center justify-center ${x.sku_id ? "bg-violet-600" : "bg-amber-500"}`}>{no}</span>
                      {canEdit ? (
                        <input value={x.part_name ?? ""} onChange={(e) => patchPin(pi, x.key, { part_name: e.target.value || null })} onClick={(e) => e.stopPropagation()}
                          placeholder={t("ส่วนประกอบ เช่น ตัวกระเป๋า", "Part, e.g. Bag body")}
                          className="flex-1 min-w-0 h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400" />
                      ) : <span className="flex-1 min-w-0 text-sm font-medium text-slate-700 truncate">{x.part_name || "—"}</span>}
                      {pages.length > 1 && <span className="text-[10px] text-slate-400 shrink-0">{p.title || t(`รูปที่ ${pi + 1}`, `Image ${pi + 1}`)}</span>}
                      {canEdit && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); change(pages.map((pp, i) => (i !== pi ? pp : { ...pp, pins: pp.pins.filter((y) => y.key !== x.key) }))); if (on) setSel(null); }}
                          title={t("ลบหมุด", "Delete pin")} className="h-7 w-7 shrink-0 inline-flex items-center justify-center text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg"><Icon name="delete" /></button>
                      )}
                    </div>
                    <div className="pl-8 mt-1.5 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                      {canEdit ? (
                        <ComponentPicker sku={x.sku_code ?? ""} name={x.sku_name ?? ""} imageKey={x.sku_image_key ?? null}
                          placeholder={t("— เลือก SKU วัตถุดิบ —", "— Select material SKU —")}
                          onPick={(c) => patchPin(pi, x.key, { sku_id: c.id, sku_code: c.code, sku_name: c.name, sku_image_key: c.image_key, uom: x.uom || c.uom_name })} />
                      ) : (
                        <div className="text-xs text-slate-600">{x.sku_id ? <><span className="font-mono text-slate-500">{x.sku_code}</span> · {x.sku_name}</> : <span className="text-amber-600">{t("ยังไม่เลือก SKU", "No SKU yet")}</span>}</div>
                      )}
                      {canEdit ? (
                        <div className="flex items-center gap-1.5">
                          <input type="number" min={0} step="any" value={x.qty ?? ""} placeholder={t("ใช้", "Qty")}
                            onChange={(e) => patchPin(pi, x.key, { qty: e.target.value === "" ? null : Number(e.target.value) })}
                            className="w-20 h-8 px-2 text-sm text-right tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400" />
                          <input value={x.uom ?? ""} placeholder={t("หน่วย", "Unit")} onChange={(e) => patchPin(pi, x.key, { uom: e.target.value || null })}
                            className="w-20 h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400" />
                          <input value={x.note ?? ""} placeholder={t("หมายเหตุ เช่น สี / ขนาด", "Note, e.g. colour / size")} onChange={(e) => patchPin(pi, x.key, { note: e.target.value || null })}
                            className="flex-1 min-w-0 h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400" />
                        </div>
                      ) : (x.qty != null || x.note) ? (
                        <div className="text-xs text-slate-500">{x.qty != null && <span className="tabular-nums">{fmtQty(x.qty)} {x.uom ?? ""}</span>}{x.note && <span> · {x.note}</span>}</div>
                      ) : null}
                    </div>
                  </div>
                );
              }))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-2.5">
            <div className="text-xs font-medium text-slate-500 mb-1.5">{t("สรุปวัตถุดิบ (ทุกรูป)", "Materials summary (all images)")}</div>
            {summary.rows.length === 0 ? (
              <p className="text-xs text-slate-400">{t("ยังไม่มีหมุดที่เลือก SKU", "No pins with a SKU yet")}</p>
            ) : (
              <table className="w-full text-xs">
                <thead><tr className="text-slate-400 border-b border-slate-200">
                  <th className="text-left font-normal py-1">{t("วัตถุดิบ", "Material")}</th>
                  <th className="text-left font-normal py-1">{t("ใช้ที่", "Used at")}</th>
                  <th className="text-right font-normal py-1">{t("รวม", "Total")}</th>
                </tr></thead>
                <tbody>
                  {summary.rows.map((r) => (
                    <tr key={r.sku_id} className="border-b border-slate-100 last:border-0">
                      <td className="py-1.5 pr-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {r.imageKey && /* eslint-disable-next-line @next/next/no-img-element */ <img src={r2ImageUrl(r.imageKey, 64) ?? ""} alt="" className="h-7 w-7 rounded object-cover bg-slate-100 shrink-0" />}
                          <div className="min-w-0"><div className="text-slate-700 truncate">{r.name}</div><div className="font-mono text-[10px] text-slate-400">{r.code}</div></div>
                        </div>
                      </td>
                      <td className="py-1.5 pr-2 text-slate-500 whitespace-nowrap">{r.nos.map((n) => `#${n}`).join(" ")}</td>
                      <td className="py-1.5 text-right tabular-nums text-slate-700 whitespace-nowrap">
                        {r.qty.map((q) => `${fmtSpecQty(q.qty)} ${q.uom}`.trim()).join(" + ") || "—"}
                        {r.noQty && r.qty.length > 0 && <span className="text-amber-600" title={t("บางหมุดยังไม่ใส่จำนวน", "Some pins have no quantity")}> *</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {summary.missing > 0 && <p className="mt-1.5 text-[11px] text-amber-600">{t(`อีก ${summary.missing} หมุดยังไม่เลือก SKU (หมุดสีส้ม)`, `${summary.missing} more pins have no SKU (orange pins)`)}</p>}
            {canEdit && summary.rows.length > 0 && (
              <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-1.5 flex-wrap">
                {onSendToCost && (
                  <button type="button" onClick={openSend} title={t("เพิ่มวัตถุดิบเหล่านี้เป็นบรรทัดในแท็บตีราคา", "Add these materials as costing lines")}
                    className="h-8 px-2.5 text-xs font-medium border border-amber-300 text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 inline-flex items-center gap-1">
                    <Icon name="calc" /> {t("ส่งไปตีราคา", "Send to costing")}
                  </button>
                )}
                <button type="button" onClick={() => setBomOpen(true)} title={t("สร้างสูตรการผลิต (BOM) จากวัตถุดิบในสรุป", "Create a production BOM from these materials")}
                  className="h-8 px-2.5 text-xs font-medium border border-indigo-300 text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 inline-flex items-center gap-1">
                  <Icon name="dna" /> {t("สร้างสูตร BOM", "Create BOM")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* 🎨 ตารางสี (รอบ 2) — บันทึกพร้อมปุ่มด้านล่าง */}
      <SpecColorTableEditor value={colors} onChange={(c) => { setColors(c); setDirty(true); }} canEdit={canEdit} pinParts={pinParts} imageKeys={imageKeys} />

      <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
        <button type="button" onClick={openPrint} title={t("ใบพิมพ์รายละเอียดงาน (รูป+หมุด · สรุปวัตถุดิบ · ตารางสี)", "Print job details (images+pins · materials · colours)")}
          className="mr-auto h-9 px-3 text-sm border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1.5">
          <Icon name="print" /> {t("พิมพ์รายละเอียดงาน", "Print job details")}
        </button>
      {canEdit && (
        <>
          {dirty && <span className="text-xs text-amber-600">{t("● มีแก้ไขที่ยังไม่บันทึก", "● Unsaved changes")}</span>}
          <button type="button" onClick={() => void save()} disabled={saving || !dirty}
            className="h-9 px-4 text-sm font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 inline-flex items-center gap-1.5">
            <Icon name="save" /> {saving ? t("กำลังบันทึก…", "Saving…") : t("บันทึกรายละเอียดงาน", "Save job details")}
          </button>
        </>
      )}
      </div>

      {/* ส่งไปตีราคา — เลือกรายการ (SKU ที่มีในตีราคาแล้ว ตั้งต้นไม่ติ๊ก) */}
      <ERPModal open={sendOpen} onClose={() => !sending && setSendOpen(false)} size="md" title={t("ส่งวัตถุดิบไปแท็บตีราคา", "Send materials to costing")}
        description={t("เพิ่มเป็นบรรทัดใหม่ในแท็บตีราคา (ชนิด/ราคา/หน้ากว้าง ดึงจาก SKU · จำนวนจากหมุด) — ตรวจแล้วกด 💾 บันทึกตีราคา", "Adds new costing lines (type/price/width from the SKU · quantity from the pins) — review, then save costing")}
        footer={<>
          <button type="button" onClick={() => setSendOpen(false)} disabled={sending} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">{t("ยกเลิก", "Cancel")}</button>
          <button type="button" onClick={() => void doSend()} disabled={sending || sendSel.size === 0}
            className="h-9 px-4 text-sm font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50">
            {sending ? t("กำลังส่ง…", "Sending…") : t(`ส่ง ${sendSel.size} รายการ`, `Send ${sendSel.size} items`)}
          </button>
        </>}>
        <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
          {materialItems.map((it, i) => {
            const inCost = costSkuIds.includes(it.sku_id);
            return (
              <label key={`${it.sku_id}-${it.uom ?? ""}`} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-50">
                <input type="checkbox" checked={sendSel.has(i)} className="h-4 w-4 accent-amber-500"
                  onChange={(e) => setSendSel((s) => { const n = new Set(s); if (e.target.checked) n.add(i); else n.delete(i); return n; })} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-slate-700 truncate">{it.sku_name || it.sku_code}</span>
                  <span className="block text-[11px] text-slate-400"><span className="font-mono">{it.sku_code}</span>{inCost && <span className="ml-1.5 text-amber-600">{t("· มีในตีราคาแล้ว", "· already in costing")}</span>}</span>
                </span>
                <span className="text-sm tabular-nums text-slate-600 whitespace-nowrap">{it.qty != null ? `${fmtSpecQty(it.qty)} ${it.uom ?? ""}` : t("ไม่ระบุจำนวน", "No qty")}</span>
              </label>
            );
          })}
        </div>
      </ERPModal>

      <BomFromCostWizard open={bomOpen} onClose={() => setBomOpen(false)}
        title={t("🧬 สร้างสูตร BOM จากรายละเอียดงาน", "🧬 Create BOM from job details")}
        tabLabel={t("รายละเอียดงาน", "Job details")} notePrefix="ดึงจากใบงานออกแบบ"
        lines={materialItems.map((it) => ({
          item_name: it.sku_name || it.sku_code, group_name: null, width_cm: null, length_cm: null, pieces: null,
          face_width_cm: null, waste_percent: null, qty: it.qty, uom: it.uom, component_sku: it.sku_code,
        }))} />

      {pickModal}
      <ConfirmDialog open={delPage != null} onClose={() => setDelPage(null)} variant="danger"
        title={t("เอารูปนี้ออก?", "Remove this image?")}
        message={t("สิ่งที่วาดและหมุดบนรูปนี้จะหายไปด้วย (รูปในแกลเลอรีใบงานยังอยู่) — ย้อนกลับได้ก่อนกดบันทึก", "Drawings and pins on this image will be removed too (the sheet gallery image stays) — you can undo before saving")}
        confirmText={t("เอาออก", "Remove")}
        onConfirm={() => {
          if (delPage == null) return;
          change(pages.filter((_, i) => i !== delPage));
          setCur((c) => Math.max(0, Math.min(c, pages.length - 2)));
          setSel(null); setDelPage(null);
        }} />
    </div>
  );
}

/** ป๊อปเลือกรูป: รูปทุกแหล่งในใบงาน (แกลเลอรี/รายละเอียด/คอมเมนต์) + อัปโหลดเพิ่มผ่าน ImageManager กลาง */
function SheetImagePicker({ sheetId, onPick, usedKeys }: { sheetId: string; onPick: (img: DesignSheetImage) => void; usedKeys: Set<string> }) {
  const t = useT();
  const [imgs, setImgs] = useState<DesignSheetImage[] | null>(null);
  const reload = useCallback(async () => {
    try {
      const j = await apiFetch(`/api/design-sheets/${sheetId}/images`).then((r) => r.json());
      setImgs((j.data ?? []) as DesignSheetImage[]);
    } catch { setImgs([]); }
  }, [sheetId]);
  useEffect(() => { void reload(); }, [reload]);
  return (
    <div className="space-y-4">
      {imgs == null ? <p className="text-sm text-slate-400 py-4 text-center">{t("กำลังโหลดรูป…", "Loading images…")}</p>
        : imgs.length === 0 ? <p className="text-sm text-slate-400 py-4 text-center">{t("ใบงานนี้ยังไม่มีรูป — อัปโหลดด้านล่าง", "This sheet has no images yet — upload below")}</p>
        : (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {imgs.map((im) => {
              const used = usedKeys.has(im.key) || usedKeys.has(im.url);
              return (
                <button key={im.key} type="button" onClick={() => onPick(im)}
                  className="group relative aspect-square rounded-lg overflow-hidden border border-slate-200 hover:border-violet-400 hover:ring-2 hover:ring-violet-200 bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={im.url} alt="" className="w-full h-full object-cover" />
                  <span className="absolute left-1 bottom-1 px-1 rounded bg-black/55 text-[10px] text-white">{im.source_label}</span>
                  {used && <span className="absolute right-1 top-1 px-1 rounded bg-violet-600 text-[10px] text-white">{t("ใช้แล้ว", "Used")}</span>}
                </button>
              );
            })}
          </div>
        )}
      <div className="border-t border-slate-100 pt-3">
        <ImageManager entityType="design_sheet" entityId={sheetId} imageOnly title={t("อัปโหลดรูปใหม่เข้าใบงาน", "Upload new images to this sheet")}
          onCountChange={() => void reload()} />
      </div>
    </div>
  );
}
