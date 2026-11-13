"use client";

/**
 * คิดผ้าก่อนซื้อ — โหมด "ทั้งตระกูล แบ่งตามสี" (เฟส 2 · เจ้าของเลือก 2026-11-13)
 *   เลือก Parent SKU → SKU ลูก (สี) + สูตรของแต่ละสี (/api/parent-skus/[id]/production) → ใส่จำนวนต่อสี
 *   → ดึงชิ้นตัดของแต่ละสูตร (/api/bom/[id]) → รวมผ้าตัวเดียวกันข้ามสี (mergeFamilyFabrics) → คิดทีละผ้า (calcFabricBuy · ค่าตั้งชุดเดียวกับโหมดผ้าเดียว)
 *   สรุปตารางทุกผ้า · กดแถว = แก้หน้ากว้าง/ราคา/ตรงลาย + ผังการวาง + เปิดแก้ละเอียดในโหมดผ้าเดียว · ใส่ตะกร้าทุกผ้าที่ขาด · พิมพ์ทุกผ้า
 *   รอบ 3: ราคา/ค่าผ้าทั้งงานในตาราง · ป้ายวัดจริงรายสี (cut-check) · ปุ่มแก้สูตรรายสี (BomEditorModal → โหลดใหม่) · พิมพ์วิธีตัดรายผ้า/ทุกผ้า (lib/fabric-cut-sheet)
 * ของกลาง: ParentSkuPicker · MiniTable · FabricLayoutPreview · BomEditorModal · addToPrCart · renderFabricBuyFamilyHtml · lib/fabric-buy · lib/fabric-cut-sheet
 */
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { ParentSkuPicker, type ParentSkuPickerValue } from "@/components/pickers";
import { FabricLayoutPreview } from "@/components/design-sheet-detail/fabric-layout-preview";
import { printReportHtmlInNewWindow } from "@/components/report";
import { BomEditorModal } from "@/components/bom-editor-modal";
import { pieceLegend, pieceNumbers, planCutMarkers, renderCutSheetHtml, type CutSheetInput } from "@/lib/fabric-cut-sheet";
import { addToPrCart } from "@/lib/pr-cart";
import type { BomComponent } from "@/components/material-picker";
import { adjustedPieces, calcFabricBuy, convertLength, cutCheckState, mergeFamilyFabrics, piecesFingerprint, unitFromUomName, type BuyInput, type BuyPiece, type BuyResult, type FamilyColor, type FamilyFabric, type FamilyLine } from "@/lib/fabric-buy";
import { renderFabricBuyFamilyHtml } from "@/lib/fabric-buy-print";
import { Card, Num, fmt, unitComparable, type FabricSettings } from "./buy-ui";
import { CutStatusBadge, MeasureModal, useCutChecks, type MeasureTarget } from "./cut-check";

/** สิ่งที่บันทึก/เปิดกลับได้ของโหมดนี้ */
export type FamilyState = {
  parent: ParentSkuPickerValue | null;
  qty: Record<string, number>;                                            // รหัส SKU ลูก → จำนวน
  over: Record<string, { face?: number; price?: number; match?: boolean }>;   // รหัสผ้า → ค่าที่ผู้ใช้แก้เอง
};
export const emptyFamily = (): FamilyState => ({ parent: null, qty: {}, over: {} });

/** ส่งผ้า 1 ตัวไปแก้ละเอียดในโหมดผ้าเดียว */
export type OpenSingleArgs = { fabric: BomComponent | null; pieces: BuyPiece[]; qty: number; face: number; form: "roll" | "sheet"; sheetLen: number; price: number; source: string;
  /** ผ้านี้ใช้สีเดียว → ส่งสินค้า+ผ้าไปด้วย (ไว้ผูกผลวัดจริงในโหมดผ้าเดียว) */
  origin?: { product_sku: string; component_sku: string } | null };
/** ตัวเลขสรุปไว้บันทึก */
export type FamilySummary = { fabrics: number; qty: number; cost_buy: number; short: number };

type ProdSku = { id: string; code: string; name: string | null; color: string | null; is_active: boolean };
type ProdBom = { id: string; bom_code: string; product_sku: string; is_default: boolean; updated_at: string | null; status?: string | null; version?: string | number | null };
type ColorRow = { code: string; name: string | null; color: string | null; bom: ProdBom | null; lines: FamilyLine[] | null; err?: string };
type FabInfo = { face: number; sheetW: number; sheetL: number; supply: string | null; uom: string | null };
type Row = { f: FamilyFabric; comp: BomComponent | null; input: BuyInput; res: BuyResult; label: string };

const pickBom = (bs: ProdBom[]): ProdBom | null =>
  bs.find((b) => b.is_default) ?? [...bs].sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")))[0] ?? null;

export function FamilyCalc({ settings, initial, onState, onSummary, onOpenSingle }: {
  settings: FabricSettings;
  initial: FamilyState;
  onState: (s: FamilyState) => void;
  onSummary: (s: FamilySummary) => void;
  onOpenSingle: (a: OpenSingleArgs) => void;
}) {
  const toast = useToast();
  const [parent, setParent] = useState<ParentSkuPickerValue | null>(initial.parent);
  const [qty, setQty] = useState<Record<string, number>>(initial.qty);
  const [over, setOver] = useState<FamilyState["over"]>(initial.over);
  const [colors, setColors] = useState<ColorRow[] | null>(null);
  const [info, setInfo] = useState<Record<string, FabInfo>>({});
  const [comps, setComps] = useState<Record<string, BomComponent>>({});
  const [stock, setStock] = useState<Record<string, number>>({});   // sku_id → คงเหลือ (หน่วย SKU)
  const [busy, setBusy] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [allQty, setAllQty] = useState(0);
  const [bomEdit, setBomEdit] = useState<string | null>(null);   // รหัสสีที่เปิดตัวทำสูตรอยู่
  const [reloadKey, setReloadKey] = useState(0);                 // บันทึกสูตรแล้ว → โหลดสูตรทุกสีใหม่ (จำนวนต่อสีคงเดิม)
  const [measure, setMeasure] = useState<MeasureTarget | null>(null);

  useEffect(() => { onState({ parent, qty, over }); }, [parent, qty, over, onState]);

  // โหลดสี + สูตร + ชิ้นตัด + ข้อมูลผ้า + ราคา + สต็อก เมื่อเปลี่ยน Parent
  const loadSeq = useRef(0);
  useEffect(() => {
    setColors(null); setInfo({}); setComps({}); setStock({}); setOpen(new Set());
    if (!parent?.id) return;
    const seq = ++loadSeq.current;
    const alive = () => seq === loadSeq.current;
    (async () => {
      try {
        setBusy("กำลังโหลดสีและสูตร…");
        const j = await apiFetch(`/api/parent-skus/${encodeURIComponent(parent.id)}/production`).then((r) => r.json());
        if (!alive()) return;
        if (j.error) throw new Error(j.error);
        const skus = ((j.skus ?? []) as ProdSku[]).filter((s) => s.is_active !== false);
        const boms = (j.boms ?? []) as ProdBom[];
        const rows: ColorRow[] = skus.map((s) => ({ code: s.code, name: s.name, color: s.color, bom: pickBom(boms.filter((b) => b.product_sku === s.code)), lines: null }));
        setColors(rows);
        setBusy("กำลังดึงชิ้นตัดจากสูตรแต่ละสี…");
        const fabInfo: Record<string, FabInfo> = {};
        const done = await Promise.all(rows.map(async (r): Promise<ColorRow> => {
          if (!r.bom) return { ...r, lines: [] };
          try {
            const d = await apiFetch(`/api/bom/${encodeURIComponent(r.bom.id)}`).then((x) => x.json());
            const raw = (d.data?.lines ?? []) as Record<string, unknown>[];
            const lines: FamilyLine[] = [];
            for (const l of raw) {
              const w = Number(l.cut_width) || 0, h = Number(l.cut_length) || 0;
              if (!(w > 0 && h > 0)) continue;
              const sku = String(l.component_sku ?? "") || "(ไม่ระบุรหัส)";
              lines.push({ component_sku: sku, component_name: (l.component_name as string) ?? null, label: String(l.piece_name ?? "") || String(l.cut_block_code ?? "") || `${w}×${h}`, width_cm: w, length_cm: h, per_unit: Number(l.pieces) || 1, no_rotate: !!l.no_rotate });
              if (!fabInfo[sku]) fabInfo[sku] = { face: Number(l.face_width_cm) || 0, sheetW: Number(l.sheet_width) || 0, sheetL: Number(l.sheet_length) || 0, supply: (l.supply_form as string) ?? null, uom: (l.uom as string) ?? null };
            }
            return { ...r, lines };
          } catch { return { ...r, lines: [], err: "โหลดสูตรไม่สำเร็จ" }; }
        }));
        if (!alive()) return;
        setColors(done); setInfo(fabInfo);
        // ข้อมูลผ้า (ราคา/หน่วย/รูป/id) ผ่านตัวค้นวัตถุดิบกลาง · สต็อกครั้งเดียวทุกผ้า
        setBusy("กำลังโหลดราคาและสต็อกผ้า…");
        const codes = Object.keys(fabInfo).filter((c) => !c.startsWith("("));
        const found: Record<string, BomComponent> = {};
        await Promise.all(codes.map(async (code) => {
          try {
            const c = await apiFetch(`/api/bom/components?search=${encodeURIComponent(code)}&limit=5`).then((x) => x.json());
            const hit = ((c.data ?? []) as BomComponent[]).find((x) => x.code === code);
            if (hit) found[code] = hit;
          } catch { /* ไม่เจอ = ไม่มีราคา/สต็อก */ }
        }));
        if (!alive()) return;
        setComps(found);
        const ids = Object.values(found).map((c) => c.id).filter(Boolean);
        if (ids.length) {
          const s = await apiFetch(`/api/inventory/sku-stock?ids=${ids.map(encodeURIComponent).join(",")}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
          if (alive() && s?.data) setStock(Object.fromEntries((s.data as { sku_id: string; qty_on_hand: number }[]).map((x) => [x.sku_id, Number(x.qty_on_hand) || 0])));
        }
      } catch (e) {
        if (alive()) toast.error(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง");
      } finally { if (alive()) setBusy(""); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parent?.id, reloadKey]);   // toast ไม่ใส่ (กันโหลดซ้ำถ้าตัวแจ้งเตือนเปลี่ยนตัว)

  // ── คำนวณ ──
  const dQty = useDeferredValue(qty), dOver = useDeferredValue(over), dSet = useDeferredValue(settings);
  const rows: Row[] = useMemo(() => {
    if (!colors) return [];
    const fc: FamilyColor[] = colors.map((c) => ({ sku: c.code, color: c.color || c.code, qty: dQty[c.code] ?? 0, lines: c.lines ?? [] }));
    return mergeFamilyFabrics(fc).map((f) => {
      const comp = comps[f.sku] ?? null, inf = info[f.sku], o = dOver[f.sku] ?? {};
      const sheet = comp?.supply_form === "sheet" || inf?.supply === "sheet" || (!(inf?.face || comp?.fabric_width_cm) && (inf?.sheetW ?? 0) > 0 && (inf?.sheetL ?? 0) > 0);
      const form: "roll" | "sheet" = sheet ? "sheet" : "roll";
      const face = o.face ?? (sheet ? (inf?.sheetW || Number(comp?.sheet_width_cm) || 0) : (inf?.face || Number(comp?.fabric_width_cm) || 0));
      const uomName = comp?.uom_name ?? inf?.uom ?? null;
      const okUnit = unitComparable(uomName, form);
      const stUnit = unitFromUomName(uomName);
      const raw = comp?.id ? stock[comp.id] : undefined;
      const st = raw == null || !okUnit ? 0 : form === "roll" && stUnit ? convertLength(raw, stUnit, dSet.unit) : raw;
      const basePrice = Number(comp?.standard_price) > 0 && okUnit ? (form === "roll" && stUnit ? Number(comp!.standard_price) * (stUnit === dSet.unit ? 1 : dSet.unit === "m" ? 100 / 91.44 : 91.44 / 100) : Number(comp!.standard_price)) : 0;
      const pieces = o.match ? f.pieces.map((p) => ({ ...p, match: true })) : f.pieces;
      const input: BuyInput = {
        pieces, qty: f.qty, face_width_cm: face, trim_cm: sheet ? 0 : dSet.trim, form, sheet_length_cm: inf?.sheetL || Number(comp?.sheet_length_cm) || 0,
        allow_rotate: dSet.rotate, gap_cm: dSet.gap, waste_pct: dSet.waste, shrink_pct: dSet.shrink, repeat_cm: dSet.repeat,
        unit: dSet.unit, round: dSet.round, roll_length: dSet.rollLen, price: o.price ?? basePrice, stock: st,
      };
      return { f, comp, input, res: calcFabricBuy(input), label: comp ? `[${comp.code}] ${comp.name}` : (f.name ? `[${f.sku}] ${f.name}` : f.sku) };
    });
  }, [colors, comps, info, stock, dQty, dOver, dSet]);

  const totalQty = Object.values(qty).reduce((s, n) => s + (Number(n) || 0), 0);
  // วัตถุดิบที่ไม่มีหน้ากว้าง (ซิป/เทปที่สูตรใส่ความยาวไว้ · ข้อมูลจริง PIX21 มี 6 ตัว) — แยกไว้ ไม่ปนในตาราง/สรุป (กดแสดงได้)
  const [showNoFace, setShowNoFace] = useState(false);
  const noFace = rows.filter((r) => !(r.input.face_width_cm > 0));
  const shown = showNoFace ? rows : rows.filter((r) => r.input.face_width_cm > 0);
  const shorts = rows.filter((r) => r.res.ok && r.res.to_buy > 0);
  const totalBuy = rows.reduce((s, r) => s + (r.res.cost_buy ?? 0), 0);
  useEffect(() => { onSummary({ fabrics: rows.length - noFace.length, qty: totalQty, cost_buy: Math.round(totalBuy), short: shorts.length }); }, [rows.length, noFace.length, totalQty, totalBuy, shorts.length, onSummary]);

  const setOv = (sku: string, p: Partial<{ face: number; price: number; match: boolean }>) => setOver((prev) => ({ ...prev, [sku]: { ...prev[sku], ...p } }));
  const totalCost = rows.reduce((s, r) => s + (r.res.cost_total ?? 0), 0);

  // ── สถานะวัดจริง: ต่อ "สี + ผ้า" (ชิ้นของสีนั้นตอนนี้ เทียบลายนิ้วมือ) ──
  const colorFabric = useMemo(() => {
    const out: Record<string, { code: string; color: string; fp: string }[]> = {};
    for (const c of colors ?? []) {
      if (!((qty[c.code] ?? 0) > 0)) continue;
      const bySku = new Map<string, FamilyLine[]>();
      for (const l of c.lines ?? []) bySku.set(l.component_sku, [...(bySku.get(l.component_sku) ?? []), l]);
      for (const [sku, ls] of bySku) (out[sku] ??= []).push({ code: c.code, color: c.color || c.code, fp: piecesFingerprint(ls) });
    }
    return out;
  }, [colors, qty]);
  const pairs = useMemo(() => Object.entries(colorFabric).flatMap(([sku, cs]) => cs.map((c) => `${c.code}|${sku}`)), [colorFabric]);
  const { checks, reload: reloadChecks } = useCutChecks(pairs);
  const fabricState = (sku: string) => {
    const cs = colorFabric[sku] ?? [];
    const each = cs.map((c) => ({ ...c, st: cutCheckState(checks[`${c.code}|${sku}`], c.fp) }));
    const done = each.filter((e) => e.st.state === "measured").length;
    return { each, done, total: each.length, all: each.length > 0 && done === each.length };
  };
  const parentLabel = parent ? `[${parent.code}] ${parent.name}` : "";

  const addAllCart = () => {
    if (!shorts.length) { toast.success(rows.length ? "สต็อกพอทุกผ้าแล้ว ไม่ต้องซื้อเพิ่ม" : "ยังไม่มีผ้าให้คิด — ใส่จำนวนต่อสีก่อน"); return; }
    const colorTxt = (colors ?? []).filter((c) => (qty[c.code] ?? 0) > 0).map((c) => `${c.color || c.code} ${fmt(qty[c.code], 0)}`).join(", ");
    const n = addToPrCart(shorts.map((r) => ({
      label: r.label, qty: r.res.to_buy, uom: r.res.unit_label, seller: "", price: Number(r.input.price) || 0, currency: "THB",
      image: r.comp?.image_key ? `/api/r2-image?key=${encodeURIComponent(r.comp.image_key)}` : null,
      variationId: null, skuRef: r.comp?.code ?? (r.f.sku.startsWith("(") ? null : r.f.sku), skuId: r.comp?.id ?? null,
      note: `คิดผ้าก่อนซื้อ (ทั้งตระกูล ${parentLabel}): ${colorTxt} · ต้องใช้ ${fmt(r.res.need)} ${r.res.unit_label} มี ${fmt(r.res.stock)}`,
      reason: "คิดผ้าก่อนซื้อ",
    })));
    toast.success(`ใส่ตะกร้าขอซื้อแล้ว ${shorts.length} ผ้า (ตะกร้ามี ${n} รายการ) — ไปกดยืนยันที่หน้า “ขอซื้อ”`);
  };
  // ใบวิธีตัด (ทีละผ้า หรือทุกผ้าในไฟล์เดียว)
  const cutSection = (r: Row, date: string): CutSheetInput => {
    const adj = adjustedPieces(r.input);
    const usable = r.res.usable_width_cm;
    const st = fabricState(r.f.sku);
    return {
      title: "ใบวิธีตัด", date, fabric_name: r.label, product_label: `${parentLabel} · สี ${r.f.colors.join(", ")}`,
      face_full_cm: r.input.face_width_cm, usable_cm: usable, sheet_length_cm: r.input.form === "sheet" ? Number(r.input.sheet_length_cm) || null : null,
      qty: r.f.qty, legend: pieceLegend(adj, r.f.qty),
      plan: planCutMarkers({ pieces: adj, qty: r.f.qty, faceWidthCm: usable, sheetLengthCm: r.input.form === "sheet" ? Number(r.input.sheet_length_cm) || null : null, allowRotate: settings.rotate, gapCm: settings.gap }),
      waste_pct: settings.waste, unit_label: r.res.unit_label,
      status: { measured: st.all, text: st.all ? (st.total > 1 ? `วัดจริงครบ ${st.total} สี` : st.each[0]?.st.detail ?? "") : st.done > 0 ? `วัดแล้ว ${st.done}/${st.total} สี` : "" },
    };
  };
  const printCut = (only?: Row) => {
    const list = only ? [only] : rows.filter((r) => r.res.ok && r.input.face_width_cm > 0);
    if (!list.length) { toast.error("ยังไม่มีผ้าให้พิมพ์ — ใส่จำนวนต่อสีก่อน"); return; }
    const date = new Date().toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
    printReportHtmlInNewWindow(renderCutSheetHtml(`วิธีตัด ${parent?.code ?? ""}`.trim(), list.map((r) => cutSection(r, date))));
  };
  const unitCm = settings.unit === "m" ? 100 : 91.44;
  const estPerUnit = (r: Row) => r.input.form === "sheet" ? (r.res.layout?.sheetsUsed ?? 0) / Math.max(1, r.f.qty) : r.res.used_length_cm / Math.max(1, r.f.qty) / unitCm;

  const printAll = () => {
    if (!rows.length) { toast.error("ยังไม่มีผ้าให้พิมพ์ — ใส่จำนวนต่อสีก่อน"); return; }
    const date = new Date().toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
    printReportHtmlInNewWindow(renderFabricBuyFamilyHtml(rows.filter((r) => r.input.face_width_cm > 0).map((r) => ({ input: r.input, res: r.res, fabric_name: r.label, colors: r.f.colors })), {
      title: `คิดผ้าก่อนซื้อ ${parent?.code ?? ""}`.trim(), date, parent_label: parentLabel,
      colors: (colors ?? []).map((c) => ({ label: c.color || c.code, qty: qty[c.code] ?? 0 })),
    }));
  };

  const colorCols: MiniColumn<ColorRow>[] = [
    { key: "c", header: "สี (SKU ลูก)", width: "1.6fr", cell: (c) => <span><b className="font-medium text-slate-700">{c.color || "-"}</b> <span className="text-[12px] text-slate-400">{c.code}</span></span> },
    { key: "b", header: "สูตร", width: "1.4fr", cell: (c) => !c.bom ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">ไม่มีสูตร</span>
      : c.err ? <span className="text-[11px] text-rose-600">{c.err}</span>
      : c.lines === null ? <span className="text-[11px] text-slate-400">กำลังโหลด…</span>
      : c.lines.length === 0 ? <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">{c.bom.bom_code} · ไม่มีขนาดชิ้นตัด</span>
      : <span className="text-[12px] text-emerald-700">{c.bom.bom_code} · {new Set(c.lines.map((l) => l.component_sku)).size} ผ้า</span> },
    { key: "e", header: "", width: "5.5rem", align: "right", cell: (c) => c.bom
      ? <button type="button" onClick={() => setBomEdit(c.code)} className="h-7 rounded-lg border border-amber-300 bg-amber-50 px-2 text-[11.5px] text-amber-800 hover:bg-amber-100" title="ขนาดชิ้นไม่ตรง → แก้สูตรของสีนี้ (บันทึกแล้วโหลดใหม่ให้)">แก้สูตร</button>
      : <button type="button" onClick={() => setBomEdit(c.code)} className="h-7 rounded-lg border border-slate-200 px-2 text-[11.5px] text-slate-600 hover:bg-slate-50" title="สร้างสูตรให้สีนี้">สร้างสูตร</button> },
    { key: "q", header: "จำนวน (ใบ)", width: "8rem", align: "right", cell: (c) => (c.lines?.length ?? 0) > 0
      ? <Num small value={qty[c.code] ?? 0} onChange={(v) => setQty((p) => ({ ...p, [c.code]: Math.floor(v) }))} />
      : <span className="text-[11px] text-slate-300">—</span> },
  ];

  const resCols: MiniColumn<Row>[] = [
    { key: "f", header: "ผ้า", width: "2fr", cell: (r) => <span className="block truncate font-medium text-slate-700" title={r.label}>{r.label}</span> },
    { key: "c", header: "ใช้ในสี", width: "1.2fr", cell: (r) => <span className="block truncate text-[12px] text-slate-500" title={r.f.colors.join(", ")}>{r.f.colors.join(", ")}</span> },
    { key: "q", header: "ใบ", width: "0.7fr", align: "right", cell: (r) => fmt(r.f.qty, 0) },
    { key: "w", header: "หน้ากว้าง", width: "0.9fr", align: "right", cell: (r) => r.input.face_width_cm > 0 ? `${fmt(r.input.face_width_cm, 1)}` : <span className="text-rose-600">ไม่รู้</span> },
    { key: "n", header: "ต้องใช้", width: "1fr", align: "right", cell: (r) => r.res.ok ? `${fmt(r.res.need)} ${r.res.unit_label}` : <span className="text-[11px] text-rose-600">{r.res.error}</span> },
    { key: "r", header: "ควรซื้อ", width: "1fr", align: "right", cell: (r) => r.res.ok ? `${fmt(r.res.need_rounded)}${r.res.rolls ? ` (${r.res.rolls} ม้วน)` : ""}` : "" },
    { key: "s", header: "สต็อก", width: "0.8fr", align: "right", cell: (r) => r.res.ok ? fmt(r.res.stock) : "" },
    { key: "b", header: "ต้องซื้อเพิ่ม", width: "1fr", align: "right", cell: (r) => !r.res.ok ? "" : r.res.to_buy > 0 ? <b className="text-rose-700">{fmt(r.res.to_buy)} {r.res.unit_label}</b> : <span className="text-emerald-700">พอ</span> },
    { key: "p", header: "ราคา", width: "0.9fr", align: "right", cell: (r) => Number(r.input.price) > 0 ? <span title={`ค่าผ้าทั้งงาน ฿${fmt(r.res.cost_total ?? 0, 0)}`}>฿{fmt(Number(r.input.price))}<span className="text-[10.5px] text-slate-400">/{r.res.unit_label}</span></span> : <span className="text-slate-300">ใส่ราคา</span> },
    { key: "$", header: "งบซื้อเพิ่ม", width: "0.9fr", align: "right", cell: (r) => r.res.cost_buy != null ? `฿${fmt(r.res.cost_buy, 0)}` : <span className="text-slate-300">—</span> },
    { key: "st", header: "สถานะ", width: "1.1fr", cell: (r) => { const st = fabricState(r.f.sku); return st.total === 0 ? null : <CutStatusBadge size="sm" st={st.all ? { state: "measured", label: "", detail: "", check: null } : { state: "none", label: "", detail: "", check: null }} hint={st.all ? undefined : `วัดแล้ว ${st.done}/${st.total} สี`} />; } },
  ];

  const expanded = (r: Row) => {
    const o = over[r.f.sku] ?? {};
    return (
      <div className="space-y-2 bg-indigo-50/30 p-3">
        <div className="flex flex-wrap items-end gap-3 text-[12px]">
          <label className="block"><span className="mb-0.5 block text-[11px] text-slate-500">{r.input.form === "sheet" ? "ผืนกว้าง (ซม.)" : "หน้ากว้างเต็ม (ซม.)"}</span><Num small value={r.input.face_width_cm} onChange={(v) => setOv(r.f.sku, { face: v })} /></label>
          <label className="block"><span className="mb-0.5 block text-[11px] text-slate-500">ราคา / {r.res.unit_label} (บาท)</span><Num small value={Number(r.input.price) || 0} onChange={(v) => setOv(r.f.sku, { price: v })} /></label>
          {settings.repeat > 0 && <label className="inline-flex h-8 items-center gap-1.5"><input type="checkbox" checked={!!o.match} onChange={(e) => setOv(r.f.sku, { match: e.target.checked })} /> ทุกชิ้นของผ้านี้ต้องตรงลาย ({fmt(settings.repeat, 1)} ซม.)</label>}
          {(o.face != null || o.price != null || o.match) && <button type="button" onClick={() => setOver((p) => { const n = { ...p }; delete n[r.f.sku]; return n; })} className="h-8 rounded-lg px-2 text-slate-500 hover:bg-slate-100">คืนค่าจากระบบ</button>}
          <button type="button" onClick={() => printCut(r)} className="ml-auto inline-flex h-8 items-center gap-1 rounded-lg border border-indigo-200 bg-white px-3 text-indigo-700 hover:bg-indigo-50"><Icon name="cut" /> พิมพ์วิธีตัดผ้านี้</button>
          <button type="button" onClick={() => { const cs = colorFabric[r.f.sku] ?? []; onOpenSingle({ fabric: r.comp, pieces: r.input.pieces, qty: r.f.qty, face: r.input.face_width_cm, form: r.input.form ?? "roll", sheetLen: Number(r.input.sheet_length_cm) || 0, price: Number(r.input.price) || 0, source: `ทั้งตระกูล ${parentLabel} · ${r.f.colors.join(", ")}`, origin: cs.length === 1 && !r.f.sku.startsWith("(") ? { product_sku: cs[0].code, component_sku: r.f.sku } : null }); }}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-indigo-200 bg-white px-3 text-indigo-700 hover:bg-indigo-50"><Icon name="open" /> เปิดแก้ละเอียด (โหมดผ้าเดียว)</button>
        </div>
        <div className="text-[12px] text-slate-500">ชิ้นตัด: {r.f.pieces.map((p) => `${p.label} ${fmt(p.width_cm, 1)}×${fmt(p.length_cm, 1)} ×${fmt(p.total ?? 0, 0)}`).join(" · ")}</div>
        {!r.f.sku.startsWith("(") && (fabricState(r.f.sku).each.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-2 py-1.5 text-[12px]">
            <span className="text-slate-500">ผลวัดจริงรายสี:</span>
            {fabricState(r.f.sku).each.map((e) => (
              <span key={e.code} className="inline-flex items-center gap-1">
                <b className="font-medium text-slate-700">{e.color}</b> <CutStatusBadge size="sm" st={e.st} />
                <button type="button" onClick={() => setMeasure({ product_sku: e.code, component_sku: r.f.sku, label: `${e.code} (${e.color}) · ${r.label}`, fp: e.fp, unit: r.res.unit_label, est_per_unit: estPerUnit(r), qty: qty[e.code] ?? 0 })}
                  className="rounded px-1.5 py-0.5 text-emerald-700 underline hover:bg-emerald-50">{e.st.state === "measured" ? "วัดใหม่" : "บันทึกผลวัด"}</button>
              </span>
            ))}
          </div>
        )}
        {r.res.ok && r.res.layout && <FabricLayoutPreview result={r.res.layout} faceWidthCm={r.res.usable_width_cm} sheetLengthCm={r.input.form === "sheet" ? Number(r.input.sheet_length_cm) || null : null} mode={r.input.form ?? "roll"} numbers={pieceNumbers(adjustedPieces(r.input))} />}
      </div>
    );
  };

  const usable = (colors ?? []).filter((c) => (c.lines?.length ?? 0) > 0);
  return (
    <div className="space-y-4">
      <Card title="1. เลือกสินค้าแม่ (Parent SKU) + ใส่จำนวนต่อสี" tag="need" right={busy && <span className="text-[12px] text-slate-500">{busy}</span>}>
        <div className="mb-3 max-w-md"><ParentSkuPicker value={parent} onChange={(v) => { setParent(v); setQty({}); setOver({}); }} placeholder="ค้นรหัส / ชื่อสินค้าแม่..." disableCreate /></div>
        {!parent ? <div className="text-[12px] text-slate-400">เลือกสินค้าแม่ ระบบจะดึงทุกสีพร้อมสูตรให้ แล้วรวมผ้าที่ต้องซื้อทั้งตระกูล</div>
          : colors === null ? <div className="text-[12px] text-slate-500">กำลังโหลด…</div>
          : colors.length === 0 ? <div className="text-[12px] text-amber-700">สินค้าแม่นี้ยังไม่มี SKU ลูก</div>
          : <>
              {usable.length > 1 && (
                <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
                  ใส่เท่ากันทุกสีที่มีสูตร <Num small value={allQty} onChange={setAllQty} />
                  <button type="button" onClick={() => setQty((p) => ({ ...p, ...Object.fromEntries(usable.map((c) => [c.code, Math.floor(allQty)])) }))} className="h-8 rounded-lg border border-slate-200 bg-white px-3 hover:border-indigo-300">ใส่ให้ทุกสี</button>
                </div>
              )}
              <MiniTable rows={colors} columns={colorCols} rowKey={(c) => c.code} hideToolbar dense zebra={false} />
              <div className="mt-2 text-[12px] text-slate-500">รวม <b className="text-slate-700">{fmt(totalQty, 0)}</b> ใบ · สีที่ไม่มีสูตร/ไม่มีขนาดชิ้นตัด ไม่นับรวม (ไปใส่ขนาดชิ้นในสูตร BOM ก่อน)</div>
            </>}
      </Card>

      <section className="rounded-2xl border-2 border-indigo-300 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="flex items-center gap-2 text-base font-bold text-indigo-700"><Icon name="calc" /> ผ้าที่ต้องซื้อทั้งตระกูล</h2>
          {rows.length > 0 && <span className="text-[12px] text-slate-500">{rows.length - noFace.length} ผ้า · ขาด {shorts.length} ผ้า · ค่าผ้าทั้งงาน ฿{fmt(totalCost, 0)} · งบซื้อเพิ่มรวม <b className="text-slate-700">฿{fmt(totalBuy, 0)}</b></span>}
          <span className="ml-auto flex flex-wrap gap-2">
            <button type="button" onClick={addAllCart} className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 bg-white px-3 text-[12px] text-rose-700 hover:bg-rose-50"><Icon name="cart" /> ใส่ตะกร้าทุกผ้าที่ขาด{shorts.length ? ` (${shorts.length})` : ""}</button>
            <button type="button" onClick={printAll} className="inline-flex h-8 items-center gap-1 rounded-lg border border-indigo-200 bg-white px-3 text-[12px] text-indigo-700 hover:bg-indigo-50"><Icon name="print" /> พิมพ์สรุปทุกผ้า</button>
            <button type="button" onClick={() => printCut()} className="inline-flex h-8 items-center gap-1 rounded-lg bg-indigo-600 px-3 text-[12px] font-medium text-white hover:bg-indigo-700"><Icon name="cut" /> พิมพ์วิธีตัดทุกผ้า</button>
          </span>
        </div>
        {rows.length === 0
          ? <div className="rounded-xl bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">{parent ? "ใส่จำนวนต่อสีอย่างน้อย 1 สี" : "เลือกสินค้าแม่ก่อน"}</div>
          : <MiniTable rows={shown} columns={resCols} rowKey={(r) => r.f.sku} hideToolbar dense expandedKeys={open} renderExpanded={expanded}
              onRowClick={(r) => setOpen((s) => { const n = new Set(s); if (n.has(r.f.sku)) n.delete(r.f.sku); else n.add(r.f.sku); return n; })} />}
        {noFace.length > 0 && (
          <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
            มี {noFace.length} รายการที่ไม่มีหน้ากว้าง (เช่น ซิป/เทปที่สูตรใส่ความยาวไว้ — ไม่ใช่ผ้าวาง) ไม่นับในสรุป
            <button type="button" onClick={() => setShowNoFace((v) => !v)} className="ml-2 text-indigo-600 underline">{showNoFace ? "ซ่อน" : "แสดง"}</button>
            {showNoFace && <span className="mt-1 block">ถ้าเป็นผ้าจริง กดแถวแล้วใส่หน้ากว้าง (หรือไปใส่หน้ากว้างที่รหัสผ้านั้น)</span>}
          </div>
        )}
        <div className="mt-2 text-[11.5px] text-slate-400">กดแถว = แก้หน้ากว้าง/ราคา · ดูผังการวาง · เปิดแก้ละเอียด · ค่าตั้ง (ริม เผื่อเสีย หน่วย ปัดขึ้น ลายซ้ำ) ใช้ชุดด้านล่างกับทุกผ้า · ผ้าผืนไม่หักริม</div>
      </section>
      {bomEdit && <BomEditorModal sku={bomEdit} onClose={(changed) => { setBomEdit(null); if (changed) { setReloadKey((k) => k + 1); toast.success("บันทึกสูตรแล้ว — โหลดชิ้นตัดใหม่"); } }} />}
      <MeasureModal target={measure} current={measure ? checks[`${measure.product_sku}|${measure.component_sku}`] ?? null : null} onClose={() => setMeasure(null)} onSaved={reloadChecks} />
    </div>
  );
}
