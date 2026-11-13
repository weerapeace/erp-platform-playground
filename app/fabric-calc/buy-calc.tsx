"use client";

/**
 * คิดผ้าก่อนซื้อ — แท็บแรกของหน้า /fabric-calc (เจ้าของสั่ง 2026-11-13 · เลือกแบบจาก widget)
 *   ชิ้นตัด (พิมพ์เอง / ดึงจากสูตร BOM ของ SKU) × จำนวนผลิต → วางชิ้นบนผ้าจริง → ต้องใช้กี่หลา/เมตร/ผืน
 *   ตั้งค่าผ้า: หน้ากว้าง · หักริม · ม้วน/ผืน · ทางผ้า · หดตัว · เว้นระหว่างชิ้น · เผื่อเสีย · หน่วยซื้อ · ปัดขึ้น (หน่วย/ม้วน) · ราคา
 *   ผล: ต้องใช้ · ควรซื้อ · สต็อกมี · ต้องซื้อเพิ่ม · งบ · ผังการวาง · ทำไมเหลือเศษ · เทียบหลายหน้ากว้าง → ใส่ตะกร้าขอซื้อ · พิมพ์
 *   ไม่บันทึก (เฟส 2)
 * ของกลาง: calcFabricBuy/compareWidths (lib/fabric-buy → packFabric) · FabricLayoutPreview · ComponentPicker · SkuPicker · MiniTable · addToPrCart · renderFabricBuyHtml + printReportHtmlInNewWindow · useToast
 */
import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { ComponentPicker, type BomComponent } from "@/components/material-picker";
import { SkuPicker, type SkuPickerValue } from "@/components/pickers";
import { FabricLayoutPreview } from "@/components/design-sheet-detail/fabric-layout-preview";
import { printReportHtmlInNewWindow } from "@/components/report";
import { addToPrCart } from "@/lib/pr-cart";
import { calcFabricBuy, compareWidths, convertLength, unitFromUomName, type BuyInput, type BuyPiece, type BuyRound, type BuyUnit, type WidthCompareRow } from "@/lib/fabric-buy";
import { renderFabricBuyHtml } from "@/lib/fabric-buy-print";
import { YARD_CM } from "@/lib/fabric-calc";

const fmt = (n: number, d = 2) => (Math.round(n * 10 ** d) / 10 ** d).toLocaleString("th-TH", { maximumFractionDigits: d });
let _k = 0;
const newPiece = (p?: Partial<BuyPiece>): BuyPiece => ({ label: "", width_cm: 0, length_cm: 0, per_unit: 1, no_rotate: false, ...p, key: `p${_k++}` });   // key ใหม่เสมอ (ก๊อปชิ้น = แถวใหม่)
const QUICK_WIDTHS = [110, 137, 147, 150, 160];   // หน้ากว้างที่พบบ่อย (ซม.) — 137 ≈ 54" · 147 ≈ 58"

type BomHead = { id: string; bom_code: string; product_sku: string | null; product_name: string | null; version: string | number | null };
type BomLine = { component_sku?: string | null; component_name?: string | null; material_type?: string | null; cut_block_code?: string | null; cut_width?: number | null; cut_length?: number | null; pieces?: number | null; no_rotate?: boolean | null; face_width_cm?: number | null; size_variant?: boolean | null };
type BomFabric = { sku: string; name: string; type: string | null; lines: BomLine[] };

const boxCls = "h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm outline-none focus:border-indigo-400";
/** หน่วยของวัตถุดิบเทียบกับหน่วยซื้อได้ไหม — ม้วน: ต้องเป็นหลา/เมตร · ผืน: ไม่ใช่หน่วยพื้นที่/น้ำหนัก · ไม่มีหน่วย = ถือว่าได้ */
function unitComparable(uomName: string | null | undefined, form: "roll" | "sheet"): boolean {
  if (!uomName) return true;
  return form === "roll" ? unitFromUomName(uomName) != null : !/cm|m²|m2|ft|kg|ตร\./i.test(uomName);
}
const inputCls = `${boxCls} text-right`;   // ช่องตัวเลข
const textCls = `${boxCls} text-left`;     // ช่องข้อความ / ตัวเลือก

export function FabricBuyCalc() {
  const toast = useToast();
  // ── ชิ้นตัด ──
  const [pieces, setPieces] = useState<BuyPiece[]>([newPiece()]);
  const [source, setSource] = useState<string | null>(null);        // "สูตร BOM-XXX" — โชว์/พิมพ์ว่าชิ้นมาจากไหน
  const [bomSku, setBomSku] = useState<SkuPickerValue | null>(null);
  const [boms, setBoms] = useState<BomHead[] | null>(null);
  const [bomFabrics, setBomFabrics] = useState<BomFabric[] | null>(null);
  const [bomBusy, setBomBusy] = useState(false);
  const [showBom, setShowBom] = useState(false);
  // ── จำนวน + ผ้า ──
  const [qty, setQty] = useState(100);
  const [fabric, setFabric] = useState<BomComponent | null>(null);
  const [face, setFace] = useState(150);
  const [trim, setTrim] = useState(3);
  const [form, setForm] = useState<"roll" | "sheet">("roll");
  const [sheetLen, setSheetLen] = useState(0);
  const [rotate, setRotate] = useState(true);
  const [shrink, setShrink] = useState(0);
  // ── เผื่อ + หน่วยซื้อ ──
  const [gap, setGap] = useState(0);
  const [waste, setWaste] = useState(3);
  const [unit, setUnit] = useState<BuyUnit>("yd");
  const [round, setRound] = useState<BuyRound>("unit");
  const [rollLen, setRollLen] = useState(50);
  const [price, setPrice] = useState(0);
  // ── สต็อก (หน่วยของ SKU) ──
  const [stockRaw, setStockRaw] = useState<number | null>(null);
  const [stockErr, setStockErr] = useState("");
  // ── เทียบหน้ากว้าง ──
  const [widths, setWidths] = useState<{ key: string; face: number; price: number }[]>([]);

  // สต็อกในหน่วยที่เลือก (หลา ↔ เมตร แปลงให้ · ผืน/หน่วยอื่นใช้ตัวเลขตรง ๆ)
  const stockUnit = unitFromUomName(fabric?.uom_name);
  // หน่วยของ SKU เทียบกับหน่วยซื้อได้ไหม (ข้อมูลจริง 2026-11-13: วัตถุดิบตัดชิ้น 96 ตัวนับเป็น cm² · บางตัว kg) — เทียบไม่ได้ = ไม่หักสต็อก
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
    setBomSku(v); setBoms(null); setBomFabrics(null);
    if (!v) return;
    setBomBusy(true);
    try {
      const j = await apiFetch(`/api/bom?search=${encodeURIComponent(v.code)}&limit=50`).then((r) => r.json());
      const list = ((j.data ?? []) as BomHead[]).filter((b) => b.product_sku === v.code);
      setBoms(list);
      if (list.length === 1) await loadBom(list[0]);
    } catch { toast.error("โหลดสูตรไม่สำเร็จ ลองใหม่อีกครั้ง"); }
    finally { setBomBusy(false); }
  };
  const loadBom = async (b: BomHead) => {
    setBomBusy(true); setBomFabrics(null);
    try {
      const j = await apiFetch(`/api/bom/${encodeURIComponent(b.id)}`).then((r) => r.json());
      const lines = ((j.data?.lines ?? []) as BomLine[]).filter((l) => Number(l.cut_width) > 0 && Number(l.cut_length) > 0);
      const m = new Map<string, BomFabric>();
      for (const l of lines) {
        const sku = String(l.component_sku ?? "") || "(ไม่ระบุรหัส)";
        const f = m.get(sku) ?? { sku, name: String(l.component_name ?? sku), type: l.material_type ?? null, lines: [] };
        f.lines.push(l); m.set(sku, f);
      }
      setBomFabrics([...m.values()]);
      setShowBom(true);
      setSource(`สูตร ${b.bom_code}${b.version != null ? ` v${b.version}` : ""} (${b.product_sku ?? ""})`);
    } catch { toast.error("โหลดสูตรไม่สำเร็จ ลองใหม่อีกครั้ง"); }
    finally { setBomBusy(false); }
  };
  const useBomFabric = async (f: BomFabric) => {
    setPieces(f.lines.map((l) => newPiece({
      label: String(l.cut_block_code ?? "") || `${l.cut_width}×${l.cut_length}`,
      width_cm: Number(l.cut_width) || 0, length_cm: Number(l.cut_length) || 0,
      per_unit: Number(l.pieces) || 1, no_rotate: !!l.no_rotate,
    })));
    setSource((s) => `${s ?? "สูตร BOM"} · ${f.name}`);
    setShowBom(false);
    // ผ้าในสูตร → เลือกผ้าให้ด้วย (ได้หน้ากว้าง ราคา สต็อก) ผ่านตัวค้นวัตถุดิบกลางตัวเดียวกับ ComponentPicker
    if (f.sku && !f.sku.startsWith("(")) {
      try {
        const j = await apiFetch(`/api/bom/components?search=${encodeURIComponent(f.sku)}&limit=5`).then((r) => r.json());
        const hit = ((j.data ?? []) as BomComponent[]).find((c) => c.code === f.sku);
        if (hit) pickFabric(hit);
      } catch { /* ไม่เจอผ้า = ผู้ใช้เลือกเอง */ }
    }
    const sized = f.lines.some((l) => l.size_variant);
    toast.success(`ดึงชิ้นตัด ${f.lines.length} แบบจากสูตรแล้ว${sized ? " (บางชิ้นแยกไซส์ — ใช้ขนาดตั้งต้น)" : ""}`);
  };

  // ── คำนวณ (เลื่อนผลเล็กน้อยตอนพิมพ์รัว ๆ ไม่ให้หน้าค้าง) ──
  const input: BuyInput = useMemo(() => ({
    pieces, qty, face_width_cm: face, trim_cm: trim, form, sheet_length_cm: sheetLen, allow_rotate: rotate,
    gap_cm: gap, waste_pct: waste, shrink_pct: shrink, unit, round, roll_length: rollLen, price, stock,
  }), [pieces, qty, face, trim, form, sheetLen, rotate, gap, waste, shrink, unit, round, rollLen, price, stock]);
  const dIn = useDeferredValue(input);
  const res = useMemo(() => calcFabricBuy(dIn), [dIn]);
  const dWidths = useDeferredValue(widths);
  const cmp: WidthCompareRow[] = useMemo(() => dWidths.length === 0 ? [] : compareWidths(dIn, [
    { face_width_cm: dIn.face_width_cm, price: dIn.price }, ...dWidths.map((w) => ({ face_width_cm: w.face, price: w.price })),
  ]), [dIn, dWidths]);
  const stale = dIn !== input;

  const patch = (key: string, p: Partial<BuyPiece>) => setPieces((prev) => prev.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const u = res.unit_label;
  const fabricLabel = fabric ? `[${fabric.code}] ${fabric.name}` : `ผ้าหน้า ${fmt(face, 1)} ซม.`;

  const addCart = () => {
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
    if (!res.ok) { toast.error(res.error ?? "ยังคำนวณไม่ได้"); return; }
    const date = new Date().toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
    printReportHtmlInNewWindow(renderFabricBuyHtml(input, res, cmp, { title: `คิดผ้าก่อนซื้อ ${fabric?.code ?? ""}`.trim(), date, fabric_name: fabricLabel, source_label: source }));
  };

  // ── ตารางชิ้นตัด (แก้ในตาราง) ──
  const pieceCols: MiniColumn<BuyPiece>[] = [
    { key: "label", header: "ชื่อชิ้น", width: "1.6fr", cell: (p) => <input value={p.label} placeholder="เช่น ตัวหน้า" onChange={(e) => patch(p.key, { label: e.target.value })} className={textCls} /> },
    { key: "w", header: "กว้าง (ซม.)", width: "1fr", align: "right", cell: (p) => <Num value={p.width_cm} onChange={(v) => patch(p.key, { width_cm: v })} /> },
    { key: "l", header: "ยาว (ซม.)", width: "1fr", align: "right", cell: (p) => <Num value={p.length_cm} onChange={(v) => patch(p.key, { length_cm: v })} /> },
    { key: "n", header: "ชิ้น/ใบ", width: "0.8fr", align: "right", cell: (p) => <Num value={p.per_unit} onChange={(v) => patch(p.key, { per_unit: v })} /> },
    { key: "tot", header: "รวมทั้งงาน", width: "0.9fr", align: "right", cell: (p) => <span className="text-[12px] text-slate-500">{fmt(p.per_unit * qty, 0)}</span> },
    { key: "nr", header: "ห้ามหมุน", width: "0.7fr", align: "center", cell: (p) => <input type="checkbox" checked={!!p.no_rotate} onChange={(e) => patch(p.key, { no_rotate: e.target.checked })} title="ชิ้นนี้ต้องตามลาย/เกรน ห้ามหมุน" /> },
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

  return (
    <div className="space-y-4">
      {/* 1. ชิ้นตัด */}
      <Card title="1. ชิ้นตัด" tag="need" right={source && <span className="truncate text-[12px] text-slate-500">จาก {source}</span>}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setShowBom((s) => !s)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-indigo-200 bg-white px-3 text-[12px] text-indigo-700 hover:bg-indigo-50"><Icon name="measure" /> ดึงจากสูตร BOM</button>
          <span className="text-[12px] text-slate-400">หรือพิมพ์ขนาดชิ้นเองในตารางด้านล่าง</span>
        </div>
        {showBom && (
          <div className="mb-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
            <div className="mb-1 text-[12px] text-slate-600">เลือกสินค้า (SKU) ที่มีสูตรแล้ว → เลือกผ้าในสูตร</div>
            <div className="max-w-md"><SkuPicker value={bomSku} onChange={(v) => void pickBomSku(v)} placeholder="ค้นรหัส / ชื่อสินค้า..." /></div>
            {bomBusy && <div className="mt-2 text-[12px] text-slate-500">กำลังโหลดสูตร…</div>}
            {boms && boms.length === 0 && !bomBusy && <div className="mt-2 text-[12px] text-amber-700">สินค้านี้ยังไม่มีสูตร (BOM) — พิมพ์ชิ้นเองได้</div>}
            {boms && boms.length > 1 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="text-[12px] text-slate-500">มี {boms.length} สูตร:</span>
                {boms.map((b) => <button key={b.id} type="button" onClick={() => void loadBom(b)} className="h-7 rounded-full border border-slate-200 bg-white px-2.5 text-[12px] hover:border-indigo-300">{b.bom_code}{b.version != null ? ` v${b.version}` : ""}</button>)}
              </div>
            )}
            {bomFabrics && (bomFabrics.length === 0
              ? <div className="mt-2 text-[12px] text-amber-700">สูตรนี้ยังไม่มีบรรทัดที่ใส่ขนาดชิ้นตัด (กว้าง × ยาว)</div>
              : <div className="mt-2 flex flex-wrap gap-1.5">
                  {bomFabrics.map((f) => (
                    <button key={f.sku} type="button" onClick={() => void useBomFabric(f)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left text-[12px] hover:border-indigo-400">
                      <div className="font-medium text-slate-700">{f.name}</div>
                      <div className="text-slate-400">{f.sku}{f.type ? ` · ${f.type}` : ""} · {f.lines.length} แบบชิ้น</div>
                    </button>
                  ))}
                </div>)}
          </div>
        )}
        <MiniTable rows={pieces} columns={pieceCols} rowKey={(p) => p.key} hideToolbar dense zebra={false} />
        <button type="button" onClick={() => setPieces((p) => [...p, newPiece()])} className="mt-2 inline-flex h-8 items-center gap-1 rounded-full border-2 border-dashed border-indigo-200 px-3 text-[12px] font-medium text-indigo-600 hover:bg-indigo-50"><Icon name="add" /> เพิ่มชิ้น</button>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 2. จำนวน + 3. ผ้า */}
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
            <Field label="หักริม รวม 2 ข้าง (ซม.)" hint="ริมผ้าตัดใช้ไม่ได้ · ปกติ 2-4 ซม."><Num value={trim} onChange={setTrim} /></Field>
            <Field label="ทางผ้า">
              <select value={rotate ? "1" : "0"} onChange={(e) => setRotate(e.target.value === "1")} className={textCls}><option value="1">หมุนชิ้นได้ (ผ้าเรียบ)</option><option value="0">ห้ามหมุน (ลาย/ขน/เงา)</option></select>
            </Field>
            <Field label="ผ้าหดตัว %" hint="ขยายชิ้นตัดเผื่อหด · ไม่หด = 0"><Num value={shrink} onChange={setShrink} /></Field>
          </div>
          <div className="mt-2 text-[12px] text-slate-500">หน้าใช้ได้จริง <b className="text-slate-700">{fmt(face - trim, 1)} ซม.</b></div>
        </Card>

        {/* 4. เผื่อ + หน่วยซื้อ */}
        <Card title="3. เผื่อ + หน่วยซื้อ" tag="rec">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Field label="เว้นระหว่างชิ้น (ซม.)" hint="ปกติ 0 (ตรงกับใบสั่งผลิต)"><Num value={gap} onChange={setGap} /></Field>
            <Field label="เผื่อเสีย %" hint="หัว-ท้ายม้วน/ตำหนิ · แนะนำ 3"><Num value={waste} onChange={setWaste} /></Field>
            {form === "roll" && (
              <Field label="ซื้อเป็น">
                <select value={unit} onChange={(e) => changeUnit(e.target.value as BuyUnit)} className={textCls}><option value="yd">หลา</option><option value="m">เมตร</option></select>
              </Field>
            )}
            {form === "roll" && (
              <Field label="ปัดขึ้น">
                <select value={round} onChange={(e) => setRound(e.target.value as BuyRound)} className={textCls}><option value="unit">{u}เต็ม</option><option value="roll">ม้วนเต็ม</option><option value="none">ไม่ปัด</option></select>
              </Field>
            )}
            {form === "roll" && <Field label={`1 ม้วนยาว (${u})`}><Num value={rollLen} onChange={setRollLen} /></Field>}
            <Field label={`ราคา / ${u} (บาท)`} hint={!fabric?.standard_price ? undefined : unitOk ? "ดึงต้นทุนจากรหัสผ้า แก้ได้" : `ต้นทุนในระบบเป็นต่อ ${fabric.uom_name} — กรอกราคาต่อ${u}เอง`}><Num value={price} onChange={setPrice} /></Field>
          </div>
        </Card>
      </div>

      {/* ผล */}
      <section className={`rounded-2xl border-2 border-indigo-300 bg-white p-4 shadow-sm transition-opacity ${stale ? "opacity-60" : ""}`}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="flex items-center gap-2 text-base font-bold text-indigo-700"><Icon name="calc" /> ผลคำนวณ</h2>
          <span className="text-[12px] text-slate-500">{fabricLabel} · ผลิต {fmt(qty, 0)} ใบ · ชิ้นรวม {fmt(res.total_pieces, 0)} ชิ้น</span>
          <span className="ml-auto flex flex-wrap gap-2">
            <button type="button" onClick={addCart} className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 bg-white px-3 text-[12px] text-rose-700 hover:bg-rose-50"><Icon name="cart" /> ใส่ตะกร้าขอซื้อ</button>
            <button type="button" onClick={doPrint} className="inline-flex h-8 items-center gap-1 rounded-lg bg-indigo-600 px-3 text-[12px] font-medium text-white hover:bg-indigo-700"><Icon name="print" /> พิมพ์</button>
          </span>
        </div>
        {!res.ok ? (
          <div className="rounded-xl bg-amber-50 px-3 py-6 text-center text-sm text-amber-800">{res.error}</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Metric label="ต้องใช้จริง (รวมเผื่อเสีย)" value={`${fmt(res.need)} ${u}`} sub={form === "sheet" ? `ใช้ต่อใบ ${fmt(res.per_unit, 3)} ผืน` : `ใช้ต่อใบ ${fmt(res.per_unit_cm, 1)} ซม. (${fmt(res.per_unit, 3)} ${u})`} />
              <Metric label="ควรซื้อ (ปัดแล้ว)" value={`${fmt(res.need_rounded)} ${u}`} sub={res.rolls ? `${res.rolls} ม้วน (ม้วนละ ${fmt(rollLen)} ${u})` : undefined} />
              <Metric label="ต้องซื้อเพิ่ม (หักสต็อก)" value={`${fmt(res.to_buy)} ${u}`} tone={res.to_buy > 0 ? "danger" : "success"}
                sub={!fabric ? "ยังไม่ได้เลือกผ้า = ไม่หักสต็อก" : stockErr ? stockErr : stockRaw == null ? "กำลังโหลดสต็อก…" : !unitOk ? `สต็อกนับเป็น ${fabric.uom_name} (${fmt(stockRaw)}) เทียบกับ${u}ไม่ได้ — ไม่หักสต็อก` : `สต็อกมี ${fmt(stock)} ${u}`} />
              <Metric label="งบซื้อเพิ่ม" value={res.cost_buy != null ? `฿${fmt(res.cost_buy, 0)}` : "—"} sub={res.cost_per_unit != null ? `ค่าผ้าต่อใบ ฿${fmt(res.cost_per_unit)}` : "ใส่ราคาเพื่อดูงบ"} />
            </div>
            <div className="mt-2 text-[12px] text-slate-500">
              {form === "sheet" ? <>วางจริง {fmt(res.layout?.sheetsUsed ?? 0, 0)} ผืน (ก่อนเผื่อเสีย)</> : <>วางชิ้นจริงยาว {fmt(res.used_length_cm / 100)} ม. (ก่อนเผื่อเสีย)</>} · ใช้ผ้าคุ้ม <b className="text-slate-700">{fmt(res.efficiency_pct, 1)}%</b>
              {form === "roll" && res.naive > 0 && <> · ถ้าคิดแบบเดิม (พื้นที่ ÷ หน้ากว้าง) = {fmt(res.naive)} {u}</>}
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
                <FabricLayoutPreview result={res.layout} faceWidthCm={res.usable_width_cm} sheetLengthCm={form === "sheet" ? sheetLen : null} mode={form} />
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
                <input type="number" min={0} value={w.face || ""} onChange={(e) => setWidths((p) => p.map((x) => x.key === w.key ? { ...x, face: Number(e.target.value) || 0 } : x))} className="h-7 w-16 rounded border border-slate-200 px-1 text-right" />
                <span className="text-slate-500">ซม. ราคา</span>
                <input type="number" min={0} value={w.price || ""} onChange={(e) => setWidths((p) => p.map((x) => x.key === w.key ? { ...x, price: Number(e.target.value) || 0 } : x))} className="h-7 w-16 rounded border border-slate-200 px-1 text-right" />
                <button type="button" title="เอาออก" onClick={() => setWidths((p) => p.filter((x) => x.key !== w.key))} className="rounded p-0.5 text-slate-400 hover:text-rose-600"><Icon name="delete" /></button>
              </div>
            ))}
          </div>
        )}
        {cmp.length > 0
          ? <MiniTable rows={cmp} columns={cmpCols} rowKey={(r) => `${r.face_width_cm}-${r.price ?? ""}`} hideToolbar dense />
          : <div className="text-[12px] text-slate-400">ยังไม่ได้เพิ่มหน้ากว้างที่จะเทียบ — ค่าตั้งอื่น (ริม เผื่อเสีย ปัดขึ้น) ใช้เหมือนด้านบน</div>}
      </Card>
    </div>
  );
}

function Card({ title, tag, right, children }: { title: string; tag?: "need" | "rec"; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        {tag === "need" && <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[11px] text-rose-700">จำเป็น</span>}
        {tag === "rec" && <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] text-indigo-700">แนะนำ</span>}
        {right && <span className="ml-auto min-w-0">{right}</span>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-0.5 block truncate text-[11px] font-medium text-slate-500" title={hint ? `${label} — ${hint}` : label}>{label}</span>
      {children}
      {hint && <span className="mt-0.5 block truncate text-[10.5px] text-slate-400">{hint}</span>}
    </label>
  );
}

function Num({ value, onChange, big }: { value: number; onChange: (v: number) => void; big?: boolean }) {
  return (
    <input type="number" min={0} step="any" value={value === 0 ? "" : value} placeholder="0"
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => onChange(e.target.value === "" ? 0 : Math.max(0, Number(e.target.value) || 0))}
      className={`${inputCls} ${big ? "text-base font-semibold" : ""}`} />
  );
}

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "danger" | "success" }) {
  const c = tone === "danger" ? "text-rose-700" : tone === "success" ? "text-emerald-700" : "text-slate-800";
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <div className="text-[11.5px] text-slate-500">{label}</div>
      <div className={`text-xl font-bold ${c}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}
