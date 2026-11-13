"use client";

/**
 * คิดผ้าก่อนซื้อ — แท็บแรกของหน้า /fabric-calc (เฟส 1 2026-11-13 · เฟส 2 วันเดียวกัน · เลือกแบบจาก widget ทั้งสองรอบ)
 *   โหมด "ผ้าเดียว": ชิ้นตัด (พิมพ์เอง / สูตร BOM ของ SKU / ก๊อปจากใบสั่งผลิตเก่า) × จำนวน → วางชิ้นบนผ้าจริง → ต้องใช้/ควรซื้อ/ต้องซื้อเพิ่ม/งบ
 *   โหมด "ทั้งตระกูล แบ่งสี": family-calc.tsx (Parent SKU → จำนวนต่อสี → รวมผ้าทุกสี)
 *   ค่าตั้ง (ริม ทางผ้า หดตัว ลายซ้ำ เว้น เผื่อเสีย หน่วยซื้อ ปัดขึ้น ความยาวม้วน) ใช้ชุดเดียวกันทั้งสองโหมด
 *   บันทึก/เปิดกลับ/แชร์ลิงก์: saved-calcs.tsx (ตาราง fabric_buy_calcs)
 *   รอบ 3 (2026-11-13): ปุ่มแก้สูตร BOM (BomEditorModal) · ป้าย คาดการณ์/วัดจริงแล้ว (cut-check.tsx · ตาราง fabric_cut_checks) · ราคาผ้าชัด ๆ
 *     · ใบพิมพ์วิธีตัด (lib/fabric-cut-sheet) · เลขชิ้นในผัง · ชิ้นทรงพิเศษ: วาดเอง (ShapeEditor) + วางตามรูปจริง (NestPanel → buyFromLength)
 *   รอบ 4: ปรับทรงรายแถว (กดรูปทรงหลังชื่อ / ปุ่มปรับทรง) · ถ่ายรูปแบบกระดาษ (PhotoModal traceOnly → ตรวจในตัววาด) · กล่องวิธีใช้ · ชื่อชิ้นจาก BOM (piece_name)
 * ของกลาง: calcFabricBuy/compareWidths/piecesFromMoBlocks (lib/fabric-buy → packFabric) · FabricLayoutPreview · ComponentPicker · SkuPicker · MoMultiPickerModal · MiniTable · addToPrCart · renderFabricBuyHtml + printReportHtmlInNewWindow · useToast
 */
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { ComponentPicker, type BomComponent } from "@/components/material-picker";
import { SkuPicker, type SkuPickerValue } from "@/components/pickers";
import { MoMultiPickerModal } from "@/components/mo-picker";
import { FabricLayoutPreview } from "@/components/design-sheet-detail/fabric-layout-preview";
import { printReportHtmlInNewWindow } from "@/components/report";
import { BomEditorModal } from "@/components/bom-editor-modal";
import { NestPanel } from "@/components/pattern-sheet/nest-panel";
import type { EditorPiece, ShapeEditorResult } from "@/components/pattern-sheet/shape-editor";
import type { NestResult } from "@/lib/pattern-nest";
import type { PatternPiece } from "@/lib/pattern-sheet";
import { pieceLegend, pieceNumbers, planCutMarkers, renderCutSheetHtml } from "@/lib/fabric-cut-sheet";
import { addToPrCart } from "@/lib/pr-cart";
import { adjustedPieces, buyFromLength, calcFabricBuy, compareWidths, convertLength, cutCheckState, piecesFingerprint, piecesFromMoBlocks, unitFromUomName, type BuyInput, type BuyPiece, type BuyRound, type BuyUnit, type WidthCompareRow } from "@/lib/fabric-buy";
import { renderFabricBuyHtml } from "@/lib/fabric-buy-print";
import { YARD_CM } from "@/lib/fabric-calc";
import type { PlanGroupInput } from "@/lib/fabric-plan";
import type { FabricPlanMo } from "@/app/api/mo/fabric-plan/route";
import type { FabricBuyCalcRow } from "@/app/api/fabric-buy-calcs/route";
import { Card, Field, Metric, Num, fmt, inputCls, textCls, unitComparable, type FabricSettings } from "./buy-ui";
import { FamilyCalc, emptyFamily, type FamilyState, type FamilySummary, type OpenSingleArgs } from "./family-calc";
import { SavedCalcsBar, type SavePack } from "./saved-calcs";
import { CutStatusBadge, MeasureModal, useCutChecks, type MeasureTarget } from "./cut-check";

// ตัววาดชิ้นขนาดจริง (ของกลาง · หนัก) — โหลดเมื่อกดเปิดเท่านั้น
const ShapeEditor = dynamic(() => import("@/components/pattern-sheet/shape-editor").then((m) => m.ShapeEditor), { ssr: false });
// ลอกเส้นจากรูปแบบกระดาษ (ของสตูดิโอแพทเทิร์น · ในเครื่อง ไม่ใช้ AI) — โหลดเมื่อกด
const PhotoModal = dynamic(() => import("@/components/pattern-studio/photo-modal").then((m) => m.PhotoModal), { ssr: false });

/** ชิ้นสี่เหลี่ยมในตาราง → ชิ้นของตัววาด (ไว้ปรับทรงรายแถว) */
const rectEditorPiece = (p: BuyPiece): EditorPiece => ({ shape: { k: "rect", x: 0, y: 0, w: p.width_cm || 10, h: p.length_cm || 10 }, count: Math.max(1, Math.round(p.per_unit || 1)), allow: 0, name: p.label || "" });

/** รูปทรงเล็ก ๆ หลังชื่อชิ้น (เส้นรอบจริง หรือสี่เหลี่ยมตามสัดส่วน) */
function ShapeThumb({ p }: { p: BuyPiece }) {
  const w = p.width_cm > 0 ? p.width_cm : 1, h = p.length_cm > 0 ? p.length_cm : 1;
  const k = Math.min(26 / w, 20 / h);
  const pts = p.outline && p.outline.length >= 3 ? p.outline.map(([x, y]) => `${(x * k + 1).toFixed(1)},${(y * k + 1).toFixed(1)}`).join(" ") : null;
  return (
    <svg width={28} height={22} viewBox="0 0 28 22" className="shrink-0" aria-hidden>
      {pts ? <polygon points={pts} fill="#ddd6fe" stroke="#7c3aed" strokeWidth={1} /> : <rect x={1} y={1} width={Math.max(1, w * k)} height={Math.max(1, h * k)} fill="#e0e7ff" stroke="#6366f1" strokeWidth={1} />}
    </svg>
  );
}

let _k = 0;
const newPiece = (p?: Partial<BuyPiece>): BuyPiece => ({ label: "", width_cm: 0, length_cm: 0, per_unit: 1, no_rotate: false, ...p, total: undefined, key: `p${_k++}` });   // key ใหม่เสมอ (ก๊อปชิ้น = แถวใหม่) · ไม่พกยอดรวมจากโหมดตระกูล
const QUICK_WIDTHS = [110, 137, 147, 150, 160];   // หน้ากว้างที่พบบ่อย (ซม.) — 137 ≈ 54" · 147 ≈ 58"

type BomHead = { id: string; bom_code: string; product_sku: string | null; product_name: string | null; version: string | number | null };
type BomLine = { component_sku?: string | null; component_name?: string | null; material_type?: string | null; cut_block_code?: string | null; piece_name?: string | null; cut_width?: number | null; cut_length?: number | null; pieces?: number | null; no_rotate?: boolean | null; face_width_cm?: number | null; size_variant?: boolean | null };
/** ผ้าให้เลือก (จากสูตร หรือจากใบสั่งผลิตเก่า) → กดแล้วได้ชิ้นตัด */
type SrcFabric = { sku: string; name: string; note: string; pieces: Omit<BuyPiece, "key">[]; sized?: boolean; product?: string | null; mo_no?: string | null; mo_qty?: number };
type Origin = { product_sku: string; component_sku: string; mo_no?: string | null; mo_qty?: number };
type Mode = "single" | "family";

export function FabricBuyCalc() {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("single");
  // ── ชิ้นตัด ──
  const [pieces, setPieces] = useState<BuyPiece[]>([newPiece()]);
  const [source, setSource] = useState<string | null>(null);        // "สูตร BOM-XXX" — โชว์/พิมพ์ว่าชิ้นมาจากไหน
  const [srcPanel, setSrcPanel] = useState<"" | "bom" | "mo">("");
  const [bomSku, setBomSku] = useState<SkuPickerValue | null>(null);
  const [boms, setBoms] = useState<BomHead[] | null>(null);
  const [srcFabrics, setSrcFabrics] = useState<SrcFabric[] | null>(null);
  const [srcBusy, setSrcBusy] = useState(false);
  const [moPick, setMoPick] = useState(false);
  const [curBom, setCurBom] = useState<BomHead | null>(null);        // สูตรที่ดึงชิ้นมา (ไว้กดแก้สูตร)
  const [bomEdit, setBomEdit] = useState<string | null>(null);       // รหัสสินค้าที่เปิดตัวทำสูตรอยู่
  const [origin, setOrigin] = useState<Origin | null>(null);         // สินค้า + ผ้า ของชิ้นชุดนี้ (ไว้ผูกผลวัดจริง)
  const [shapeOpen, setShapeOpen] = useState(false);
  const [shapeInit, setShapeInit] = useState<EditorPiece[] | null>(null);   // ชิ้นตั้งต้นของตัววาด (จากรูปถ่าย / แถวที่กดปรับทรง) · null = ชิ้นทรงพิเศษที่มีอยู่
  const [rowEdit, setRowEdit] = useState<string | null>(null);             // แถวที่กำลังปรับทรง
  const [photoOpen, setPhotoOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [nestRes, setNestRes] = useState<NestResult | null>(null);
  const [useNest, setUseNest] = useState(true);
  const [measure, setMeasure] = useState<MeasureTarget | null>(null);
  const onNest = useCallback((r: NestResult | null) => setNestRes(r), []);
  // ── จำนวน + ผ้า ──
  const [qty, setQty] = useState(100);
  const [fabric, setFabric] = useState<BomComponent | null>(null);
  const [face, setFace] = useState(150);
  const [form, setForm] = useState<"roll" | "sheet">("roll");
  const [sheetLen, setSheetLen] = useState(0);
  const [price, setPrice] = useState(0);
  // ── ค่าตั้งที่ใช้ทั้งสองโหมด ──
  const [trim, setTrim] = useState(3);
  const [rotate, setRotate] = useState(true);
  const [shrink, setShrink] = useState(0);
  const [repeat, setRepeat] = useState(0);
  const [gap, setGap] = useState(0);
  const [waste, setWaste] = useState(3);
  const [unit, setUnit] = useState<BuyUnit>("yd");
  const [round, setRound] = useState<BuyRound>("unit");
  const [rollLen, setRollLen] = useState(50);
  // ── สต็อก (หน่วยของ SKU) ──
  const [stockRaw, setStockRaw] = useState<number | null>(null);
  const [stockErr, setStockErr] = useState("");
  // ── เทียบหน้ากว้าง ──
  const [widths, setWidths] = useState<{ key: string; face: number; price: number }[]>([]);
  // ── โหมดทั้งตระกูล (เก็บไว้ที่นี่เพื่อบันทึก) ──
  const famRef = useRef<FamilyState>(emptyFamily());
  const famSumRef = useRef<FamilySummary>({ fabrics: 0, qty: 0, cost_buy: 0, short: 0 });
  const [famInit, setFamInit] = useState<FamilyState>(emptyFamily());
  const [famKey, setFamKey] = useState(0);
  const onFamState = useCallback((s: FamilyState) => { famRef.current = s; }, []);
  const onFamSummary = useCallback((s: FamilySummary) => { famSumRef.current = s; }, []);

  const settings: FabricSettings = useMemo(() => ({ trim, rotate, shrink, repeat, gap, waste, unit, round, rollLen }), [trim, rotate, shrink, repeat, gap, waste, unit, round, rollLen]);

  const stockUnit = unitFromUomName(fabric?.uom_name);
  const unitOk = unitComparable(fabric?.uom_name, form);
  const stock = stockRaw == null || !unitOk ? 0 : form === "roll" && stockUnit ? convertLength(stockRaw, stockUnit, unit) : stockRaw;

  // โหลดสต็อกเมื่อเลือกผ้า
  useEffect(() => {
    setStockRaw(null); setStockErr("");
    if (!fabric?.id) return;
    let alive = true;
    apiFetch(`/api/inventory/sku-stock?ids=${encodeURIComponent(fabric.id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!alive) return; if (j.error) { setStockErr(j.error); return; } setStockRaw(Number(j.data?.[0]?.qty_on_hand) || 0); })
      .catch(() => { if (alive) setStockErr("โหลดสต็อกไม่สำเร็จ"); });
    return () => { alive = false; };
  }, [fabric?.id]);

  const pickFabric = (c: BomComponent) => {
    setFabric(c);
    const sheetForm = c.supply_form === "sheet" || (!c.fabric_width_cm && Number(c.sheet_width_cm) > 0 && Number(c.sheet_length_cm) > 0);
    if (sheetForm) { setForm("sheet"); setFace(Number(c.sheet_width_cm) || 0); setSheetLen(Number(c.sheet_length_cm) || 0); setTrim(0); }   // ผืน (PU/ตัวเสริม) ส่วนใหญ่ไม่มีริม
    else { setForm("roll"); if (Number(c.fabric_width_cm) > 0) setFace(Number(c.fabric_width_cm)); }
    const u = unitFromUomName(c.uom_name);
    if (u) setUnit(u);
    // ราคาต้นทุนของ SKU เป็นราคาต่อหน่วยของ SKU — เติมให้เฉพาะเมื่อหน่วยตรงกับหน่วยซื้อ (cm²/kg = ไม่เติม ให้กรอกเอง)
    if (Number(c.standard_price) > 0 && unitComparable(c.uom_name, sheetForm ? "sheet" : "roll")) setPrice(Number(c.standard_price));
    else setPrice(0);
  };
  const pickFabricByCode = async (code: string) => {
    if (!code || code.startsWith("(")) return;
    try {
      const j = await apiFetch(`/api/bom/components?search=${encodeURIComponent(code)}&limit=5`).then((r) => r.json());
      const hit = ((j.data ?? []) as BomComponent[]).find((c) => c.code === code);
      if (hit) pickFabric(hit);
    } catch { /* ไม่เจอผ้า = ผู้ใช้เลือกเอง */ }
  };

  // เปลี่ยนหน่วยซื้อ → แปลงราคา/ความยาวม้วนตาม (ราคาต่อหลา ↔ ต่อเมตร)
  const changeUnit = (u: BuyUnit) => {
    if (u === unit) return;
    const k = u === "m" ? 100 / YARD_CM : YARD_CM / 100;   // ราคาต่อหน่วยใหม่ = ราคาเดิม × (cm หน่วยใหม่ / cm หน่วยเดิม)
    setPrice((p) => Math.round(p * k * 100) / 100);       // 85 บาท/หลา → 92.96 บาท/เมตร
    setRollLen((l) => Math.round((l / k) * 100) / 100);   // 50 หลา → 45.72 เมตร
    setUnit(u);
  };

  // ── ดึงจากสูตร BOM: เลือก SKU → หาสูตรของ SKU นั้น → เลือกผ้าในสูตร → ชิ้นตัดของผ้านั้น ──
  const pickBomSku = async (v: SkuPickerValue | null) => {
    setBomSku(v); setBoms(null); setSrcFabrics(null);
    if (!v) return;
    setSrcBusy(true);
    try {
      const j = await apiFetch(`/api/bom?search=${encodeURIComponent(v.code)}&limit=50`).then((r) => r.json());
      const list = ((j.data ?? []) as BomHead[]).filter((b) => b.product_sku === v.code);
      setBoms(list);
      if (list.length === 1) await loadBom(list[0]);
    } catch { toast.error("โหลดสูตรไม่สำเร็จ ลองใหม่อีกครั้ง"); }
    finally { setSrcBusy(false); }
  };
  const loadBom = async (b: BomHead): Promise<SrcFabric[]> => {
    setSrcBusy(true); setSrcFabrics(null); setCurBom(b);
    try {
      const j = await apiFetch(`/api/bom/${encodeURIComponent(b.id)}`).then((r) => r.json());
      const lines = ((j.data?.lines ?? []) as BomLine[]).filter((l) => Number(l.cut_width) > 0 && Number(l.cut_length) > 0);
      const m = new Map<string, SrcFabric>();
      for (const l of lines) {
        const sku = String(l.component_sku ?? "") || "(ไม่ระบุรหัส)";
        const f = m.get(sku) ?? { sku, name: String(l.component_name ?? sku), note: l.material_type ?? "", pieces: [], sized: false, product: b.product_sku };
        f.pieces.push({ label: String(l.piece_name ?? "") || String(l.cut_block_code ?? "") || `${l.cut_width}×${l.cut_length}`, width_cm: Number(l.cut_width) || 0, length_cm: Number(l.cut_length) || 0, per_unit: Number(l.pieces) || 1, no_rotate: !!l.no_rotate });
        if (l.size_variant) f.sized = true;
        m.set(sku, f);
      }
      const list = [...m.values()];
      setSrcFabrics(list);
      setSource(`สูตร ${b.bom_code}${b.version != null ? ` v${b.version}` : ""} (${b.product_sku ?? ""})`);
      return list;
    } catch { toast.error("โหลดสูตรไม่สำเร็จ ลองใหม่อีกครั้ง"); return []; }
    finally { setSrcBusy(false); }
  };
  // ปิดตัวทำสูตร → ถ้าบันทึกแล้ว ดึงชิ้นของผ้าเดิมใหม่ให้เอง
  const afterBomEdit = async (changed: boolean) => {
    setBomEdit(null);
    if (!changed || !curBom) return;
    const list = await loadBom(curBom);
    const same = origin ? list.find((x) => x.sku === origin.component_sku) : null;
    if (same) { setPieces(same.pieces.map((p) => newPiece(p))); setSource((s) => `${s ?? ""} · ${same.name}`); setSrcPanel(""); toast.success("ดึงชิ้นตัดใหม่จากสูตรที่แก้แล้ว"); }
    else { setSrcPanel("bom"); toast.success("บันทึกสูตรแล้ว — เลือกผ้าเพื่อดึงชิ้นใหม่"); }
  };
  // ── ก๊อปจากใบสั่งผลิตเก่า: ผังที่ระบบเคยวางไว้ของใบนั้น (lay_layout) ÷ จำนวนในใบ = ชิ้นต่อใบ ──
  const loadMo = async (moNo: string) => {
    setSrcBusy(true); setSrcFabrics(null); setSrcPanel("mo"); setCurBom(null);
    try {
      const j = await apiFetch(`/api/mo/fabric-plan?mo_nos=${encodeURIComponent(moNo)}`).then((r) => r.json());
      if (j.error) { toast.error(j.error); return; }
      const groups = (j.data?.groups ?? []) as PlanGroupInput[];
      const mo = (j.data?.mos ?? {})[moNo] as FabricPlanMo | undefined;
      const moQty = Number(mo?.qty) || 0;
      setSrcFabrics(groups.map((g) => ({
        sku: g.sku, name: g.name ?? g.sku, note: `หน้า ${fmt(g.face_width_cm, 1)} ซม.${g.sheet_length_cm ? ` · ผืนยาว ${fmt(g.sheet_length_cm, 1)}` : ""}`,
        pieces: piecesFromMoBlocks(g.blocks, moQty), product: mo?.product_sku ?? null, mo_no: moNo, mo_qty: moQty,
      })).filter((f) => f.pieces.length > 0));
      setSource(`ใบสั่งผลิต ${moNo}${mo?.product_sku ? ` (${mo.product_sku} · ${fmt(moQty, 0)} ใบ)` : ""}`);
      if (moQty <= 0) toast.error("ใบนี้ไม่มีจำนวนสั่ง — คิดชิ้นต่อใบไม่ได้");
    } catch { toast.error("โหลดใบสั่งผลิตไม่สำเร็จ ลองใหม่อีกครั้ง"); }
    finally { setSrcBusy(false); }
  };
  const useSrcFabric = (f: SrcFabric) => {
    setPieces(f.pieces.map((p) => newPiece(p)));
    setOrigin(f.product && !f.sku.startsWith("(") ? { product_sku: f.product, component_sku: f.sku, mo_no: f.mo_no ?? null, mo_qty: f.mo_qty } : null);
    setSource((s) => `${s ?? "สูตร BOM"} · ${f.name}`);
    setSrcPanel("");
    void pickFabricByCode(f.sku);   // ผ้าในสูตร/ใบ → เลือกผ้าให้ด้วย (ได้หน้ากว้าง ราคา สต็อก)
    toast.success(`ดึงชิ้นตัด ${f.pieces.length} แบบแล้ว${f.sized ? " (บางชิ้นแยกไซส์ — ใช้ขนาดตั้งต้น)" : ""}`);
  };

  // ── เปิดผ้าจากโหมดทั้งตระกูลมาแก้ละเอียด ──
  const openSingle = (a: OpenSingleArgs) => {
    setPieces(a.pieces.map((p) => newPiece({ ...p, per_unit: p.per_unit })));
    setQty(a.qty); setFabric(a.fabric); setFace(a.face); setForm(a.form); setSheetLen(a.sheetLen); setPrice(a.price); setSource(a.source); setOrigin(a.origin ?? null); setCurBom(null);
    setMode("single");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── คำนวณ (เลื่อนผลเล็กน้อยตอนพิมพ์รัว ๆ ไม่ให้หน้าค้าง) ──
  const input: BuyInput = useMemo(() => ({
    pieces, qty, face_width_cm: face, trim_cm: trim, form, sheet_length_cm: sheetLen, allow_rotate: rotate,
    gap_cm: gap, waste_pct: waste, shrink_pct: shrink, repeat_cm: repeat, unit, round, roll_length: rollLen, price, stock,
  }), [pieces, qty, face, trim, form, sheetLen, rotate, gap, waste, shrink, repeat, unit, round, rollLen, price, stock]);
  const dIn = useDeferredValue(input);
  const res = useMemo(() => calcFabricBuy(dIn), [dIn]);
  const dWidths = useDeferredValue(widths);
  const cmp: WidthCompareRow[] = useMemo(() => dWidths.length === 0 ? [] : compareWidths(dIn, [
    { face_width_cm: dIn.face_width_cm, price: dIn.price }, ...dWidths.map((w) => ({ face_width_cm: w.face, price: w.price })),
  ]), [dIn, dWidths]);
  const stale = dIn !== input;
  // วางตามรูปจริง (มีชิ้นทรงพิเศษ · ผ้าม้วน) → ตัวเลขซื้อจากความยาวที่วางได้
  const lb = useMemo(() => (nestRes && form === "roll" ? buyFromLength(dIn, nestRes.length) : null), [nestRes, dIn, form]);
  // ใช้ผลรูปจริงเฉพาะตอนที่สั้นกว่าวางเป็นกรอบ (ชิ้นสี่เหลี่ยมเกือบหมด รูปจริงมักยาวกว่าเพราะตารางละเอียด/เว้นรอยตัด — ทดสอบจริง 2026-11-13)
  const nestBetter = !!nestRes && nestRes.length < res.used_length_cm - 0.5;
  const nestOn = !!lb && useNest && nestBetter;
  const eff = nestOn && lb ? { ...res, ...lb } : res;
  const adj = useMemo(() => adjustedPieces(input), [input]);
  const nums = useMemo(() => pieceNumbers(adj), [adj]);
  const fp = useMemo(() => piecesFingerprint(pieces), [pieces]);
  const pairKey = origin ? `${origin.product_sku}|${origin.component_sku}` : "";
  const { checks, reload: reloadChecks } = useCutChecks(pairKey ? [pairKey] : []);
  const cst = cutCheckState(pairKey ? checks[pairKey] : null, fp);
  const shaped = pieces.some((p) => (p.outline?.length ?? 0) >= 3);
  const unitCm = unit === "m" ? 100 : YARD_CM;
  const estPerUnit = form === "sheet" ? (res.layout?.sheetsUsed ?? 0) / Math.max(1, qty) : ((nestOn && nestRes ? nestRes.length : res.used_length_cm) / Math.max(1, qty)) / unitCm;
  const nestPieces = useMemo<PatternPiece[]>(() => {
    const k = 1 + shrink / 100;
    return pieces.filter((p) => p.width_cm > 0 && p.length_cm > 0 && p.per_unit > 0).map((p) => ({
      id: `${nums[p.key] ?? ""} ${p.label || ""}`.trim() || p.key, name: p.label, material: "", group: "", w: p.width_cm * k, h: p.length_cm * k,
      count: Math.max(1, Math.round(p.per_unit)), faceWidth: null, note: null,
      outline: p.outline && p.outline.length >= 3 ? p.outline.map(([x, y]) => [x * k, y * k] as [number, number]) : null, tag: p.no_rotate ? "ทางเดียว" : null,
    }));
  }, [pieces, shrink, nums]);

  const patch = (key: string, p: Partial<BuyPiece>) => setPieces((prev) => prev.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const u = res.unit_label;
  const fabricLabel = fabric ? `[${fabric.code}] ${fabric.name}` : `ผ้าหน้า ${fmt(face, 1)} ซม.`;

  const addCart = () => {
    const res = eff;
    if (!res.ok) { toast.error(res.error ?? "ยังคำนวณไม่ได้"); return; }
    if (res.to_buy <= 0) { toast.success("สต็อกพอแล้ว ไม่ต้องซื้อเพิ่ม"); return; }
    const n = addToPrCart([{
      label: fabricLabel, qty: res.to_buy, uom: u, seller: "", price: price > 0 ? price : 0, currency: "THB",
      image: fabric?.image_key ? `/api/r2-image?key=${encodeURIComponent(fabric.image_key)}` : null,
      variationId: null, skuRef: fabric?.code ?? null, skuId: fabric?.id ?? null,
      note: `คิดผ้าก่อนซื้อ: ผลิต ${fmt(qty, 0)} ใบ${source ? ` · ${source}` : ""} · ต้องใช้ ${fmt(res.need)} ${u} มี ${fmt(res.stock)} ${u}`,
      reason: "คิดผ้าก่อนซื้อ",
    }]);
    toast.success(`ใส่ตะกร้าขอซื้อแล้ว ${fmt(res.to_buy)} ${u} (ตะกร้ามี ${n} รายการ) — ไปกดยืนยันที่หน้า “ขอซื้อ”`);
  };
  const doPrint = () => {
    if (!eff.ok) { toast.error(eff.error ?? "ยังคำนวณไม่ได้"); return; }
    const date = new Date().toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
    printReportHtmlInNewWindow(renderFabricBuyHtml(input, eff, cmp, { title: `คิดผ้าก่อนซื้อ ${fabric?.code ?? ""}`.trim(), date, fabric_name: fabricLabel, source_label: source }));
  };

  // ── ใบวิธีตัด (แบบตัดซ้ำ ×รอบ · เลขชิ้น · ช่วง 90 ซม. · ตราสถานะ) ──
  const doCutPrint = () => {
    if (!adj.length || !(face - trim > 0)) { toast.error("ยังไม่มีชิ้นตัดหรือหน้ากว้างผ้า"); return; }
    const plan = planCutMarkers({ pieces: adj, qty, faceWidthCm: face - trim, sheetLengthCm: form === "sheet" ? sheetLen : null, allowRotate: rotate, gapCm: gap });
    const date = new Date().toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
    printReportHtmlInNewWindow(renderCutSheetHtml(`วิธีตัด ${fabric?.code ?? ""}`.trim(), [{
      title: "ใบวิธีตัด", date, fabric_name: fabricLabel, product_label: source, face_full_cm: face, usable_cm: face - trim, sheet_length_cm: form === "sheet" ? sheetLen : null,
      qty, legend: pieceLegend(adj, qty), plan, waste_pct: waste, unit_label: u,
      status: { measured: cst.state === "measured", text: cst.state === "measured" ? cst.detail : cst.state === "stale" ? "ขนาดชิ้นเปลี่ยนหลังวัด — ต้องวัดใหม่" : "" },
    }]));
    if (shaped) toast.success("ชิ้นทรงพิเศษในใบวิธีตัดวาดเป็นกรอบสี่เหลี่ยม — ผังรูปจริงดูบนจอ");
  };
  // ── ชิ้นทรงพิเศษ (วาดเอง) → ชิ้นที่มีเส้นรอบรูป ──
  // ชิ้นจากตัววาด → แถวในตาราง (สี่เหลี่ยมล้วนไม่มีรู = แถวธรรมดา · ทรงอื่น = ทรงพิเศษมีเส้นรอบจริง)
  const fromEditor = (p: ShapeEditorResult["pieces"][number], base?: BuyPiece): BuyPiece => {
    const b = p.geo.cutBox;
    // สี่เหลี่ยมล้วน (รวมกรณีเปิดแก้จุดแล้วยังเป็นสี่เหลี่ยมตั้งตรง 4 จุด ไม่มีหูจับ) = แถวธรรมดา
    const axisRect = p.shape.k === "path" && p.shape.nodes.length === 4 && p.shape.nodes.every((n, i, a) => !(n.ix || n.iy || n.ox || n.oy) && (Math.abs(n.x - a[(i + 1) % 4].x) < 1e-6 || Math.abs(n.y - a[(i + 1) % 4].y) < 1e-6));
    const plainRect = (p.shape.k === "rect" || axisRect) && !(p.holes?.length) && !(p.allow > 0);
    const outline = plainRect ? null : p.geo.cut.map(([x, y]) => [Math.round((x - b.x) * 100) / 100, Math.round((y - b.y) * 100) / 100] as [number, number]);
    return newPiece({
      ...(base ? { no_rotate: base.no_rotate, match: base.match } : {}),
      label: p.name || base?.label || (plainRect ? "" : "ชิ้นทรงพิเศษ"), width_cm: Math.round(b.w * 10) / 10, length_cm: Math.round(b.h * 10) / 10,
      per_unit: Math.max(1, Math.round(p.count || 1)), outline,
      shape: { shape: p.shape, holes: p.holes, count: p.count, allow: p.allow, allowEdges: p.allowEdges, name: p.name, pid: p.pid },
    });
  };
  const closeEditor = () => { setShapeOpen(false); setShapeInit(null); setRowEdit(null); };
  const applyShapes = (r: ShapeEditorResult) => {
    if (rowEdit) {   // ปรับทรงแถวเดียว → แทนแถวนั้น (วาดเพิ่มหลายชิ้น = แทรกต่อท้ายแถว)
      const key = rowEdit;
      setPieces((prev) => {
        const i = prev.findIndex((x) => x.key === key);
        if (i < 0 || !r.pieces.length) return prev;
        const made = r.pieces.map((p, j) => fromEditor(p, j === 0 ? prev[i] : undefined));
        const n = [...prev]; n.splice(i, 1, ...made); return n;
      });
      closeEditor();
      toast.success("ปรับทรงแล้ว");
      return;
    }
    const made: BuyPiece[] = r.pieces.map((p) => fromEditor(p));
    setPieces((prev) => { const keep = prev.filter((x) => !x.shape && (x.width_cm > 0 || x.length_cm > 0 || x.label)); const n = [...keep, ...made]; return n.length ? n : [newPiece()]; });
    closeEditor();
    toast.success(`ได้ชิ้นจากตัววาด ${made.length} ชิ้น${made.some((m) => m.outline) ? " — มีทรงพิเศษ กด “วางตามรูปจริง” ในผลคำนวณได้" : ""}`);
  };
  const openRowShape = (p: BuyPiece) => { setRowEdit(p.key); setShapeInit([p.shape ? (p.shape as EditorPiece) : rectEditorPiece(p)]); setShapeOpen(true); };
  // รูปถ่ายแบบกระดาษ → ชิ้นที่ลอกได้ → เปิดตัววาดให้ตรวจขนาด/เกลาเส้นก่อนใช้
  const fromPhoto = (ps: EditorPiece[]) => {
    setPhotoOpen(false);
    if (!ps.length) return;
    setRowEdit(null);
    setShapeInit([...pieces.filter((p) => p.shape).map((p) => p.shape as EditorPiece), ...ps]);
    setShapeOpen(true);
    toast.success(`ลอกได้ ${ps.length} ชิ้น — ตรวจขนาดกับของจริง เกลาเส้น ตั้งจำนวนต่อใบ แล้วกด “ใช้ขนาดนี้”`);
  };

  // ── บันทึก / เปิดกลับ ──
  const pack = (): SavePack => {
    const s = { trim, rotate, shrink, repeat, gap, waste, unit, round, rollLen };
    if (mode === "family") {
      const f = famRef.current, sm = famSumRef.current;
      return { mode, payload: { v: 1, settings: s, family: f }, summary: { fabrics: sm.fabrics, qty: sm.qty, cost_buy: sm.cost_buy }, suggestName: f.parent ? `${f.parent.code} ทั้งตระกูล` : "" };
    }
    return {
      mode, payload: { v: 1, settings: s, single: { pieces: pieces.map(({ key: _key, ...p }) => p), qty, fabric, face, form, sheetLen, price, widths: widths.map((w) => ({ face: w.face, price: w.price })), source, origin } },
      summary: res.ok ? { need: res.need, to_buy: res.to_buy, cost_buy: res.cost_buy, unit: res.unit_label, qty } : { qty },
      suggestName: fabric?.code ? `${fabric.code} × ${qty}` : (source ?? ""),
    };
  };
  const onLoad = (row: FabricBuyCalcRow) => {
    const p = (row.payload ?? {}) as Record<string, unknown>;
    const s = (p.settings ?? {}) as Partial<FabricSettings>;
    const n = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);
    setTrim(n(s.trim, 3)); setRotate(s.rotate !== false); setShrink(n(s.shrink, 0)); setRepeat(n(s.repeat, 0)); setGap(n(s.gap, 0)); setWaste(n(s.waste, 3));
    setUnit(s.unit === "m" ? "m" : "yd"); setRound(s.round === "roll" || s.round === "none" ? s.round : "unit"); setRollLen(n(s.rollLen, 50));
    if (row.mode === "family") {
      const f = (p.family ?? emptyFamily()) as FamilyState;
      const init: FamilyState = { parent: f.parent ?? null, qty: f.qty ?? {}, over: f.over ?? {} };
      famRef.current = init; setFamInit(init); setFamKey((k) => k + 1); setMode("family");
      return;
    }
    const g = (p.single ?? {}) as Record<string, unknown>;
    const ps = Array.isArray(g.pieces) ? (g.pieces as Partial<BuyPiece>[]) : [];
    setPieces(ps.length ? ps.map((x) => newPiece(x)) : [newPiece()]);
    setQty(n(g.qty, 100)); setFabric((g.fabric as BomComponent | null) ?? null); setFace(n(g.face, 150)); setForm(g.form === "sheet" ? "sheet" : "roll");
    setSheetLen(n(g.sheetLen, 0)); setPrice(n(g.price, 0)); setSource((g.source as string | null) ?? null); setOrigin((g.origin as Origin | null) ?? null); setCurBom(null);
    setWidths(Array.isArray(g.widths) ? (g.widths as { face: number; price: number }[]).map((w) => ({ key: `w${_k++}`, face: n(w.face, 0), price: n(w.price, 0) })) : []);
    setMode("single");
  };

  // ── ตารางชิ้นตัด (แก้ในตาราง) ──
  const pieceCols: MiniColumn<BuyPiece>[] = [
    { key: "no", header: "เลข", width: "2.6rem", align: "center", cell: (p) => nums[p.key] != null ? <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-indigo-300 bg-white text-[12px] font-bold text-indigo-700">{nums[p.key]}</span> : <span className="text-slate-300">—</span> },
    { key: "label", header: "ชื่อชิ้น · รูปทรง", width: "2.2fr", cell: (p) => (
      <span className="flex items-center gap-1.5">
        {p.outline && <span className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-[10.5px] text-violet-700" title="ชิ้นทรงพิเศษ — กว้าง×ยาว = กรอบของรูป">ทรงพิเศษ</span>}
        <input value={p.label} placeholder="เช่น ตัวหน้า" onChange={(e) => patch(p.key, { label: e.target.value })} className={textCls} />
        <button type="button" onClick={() => openRowShape(p)} title="ปรับทรงชิ้นนี้ (โค้ง/ตัดมุม/วงกลม/เจาะรู)" className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-violet-200 bg-white px-1.5 py-1 text-[11px] text-violet-700 hover:bg-violet-50">
          <ShapeThumb p={p} /> ปรับทรง
        </button>
      </span>
    ) },
    { key: "w", header: "กว้าง (ซม.)", width: "1fr", align: "right", cell: (p) => p.outline ? <span className="text-[12.5px] text-slate-600">{fmt(p.width_cm, 1)}</span> : <Num value={p.width_cm} onChange={(v) => patch(p.key, { width_cm: v })} /> },
    { key: "l", header: "ยาว (ซม.)", width: "1fr", align: "right", cell: (p) => p.outline ? <span className="text-[12.5px] text-slate-600">{fmt(p.length_cm, 1)}</span> : <Num value={p.length_cm} onChange={(v) => patch(p.key, { length_cm: v })} /> },
    { key: "n", header: "ชิ้น/ใบ", width: "0.8fr", align: "right", cell: (p) => <Num value={p.per_unit} onChange={(v) => patch(p.key, { per_unit: v })} /> },
    { key: "tot", header: "รวมทั้งงาน", width: "0.9fr", align: "right", cell: (p) => <span className="text-[12px] text-slate-500">{fmt(p.per_unit * qty, 0)}</span> },
    { key: "nr", header: "ห้ามหมุน", width: "0.7fr", align: "center", cell: (p) => <input type="checkbox" checked={!!p.no_rotate} onChange={(e) => patch(p.key, { no_rotate: e.target.checked })} title="ชิ้นนี้ต้องตามลาย/เกรน ห้ามหมุน" /> },
    ...(repeat > 0 ? [{ key: "m", header: "ตรงลาย", width: "0.7fr", align: "center" as const, cell: (p: BuyPiece) => <input type="checkbox" checked={!!p.match} onChange={(e) => patch(p.key, { match: e.target.checked })} title={`ความยาวปัดขึ้นเป็นรอบลาย ${repeat} ซม. + ห้ามหมุน`} /> }] : []),
    { key: "x", header: "", width: "4.5rem", align: "right", cell: (p) => (
      <span className="inline-flex gap-1">
        <button type="button" title="ก๊อปชิ้นนี้" onClick={() => setPieces((prev) => { const i = prev.findIndex((x) => x.key === p.key); const n = [...prev]; n.splice(i + 1, 0, newPiece(p)); return n; })} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"><Icon name="list" /></button>
        <button type="button" title="ลบชิ้นนี้" onClick={() => setPieces((prev) => (prev.length > 1 ? prev.filter((x) => x.key !== p.key) : [newPiece()]))} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Icon name="delete" /></button>
      </span>
    ) },
  ];

  const cmpCols: MiniColumn<WidthCompareRow>[] = [
    { key: "f", header: "หน้ากว้าง", width: "1.3fr", cell: (r) => <span className={r.best ? "font-semibold text-emerald-700" : ""}>{fmt(r.face_width_cm, 1)} ซม.{r.face_width_cm === face && " (ตัวที่เลือก)"}{r.best && <span className="ml-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700">{cmp.every((c) => !c.result.ok || c.price != null) ? "ถูกสุด" : "ใช้น้อยสุด"}</span>}</span> },
    { key: "p", header: `ราคา/${u}`, width: "1fr", align: "right", cell: (r) => r.price != null ? fmt(r.price) : "—" },
    { key: "n", header: `ต้องใช้ (${u})`, width: "1fr", align: "right", cell: (r) => r.result.ok ? fmt(r.result.need) : <span className="text-rose-600 text-[12px]">{r.result.error}</span> },
    { key: "nr", header: "ปัดแล้ว", width: "0.9fr", align: "right", cell: (r) => r.result.ok ? fmt(r.result.need_rounded) : "" },
    { key: "e", header: "คุ้ม %", width: "0.8fr", align: "right", cell: (r) => r.result.ok ? `${fmt(r.result.efficiency_pct, 1)}%` : "" },
    { key: "c", header: "งบ", width: "1fr", align: "right", cell: (r) => r.result.ok && r.price != null ? `฿${fmt(r.result.need_rounded * r.price, 0)}` : "—" },
  ];

  const hints = (res.layout?.fitHints ?? []).filter((h) => h.leftoverCm >= 3).slice(0, 2);
  const family = mode === "family";

  // ค่าตั้งผ้าทั่วไป (ใช้ทั้งสองโหมด)
  const generalFields = (
    <>
      <Field label="หักริม รวม 2 ข้าง (ซม.)" hint={family ? "ผ้าม้วน · ผ้าผืนไม่หักริม" : "ริมผ้าตัดใช้ไม่ได้ · ปกติ 2-4 ซม."}><Num value={trim} onChange={setTrim} /></Field>
      <Field label="ทางผ้า">
        <select value={rotate ? "1" : "0"} onChange={(e) => setRotate(e.target.value === "1")} className={textCls}><option value="1">หมุนชิ้นได้ (ผ้าเรียบ)</option><option value="0">ห้ามหมุน (ลาย/ขน/เงา)</option></select>
      </Field>
      <Field label="ผ้าหดตัว %" hint="ขยายชิ้นตัดเผื่อหด · ไม่หด = 0"><Num value={shrink} onChange={setShrink} /></Field>
      <Field label="ลายซ้ำ (ซม.)" hint={repeat > 0 ? (family ? "ติ๊ก “ตรงลาย” ที่ผ้าแต่ละตัว" : "ติ๊ก “ตรงลาย” ที่ชิ้นในตาราง") : "ผ้าลายที่ต้องตรงลาย · ไม่มี = 0"}><Num value={repeat} onChange={setRepeat} /></Field>
    </>
  );
  const buyCard = (
    <Card title={family ? "3. เผื่อ + หน่วยซื้อ (ใช้กับทุกผ้า)" : "3. เผื่อ + หน่วยซื้อ"} tag="rec">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Field label="เว้นระหว่างชิ้น (ซม.)" hint="ปกติ 0 (ตรงกับใบสั่งผลิต)"><Num value={gap} onChange={setGap} /></Field>
        <Field label="เผื่อเสีย %" hint="หัว-ท้ายม้วน/ตำหนิ · แนะนำ 3"><Num value={waste} onChange={setWaste} /></Field>
        {(family || form === "roll") && (
          <Field label="ซื้อเป็น (ผ้าม้วน)">
            <select value={unit} onChange={(e) => changeUnit(e.target.value as BuyUnit)} className={textCls}><option value="yd">หลา</option><option value="m">เมตร</option></select>
          </Field>
        )}
        {(family || form === "roll") && (
          <Field label="ปัดขึ้น">
            <select value={round} onChange={(e) => setRound(e.target.value as BuyRound)} className={textCls}><option value="unit">{unit === "m" ? "เมตร" : "หลา"}เต็ม</option><option value="roll">ม้วนเต็ม</option><option value="none">ไม่ปัด</option></select>
          </Field>
        )}
        {(family || form === "roll") && <Field label={`1 ม้วนยาว (${unit === "m" ? "เมตร" : "หลา"})`}><Num value={rollLen} onChange={setRollLen} /></Field>}
        {!family && <Field label={`ราคา / ${u} (บาท)`} hint={!fabric?.standard_price ? undefined : unitOk ? "ดึงต้นทุนจากรหัสผ้า แก้ได้" : `ต้นทุนในระบบเป็นต่อ ${fabric.uom_name} — กรอกราคาต่อ${u}เอง`}><Num value={price} onChange={setPrice} /></Field>}
      </div>
    </Card>
  );

  return (
    <div className="space-y-4">
      <SavedCalcsBar pack={pack} onLoad={onLoad} />

      <div className="inline-flex rounded-xl border border-indigo-200 bg-white p-1 text-sm">
        {([["single", "ผ้าเดียว"], ["family", "ทั้งตระกูล (แบ่งตามสี)"]] as [Mode, string][]).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setMode(k)} className={`rounded-lg px-4 py-1.5 font-medium ${mode === k ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-indigo-50"}`}>{label}</button>
        ))}
      </div>

      {/* ทั้งตระกูล (คงไว้ใน DOM ตอนสลับไปผ้าเดียว เพื่อไม่ต้องโหลดใหม่) */}
      <div className={family ? "space-y-4" : "hidden"}>
        <FamilyCalc key={famKey} settings={settings} initial={famInit} onState={onFamState} onSummary={onFamSummary} onOpenSingle={openSingle} />
        <Card title="2. ค่าตั้งผ้า (ใช้กับทุกผ้า)" tag="rec">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{generalFields}</div>
        </Card>
        {buyCard}
      </div>

      {!family && <>
      {/* 1. ชิ้นตัด */}
      <Card title="1. ชิ้นตัด" tag="need" right={source && <span className="truncate text-[12px] text-slate-500">จาก {source}</span>}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => { setSrcPanel((s) => (s === "bom" ? "" : "bom")); setSrcFabrics(null); }} className={`inline-flex h-8 items-center gap-1 rounded-lg border px-3 text-[12px] ${srcPanel === "bom" ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50"}`}><Icon name="measure" /> ดึงจากสูตร BOM</button>
          <button type="button" onClick={() => setMoPick(true)} className={`inline-flex h-8 items-center gap-1 rounded-lg border px-3 text-[12px] ${srcPanel === "mo" ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50"}`}><Icon name="repeat" /> ก๊อปจากใบสั่งผลิตเก่า</button>
          <button type="button" onClick={() => setShapeOpen(true)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-violet-200 bg-white px-3 text-[12px] text-violet-700 hover:bg-violet-50"><Icon name="edit" /> วาดชิ้นทรงพิเศษ{shaped ? ` (${pieces.filter((p) => p.outline).length})` : ""}</button>
          <button type="button" onClick={() => setPhotoOpen(true)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-violet-200 bg-white px-3 text-[12px] text-violet-700 hover:bg-violet-50" title="ถ่ายรูปแพทเทิร์นกระดาษ → ลอกเส้นรอบชิ้นให้ (ในเครื่อง ไม่ใช้ AI)"><Icon name="camera" /> ถ่ายรูปแบบกระดาษ</button>
          <button type="button" onClick={() => setHelp((v) => !v)} className={`inline-flex h-8 items-center gap-1 rounded-lg border px-3 text-[12px] ${help ? "border-slate-400 bg-slate-100 text-slate-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}><Icon name="help" /> วิธีใช้</button>
          {curBom?.product_sku && <button type="button" onClick={() => setBomEdit(curBom.product_sku)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-3 text-[12px] text-amber-800 hover:bg-amber-100" title="ขนาดชิ้นในสูตรไม่ตรง → แก้ที่สูตรเลย (บันทึกแล้วดึงชิ้นใหม่ให้)"><Icon name="edit" /> แก้สูตร BOM นี้</button>}
          <span className="text-[12px] text-slate-400">หรือพิมพ์ขนาดชิ้นเองในตารางด้านล่าง</span>
        </div>
        {help && <HowTo onClose={() => setHelp(false)} />}
        {srcPanel !== "" && (
          <div className="mb-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
            {srcPanel === "bom" && <>
              <div className="mb-1 text-[12px] text-slate-600">เลือกสินค้า (SKU) ที่มีสูตรแล้ว → เลือกผ้าในสูตร</div>
              <div className="max-w-md"><SkuPicker value={bomSku} onChange={(v) => void pickBomSku(v)} placeholder="ค้นรหัส / ชื่อสินค้า..." /></div>
              {boms && boms.length === 0 && !srcBusy && <div className="mt-2 text-[12px] text-amber-700">สินค้านี้ยังไม่มีสูตร (BOM) — พิมพ์ชิ้นเองได้</div>}
              {boms && boms.length > 1 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="text-[12px] text-slate-500">มี {boms.length} สูตร:</span>
                  {boms.map((b) => <button key={b.id} type="button" onClick={() => void loadBom(b)} className="h-7 rounded-full border border-slate-200 bg-white px-2.5 text-[12px] hover:border-indigo-300">{b.bom_code}{b.version != null ? ` v${b.version}` : ""}</button>)}
                </div>
              )}
            </>}
            {srcPanel === "mo" && <div className="mb-1 text-[12px] text-slate-600">ผ้าในใบที่เลือก (ชิ้นต่อใบ = ชิ้นที่ระบบวางไว้ ÷ จำนวนในใบ) → เลือกผ้า <button type="button" onClick={() => setMoPick(true)} className="ml-1 text-indigo-600 underline">เลือกใบอื่น</button></div>}
            {srcBusy && <div className="mt-2 text-[12px] text-slate-500">กำลังโหลด…</div>}
            {srcFabrics && (srcFabrics.length === 0
              ? <div className="mt-2 text-[12px] text-amber-700">{srcPanel === "mo" ? "ใบนี้ยังไม่มีผังชิ้นตัด (ยังไม่ได้กด “อัพเดตวัตถุดิบตาม BOM” หรือไม่มีผ้าที่ใส่ขนาดชิ้น)" : "สูตรนี้ยังไม่มีบรรทัดที่ใส่ขนาดชิ้นตัด (กว้าง × ยาว)"}</div>
              : <div className="mt-2 flex flex-wrap gap-1.5">
                  {srcFabrics.map((f) => (
                    <button key={f.sku} type="button" onClick={() => useSrcFabric(f)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left text-[12px] hover:border-indigo-400">
                      <div className="font-medium text-slate-700">{f.name}</div>
                      <div className="text-slate-400">{f.sku}{f.note ? ` · ${f.note}` : ""} · {f.pieces.length} แบบชิ้น</div>
                    </button>
                  ))}
                </div>)}
          </div>
        )}
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
          <CutStatusBadge st={cst} />
          <span className="min-w-0 flex-1 text-[12px] text-slate-500">{cst.detail}</span>
          {origin
            ? <button type="button" onClick={() => setMeasure({ product_sku: origin.product_sku, component_sku: origin.component_sku, label: `${origin.product_sku} · ${fabricLabel}`, fp, unit: u, est_per_unit: estPerUnit, mo_no: origin.mo_no ?? null, qty: origin.mo_qty })}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-emerald-300 bg-white px-3 text-[12px] font-medium text-emerald-700 hover:bg-emerald-50"><Icon name="measure" /> {cst.state === "measured" ? "วัดใหม่ / ดูผลวัด" : "บันทึกผลวัดจริง"}</button>
            : <span className="text-[11.5px] text-slate-400">ดึงชิ้นจากสูตร BOM หรือใบสั่งผลิตก่อน ถึงบันทึกผลวัดจริงได้</span>}
        </div>
        <MiniTable rows={pieces} columns={pieceCols} rowKey={(p) => p.key} hideToolbar dense zebra={false} />
        <button type="button" onClick={() => setPieces((p) => [...p, newPiece()])} className="mt-2 inline-flex h-8 items-center gap-1 rounded-full border-2 border-dashed border-indigo-200 px-3 text-[12px] font-medium text-indigo-600 hover:bg-indigo-50"><Icon name="add" /> เพิ่มชิ้น</button>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="2. จำนวนผลิต + ผ้าที่จะซื้อ" tag="need">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Field label="จำนวนผลิต (ใบ)"><Num value={qty} onChange={setQty} big /></Field>
            <div className="col-span-2">
              <Field label="เลือกผ้า (ได้หน้ากว้าง ราคา สต็อก) — ไม่เลือกก็ได้"><ComponentPicker sku={fabric?.code ?? ""} name={fabric?.name ?? ""} imageKey={fabric?.image_key} placeholder="— ค้นผ้า / วัตถุดิบ —" onPick={pickFabric} /></Field>
            </div>
            <Field label="มาเป็น">
              <select value={form} onChange={(e) => setForm(e.target.value as "roll" | "sheet")} className={textCls}><option value="roll">ม้วน</option><option value="sheet">ผืน</option></select>
            </Field>
            <Field label={form === "sheet" ? "ผืนกว้าง (ซม.)" : "หน้ากว้างเต็ม (ซม.)"}><Num value={face} onChange={setFace} /></Field>
            {form === "sheet" && <Field label="ผืนยาว (ซม.)"><Num value={sheetLen} onChange={setSheetLen} /></Field>}
            {generalFields}
          </div>
          <div className="mt-2 text-[12px] text-slate-500">หน้าใช้ได้จริง <b className="text-slate-700">{fmt(face - trim, 1)} ซม.</b></div>
        </Card>
        {buyCard}
      </div>

      {/* ผล */}
      <section className={`rounded-2xl border-2 border-indigo-300 bg-white p-4 shadow-sm transition-opacity ${stale ? "opacity-60" : ""}`}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="flex items-center gap-2 text-base font-bold text-indigo-700"><Icon name="calc" /> ผลคำนวณ</h2>
          <span className="text-[12px] text-slate-500">{fabricLabel} · ผลิต {fmt(qty, 0)} ใบ · ชิ้นรวม {fmt(res.total_pieces, 0)} ชิ้น</span>
          <span className="ml-auto flex flex-wrap gap-2">
            <button type="button" onClick={addCart} className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 bg-white px-3 text-[12px] text-rose-700 hover:bg-rose-50"><Icon name="cart" /> ใส่ตะกร้าขอซื้อ</button>
            <button type="button" onClick={doPrint} className="inline-flex h-8 items-center gap-1 rounded-lg border border-indigo-200 bg-white px-3 text-[12px] text-indigo-700 hover:bg-indigo-50"><Icon name="print" /> พิมพ์สรุป</button>
            <button type="button" onClick={doCutPrint} className="inline-flex h-8 items-center gap-1 rounded-lg bg-indigo-600 px-3 text-[12px] font-medium text-white hover:bg-indigo-700"><Icon name="cut" /> พิมพ์วิธีตัด</button>
          </span>
        </div>
        {!res.ok ? (
          <div className="rounded-xl bg-amber-50 px-3 py-6 text-center text-sm text-amber-800">{res.error}</div>
        ) : (
          <>
            {nestOn && <div className="mb-2 rounded-lg bg-violet-50 px-3 py-1.5 text-[12px] text-violet-800">ตัวเลขด้านล่างคิดจาก <b>วางตามรูปจริง</b> (ยาว {fmt((nestRes?.length ?? 0) / 100)} ม.) — วางเป็นกรอบจะได้ {fmt(res.need)} {u}</div>}
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
              <Metric label="ต้องใช้จริง (รวมเผื่อเสีย)" value={`${fmt(eff.need)} ${u}`} sub={form === "sheet" ? `ใช้ต่อใบ ${fmt(eff.per_unit, 3)} ผืน` : `ใช้ต่อใบ ${fmt(eff.per_unit_cm, 1)} ซม. (${fmt(eff.per_unit, 3)} ${u})`} />
              <Metric label="ควรซื้อ (ปัดแล้ว)" value={`${fmt(eff.need_rounded)} ${u}`} sub={eff.rolls ? `${eff.rolls} ม้วน (ม้วนละ ${fmt(rollLen)} ${u})` : undefined} />
              <Metric label="ราคาผ้า" value={price > 0 ? `฿${fmt(price)}` : "—"} sub={price > 0 ? `ต่อ${u} · ค่าผ้าทั้งงาน ฿${fmt(eff.cost_total ?? 0, 0)}` : "ใส่ราคาที่ “เผื่อ + หน่วยซื้อ”"} />
              <Metric label="ต้องซื้อเพิ่ม (หักสต็อก)" value={`${fmt(eff.to_buy)} ${u}`} tone={eff.to_buy > 0 ? "danger" : "success"}
                sub={!fabric ? "ยังไม่ได้เลือกผ้า = ไม่หักสต็อก" : stockErr ? stockErr : stockRaw == null ? "กำลังโหลดสต็อก…" : !unitOk ? `สต็อกนับเป็น ${fabric.uom_name} (${fmt(stockRaw)}) เทียบกับ${u}ไม่ได้ — ไม่หักสต็อก` : `สต็อกมี ${fmt(stock)} ${u}`} />
              <Metric label="งบซื้อเพิ่ม" value={eff.cost_buy != null ? `฿${fmt(eff.cost_buy, 0)}` : "—"} sub={eff.cost_per_unit != null ? `ค่าผ้าต่อใบ ฿${fmt(eff.cost_per_unit)}` : "ใส่ราคาเพื่อดูงบ"} />
            </div>
            <div className="mt-2 text-[12px] text-slate-500">
              {form === "sheet" ? <>วางจริง {fmt(res.layout?.sheetsUsed ?? 0, 0)} ผืน (ก่อนเผื่อเสีย)</> : <>วางชิ้นจริงยาว {fmt(res.used_length_cm / 100)} ม. (ก่อนเผื่อเสีย)</>} · ใช้ผ้าคุ้ม <b className="text-slate-700">{fmt(res.efficiency_pct, 1)}%</b>
              {form === "roll" && res.naive > 0 && <> · ถ้าคิดแบบเดิม (พื้นที่ ÷ หน้ากว้าง) = {fmt(res.naive)} {u}</>}
              {repeat > 0 && pieces.some((p) => p.match) && <> · ชิ้นตรงลายปัดความยาวเป็นรอบลาย {fmt(repeat, 1)} ซม.</>}
              {res.layout?.sampledFrom && <> · งานล็อตใหญ่: จำลอง {fmt(res.layout.sampledFrom.simulated, 0)} จาก {fmt(res.layout.sampledFrom.total, 0)} ชิ้น แล้วขยายผล</>}
            </div>
            {hints.length > 0 && (
              <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                <Icon name="tip" /> ทำไมเหลือเศษ:{" "}
                {hints.map((h, i) => <span key={i}>{i > 0 && " · "}ชิ้น {h.label} กว้าง {fmt(h.w, 1)} วางได้ {h.perRow} ชิ้น/แถว เหลือขอบ {fmt(h.leftoverCm, 1)} ซม.{h.suggestFaceCm ? ` (ผ้าหน้า ${fmt(h.suggestFaceCm + trim, 1)} ซม. จะลงตัวกว่า)` : ""}</span>)}
              </div>
            )}
            {res.layout && (
              <div className="mt-3">
                <FabricLayoutPreview result={res.layout} faceWidthCm={res.usable_width_cm} sheetLengthCm={form === "sheet" ? sheetLen : null} mode={form} numbers={nums} />
                {shaped && form === "roll" && (
                  <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/40 p-3">
                    <div className="text-[12.5px] font-medium text-violet-800">มีชิ้นทรงพิเศษ — ผังด้านบนวางเป็นกรอบสี่เหลี่ยม · กด “วางตามรูปจริง” ให้ชิ้นโค้งซ้อนกัน (ประหยัดกว่า)</div>
                    <NestPanel pieces={nestPieces} faceWidth={face - trim} qty={qty} boxLength={res.used_length_cm} onResult={onNest} />
                    {lb && nestBetter && <label className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-slate-700"><input type="checkbox" checked={useNest} onChange={(e) => setUseNest(e.target.checked)} /> ใช้ผลวางตามรูปจริงคิดยอดซื้อ ({fmt(lb.need)} {u} · วางเป็นกรอบ {fmt(res.need)} {u})</label>}
                    {lb && !nestBetter && <div className="mt-2 text-[12px] text-slate-500">วางตามรูปจริงไม่สั้นกว่าวางเป็นกรอบ ({fmt(lb.need)} vs {fmt(res.need)} {u}) — ใช้ตัวเลขแบบกรอบ</div>}
                  </div>
                )}
                {shaped && form === "sheet" && <div className="mt-2 text-[12px] text-amber-700">ผ้าผืน: วางตามรูปจริงยังคิดได้เฉพาะผ้าม้วน — ตอนนี้ใช้กรอบของชิ้นทรงพิเศษ</div>}
              </div>
            )}
          </>
        )}
      </section>

      {/* เทียบหน้ากว้าง */}
      <Card title="4. เทียบหน้ากว้าง — ผ้าหน้าไหนคุ้มสุด" tag="rec">
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[12px]">
          <span className="text-slate-500">เพิ่มหน้าที่จะเทียบ:</span>
          {QUICK_WIDTHS.filter((w) => w !== face && !widths.some((x) => x.face === w)).map((w) => (
            <button key={w} type="button" onClick={() => setWidths((p) => [...p, { key: `w${_k++}`, face: w, price }])} className="h-7 rounded-full border border-slate-200 bg-white px-2.5 hover:border-indigo-300">+ {w} ซม.</button>
          ))}
          <button type="button" onClick={() => setWidths((p) => [...p, { key: `w${_k++}`, face: 0, price }])} className="h-7 rounded-full border border-dashed border-slate-300 px-2.5 text-slate-500 hover:bg-slate-50">+ ใส่เอง</button>
        </div>
        {widths.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {widths.map((w) => (
              <div key={w.key} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[12px]">
                <span className="text-slate-500">หน้า</span>
                <input type="number" min={0} value={w.face || ""} onChange={(e) => setWidths((p) => p.map((x) => x.key === w.key ? { ...x, face: Number(e.target.value) || 0 } : x))} className={`${inputCls} !h-7 !w-16 !px-1`} />
                <span className="text-slate-500">ซม. ราคา</span>
                <input type="number" min={0} value={w.price || ""} onChange={(e) => setWidths((p) => p.map((x) => x.key === w.key ? { ...x, price: Number(e.target.value) || 0 } : x))} className={`${inputCls} !h-7 !w-16 !px-1`} />
                <button type="button" title="เอาออก" onClick={() => setWidths((p) => p.filter((x) => x.key !== w.key))} className="rounded p-0.5 text-slate-400 hover:text-rose-600"><Icon name="delete" /></button>
              </div>
            ))}
          </div>
        )}
        {cmp.length > 0
          ? <MiniTable rows={cmp} columns={cmpCols} rowKey={(r) => `${r.face_width_cm}-${r.price ?? ""}`} hideToolbar dense />
          : <div className="text-[12px] text-slate-400">ยังไม่ได้เพิ่มหน้ากว้างที่จะเทียบ — ค่าตั้งอื่น (ริม เผื่อเสีย ปัดขึ้น) ใช้เหมือนด้านบน</div>}
      </Card>
      </>}

      {bomEdit && <BomEditorModal sku={bomEdit} onClose={(changed) => void afterBomEdit(changed)} />}
      {shapeOpen && <ShapeEditor open onClose={closeEditor} onSave={applyShapes} initialEdit={!!rowEdit} title={rowEdit ? "ปรับทรงชิ้นนี้ (ขนาดจริง ซม.)" : "วาดชิ้นทรงพิเศษ (ขนาดจริง ซม.)"}
        initial={shapeInit ?? pieces.filter((p) => p.shape).map((p) => p.shape as EditorPiece)} />}
      {photoOpen && <PhotoModal open traceOnly onClose={() => setPhotoOpen(false)} onPieces={(ps) => fromPhoto(ps)} onDraft={() => { /* ไม่ใช้ทาง AI ในหน้านี้ */ }} />}
      <MeasureModal target={measure} current={pairKey ? checks[pairKey] ?? null : null} onClose={() => setMeasure(null)} onSaved={reloadChecks} />
      <MoMultiPickerModal open={moPick} onClose={() => setMoPick(false)} single scope="history" title="เลือกใบสั่งผลิตเก่าที่จะก๊อปชิ้นตัด" confirmLabel="ใช้ใบนี้"
        onConfirm={(rows) => { setMoPick(false); if (rows[0]) void loadMo(rows[0].mo_no); }} />
    </div>
  );
}

/** วิธีใช้ส่วน "ชิ้นตัด" (เจ้าของขอ 2026-11-13 "ทำเลยมีวิธีใช้ด้วยนะ") */
function HowTo({ onClose }: { onClose: () => void }) {
  const Step = ({ n, t, children }: { n: number; t: string; children: ReactNode }) => (
    <li className="flex gap-2"><span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-bold text-white">{n}</span><div><b className="text-slate-800">{t}</b><div className="text-slate-600">{children}</div></div></li>
  );
  return (
    <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3 text-[12.5px] leading-relaxed">
      <div className="mb-2 flex items-center gap-2"><Icon name="guide" /><b className="text-slate-800">วิธีใส่ชิ้นตัด</b><button type="button" onClick={onClose} className="ml-auto text-[12px] text-slate-500 hover:underline">ปิด</button></div>
      <ol className="grid gap-2.5 md:grid-cols-2">
        <Step n={1} t="พิมพ์เอง">ใส่ชื่อชิ้น · กว้าง × ยาว (ซม.) · ชิ้นต่อใบ ในตาราง · กด “เพิ่มชิ้น” ได้เรื่อย ๆ · ก๊อปแถวด้วยปุ่มข้างหลัง</Step>
        <Step n={2} t="ดึงจากสูตร BOM">เลือกสินค้า → เลือกผ้าในสูตร → ได้ชิ้นตัดพร้อมเลือกผ้าให้ · ขนาดไม่ตรง กด “แก้สูตร BOM นี้” แก้แล้วบันทึก ระบบดึงใหม่ให้ · ตั้ง “ชื่อชิ้น” ในสูตรได้ (ช่องใหม่) จะโชว์ในผังและใบวิธีตัด</Step>
        <Step n={3} t="ก๊อปจากใบสั่งผลิตเก่า">เลือกใบที่เคยผลิต (รวมใบที่ปิดแล้ว) → เลือกผ้า → ได้ชิ้นต่อใบจากผังที่ระบบเคยวางไว้</Step>
        <Step n={4} t="ปรับทรงรายแถว">กดปุ่ม “ปรับทรง” (รูปเล็กหลังชื่อ) → ตัววาดเปิดพร้อมแก้จุดทันที (ลูกศรขาว A): ลากจุด · ลากกรอบที่ว่างเลือกหลายจุด · Delete ลบจุด · ลูกศรคีย์บอร์ดขยับ · คลิกจุดมุมแล้วลากวงกลม ◉ เข้าด้านใน = มุมโค้ง (บอก R:) · ปุ่ม + เพิ่มจุดบนเส้น · − ลบจุด · Shift+C แปลงมุม↔โค้ง → “ใช้ขนาดนี้” · รูปเล็กหลังชื่อเปลี่ยนตามทรงจริง</Step>
        <Step n={5} t="วาดชิ้นทรงพิเศษ">วาดชิ้นใหม่ทั้งหมด (สี่เหลี่ยม วงกลม ปากกาโค้ง วางจาก Illustrator) · ตั้งชื่อและจำนวนต่อใบในแผงด้านขวาของชิ้น</Step>
        <Step n={6} t="ถ่ายรูปแบบกระดาษ">วางแพทเทิร์นกระดาษบน <b>พื้นสีตัดกัน</b> ถ่าย <b>ตรงจากด้านบน</b> ไม่มีเงาพาด · ใส่ A4 ไว้ในรูป → คลิก 4 มุม A4 แก้รูปเอียง (หรือบอกความกว้างจริงของชิ้นที่กว้างสุด) → ติ๊กชิ้นที่เอา → ระบบเปิดตัววาดให้ <b>ตรวจขนาด/เกลาเส้น/ตั้งเผื่อเย็บ</b> ก่อนใช้ · ลอกในเครื่อง ไม่ใช้ AI ไม่เสียเงิน</Step>
        <Step n={7} t="ห้ามหมุน · ตรงลาย">ผ้าลาย/มีขน ติ๊ก “ห้ามหมุน” รายชิ้น · ผ้าที่ต้องตรงลาย ใส่ “ลายซ้ำ (ซม.)” แล้วติ๊ก “ตรงลาย” ที่ชิ้น</Step>
        <Step n={8} t="วัดจริงแล้ว = พิสูจน์แล้ว">ตัดจริงแล้วกด “บันทึกผลวัดจริง” (ใส่ใบสั่งผลิต · ตัดกี่ใบ · ใช้ผ้าจริงเท่าไร) → ป้ายเปลี่ยนเป็นเขียว และใบวิธีตัดขึ้นตรา “พิสูจน์แล้ว”</Step>
      </ol>
      <p className="mt-2 text-[11.5px] text-slate-500">ชิ้นทรงพิเศษ: ผังด้านล่างวางเป็นกรอบสี่เหลี่ยม · กด “วางตามรูปจริง” ในผลคำนวณ ระบบใช้ตัวเลขรูปจริงเฉพาะตอนที่ประหยัดกว่า</p>
    </div>
  );
}
