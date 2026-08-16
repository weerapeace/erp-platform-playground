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
import {
  calcSupplierLine, sumSupplierLines, splitAmount, emptySupplierLine, fmtBaht, fmtNum,
  DEFAULT_FREIGHT, DEFAULT_FX, type SupplierLine, type FreightRates, type ProfitSplit, type ShipMode,
} from "@/lib/supplier-quote";

type Row = SupplierLine & { key: string };
type ToastFn = (type: "success" | "error" | "info", m: string) => void;

const keyOf = (l: SupplierLine, i: number) => l.key ?? l.id ?? `r${i}`;
const pkey = (s: string | null | undefined) => s ?? "";

export function SupplierQuoteSection({ sheetId, parentCode, parentTabs, canEdit, canSeeCost, pushToast, onDirtyChange, saveRef }: {
  sheetId: string;
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
}) {
  const [all, setAll] = useState<Row[]>([]);
  const [splitsMap, setSplitsMap] = useState<Record<string, ProfitSplit[]>>({});   // แบ่งกำไรทั้งใบ แยกตามแท็บ
  const [fx, setFx] = useState(DEFAULT_FX);
  const [rates, setRates] = useState<FreightRates>(DEFAULT_FREIGHT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [splitOpenFor, setSplitOpenFor] = useState<string | null>(null);    // key บรรทัดที่กางแบ่งกำไรรายบรรทัด
  const [freightOpenFor, setFreightOpenFor] = useState<string | null>(null); // key บรรทัดที่กางแผงคำนวณค่าส่ง

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
  }, [sheetId]);

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
      pushToast("success", "บันทึกตีราคาจากร้านแล้ว");
    } catch (e) { pushToast("error", (e as Error).message); }
    finally { setSaving(false); }
  };

  // ให้หน้าแม่เรียกบันทึกได้ (ปุ่ม "บันทึกแล้วปิด" ตอนปิดป๊อป)
  useEffect(() => {
    if (!saveRef) return;
    saveRef.current = save;
    return () => { saveRef.current = null; };
  });

  // ── คอลัมน์ตาราง (ของกลาง LineItemsGrid) ───────────────────────────────
  const cols: LineColumn<Row>[] = [
    { key: "item_name", header: "รายการ", width: 190, align: "left",
      render: (r, u, ro) => <input value={r.item_name ?? ""} disabled={ro} onChange={(e) => u({ item_name: e.target.value })}
        placeholder="ชื่อสินค้า" className="h-8 w-full rounded border border-slate-200 px-2 text-sm disabled:bg-slate-50" /> },
    { key: "supplier", header: "ร้าน", width: 190, align: "left",
      render: (r, u, ro) => (
        <SupplierPicker disabled={ro}
          value={r.supplier_id ? { id: r.supplier_id, code: null, name: r.supplier_name ?? "" } : null}
          onChange={(v: SupplierPickerValue | null) => u({ supplier_id: v?.id ?? null, supplier_name: v?.name ?? null })}
          placeholder="เลือกร้าน..." />
      ) },
    { key: "price", header: "ราคาจากร้าน", width: 150, align: "right",
      render: (r, u, ro) => (
        <div className="flex items-center gap-1">
          <MoneyInput value={r.price} onChange={(raw) => u({ price: raw === "" ? null : Number(raw) })} disabled={ro} className="h-8 w-20 rounded border border-slate-200 px-1.5 text-right text-sm" />
          <button type="button" disabled={ro} title="สลับสกุลเงิน"
            onClick={() => u({ currency: r.currency === "CNY" ? "THB" : "CNY" })}
            className={`h-8 shrink-0 rounded border px-1.5 text-xs font-medium ${r.currency === "CNY" ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-500"}`}>
            {r.currency === "CNY" ? "¥" : "฿"}
          </button>
          <button type="button" disabled={ro} title={r.price_unit === "pack" ? "ราคานี้ต่อแพ็ค (กดสลับเป็นต่อชิ้น)" : "ราคานี้ต่อชิ้น (กดสลับเป็นต่อแพ็ค)"}
            onClick={() => u({ price_unit: r.price_unit === "pack" ? "pcs" : "pack", pack_qty: r.price_unit === "pack" ? null : (r.pack_qty ?? 1) })}
            className={`h-8 shrink-0 rounded border px-1.5 text-[11px] font-medium ${r.price_unit === "pack" ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-500"}`}>
            {r.price_unit === "pack" ? "/แพ็ค" : "/ชิ้น"}
          </button>
          {r.price_unit === "pack" && (
            <input type="number" min={1} step="1" disabled={ro} value={r.pack_qty ?? ""} onChange={(e) => u({ pack_qty: e.target.value === "" ? null : Number(e.target.value) })}
              title="กี่ชิ้นต่อแพ็ค" placeholder="ชิ้น/แพ็ค" className="h-8 w-16 rounded border border-violet-200 px-1 text-right text-xs" />
          )}
        </div>
      ) },
    ...(canSeeCost ? [{
      key: "price_baht", header: "= บาท/ชิ้น", width: 92, align: "right" as const,
      render: (r: Row) => <span className="tabular-nums text-slate-500">{fmtBaht(calcSupplierLine(r, fx, rates).priceBaht)}</span>,
    }] : []),
    { key: "qty", header: "จำนวนที่สั่ง", width: 96, align: "right",
      render: (r, u, ro) => <input type="number" min={0} step="1" disabled={ro} value={r.qty ?? ""} onChange={(e) => u({ qty: e.target.value === "" ? null : Number(e.target.value) })}
        className="h-8 w-full rounded border border-slate-200 px-2 text-right text-sm disabled:bg-slate-50" /> },
    { key: "freight", header: "ค่าส่ง/ชิ้น", width: 120, align: "right",
      render: (r) => {
        const c = calcSupplierLine(r, fx, rates);
        const hasBox = (r.box_w_cm ?? 0) > 0 && (r.box_l_cm ?? 0) > 0 && (r.box_h_cm ?? 0) > 0;
        return (
          <button type="button" onClick={() => { setSplitOpenFor(null); setFreightOpenFor(freightOpenFor === r.key ? null : r.key); }}
            title="กดเพื่อกางแผงคำนวณค่าส่ง (ขนาดกล่อง)"
            className={`h-8 w-full rounded border px-2 text-right text-sm tabular-nums ${hasBox ? "border-slate-200 bg-white text-slate-600" : "border-dashed border-amber-300 bg-amber-50 text-amber-600"}`}>
            {hasBox ? (canSeeCost ? fmtBaht(c.freightPerPc) : "—") : "📐 ใส่ขนาด"}
          </button>
        );
      } },
    ...(canSeeCost ? [{
      key: "cost", header: "ราคา+ค่าส่ง", width: 104, align: "right" as const, sortable: true,
      getValue: (r: Row) => calcSupplierLine(r, fx, rates).costPerPc,
      render: (r: Row) => <b className="tabular-nums text-slate-800">{fmtBaht(calcSupplierLine(r, fx, rates).costPerPc)}</b>,
    }] : []),
    { key: "offer_price", header: "ราคาที่จะเสนอ", width: 116, align: "right",
      render: (r, u, ro) => <MoneyInput value={r.offer_price} onChange={(raw) => u({ offer_price: raw === "" ? null : Number(raw) })} disabled={ro} className="h-8 w-full rounded border border-slate-200 px-2 text-right text-sm disabled:bg-slate-50" /> },
    { key: "sale_total", header: "รวมทั้งหมด", width: 110, align: "right", sortable: true,
      getValue: (r) => calcSupplierLine(r, fx, rates).saleTotal,
      render: (r) => <span className="tabular-nums text-slate-700">{fmtBaht(calcSupplierLine(r, fx, rates).saleTotal)}</span> },
    ...(canSeeCost ? [
      { key: "profit_pc", header: "กำไร/ชิ้น", width: 96, align: "right" as const, sortable: true,
        getValue: (r: Row) => calcSupplierLine(r, fx, rates).profitPerPc,
        render: (r: Row) => { const v = calcSupplierLine(r, fx, rates).profitPerPc; return <span className={`tabular-nums font-medium ${v >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{fmtBaht(v)}</span>; } },
      { key: "profit_total", header: "รวมกำไร", width: 110, align: "right" as const, sortable: true,
        getValue: (r: Row) => calcSupplierLine(r, fx, rates).profitTotal,
        render: (r: Row) => { const c = calcSupplierLine(r, fx, rates); return (
          <div className="flex items-center justify-end gap-1">
            <span className={`tabular-nums font-semibold ${c.profitTotal >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{fmtBaht(c.profitTotal)}</span>
            <button type="button" title="แบ่งกำไรเฉพาะรายการนี้" onClick={() => setSplitOpenFor(splitOpenFor === r.key ? null : r.key)}
              className={`h-6 shrink-0 rounded px-1 text-[11px] ${(r.split_json ?? []).length ? "bg-violet-100 text-violet-700" : "text-slate-300 hover:text-violet-600"}`}>🤝</button>
          </div>
        ); } },
    ] : []),
  ];

  // แถวที่กางแผงค่าส่ง / แบ่งกำไรรายบรรทัด (วางใต้ตาราง — LineItemsGrid ไม่มี expand row)
  const openRow = rows.find((r) => r.key === freightOpenFor);
  const splitRow = rows.find((r) => r.key === splitOpenFor);

  if (loading) return <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-400">กำลังโหลดตีราคาจากร้าน…</div>;

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/30 p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-800">🛒 คำนวณจากซัพพลายเออร์</h3>
        <span className="text-[11px] text-slate-400">สินค้าที่สั่งจากร้าน — ราคา + ค่าส่งตามคิว → กำไร</span>
        <span className="ml-auto text-[11px] text-slate-500">เรตหยวน <b>{fx}</b> ฿/¥ · รถ <b>{fmtNum(rates.truck)}</b> · เรือ <b>{fmtNum(rates.ship)}</b> ฿/คิว</span>
        {canEdit && (
          <button onClick={() => void save()} disabled={saving || !dirty}
            className="h-8 rounded-lg bg-violet-600 px-3 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-40">
            {saving ? "กำลังบันทึก…" : "💾 บันทึก"}{dirty ? " ●" : ""}
          </button>
        )}
      </div>

      {/* สรุปยอด */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          <Stat label="จำนวนรวม" value={`${fmtNum(totals.qty)} ชิ้น`} />
          <Stat label={`คิวรวม`} value={`${totals.cbm.toFixed(3)} คิว`} />
          {canSeeCost && <Stat label="ค่าส่งรวม" value={`${fmtBaht(totals.freight)} ฿`} />}
          {canSeeCost && <Stat label="ต้นทุนถึงมือรวม" value={`${fmtBaht(totals.cost)} ฿`} />}
          <Stat label="ยอดขายถ้าขายหมด" value={`${fmtBaht(totals.sale)} ฿`} />
          {canSeeCost && <Stat label="กำไรรวม" value={`${fmtBaht(totals.profit)} ฿`} tone={totals.profit >= 0 ? "good" : "bad"} />}
        </div>
      )}

      <LineItemsGrid<Row>
        rows={rows}
        columns={cols}
        onChange={(next) => setRows(next)}
        rowId={(r) => r.key}
        readonly={!canEdit}
        onAdd={() => ({ ...emptySupplierLine(parentCode || null, rows.length + 1), key: `n${Date.now()}_${rows.length}` } as Row)}
        addLabel="＋ เพิ่มรายการจากร้าน"
        emptyText="ยังไม่มีรายการสั่งจากร้าน — กดปุ่มด้านล่างเพื่อเพิ่มรายการแรก"
        onDuplicate={(r) => ({ ...r, id: undefined, key: `d${Date.now()}_${Math.round(Math.random() * 1e6)}` })}
        storageKey="ds-supplier-quote"
        footer={parentTabs && parentTabs.length > 1 ? <span className="text-[11px] text-slate-400">* รายการนี้อยู่แท็บ “{parentCode === "" ? "ทั่วไป" : parentCode}” เท่านั้น</span> : null}
      />

      {/* แผงคำนวณค่าส่ง (กางจากปุ่มค่าส่ง/ชิ้น) */}
      {openRow && (
        <FreightPanel row={openRow} fx={fx} rates={rates} readonly={!canEdit}
          onChange={(p) => patchRow(openRow.key, p)}
          onClose={() => setFreightOpenFor(null)} />
      )}

      {/* แบ่งกำไรเฉพาะรายการ */}
      {canSeeCost && splitRow && (
        <SplitEditor
          title={`🤝 แบ่งกำไรเฉพาะ “${splitRow.item_name || "รายการนี้"}”`}
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
            title="🤝 แบ่งกำไรทั้งใบ"
            hint="คิดจากกำไรรวมหลังหักส่วนแบ่งรายรายการแล้ว"
            base={totals.profitAfterLine}
            splits={splits}
            readonly={!canEdit}
            onChange={setSplits}
          />
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm">
            <span className="text-slate-600">กำไรสุทธิหลังแบ่งทั้งหมด</span>
            <b className={`ml-auto text-lg tabular-nums ${netProfit >= 0 ? "text-emerald-700" : "text-rose-600"}`}>{fmtBaht(netProfit)} ฿</b>
          </div>
        </>
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
        <span className="text-xs font-semibold text-slate-700">📐 คำนวณค่าส่ง — {row.item_name || "รายการ"}</span>
        <button onClick={onClose} className="ml-auto text-xs text-slate-400 hover:text-slate-700">✕ ปิด</button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {numInput("กว้าง (ซม.)", row.box_w_cm, "box_w_cm")}
        {numInput("ยาว (ซม.)", row.box_l_cm, "box_l_cm")}
        {numInput("หนา (ซม.)", row.box_h_cm, "box_h_cm")}
        <Out label="Cube (ซม.³)" value={fmtNum(Math.round(c.cubeCm3))} />
        <Out label="คิว/ชิ้น" value={c.cbmPerPc.toFixed(6)} />
        <Out label="คิวตามจำนวน" value={c.cbmTotal.toFixed(4)} />
        <label className="flex flex-col gap-0.5">
          <span className="text-[11px] text-slate-500">ส่งแบบ / เรต (฿/คิว)</span>
          <div className="flex gap-1">
            {(["truck", "ship"] as ShipMode[]).map((m) => (
              <button key={m} type="button" disabled={readonly}
                onClick={() => onChange({ ship_mode: m, ship_rate: null })}
                className={`h-8 shrink-0 rounded border px-2 text-xs ${row.ship_mode === m ? "border-violet-500 bg-violet-600 text-white" : "border-slate-200 bg-white text-slate-500"}`}>
                {m === "truck" ? "🚚 รถ" : "🚢 เรือ"}
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
        {fmtNum(row.box_w_cm ?? 0, 1)}×{fmtNum(row.box_l_cm ?? 0, 1)}×{fmtNum(row.box_h_cm ?? 0, 1)} ซม. = {fmtNum(Math.round(c.cubeCm3))} ซม.³
        → {c.cbmPerPc.toFixed(6)} คิว/ชิ้น × {fmtNum(row.qty ?? 0)} ชิ้น = <b>{c.cbmTotal.toFixed(4)} คิว</b> × {fmtNum(c.rate)} ฿
        = <b className="text-slate-700">{fmtBaht(c.freightTotal)} ฿</b> → เฉลี่ยชิ้นละ <b className="text-slate-700">{fmtBaht(c.freightPerPc)} ฿</b>
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
  const total = splitAmount(splits, base);
  const set = (i: number, p: Partial<ProfitSplit>) => onChange(splits.map((s, j) => (j === i ? { ...s, ...p } : s)));
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-700">{title}</span>
        {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
        <span className="ml-auto text-[11px] text-slate-500">ฐานกำไร <b className="tabular-nums">{fmtBaht(base)}</b> ฿</span>
        {onClose && <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-700">✕</button>}
      </div>
      <div className="space-y-1.5">
        {splits.length === 0 && <p className="text-[11px] text-slate-400">ยังไม่มีใครแบ่ง — กดปุ่มด้านล่างเพื่อเพิ่ม</p>}
        {splits.map((s, i) => {
          const amt = s.on === false ? 0 : (s.type === "pct" ? base * (Number(s.value) || 0) / 100 : (Number(s.value) || 0));
          return (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input type="checkbox" checked={s.on !== false} disabled={readonly} onChange={(e) => set(i, { on: e.target.checked })} className="h-4 w-4 accent-violet-600" />
              <input value={s.name} disabled={readonly} onChange={(e) => set(i, { name: e.target.value })} placeholder="ชื่อคนที่แบ่ง"
                className="h-8 w-44 rounded border border-slate-200 px-2 text-sm disabled:bg-slate-50" />
              <div className="inline-flex overflow-hidden rounded-md border border-slate-200">
                {(["pct", "amt"] as const).map((t) => (
                  <button key={t} type="button" disabled={readonly} onClick={() => set(i, { type: t })}
                    className={`h-8 px-2.5 text-[11px] font-medium ${s.type === t ? "bg-violet-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                    {t === "pct" ? "% ของกำไร" : "จำนวนเงิน"}
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
          className="mt-2 text-xs text-violet-700 hover:underline">＋ เพิ่มคนแบ่ง</button>
      )}
      {splits.length > 0 && <div className="mt-2 border-t border-slate-100 pt-1.5 text-right text-xs text-slate-500">แบ่งออกไปรวม <b className="tabular-nums text-slate-700">{fmtBaht(total)}</b> ฿</div>}
    </div>
  );
}
