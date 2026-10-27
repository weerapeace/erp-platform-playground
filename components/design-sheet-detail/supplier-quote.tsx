"use client";

// ============================================================
// SupplierQuoteSection — "คำนวณจากซัพพลายเออร์" (Section ในแท็บตีราคาของใบงานออกแบบ)
//
// ใช้กับสินค้าที่ "สั่งจากร้าน" (ไม่ได้ผลิตเอง): ราคาจากร้าน (¥/฿) + ค่าส่งตามปริมาตรกล่อง
//   → ต้นทุนถึงมือ/ชิ้น → ราคาที่จะเสนอ → กำไร → แบ่งกำไร (ทั้งใบ + รายบรรทัด)
// สูตรทั้งหมดอยู่ที่ของกลาง lib/supplier-quote (แก้ที่เดียว)
// ของกลางที่ใช้: LineItemsGrid · SupplierPicker · MoneyInput · useToast · usePermission
//
// 🔒 ตัวเลขต้นทุน/กำไร โชว์เฉพาะคนที่มีสิทธิ์ products.cost.view (ผู้บริหาร/จัดซื้อ)
//    คนอื่นเห็นแค่ รายการ/ร้าน/จำนวน/ราคาที่เสนอ/ยอดขาย
// ============================================================

import { useCallback, useEffect, useMemo, useState, type MutableRefObject } from "react";
import { LineItemsGrid, type LineColumn } from "@/components/line-items-grid";
import { SupplierPicker, type SupplierPickerValue } from "@/components/pickers";
import { MoneyInput } from "@/components/money-input";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";
import {
  calcSupplierLine, sumSupplierLines, splitAmount, emptySupplierLine, isInTotal, fmtBaht, fmtNum,
  DEFAULT_FREIGHT, DEFAULT_FX, type SupplierLine, type FreightRates, type ProfitSplit, type ShipMode,
} from "@/lib/supplier-quote";
import type { SupplierPriceRow } from "@/app/api/design-sheets/supplier-prices/route";

type Row = SupplierLine & { key: string };
type ToastFn = (type: "success" | "error" | "info", m: string) => void;

const keyOf = (l: SupplierLine, i: number) => l.key ?? l.id ?? `r${i}`;
const pkey = (s: string | null | undefined) => s ?? "";

export function SupplierQuoteSection({ sheetId, parentCode, parentTabs, canEdit, canSeeCost, pushToast, onDirtyChange, saveRef, onRequestEdit, onSendToQuote, reloadKey = 0 }: {
  sheetId: string;
  /** เปลี่ยนค่า = โหลดบรรทัด/แบ่งกำไรใหม่จากเซิร์ฟเวอร์ (หน้าแม่เปลี่ยนชื่อ/ลบเวอร์ชันแล้ว) */
  reloadKey?: number;
  /** แท็บไซส์/Parent ที่กำลังดู ("" = ทั่วไป) — บรรทัดผูกกับแท็บเหมือนตีราคา */
  parentCode: string;
  parentTabs?: { key: string; label: string }[];
  canEdit: boolean;
  /** เห็นตัวเลขต้นทุน/กำไรไหม (products.cost.view) */
  canSeeCost: boolean;
  pushToast: ToastFn;
  onDirtyChange?: (dirty: boolean) => void;
  /** ให้หน้าแม่เรียก "บันทึก" ได้ (ใช้ตอนกดปิดป๊อปแล้วเลือก "บันทึกแล้วปิด") */
  saveRef?: MutableRefObject<(() => Promise<void>) | null>;
  /** โหมดดูอย่างเดียว: กดปุ่มในกล่องว่าง = ให้หน้าแม่เปิดโหมดแก้ไขให้ (คลิกเดียวจบ) */
  onRequestEdit?: () => void;
  /** ส่งราคาที่เสนอไปใบเสนอราคา (หน้าแม่ถือตะกร้า/ป๊อปอยู่) */
  onSendToQuote?: (lines: { product_name: string; variation: string | null; unit_price: number; qty: number }[]) => void;
}) {
  const t = useT();
  const [all, setAll] = useState<Row[]>([]);
  const [splitsMap, setSplitsMap] = useState<Record<string, ProfitSplit[]>>({});   // แบ่งกำไรทั้งใบ แยกตามแท็บ
  const [fx, setFx] = useState(DEFAULT_FX);
  const [rates, setRates] = useState<FreightRates>(DEFAULT_FREIGHT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [splitOpenFor, setSplitOpenFor] = useState<string | null>(null);    // key บรรทัดที่กางแบ่งกำไรรายบรรทัด
  const [freightOpenFor, setFreightOpenFor] = useState<string | null>(null); // key บรรทัดที่กางแผงคำนวณค่าส่ง
  const [priceLookupFor, setPriceLookupFor] = useState<string | null>(null); // key บรรทัดที่กำลังดึงราคาเดิมของร้าน

  const markDirty = useCallback(() => { setDirty(true); onDirtyChange?.(true); }, [onDirtyChange]);

  // โหลดบรรทัด + เรตกลาง (หยวน/ค่าส่ง) + แบ่งกำไรทั้งใบ
  useEffect(() => {
    if (!sheetId) return;
    let alive = true;
    setLoading(true);
    Promise.all([
      apiFetch(`/api/design-sheets/${sheetId}/supplier-lines`).then((r) => r.json()),
      apiFetch("/api/ui-config?key=rmb_to_thb_rate").then((r) => r.json()).catch(() => ({})),
      apiFetch("/api/ui-config?key=design_freight_rates").then((r) => r.json()).catch(() => ({})),
      apiFetch(`/api/design-sheets/${sheetId}`).then((r) => r.json()).catch(() => ({})),
    ]).then(([lr, fr, gr, sr]) => {
      if (!alive) return;
      const rows = ((lr?.data ?? []) as SupplierLine[]).map((l, i) => ({ ...l, key: keyOf(l, i) }));
      setAll(rows);
      const rr = Number((fr?.value ?? {}).rate);
      if (Number.isFinite(rr) && rr > 0) setFx(rr);
      const g = (gr?.value ?? {}) as Partial<FreightRates>;
      setRates({ truck: Number(g.truck) > 0 ? Number(g.truck) : DEFAULT_FREIGHT.truck, ship: Number(g.ship) > 0 ? Number(g.ship) : DEFAULT_FREIGHT.ship });
      const ps = (sr?.data?.profit_splits ?? {}) as Record<string, ProfitSplit[]>;
      setSplitsMap(ps && typeof ps === "object" ? ps : {});
      setDirty(false);
    }).catch(() => { /* เงียบ — โหลดไม่ได้ = เริ่มจากว่าง */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [sheetId, reloadKey]);

  const rows = useMemo(() => all.filter((l) => pkey(l.parent_code) === parentCode), [all, parentCode]);
  const splits = splitsMap[parentCode] ?? [];
  const totals = useMemo(() => sumSupplierLines(rows, fx, rates), [rows, fx, rates]);
  const sheetSplitTotal = splitAmount(splits, totals.profitAfterLine);
  const netProfit = totals.profitAfterLine - sheetSplitTotal;

  const setRows = (next: Row[]) => {
    const others = all.filter((l) => pkey(l.parent_code) !== parentCode);
    setAll([...others, ...next.map((r) => ({ ...r, parent_code: parentCode || null }))]);
    markDirty();
  };
  const patchRow = (key: string, p: Partial<SupplierLine>) => {
    setAll((list) => list.map((l) => (l.key === key ? { ...l, ...p } : l)));
    markDirty();
  };
  const setSplits = (next: ProfitSplit[]) => { setSplitsMap((m) => ({ ...m, [parentCode]: next })); markDirty(); };
  const newRow = () => ({ ...emptySupplierLine(parentCode || null, rows.length + 1), key: `n${Date.now()}_${rows.length}` } as Row);
  const addRow = () => { setAll((list) => [...list, newRow()]); markDirty(); };

  const save = async () => {
    setSaving(true);
    try {
      const payload = all.map((l, i) => {
        const c = calcSupplierLine(l, fx, rates);
        return { ...l, freight_total: c.freightTotal, sort_order: i + 1 };
      });
      const [lr, sr] = await Promise.all([
        apiFetch(`/api/design-sheets/${sheetId}/supplier-lines`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines: payload }) }),
        apiFetch(`/api/design-sheets/${sheetId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profit_splits: splitsMap }) }),
      ]);
      const lj = await lr.json(); if (lj.error) throw new Error(lj.error);
      const sj = await sr.json(); if (sj.error) throw new Error(sj.error);
      setDirty(false); onDirtyChange?.(false);
      pushToast("success", t("บันทึกตีราคาจากร้านแล้ว", "Supplier costing saved"));
    } catch (e) { pushToast("error", (e as Error).message); }
    finally { setSaving(false); }
  };

  // ให้หน้าแม่เรียกบันทึกได้ (ปุ่ม "บันทึกแล้วปิด" ตอนปิดป๊อป)
  useEffect(() => {
    if (!saveRef) return;
    saveRef.current = save;
    return () => { saveRef.current = null; };
  });

  // คำอธิบาย "คิดมาจากอะไร" ของแต่ละช่องที่คำนวณ — ใส่เป็น tooltip (ชี้เมาส์ค้างที่ตัวเลข)
  const why = (r: Row) => {
    const c = calcSupplierLine(r, fx, rates);
    const useFx = r.currency === "CNY" ? (r.fx_rate && r.fx_rate > 0 ? r.fx_rate : fx) : 1;
    const packTxt = r.price_unit === "pack" ? t(` ÷ ${fmtNum(r.pack_qty ?? 1)} ชิ้น/แพ็ค`, ` ÷ ${fmtNum(r.pack_qty ?? 1)} pcs/pack`) : "";
    return {
      baht: r.currency === "CNY"
        ? t(`ราคาร้าน ${fmtNum(r.price ?? 0, 2)} ¥${packTxt} × เรต ${useFx} = ${fmtBaht(c.priceBaht)} ฿/ชิ้น`, `Supplier price ${fmtNum(r.price ?? 0, 2)} ¥${packTxt} × rate ${useFx} = ${fmtBaht(c.priceBaht)} ฿/pc`)
        : t(`ราคาร้าน ${fmtBaht(r.price ?? 0)} ฿${packTxt} = ${fmtBaht(c.priceBaht)} ฿/ชิ้น`, `Supplier price ${fmtBaht(r.price ?? 0)} ฿${packTxt} = ${fmtBaht(c.priceBaht)} ฿/pc`),
      freight: c.cubeCm3 > 0
        ? t(`กล่อง ${fmtNum(r.box_w_cm ?? 0, 1)}×${fmtNum(r.box_l_cm ?? 0, 1)}×${fmtNum(r.box_h_cm ?? 0, 1)} ซม. = ${fmtNum(Math.round(c.cubeCm3))} ซม.³\n`, `Box ${fmtNum(r.box_w_cm ?? 0, 1)}×${fmtNum(r.box_l_cm ?? 0, 1)}×${fmtNum(r.box_h_cm ?? 0, 1)} cm = ${fmtNum(Math.round(c.cubeCm3))} cm³\n`)
          + t(`→ ${c.cbmPerPc.toFixed(6)} คิว/ชิ้น × ${fmtNum(r.qty ?? 0)} ชิ้น = ${c.cbmTotal.toFixed(4)} คิว\n`, `→ ${c.cbmPerPc.toFixed(6)} CBM/pc × ${fmtNum(r.qty ?? 0)} pcs = ${c.cbmTotal.toFixed(4)} CBM\n`)
          + t(`× ${fmtNum(c.rate)} ฿/คิว (${r.ship_mode === "truck" ? "รถ" : "เรือ"}) = ${fmtBaht(c.freightTotal)} ฿\n`, `× ${fmtNum(c.rate)} ฿/CBM (${r.ship_mode === "truck" ? "truck" : "sea"}) = ${fmtBaht(c.freightTotal)} ฿\n`)
          + t(`÷ ${fmtNum(r.qty ?? 0)} ชิ้น = ${fmtBaht(c.freightPerPc)} ฿/ชิ้น`, `÷ ${fmtNum(r.qty ?? 0)} pcs = ${fmtBaht(c.freightPerPc)} ฿/pc`)
        : t("ยังไม่ได้ใส่ขนาดกล่อง — กดที่ช่องนี้เพื่อใส่ กว้าง×ยาว×หนา", "No box size yet — click here to enter width×length×height"),
      cost: t(`ราคา ${fmtBaht(c.priceBaht)} + ค่าส่ง ${fmtBaht(c.freightPerPc)} = ${fmtBaht(c.costPerPc)} ฿/ชิ้น (ต้นทุนถึงมือ)`, `Price ${fmtBaht(c.priceBaht)} + freight ${fmtBaht(c.freightPerPc)} = ${fmtBaht(c.costPerPc)} ฿/pc (landed cost)`),
      sale: t(`จำนวน ${fmtNum(r.qty ?? 0)} × ราคาที่เสนอ ${fmtBaht(r.offer_price ?? 0)} = ${fmtBaht(c.saleTotal)} ฿`, `Qty ${fmtNum(r.qty ?? 0)} × offered price ${fmtBaht(r.offer_price ?? 0)} = ${fmtBaht(c.saleTotal)} ฿`),
      profitPc: t(`ราคาที่เสนอ ${fmtBaht(r.offer_price ?? 0)} − ต้นทุนถึงมือ ${fmtBaht(c.costPerPc)} = ${fmtBaht(c.profitPerPc)} ฿/ชิ้น`, `Offered price ${fmtBaht(r.offer_price ?? 0)} − landed cost ${fmtBaht(c.costPerPc)} = ${fmtBaht(c.profitPerPc)} ฿/pc`),
      profitAll: t(`กำไร/ชิ้น ${fmtBaht(c.profitPerPc)} × ${fmtNum(r.qty ?? 0)} ชิ้น = ${fmtBaht(c.profitTotal)} ฿`, `Profit/pc ${fmtBaht(c.profitPerPc)} × ${fmtNum(r.qty ?? 0)} pcs = ${fmtBaht(c.profitTotal)} ฿`)
        + ((r.split_json ?? []).length ? t(`\nหักส่วนแบ่งรายการนี้ ${fmtBaht(c.splitTotal)} ฿ → เหลือ ${fmtBaht(c.profitNet)} ฿`, `\nLess this item's split ${fmtBaht(c.splitTotal)} ฿ → ${fmtBaht(c.profitNet)} ฿ left`) : ""),
    };
  };

  // ── คอลัมน์ตาราง (ของกลาง LineItemsGrid) ───────────────────────────────
  const cols: LineColumn<Row>[] = [
    // ติ๊กเลือกว่าจะเอาบรรทัดไหน "รวมยอด" (ไม่ติ๊ก = ยังเก็บไว้ในตาราง แต่ไม่นับในสรุป/ไม่ส่งใบเสนอราคา)
    { key: "in_total", header: t("รวม", "Incl."), width: 46, align: "center",
      render: (r, u, ro) => (
        <input type="checkbox" disabled={ro} checked={r.in_total !== false}
          title={r.in_total !== false ? t("นับรวมในยอดสรุป (ติ๊กออก = ไม่นับ)", "Counted in the summary (untick = not counted)") : t("ไม่นับในยอดสรุป — ติ๊กเพื่อนับรวม", "Not counted in the summary — tick to include")}
          onChange={(e) => u({ in_total: e.target.checked })}
          className="h-4 w-4 cursor-pointer accent-violet-600" />
      ) },
    { key: "item_name", header: t("รายการ", "Item"), width: 190, align: "left",
      render: (r, u, ro) => <input value={r.item_name ?? ""} disabled={ro} onChange={(e) => u({ item_name: e.target.value })}
        placeholder={t("ชื่อสินค้า", "Product name")} className="h-8 w-full rounded border border-slate-200 px-2 text-sm disabled:bg-slate-50" /> },
    { key: "supplier", header: t("ร้าน", "Supplier"), width: 190, align: "left",
      render: (r, u, ro) => (
        <SupplierPicker disabled={ro}
          value={r.supplier_id ? { id: r.supplier_id, code: null, name: r.supplier_name ?? "" } : null}
          onChange={(v: SupplierPickerValue | null) => u({ supplier_id: v?.id ?? null, supplier_name: v?.name ?? null })}
          placeholder={t("เลือกร้าน...", "Select supplier...")} />
      ) },
    { key: "price", header: t("ราคาจากร้าน", "Supplier price"), width: 150, align: "right",
      render: (r, u, ro) => (
        <div className="flex items-center gap-1">
          <MoneyInput value={r.price} onChange={(raw) => u({ price: raw === "" ? null : Number(raw) })} disabled={ro} className="h-8 w-20 rounded border border-slate-200 px-1.5 text-right text-sm" />
          <button type="button" disabled={ro} title={t("สลับสกุลเงิน", "Switch currency")}
            onClick={() => u({ currency: r.currency === "CNY" ? "THB" : "CNY" })}
            className={`h-8 shrink-0 rounded border px-1.5 text-xs font-medium ${r.currency === "CNY" ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-500"}`}>
            {r.currency === "CNY" ? "¥" : "฿"}
          </button>
          <button type="button" disabled={ro} title={r.price_unit === "pack" ? t("ราคานี้ต่อแพ็ค (กดสลับเป็นต่อชิ้น)", "Price per pack (click to switch to per piece)") : t("ราคานี้ต่อชิ้น (กดสลับเป็นต่อแพ็ค)", "Price per piece (click to switch to per pack)")}
            onClick={() => u({ price_unit: r.price_unit === "pack" ? "pcs" : "pack", pack_qty: r.price_unit === "pack" ? null : (r.pack_qty ?? 1) })}
            className={`h-8 shrink-0 rounded border px-1.5 text-[11px] font-medium ${r.price_unit === "pack" ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-500"}`}>
            {r.price_unit === "pack" ? t("/แพ็ค", "/pack") : t("/ชิ้น", "/pc")}
          </button>
          {r.price_unit === "pack" && (
            <input type="number" min={1} step="1" disabled={ro} value={r.pack_qty ?? ""} onChange={(e) => u({ pack_qty: e.target.value === "" ? null : Number(e.target.value) })}
              title={t("กี่ชิ้นต่อแพ็ค", "Pieces per pack")} placeholder={t("ชิ้น/แพ็ค", "pcs/pack")} className="h-8 w-16 rounded border border-violet-200 px-1 text-right text-xs" />
          )}
          {!ro && (
            <button type="button" onClick={() => setPriceLookupFor(r.key)}
              title={t("ดึงราคาที่เคยตั้งไว้กับร้านนี้ (ทะเบียนราคาต่อร้าน)", "Pull a price set earlier with this supplier (supplier price list)")}
              className="h-8 shrink-0 rounded border border-slate-200 bg-white px-1.5 text-xs text-slate-500 hover:border-violet-300 hover:text-violet-600">🔎</button>
          )}
        </div>
      ) },
    ...(canSeeCost ? [{
      key: "price_baht", header: t("= บาท/ชิ้น", "= THB/pc"), width: 92, align: "right" as const,
      render: (r: Row) => <span title={why(r).baht} className="cursor-help tabular-nums text-slate-500 underline decoration-dotted decoration-slate-300 underline-offset-2">{fmtBaht(calcSupplierLine(r, fx, rates).priceBaht)}</span>,
    }] : []),
    { key: "qty", header: t("จำนวนที่สั่ง", "Order qty"), width: 96, align: "right",
      render: (r, u, ro) => <input type="number" min={0} step="1" disabled={ro} value={r.qty ?? ""} onChange={(e) => u({ qty: e.target.value === "" ? null : Number(e.target.value) })}
        className="h-8 w-full rounded border border-slate-200 px-2 text-right text-sm disabled:bg-slate-50" /> },
    { key: "freight", header: t("ค่าส่ง/ชิ้น", "Freight/pc"), width: 120, align: "right",
      render: (r) => {
        const c = calcSupplierLine(r, fx, rates);
        const hasBox = (r.box_w_cm ?? 0) > 0 && (r.box_l_cm ?? 0) > 0 && (r.box_h_cm ?? 0) > 0;
        return (
          <button type="button" onClick={() => { setSplitOpenFor(null); setFreightOpenFor(freightOpenFor === r.key ? null : r.key); }}
            title={`${why(r).freight}\n\n${t("(กดเพื่อกาง/ปิดแผงคำนวณค่าส่ง)", "(click to open/close the freight calculator)")}`}
            className={`h-8 w-full rounded border px-2 text-right text-sm tabular-nums ${hasBox ? "border-slate-200 bg-white text-slate-600" : "border-dashed border-amber-300 bg-amber-50 text-amber-600"}`}>
            {hasBox ? (canSeeCost ? fmtBaht(c.freightPerPc) : "—") : t("📐 ใส่ขนาด", "📐 Box size")}
          </button>
        );
      } },
    ...(canSeeCost ? [{
      key: "cost", header: t("ราคา+ค่าส่ง", "Price+freight"), width: 104, align: "right" as const, sortable: true,
      getValue: (r: Row) => calcSupplierLine(r, fx, rates).costPerPc,
      render: (r: Row) => <b title={why(r).cost} className="cursor-help tabular-nums text-slate-800 underline decoration-dotted decoration-slate-300 underline-offset-2">{fmtBaht(calcSupplierLine(r, fx, rates).costPerPc)}</b>,
    }] : []),
    { key: "offer_price", header: t("ราคาที่จะเสนอ", "Offer price"), width: 116, align: "right",
      render: (r, u, ro) => <MoneyInput value={r.offer_price} onChange={(raw) => u({ offer_price: raw === "" ? null : Number(raw) })} disabled={ro} className="h-8 w-full rounded border border-slate-200 px-2 text-right text-sm disabled:bg-slate-50" /> },
    // ส่วนต่าง/ชิ้น = ราคาที่เสนอ − ต้นทุนถึงมือ (โชว์ทั้งบาทและ % ให้เห็นทันทีข้าง ๆ ราคาที่เสนอ)
    ...(canSeeCost ? [{
      key: "margin", header: t("ส่วนต่าง/ชิ้น", "Margin/pc"), width: 116, align: "right" as const, sortable: true,
      getValue: (r: Row) => calcSupplierLine(r, fx, rates).profitPerPc,
      render: (r: Row) => {
        const c = calcSupplierLine(r, fx, rates);
        const offer = Number(r.offer_price) || 0;
        const onSale = offer > 0 ? (c.profitPerPc / offer) * 100 : null;     // % ของราคาขาย
        const onCost = c.costPerPc > 0 ? (c.profitPerPc / c.costPerPc) * 100 : null;  // บวกจากต้นทุนกี่ %
        const good = c.profitPerPc >= 0;
        return (
          <div title={`${why(r).profitPc}\n\n= ${onSale != null ? t(`${onSale.toFixed(1)}% ของราคาขาย`, `${onSale.toFixed(1)}% of sale price`) : "—"}\n= ${onCost != null ? t(`บวก ${onCost.toFixed(1)}% จากต้นทุน`, `+${onCost.toFixed(1)}% on cost`) : "—"}`}
            className="cursor-help leading-tight">
            <div className={`tabular-nums font-semibold ${good ? "text-emerald-600" : "text-rose-600"}`}>{good ? "+" : ""}{fmtBaht(c.profitPerPc)}</div>
            <div className={`text-[10px] tabular-nums ${good ? "text-emerald-500" : "text-rose-400"}`}>
              {onSale != null ? `${good ? "+" : ""}${onSale.toFixed(1)}%` : "—"}{onCost != null ? t(` · บวก ${onCost.toFixed(0)}%`, ` · +${onCost.toFixed(0)}% on cost`) : ""}
            </div>
          </div>
        );
      },
    }] : []),
    { key: "sale_total", header: t("รวมทั้งหมด", "Total"), width: 110, align: "right", sortable: true,
      getValue: (r) => calcSupplierLine(r, fx, rates).saleTotal,
      render: (r) => <span title={why(r).sale} className="cursor-help tabular-nums text-slate-700 underline decoration-dotted decoration-slate-300 underline-offset-2">{fmtBaht(calcSupplierLine(r, fx, rates).saleTotal)}</span> },
    ...(canSeeCost ? [
      { key: "profit_total", header: t("รวมกำไร", "Total profit"), width: 110, align: "right" as const, sortable: true,
        getValue: (r: Row) => calcSupplierLine(r, fx, rates).profitTotal,
        render: (r: Row) => { const c = calcSupplierLine(r, fx, rates); return (
          <div className="flex items-center justify-end gap-1">
            <span title={why(r).profitAll} className={`cursor-help tabular-nums font-semibold underline decoration-dotted decoration-slate-300 underline-offset-2 ${c.profitTotal >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{fmtBaht(c.profitTotal)}</span>
            <button type="button" title={t("แบ่งกำไรเฉพาะรายการนี้", "Split profit for this item only")} onClick={() => setSplitOpenFor(splitOpenFor === r.key ? null : r.key)}
              className={`h-6 shrink-0 rounded px-1 text-[11px] ${(r.split_json ?? []).length ? "bg-violet-100 text-violet-700" : "text-slate-300 hover:text-violet-600"}`}>🤝</button>
          </div>
        ); } },
    ] : []),
  ];

  // แถวที่กางแผงค่าส่ง / แบ่งกำไรรายบรรทัด (วางใต้ตาราง — LineItemsGrid ไม่มี expand row)
  const openRow = rows.find((r) => r.key === freightOpenFor);
  const splitRow = rows.find((r) => r.key === splitOpenFor);

  if (loading) return <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-400">{t("กำลังโหลดตีราคาจากร้าน…", "Loading supplier costing…")}</div>;

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/30 p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-800">{t("🛒 คำนวณจากซัพพลายเออร์", "🛒 Supplier costing")}</h3>
        <span className="text-[11px] text-slate-400">{t("สินค้าที่สั่งจากร้าน — ราคา + ค่าส่งตามคิว → กำไร", "Items bought from suppliers — price + freight by CBM → profit")}</span>
        <span className="ml-auto text-[11px] text-slate-500">{t("เรตหยวน", "CNY rate")} <b>{fx}</b> ฿/¥ · {t("รถ", "Truck")} <b>{fmtNum(rates.truck)}</b> · {t("เรือ", "Sea")} <b>{fmtNum(rates.ship)}</b> {t("฿/คิว", "฿/CBM")}</span>
        {canSeeCost && rows.length > 0 && (
          <a href={`/print/design-sheet-supplier/${sheetId}${parentCode ? `?parent=${encodeURIComponent(parentCode)}` : ""}`} target="_blank" rel="noreferrer"
            title={t("พิมพ์ใบสรุปต้นทุน-กำไร (เอกสารภายใน ห้ามส่งลูกค้า)", "Print cost/profit summary (internal document — do not send to customers)")}
            className="inline-flex h-8 items-center rounded-lg border border-slate-300 px-2.5 text-xs text-slate-600 hover:bg-white">{t("🖨 ใบภายใน", "🖨 Internal sheet")}</a>
        )}
        {onSendToQuote && rows.length > 0 && (
          <button onClick={() => onSendToQuote(rows
            .filter((r) => isInTotal(r) && (Number(r.offer_price) || 0) > 0)   // ส่งเฉพาะรายการที่ติ๊กรวมยอดไว้
            .map((r) => ({ product_name: r.item_name?.trim() || "สินค้า", variation: r.supplier_name ? `ร้าน ${r.supplier_name}` : null, unit_price: Number(r.offer_price) || 0, qty: Math.max(1, Number(r.qty) || 1) })))}
            title={t("ส่ง 'ราคาที่จะเสนอ' ทุกรายการเข้าใบเสนอราคา (ตะกร้า)", "Send every item's 'offer price' to the quotation (cart)")}
            className="h-8 rounded-lg border border-indigo-300 px-2.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50">{t("🧾 ส่งไปใบเสนอราคา", "🧾 Send to quotation")}</button>
        )}
        {canEdit && (
          <button onClick={() => void save()} disabled={saving || !dirty}
            className="h-8 rounded-lg bg-violet-600 px-3 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-40">
            {saving ? t("กำลังบันทึก…", "Saving…") : t("💾 บันทึก", "💾 Save")}{dirty ? " ●" : ""}
          </button>
        )}
      </div>

      {/* สรุปยอด — นับเฉพาะบรรทัดที่ติ๊ก "รวม" ไว้ */}
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          <span>{t("รวมยอดจาก", "Totals from")} <b className="text-slate-700">{totals.lines}</b>/{totals.linesAll} {t("รายการที่ติ๊กไว้", "ticked items")}</span>
          <button type="button" disabled={!canEdit}
            onClick={() => { setAll((list) => list.map((l) => (pkey(l.parent_code) === parentCode ? { ...l, in_total: true } : l))); markDirty(); }}
            className="rounded border border-slate-200 bg-white px-2 py-0.5 hover:border-violet-300 disabled:opacity-40">{t("ติ๊กทั้งหมด", "Tick all")}</button>
          <button type="button" disabled={!canEdit}
            onClick={() => { setAll((list) => list.map((l) => (pkey(l.parent_code) === parentCode ? { ...l, in_total: false } : l))); markDirty(); }}
            className="rounded border border-slate-200 bg-white px-2 py-0.5 hover:border-violet-300 disabled:opacity-40">{t("ล้างติ๊ก", "Clear ticks")}</button>
          {totals.lines < totals.linesAll && <span className="text-amber-600">{t(`⚠ มี ${totals.linesAll - totals.lines} รายการที่ไม่ถูกนับ (ยังเก็บไว้ในตาราง)`, `⚠ ${totals.linesAll - totals.lines} items not counted (still kept in the table)`)}</span>}
        </div>
      )}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          <Stat label={t("จำนวนรวม", "Total qty")} value={t(`${fmtNum(totals.qty)} ชิ้น`, `${fmtNum(totals.qty)} pcs`)} />
          <Stat label={t("คิวรวม", "Total CBM")} value={t(`${totals.cbm.toFixed(3)} คิว`, `${totals.cbm.toFixed(3)} CBM`)} />
          {canSeeCost && <Stat label={t("ค่าส่งรวม", "Total freight")} value={`${fmtBaht(totals.freight)} ฿`} />}
          {canSeeCost && <Stat label={t("ต้นทุนถึงมือรวม", "Total landed cost")} value={`${fmtBaht(totals.cost)} ฿`} />}
          <Stat label={t("ยอดขายถ้าขายหมด", "Sales if all sold")} value={`${fmtBaht(totals.sale)} ฿`} />
          {canSeeCost && <Stat label={`${t("กำไรรวม", "Total profit")}${totals.sale > 0 ? t(` · ${((totals.profit / totals.sale) * 100).toFixed(1)}% ของยอดขาย`, ` · ${((totals.profit / totals.sale) * 100).toFixed(1)}% of sales`) : ""}`}
            value={`${fmtBaht(totals.profit)} ฿`} tone={totals.profit >= 0 ? "good" : "bad"} />}
        </div>
      )}

      <LineItemsGrid<Row>
        rows={rows}
        columns={cols}
        onChange={(next) => setRows(next)}
        rowId={(r) => r.key}
        readonly={!canEdit}
        onAdd={newRow}
        addLabel={t("＋ เพิ่มรายการจากร้าน", "＋ Add supplier item")}
        emptyText={t("ยังไม่มีรายการสั่งจากร้าน", "No supplier items yet")}
        // โหมดดูอย่างเดียว: ให้กดเพิ่มได้เลย (เข้าโหมดแก้ไข + เพิ่มบรรทัดให้ในคลิกเดียว)
        emptyAction={!canEdit && onRequestEdit ? (
          <button type="button" onClick={() => { onRequestEdit(); addRow(); }}
            className="h-9 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700">{t("＋ เพิ่มรายการจากร้าน", "＋ Add supplier item")}</button>
        ) : null}
        onDuplicate={(r) => ({ ...r, id: undefined, key: `d${Date.now()}_${Math.round(Math.random() * 1e6)}` })}
        storageKey="ds-supplier-quote"
        footer={parentTabs && parentTabs.length > 1 ? <span className="text-[11px] text-slate-400">{t(`* รายการนี้อยู่แท็บ “${parentCode === "" ? "ทั่วไป" : parentCode}” เท่านั้น`, `* These items belong to tab “${parentCode === "" ? "General" : parentCode}” only`)}</span> : null}
      />

      {/* แผงคำนวณค่าส่ง (กางจากปุ่มค่าส่ง/ชิ้น) */}
      {openRow && (
        <FreightPanel row={openRow} fx={fx} rates={rates} readonly={!canEdit}
          onChange={(p) => patchRow(openRow.key, p)}
          onClose={() => setFreightOpenFor(null)} />
      )}

      {/* ดึงราคาเดิมของร้าน (ทะเบียนราคาต่อร้าน) */}
      {priceLookupFor && (() => {
        const r = rows.find((x) => x.key === priceLookupFor);
        if (!r) return null;
        return (
          <SupplierPriceLookup row={r} onClose={() => setPriceLookupFor(null)}
            onPick={(p) => {
              patchRow(r.key, {
                price: p.price, currency: ["RMB", "YUAN", "CNY"].includes(String(p.currency ?? "").toUpperCase()) ? "CNY" : "THB",
                item_name: r.item_name || p.sku_name || p.sku_code || null,
                supplier_id: r.supplier_id || p.supplier_id, supplier_name: r.supplier_name || p.supplier_name,
                source_url: r.source_url || p.purchase_link || null,
              });
              setPriceLookupFor(null);
              pushToast("success", t(`ดึงราคา ${p.price} ${p.currency ?? ""} จาก ${p.supplier_name ?? "ร้าน"} มาแล้ว`, `Pulled price ${p.price} ${p.currency ?? ""} from ${p.supplier_name ?? "supplier"}`));
            }} />
        );
      })()}

      {/* แบ่งกำไรเฉพาะรายการ */}
      {canSeeCost && splitRow && (
        <SplitEditor
          title={t(`🤝 แบ่งกำไรเฉพาะ “${splitRow.item_name || "รายการนี้"}”`, `🤝 Profit split for “${splitRow.item_name || "this item"}” only`)}
          base={calcSupplierLine(splitRow, fx, rates).profitTotal}
          splits={splitRow.split_json ?? []}
          readonly={!canEdit}
          onChange={(next) => patchRow(splitRow.key, { split_json: next })}
          onClose={() => setSplitOpenFor(null)}
        />
      )}

      {/* แบ่งกำไรทั้งใบ */}
      {canSeeCost && rows.length > 0 && (
        <>
          <SplitEditor
            title={t("🤝 แบ่งกำไรทั้งใบ", "🤝 Profit split for the whole sheet")}
            hint={t("คิดจากกำไรรวมหลังหักส่วนแบ่งรายรายการแล้ว", "Based on total profit after per-item splits")}
            base={totals.profitAfterLine}
            splits={splits}
            readonly={!canEdit}
            onChange={setSplits}
          />
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm">
            <span className="text-slate-600">{t("กำไรสุทธิหลังแบ่งทั้งหมด", "Net profit after all splits")}</span>
            <b className={`ml-auto text-lg tabular-nums ${netProfit >= 0 ? "text-emerald-700" : "text-rose-600"}`}>{fmtBaht(netProfit)} ฿</b>
          </div>
        </>
      )}
    </div>
  );
}

/** ป๊อปดึง "ราคาเดิมของร้าน" จากทะเบียนราคาต่อร้าน (supplier_items) — เลือกแล้วเติมราคา/สกุล/ลิงก์ให้ */
function SupplierPriceLookup({ row, onPick, onClose }: {
  row: SupplierLine & { key: string };
  onPick: (p: SupplierPriceRow) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [q, setQ] = useState(row.item_name ?? "");
  const [rows, setRows] = useState<SupplierPriceRow[] | null>(null);
  const [onlyThisShop, setOnlyThisShop] = useState(!!row.supplier_id);

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      const sp = new URLSearchParams();
      if (onlyThisShop && row.supplier_id) sp.set("supplier_id", row.supplier_id);
      if (q.trim()) sp.set("q", q.trim());
      sp.set("limit", "30");
      apiFetch(`/api/design-sheets/supplier-prices?${sp}`).then((r) => r.json())
        .then((j) => { if (alive) setRows((j.data ?? []) as SupplierPriceRow[]); })
        .catch(() => { if (alive) setRows([]); });
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [q, onlyThisShop, row.supplier_id]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-700">{t("🔎 ราคาที่เคยตั้งไว้กับร้าน", "🔎 Saved supplier prices")}</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ค้นชื่อ/รหัสสินค้า…", "Search product name/code…")}
          className="h-8 w-52 rounded border border-slate-200 px-2 text-sm" />
        {row.supplier_id && (
          <label className="flex items-center gap-1 text-[11px] text-slate-500">
            <input type="checkbox" checked={onlyThisShop} onChange={(e) => setOnlyThisShop(e.target.checked)} className="h-3.5 w-3.5 accent-violet-600" />
            {t("เฉพาะร้านที่เลือกไว้", "Selected supplier only")}
          </label>
        )}
        <button onClick={onClose} className="ml-auto text-xs text-slate-400 hover:text-slate-700">{t("✕ ปิด", "✕ Close")}</button>
      </div>
      {rows === null ? <p className="py-3 text-center text-xs text-slate-400">{t("กำลังค้น…", "Searching…")}</p>
        : rows.length === 0 ? <p className="py-3 text-center text-xs text-slate-400">{t("ไม่พบราคาที่เคยตั้งไว้ — ตั้งราคาต่อร้านได้ที่หน้าสินค้า (ราคาผู้ขาย)", "No saved prices found — set supplier prices on the product page (Vendor prices)")}</p>
        : (
          <div className="max-h-56 space-y-1 overflow-auto">
            {rows.map((p) => (
              <button key={p.id} onClick={() => onPick(p)}
                className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 text-left hover:border-violet-300 hover:bg-violet-50/40">
                <span className="font-mono text-[11px] text-slate-500">{p.sku_code ?? "—"}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{p.sku_name ?? p.supplier_sku ?? "—"}</span>
                {p.supplier_name && <span className="shrink-0 text-[11px] text-slate-400">🏪 {p.supplier_name}</span>}
                {p.moq != null && p.moq > 0 && <span className="shrink-0 text-[10px] text-amber-600">{t("ขั้นต่ำ", "MOQ")} {fmtNum(p.moq)}</span>}
                <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-800">{fmtBaht(p.price ?? 0)} {p.currency ?? ""}</span>
                {p.is_default && <span className="shrink-0 text-[10px] text-amber-500" title={t("ร้านหลักของสินค้านี้", "Main supplier for this product")}>★</span>}
              </button>
            ))}
          </div>
        )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
      <div className="text-[10px] text-slate-400">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-rose-600" : "text-slate-800"}`}>{value}</div>
    </div>
  );
}

/** แผงคำนวณค่าส่งจากขนาดกล่อง (กว้าง×ยาว×หนา → คิว → ค่าส่ง) */
function FreightPanel({ row, fx, rates, readonly, onChange, onClose }: {
  row: SupplierLine & { key: string };
  fx: number; rates: FreightRates; readonly: boolean;
  onChange: (p: Partial<SupplierLine>) => void;
  onClose: () => void;
}) {
  const t = useT();
  const c = calcSupplierLine(row, fx, rates);
  const numInput = (label: string, val: number | null, k: "box_w_cm" | "box_l_cm" | "box_h_cm") => (
    <label className="flex flex-col gap-0.5">
      <span className="text-[11px] text-slate-500">{label}</span>
      <input type="number" min={0} step="0.1" disabled={readonly} value={val ?? ""} onChange={(e) => onChange({ [k]: e.target.value === "" ? null : Number(e.target.value) } as Partial<SupplierLine>)}
        className="h-8 w-full rounded border border-slate-200 px-2 text-right text-sm disabled:bg-slate-50" />
    </label>
  );
  return (
    <div className="rounded-xl border-l-4 border-violet-400 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-700">{t("📐 คำนวณค่าส่ง", "📐 Freight calculator")} — {row.item_name || t("รายการ", "Item")}</span>
        <button onClick={onClose} className="ml-auto text-xs text-slate-400 hover:text-slate-700">{t("✕ ปิด", "✕ Close")}</button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {numInput(t("กว้าง (ซม.)", "Width (cm)"), row.box_w_cm, "box_w_cm")}
        {numInput(t("ยาว (ซม.)", "Length (cm)"), row.box_l_cm, "box_l_cm")}
        {numInput(t("หนา (ซม.)", "Height (cm)"), row.box_h_cm, "box_h_cm")}
        <Out label={t("Cube (ซม.³)", "Cube (cm³)")} value={fmtNum(Math.round(c.cubeCm3))} />
        <Out label={t("คิว/ชิ้น", "CBM/pc")} value={c.cbmPerPc.toFixed(6)} />
        <Out label={t("คิวตามจำนวน", "CBM for qty")} value={c.cbmTotal.toFixed(4)} />
        <label className="flex flex-col gap-0.5">
          <span className="text-[11px] text-slate-500">{t("ส่งแบบ / เรต (฿/คิว)", "Ship by / rate (฿/CBM)")}</span>
          <div className="flex gap-1">
            {(["truck", "ship"] as ShipMode[]).map((m) => (
              <button key={m} type="button" disabled={readonly}
                onClick={() => onChange({ ship_mode: m, ship_rate: null })}
                className={`h-8 shrink-0 rounded border px-2 text-xs ${row.ship_mode === m ? "border-violet-500 bg-violet-600 text-white" : "border-slate-200 bg-white text-slate-500"}`}>
                {m === "truck" ? t("🚚 รถ", "🚚 Truck") : t("🚢 เรือ", "🚢 Sea")}
              </button>
            ))}
            <input type="number" min={0} step="100" disabled={readonly}
              value={row.ship_rate ?? (row.ship_mode === "truck" ? rates.truck : rates.ship)}
              onChange={(e) => onChange({ ship_rate: e.target.value === "" ? null : Number(e.target.value) })}
              className="h-8 w-20 rounded border border-slate-200 px-1.5 text-right text-sm disabled:bg-slate-50" />
          </div>
        </label>
      </div>
      <p className="mt-2 text-[11.5px] text-slate-500">
        {fmtNum(row.box_w_cm ?? 0, 1)}×{fmtNum(row.box_l_cm ?? 0, 1)}×{fmtNum(row.box_h_cm ?? 0, 1)} {t("ซม.", "cm")} = {fmtNum(Math.round(c.cubeCm3))} {t("ซม.³", "cm³")}
        → {c.cbmPerPc.toFixed(6)} {t("คิว/ชิ้น", "CBM/pc")} × {fmtNum(row.qty ?? 0)} {t("ชิ้น", "pcs")} = <b>{c.cbmTotal.toFixed(4)} {t("คิว", "CBM")}</b> × {fmtNum(c.rate)} ฿
        = <b className="text-slate-700">{fmtBaht(c.freightTotal)} ฿</b> → {t("เฉลี่ยชิ้นละ", "avg per pc")} <b className="text-slate-700">{fmtBaht(c.freightPerPc)} ฿</b>
      </p>
    </div>
  );
}

function Out({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-slate-500">{label}</span>
      <div className="rounded border border-dashed border-violet-300 bg-violet-50/60 px-2 py-1.5 text-right text-sm font-semibold tabular-nums text-slate-700">{value}</div>
    </div>
  );
}

/** ตัวแก้รายการแบ่งกำไร (ใช้ทั้งแบบทั้งใบ และรายบรรทัด) */
function SplitEditor({ title, hint, base, splits, readonly, onChange, onClose }: {
  title: string; hint?: string; base: number; splits: ProfitSplit[]; readonly: boolean;
  onChange: (next: ProfitSplit[]) => void; onClose?: () => void;
}) {
  const t = useT();
  const total = splitAmount(splits, base);
  const set = (i: number, p: Partial<ProfitSplit>) => onChange(splits.map((s, j) => (j === i ? { ...s, ...p } : s)));
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-700">{title}</span>
        {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
        <span className="ml-auto text-[11px] text-slate-500">{t("ฐานกำไร", "Profit base")} <b className="tabular-nums">{fmtBaht(base)}</b> ฿</span>
        {onClose && <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-700">✕</button>}
      </div>
      <div className="space-y-1.5">
        {splits.length === 0 && <p className="text-[11px] text-slate-400">{t("ยังไม่มีใครแบ่ง — กดปุ่มด้านล่างเพื่อเพิ่ม", "No splits yet — use the button below to add one")}</p>}
        {splits.map((s, i) => {
          const amt = s.on === false ? 0 : (s.type === "pct" ? base * (Number(s.value) || 0) / 100 : (Number(s.value) || 0));
          return (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input type="checkbox" checked={s.on !== false} disabled={readonly} onChange={(e) => set(i, { on: e.target.checked })} className="h-4 w-4 accent-violet-600" />
              <input value={s.name} disabled={readonly} onChange={(e) => set(i, { name: e.target.value })} placeholder={t("ชื่อคนที่แบ่ง", "Person's name")}
                className="h-8 w-44 rounded border border-slate-200 px-2 text-sm disabled:bg-slate-50" />
              <div className="inline-flex overflow-hidden rounded-md border border-slate-200">
                {(["pct", "amt"] as const).map((ty) => (
                  <button key={ty} type="button" disabled={readonly} onClick={() => set(i, { type: ty })}
                    className={`h-8 px-2.5 text-[11px] font-medium ${s.type === ty ? "bg-violet-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                    {ty === "pct" ? t("% ของกำไร", "% of profit") : t("จำนวนเงิน", "Amount")}
                  </button>
                ))}
              </div>
              <input type="number" step={s.type === "pct" ? 1 : 100} disabled={readonly} value={s.value ?? 0} onChange={(e) => set(i, { value: Number(e.target.value) || 0 })}
                className="h-8 w-24 rounded border border-slate-200 px-2 text-right text-sm disabled:bg-slate-50" />
              <span className={`ml-auto text-sm font-semibold tabular-nums ${s.on === false ? "text-slate-300" : "text-emerald-600"}`}>{fmtBaht(amt)} ฿</span>
              {!readonly && <button onClick={() => onChange(splits.filter((_, j) => j !== i))} className="text-rose-400 hover:text-rose-600">🗑</button>}
            </div>
          );
        })}
      </div>
      {!readonly && (
        <button onClick={() => onChange([...splits, { name: "", type: "pct", value: 0, on: true }])}
          className="mt-2 text-xs text-violet-700 hover:underline">{t("＋ เพิ่มคนแบ่ง", "＋ Add person")}</button>
      )}
      {splits.length > 0 && <div className="mt-2 border-t border-slate-100 pt-1.5 text-right text-xs text-slate-500">{t("แบ่งออกไปรวม", "Total split out")} <b className="tabular-nums text-slate-700">{fmtBaht(total)}</b> ฿</div>}
    </div>
  );
}
