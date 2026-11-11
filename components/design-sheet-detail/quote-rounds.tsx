"use client";
/**
 * รอบเสนอราคา แบบ "1 ครั้ง = 1 การ์ด" (เจ้าของขอ 2026-10-14: แถวซ้ำ 8 แถวจริง ๆ คือครั้งเดียว 2 ไซส์ × 4 ขั้นจำนวน)
 *
 * การ์ด = ครั้งที่ (batch) · วันที่ · สถานะรวม · หมายเหตุ · "ที่เปลี่ยนจากครั้งก่อน" (ต่อไซส์)
 * ข้างใน = ตารางไขว้: แถว = ไซส์ · คอลัมน์ = ขั้นจำนวน · ช่อง = ราคาที่เสนอ + กำไร/ชิ้น (+%) + สถานะช่อง + เทียบครั้งก่อน
 * เพิ่มครั้งใหม่ = ฟอร์มตารางไขว้กรอกทีเดียว (เตรียมไซส์/ขั้นจำนวนจากครั้งล่าสุดให้)
 * ✏️ แก้ไขครั้งที่เสนอแล้ว = ฟอร์มเดียวกัน ใส่ค่าของการ์ดนั้นมาให้ → บันทึกเฉพาะที่เปลี่ยน (แก้/ลบ/เพิ่มช่อง · เปลี่ยนตัวเลขขั้นจำนวน)
 *
 * ข้อมูล: design_sheet_quotes (1 แถว = 1 ช่อง; batch = ครั้งที่) · API /quotes (ช่อง) + /quotes/batch (ทั้งครั้ง)
 * 💰 ตัวช่วยตั้งราคา (เจ้าของขอ 2026-11-09) = ปุ่มบนแถบ → quote-pricing-helper.tsx → เลือกวิธีแล้ว "ใส่ราคา" = ตีราคาของทุกช่อง × ตัวคูณ (เปิดฟอร์มครั้งใหม่ให้ถ้ายังไม่เปิด)
 * แบบกะทัดรัด (เจ้าของเลือกแบบ A 2026-11-10): หัวการ์ดบรรทัดเดียว · แก้ไข/คัดลอก/ลบ อยู่ในปุ่ม ⋮ · ครั้งเก่าพับเหลือบรรทัดเดียว (โชว์ช่วงราคาที่เสนอต่อไซส์)
 *   เปิดครั้งล่าสุดไว้ให้ · ช่องราคา = ราคา + กำไร (%) บรรทัดเดียว · สถานะรายช่องโชว์ตอนชี้ (ถ้าทุกช่องสถานะเดียวกัน · จอสัมผัสโชว์ตลอด)
 * 🎨 หลายสีต่อไซส์ (เจ้าของขอ 2026-11-11): ฟอร์ม = แถวสีใต้ไซส์ · จำนวนต่อสีแยกตามขั้น (หรือใส่เป็น %) · แบ่งเท่ากัน · แยกราคาตามสี (± บาท จากราคาไซส์)
 *   เก็บที่ design_sheet_quotes.colors ทีละช่อง · กติกา lib/quote-colors · การ์ดโชว์จำนวนต่อสี + เตือนแบ่งไม่ครบ/เกิน · ส่งไปใบเสนอราคา 1 สี = 1 บรรทัด
 * ของกลาง: ConfirmDialog · Popover (เมนู ⋮) · InfoHint · useCanHover · useToast · apiFetch · lib/quote-pricing · lib/quote-colors
 */
import { Fragment, useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { tr } from "@/lib/lang";
import { useT } from "@/components/i18n";
import { QUOTE_STATUS, QUOTE_STATUS_OPTS } from "@/lib/design-sheets-meta";
import type { DesignSheetQuote } from "@/app/api/design-sheets/[id]/quotes/route";
import { Icon } from "@/components/icon";
import { Popover } from "@/components/popover";
import { InfoHint } from "@/components/info-hint";
import { useCanHover } from "@/lib/use-can-hover";
import { priceFromCost, tierPrice } from "@/lib/quote-pricing";
import { QuotePricingHelper, type PriceFill } from "./quote-pricing-helper";
import { QUOTE_COLOR_PALETTE, cleanQuoteColors, colorQtyStatus, colorUnitPrice, paletteHex, percentsToQty, qtyToPercent, splitEvenly, type QuoteColor } from "@/lib/quote-colors";

/** จุดสีของสินค้า (ไม่รู้สี = เทา) */
const ColorDot = ({ hex, title }: { hex: string | null | undefined; title?: string }) => (
  <span title={title} className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-slate-300" style={{ background: hex ?? "#cbd5e1" }} />
);

const fmtBaht = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtInt = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("th-TH"));
const sgn = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmtBaht(Math.abs(n))}`;
/** ตัวเลขสั้น: จำนวนเต็มไม่มีทศนิยม (45 · 45.50) — ใช้ในบรรทัดสรุป/กำไรใต้ราคา */
const fmtShort = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const sgnShort = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmtShort(Math.abs(n))}`;
const upDown = (n: number) => (n > 0.004 ? "text-emerald-700" : n < -0.004 ? "text-rose-600" : "text-slate-400");
const costCls = (n: number) => (n > 0.004 ? "text-rose-600" : n < -0.004 ? "text-emerald-700" : "text-slate-400");
const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d: string | null) => { if (!d) return "—"; const t = new Date(d); return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString(tr("th-TH", "en-GB"), { day: "2-digit", month: "2-digit", year: "numeric" }); };
const qtyKey = (q: number | null | undefined) => (q == null ? "" : String(q));
const byQty = (a: number | null, b: number | null) => (a == null ? 1 : b == null ? -1 : a - b);   // ไม่ระบุจำนวนไว้ท้าย

type Size = { key: string; label: string };
type Batch = { batch: number; part: number; quotes: DesignSheetQuote[]; date: string | null; note: string | null; sizes: string[]; qtys: (number | null)[]; status: string | "mixed" };

export function QuoteRounds({ sheetId, quotes, sizes, sizeLabel, currentCost, orderQtyFor, canEdit, costDirty, saveCost, onReload, onOpenVersions, onSendToQuotation, compact = false, pricingHelper = false }: {
  sheetId: string;
  quotes: DesignSheetQuote[];
  sizes: Size[];                                  // ไซส์/แท็บทั้งหมดของใบ (เรียงตามแท็บตีราคา)
  sizeLabel: (code: string | null) => string;
  currentCost: (key: string, qty?: number | null) => number;   // ตีราคาปัจจุบันของไซส์ (รวมที่ยังไม่บันทึก) · ส่ง qty = คิดค่าแบบ "หารจำนวนสั่ง" (ค่าบล็อก) ตามจำนวนนั้น
  orderQtyFor?: (key: string) => number | null;                 // จำนวนที่สั่งของไซส์ (แถบจำนวนที่สั่ง) — ตัวช่วยตั้งราคาใช้ตั้งต้น
  canEdit: boolean;
  costDirty: boolean; saveCost: () => Promise<boolean>;   // เพิ่มครั้งใหม่ → บันทึกตีราคาที่ค้างก่อน
  onReload: () => Promise<void>;
  onOpenVersions?: (a: string | null, b: string, parent: string) => void;   // ไม่ส่ง (มือถือ) = บอกให้ไปดูในหน้าเต็ม
  onSendToQuotation?: () => void;
  compact?: boolean;                              // มือถือ: ซ่อนคำอธิบายยาว ๆ
  pricingHelper?: boolean;                        // โชว์ปุ่ม 💰 ตัวช่วยตั้งราคา (คนเห็นต้นทุนเท่านั้น — API กันอีกชั้น)
}) {
  const t = useT();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const canHover = useCanHover();
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});   // การ์ดที่กดเปิด/พับเอง (ไม่กด = เปิดเฉพาะครั้งล่าสุด)
  const [delBatch, setDelBatch] = useState<Batch | null>(null);
  const [delCell, setDelCell] = useState<DesignSheetQuote | null>(null);
  const [editCell, setEditCell] = useState<{ id: string; val: string } | null>(null);
  const [editNote, setEditNote] = useState<{ batch: number; val: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addFrom, setAddFrom] = useState<Batch | null>(null);   // 📋 คัดลอกครั้งไหนมาเป็นครั้งใหม่ (null = ครั้งล่าสุด)
  const [editKey, setEditKey] = useState<string | null>(null);  // ✏️ การ์ดที่กำลังแก้ (`batch-part`) — เปิดได้ทีละใบ
  const cardKey = (b: Batch) => `${b.batch}-${b.part}`;
  const formOpen = addOpen || editKey !== null;
  const [helperOpen, setHelperOpen] = useState(false);
  const [fill, setFill] = useState<PriceFill | null>(null);   // ส่งให้ฟอร์มที่เปิดอยู่ (ครั้งใหม่ หรือที่กำลังแก้)
  const applyPrice = (f: Omit<PriceFill, "id">) => {
    setFill({ ...f, id: Date.now() });
    if (!formOpen) { setAddFrom(null); setAddOpen(true); }   // ยังไม่เปิดฟอร์ม → เปิด "เสนอราคาครั้งใหม่" แล้วใส่ราคาให้
  };
  useEffect(() => { if (!formOpen) setFill(null); }, [formOpen]);   // ฟอร์มปิดแล้ว ล้างทิ้ง — ไม่ให้ฟอร์มที่เปิดทีหลังโดนใส่ราคาซ้ำ
  const openV = onOpenVersions ?? (() => toast.warning(tr("ดูรายละเอียดเทียบเวอร์ชันตีราคาได้ในหน้าเต็ม (คอมพิวเตอร์)", "Open the full page (on a computer) to compare costing versions")));

  // จัดกลุ่มเป็น "ครั้ง" (batch) — แถวเก่าที่ยังไม่มี batch ใช้วันที่แทน
  const batches = useMemo<Batch[]>(() => {
    const m = new Map<number, DesignSheetQuote[]>();
    const dateKeys = new Map<string, number>();
    for (const q of quotes) {
      let b = q.batch ?? null;
      if (b == null) { const dk = q.quote_date ?? "?"; if (!dateKeys.has(dk)) dateKeys.set(dk, -(dateKeys.size + 1)); b = dateKeys.get(dk)!; }
      (m.get(b) ?? m.set(b, []).get(b)!).push(q);
    }
    const order = new Map(sizes.map((s, i) => [s.key, i]));
    const out: Batch[] = [];
    [...m.entries()].sort((a, b) => a[0] - b[0]).forEach(([batch, all], i) => {
      // ข้อมูลเก่าอาจมีหลายแถวที่ไซส์+จำนวนซ้ำกันในวันเดียว (เช่น เสนอใหม่ไม่ระบุจำนวน) → แยกเป็น "รายการที่ 2, 3…" ไม่ให้แถวหาย
      const parts: DesignSheetQuote[][] = [];
      for (const q of [...all].sort((a, b) => a.round - b.round)) {
        const k = `${q.parent_code ?? ""}|${qtyKey(q.qty)}`;
        let part = parts.find((p) => !p.some((x) => `${x.parent_code ?? ""}|${qtyKey(x.qty)}` === k));
        if (!part) { part = []; parts.push(part); }
        part.push(q);
      }
      parts.forEach((qs, pi) => {
        const sz = [...new Set(qs.map((q) => q.parent_code ?? ""))].sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
        const qtys = [...new Set(qs.map((q) => q.qty ?? null))].sort((a, b) => (a == null ? 1 : b == null ? -1 : a - b));
        const sts = new Set(qs.map((q) => q.status));
        out.push({ batch: batch > 0 ? batch : i + 1, part: pi, quotes: qs, date: qs[0]?.quote_date ?? null, note: qs.find((q) => q.note)?.note ?? null, sizes: sz, qtys, status: sts.size === 1 ? qs[0].status : "mixed" });
      });
    });
    return out;
  }, [quotes, sizes]);
  const cellOf = (b: Batch, size: string, qty: number | null) => b.quotes.find((q) => (q.parent_code ?? "") === size && qtyKey(q.qty) === qtyKey(qty)) ?? null;

  const call = async (fn: () => Promise<void>, ok?: string) => {
    if (busy) return; setBusy(true);
    try { await fn(); await onReload(); if (ok) toast.success(ok); }
    catch (e) { toast.error(e instanceof Error ? e.message : tr("ไม่สำเร็จ", "Failed")); }
    finally { setBusy(false); }
  };
  const api = async (path: string, init?: RequestInit) => { const r = await apiFetch(path, init); const j = await r.json(); if (j.error) throw new Error(j.error); return j; };
  const json = (body: unknown, method = "PATCH"): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const patchCell = (q: DesignSheetQuote, patch: Record<string, unknown>) => call(async () => { await api(`/api/design-sheets/${sheetId}/quotes/${q.id}`, json(patch)); });
  const patchBatch = (b: Batch, patch: Record<string, unknown>, ok?: string) => call(async () => { await api(`/api/design-sheets/${sheetId}/quotes/batch`, json({ batch: b.batch, ...patch })); }, ok);
  const commitCell = (q: DesignSheetQuote) => {
    if (!editCell || editCell.id !== q.id) return;
    const v = editCell.val.trim(); setEditCell(null);
    const n = v === "" ? null : Number(v);
    if (v !== "" && (!Number.isFinite(n) || (n as number) < 0)) { toast.error(tr("ราคาต้องเป็นตัวเลขไม่ติดลบ", "Price must be a non-negative number")); return; }
    if ((n ?? null) === (q.offered_price ?? null)) return;
    void patchCell(q, { offered_price: n });
  };
  // 🎨 แถวสีใต้ไซส์ในการ์ด: ชิปสี (+ ราคาต่าง) · ช่องละขั้น = จำนวนต่อสี + เตือนแบ่งไม่ครบ/เกิน · ไม่มีสี = ไม่มีแถว
  const colorRow = (b: Batch, size: string) => {
    const per = b.qtys.map((qty) => cleanQuoteColors(cellOf(b, size, qty)?.colors));
    const names: { name: string; hex: string | null; delta: number | null }[] = [];
    for (const cs of per) for (const c of cs ?? []) if (!names.some((x) => x.name === c.name)) names.push({ name: c.name, hex: c.hex, delta: c.delta });
    if (!names.length) return null;
    return (
      <tr className="border-t border-slate-50">
        <td className="px-3 py-1 pl-6 text-[10px] text-slate-400">{t("สี", "Colors")}</td>
        <td className="px-2 py-1">
          <div className="flex flex-wrap justify-end gap-1">
            {names.map((c) => (
              <span key={c.name} className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-1.5 text-[10px] text-slate-600">
                <ColorDot hex={c.hex} />{c.name}{c.delta ? <span className="text-slate-400">{c.delta > 0 ? "+" : "−"}{fmtShort(Math.abs(c.delta))}</span> : null}
              </span>
            ))}
          </div>
        </td>
        {b.qtys.map((qty, i) => {
          const cs = per[i]; const st = colorQtyStatus(cs, qty);
          return (
            <td key={qtyKey(qty)} className="px-2 py-1 text-right align-top bg-blue-50/10">
              <div className="flex flex-col items-end gap-0.5 text-[10px] tabular-nums text-slate-600">
                {(cs ?? []).map((c) => <span key={c.name} className="inline-flex items-center gap-1" title={c.name}><ColorDot hex={c.hex} title={c.name} />{c.qty != null ? fmtInt(c.qty) : "—"}</span>)}
                {st.state === "under" && <span className="text-amber-600">{t(`ยังไม่แบ่ง ${fmtInt(st.remaining)}`, `${fmtInt(st.remaining)} unassigned`)}</span>}
                {st.state === "over" && <span className="text-rose-600">{t(`เกิน ${fmtInt(-st.remaining)}`, `${fmtInt(-st.remaining)} over`)}</span>}
              </div>
            </td>
          );
        })}
      </tr>
    );
  };
  const addCell = (b: Batch, size: string, qty: number | null) => call(async () => {
    const cost = currentCost(size, qty);
    await api(`/api/design-sheets/${sheetId}/quotes`, json({ quote_date: b.date ?? todayStr(), price: cost > 0 ? cost : null, offered_price: cost > 0 ? cost : null, qty, status: b.status === "mixed" ? "pending" : b.status, note: null, parent_code: size, batch: b.batch }, "POST"));
  }, tr("เพิ่มช่องแล้ว — กดตัวเลขเพื่อแก้ราคาที่เสนอ", "Cell added — click the number to edit the offered price"));

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 text-sm font-semibold text-slate-700">
            {t("รอบเสนอราคา", "Quote rounds")}{batches.length > 0 && <span className="text-xs font-normal text-slate-400">({batches.length})</span>}
            {!compact && <InfoHint label={t("วิธีใช้รอบเสนอราคา", "How quote rounds work")}>{t("1 ครั้ง = 1 การ์ด (หลายไซส์ × หลายขั้นจำนวน) · กดตัวเลขราคาเพื่อแก้ · สถานะตั้งได้ทั้งครั้งหรือรายช่อง · ครั้งเก่าพับไว้ กดหัวการ์ดเพื่อเปิดดู", "1 round = 1 card (sizes × quantity tiers) · click a price to edit · set status for the whole round or per cell · older rounds are folded — click the header to open")}</InfoHint>}
          </div>
          <div className="flex flex-wrap gap-1">
            {pricingHelper && <button type="button" onClick={() => setHelperOpen(true)} className="h-7 px-2.5 text-xs border border-emerald-300 text-emerald-700 rounded-md hover:bg-emerald-50 whitespace-nowrap inline-flex items-center gap-1" title={t("บวกกำไรจากต้นทุน · เทียบงานอื่นในแบรนด์ · ปัดราคา · VAT · ย้อนจากงบลูกค้า", "Markup on cost · compare jobs in this brand · rounding · VAT · from budget")}><Icon value="i:calculator" className="text-[14px]" />{t("ตัวช่วยตั้งราคา", "Pricing helper")}</button>}
            {onSendToQuotation && <button type="button" onClick={onSendToQuotation} className="h-7 px-2.5 text-xs border border-indigo-300 text-indigo-700 rounded-md hover:bg-indigo-50 whitespace-nowrap inline-flex items-center gap-1"><Icon value="i:send" className="text-[14px]" />{t("ส่งไปใบเสนอราคา", "Send to quotation")}</button>}
            <button type="button" onClick={() => { setAddFrom(null); setAddOpen(true); }} disabled={formOpen} title={editKey ? t("บันทึกหรือยกเลิกการแก้ไขก่อน", "Save or cancel the edit first") : undefined} className="h-7 px-2.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">{t("＋ ครั้งที่", "＋ Round")} {Math.max(0, ...batches.map((x) => x.batch)) + 1}</button>
          </div>
        </div>
      )}

      {pricingHelper && helperOpen && (
        <QuotePricingHelper open onClose={() => setHelperOpen(false)} sheetId={sheetId} sizes={sizes} currentCost={currentCost} orderQtyFor={orderQtyFor}
          qtys={batches.at(-1)?.qtys ?? [100, 200, 500, 1000]} onApply={applyPrice} />
      )}

      {addOpen && (
        <RoundEditor sheetId={sheetId} nextBatch={Math.max(0, ...batches.map((x) => x.batch)) + 1} sizes={sizes} sizeLabel={sizeLabel} currentCost={currentCost} last={addFrom ?? batches.at(-1) ?? null} copiedFrom={addFrom?.batch ?? null} fill={fill}
          costDirty={costDirty} saveCost={saveCost} onClose={() => { setAddOpen(false); setAddFrom(null); }}
          onSaved={async (n) => { setAddOpen(false); setAddFrom(null); await onReload(); toast.success(tr(`เสนอราคาครั้งที่ ${n} แล้ว`, `Quote round ${n} saved`)); }} />
      )}

      {batches.length === 0 && !addOpen && <div className="py-8 text-center text-sm text-slate-300">{t("— ยังไม่เคยเสนอราคา —", "— No quotes yet —")}</div>}

      {[...batches].reverse().map((b, bi) => {
        const isOpen = openMap[cardKey(b)] ?? bi === 0;   // ครั้งล่าสุดเปิดไว้ ครั้งเก่าพับ
        const toggle = () => setOpenMap((m) => ({ ...m, [cardKey(b)]: !isOpen }));
        // บรรทัดสรุปตอนพับ: ช่วงราคาที่เสนอต่อไซส์ เช่น "S 45–60 · M 50–65"
        const priceSummary = b.sizes.map((s) => {
          const ps = b.quotes.filter((q) => (q.parent_code ?? "") === s).map((q) => q.offered_price ?? q.price).filter((v): v is number => v != null);
          if (!ps.length) return null;
          const lo = Math.min(...ps), hi = Math.max(...ps);
          return `${sizeLabel(s)} ${fmtShort(lo)}${hi !== lo ? `–${fmtShort(hi)}` : ""}`;
        }).filter(Boolean).join(" · ");
        const prev = [...batches].reverse().find((x) => x.batch < b.batch) ?? null;   // ครั้งก่อนหน้า (ไว้เทียบราคาที่เสนอช่องต่อช่อง)
        const st = b.status === "mixed" ? null : (QUOTE_STATUS[b.status] ?? QUOTE_STATUS.pending);
        // "ที่เปลี่ยนจากครั้งก่อน" ต่อไซส์ (API คำนวณจากเวอร์ชันตีราคา) — เอาช่องแรกของแต่ละไซส์
        const changes = b.sizes.map((s) => ({ size: s, q: b.quotes.find((q) => (q.parent_code ?? "") === s) })).filter((x) => x.q?.changes || x.q?.cost_snapshot_id);
        if (editKey === cardKey(b)) return (
          <RoundEditor key={`edit-${cardKey(b)}`} sheetId={sheetId} nextBatch={b.batch} sizes={sizes} sizeLabel={sizeLabel} currentCost={currentCost} last={null} editing={b} fill={fill}
            costDirty={costDirty} saveCost={saveCost} onClose={() => setEditKey(null)} onReload={onReload}
            onSaved={async (n) => { setEditKey(null); await onReload(); toast.success(tr(`บันทึกการแก้ไขครั้งที่ ${n} แล้ว`, `Round ${n} changes saved`)); }} />
        );
        return (
          <div key={`${b.batch}-${b.part}`} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            {/* หัวการ์ด (บรรทัดเดียว): ▸ ครั้งที่ · วันที่ · สถานะรวม · หมายเหตุ / สรุปราคา (ตอนพับ) · ⋮ */}
            <div className={`flex items-center gap-1.5 px-2 py-1 bg-slate-50 ${isOpen ? "border-b border-slate-200" : ""}`}>
              <button type="button" onClick={toggle} aria-expanded={isOpen} title={isOpen ? t("พับการ์ดนี้", "Fold this card") : t("เปิดดูการ์ดนี้", "Open this card")} className="flex items-center gap-1 shrink-0">
                <Icon value="i:chevron-down" className={`text-[14px] text-slate-400 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                <span className="h-6 min-w-[2.5rem] px-2 rounded-md bg-slate-800 text-white text-[11px] font-semibold flex items-center justify-center whitespace-nowrap" title={b.part > 0 ? t("วันเดียวกันมีหลายรายการที่ไซส์/จำนวนซ้ำกัน (ข้อมูลเก่า) — แยกให้เห็นครบ", "Same day has several entries with the same size/qty (old data) — shown separately") : undefined}>{t(`ครั้งที่ ${b.batch}`, `Round ${b.batch}`)}{b.part > 0 ? t(` · รายการที่ ${b.part + 1}`, ` · entry ${b.part + 1}`) : ""}</span>
              </button>
              {canEdit && isOpen
                ? <input type="date" value={b.date ?? ""} onChange={(e) => void patchBatch(b, { quote_date: e.target.value || null })} className="h-6 px-1 text-[11px] border border-slate-200 rounded-md bg-white shrink-0" />
                : <span className="text-[11px] text-slate-500 shrink-0 tabular-nums">{fmtDate(b.date)}</span>}
              {canEdit && isOpen ? (
                <select value={b.status} onChange={(e) => { if (e.target.value !== "mixed") void patchBatch(b, { status: e.target.value }, tr("ตั้งสถานะทั้งครั้งแล้ว", "Status set for the whole round")); }} title={t("สถานะทั้งครั้ง (ทุกช่อง) — ตั้งรายช่องได้ในตาราง", "Status for the whole round (all cells) — set per cell in the table")}
                  className={`h-6 px-1 text-[11px] rounded-md cursor-pointer shrink-0 ${st ? st.cls : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
                  {b.status === "mixed" && <option value="mixed">{t("◐ ผสม (ตั้งรายช่อง)", "◐ Mixed (set per cell)")}</option>}
                  {QUOTE_STATUS_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              ) : <span className={`text-[11px] px-1.5 py-0.5 rounded shrink-0 ${st ? st.cls : "bg-amber-50 text-amber-700"}`}>{st ? st.label : t("◐ ผสม", "◐ Mixed")}</span>}
              {/* พับอยู่ = บรรทัดสรุปราคา (กดเพื่อเปิด) · เปิดอยู่ = หมายเหตุ กดเพื่อแก้ (บันทึกทุกช่องของครั้งนี้) */}
              {!isOpen ? (
                <button type="button" onClick={toggle} className="flex-1 min-w-0 text-left text-[11px] truncate" title={[priceSummary, b.note].filter(Boolean).join("\n")}>
                  <span className="text-slate-400">{t(`${b.sizes.length} ไซส์ × ${b.qtys.length} ขั้น`, `${b.sizes.length} sizes × ${b.qtys.length} tiers`)}</span>
                  {priceSummary && <span className="ml-1.5 font-medium text-blue-700 tabular-nums">{priceSummary}</span>}
                  {b.note && <span className="ml-1.5 text-slate-400">· {b.note}</span>}
                </button>
              ) : editNote?.batch === b.batch ? (
                <input autoFocus value={editNote.val} onChange={(e) => setEditNote({ batch: b.batch, val: e.target.value })}
                  onBlur={() => { const v = editNote.val; setEditNote(null); if (v.trim() !== (b.note ?? "")) void patchBatch(b, { note: v }); }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditNote(null); }}
                  className="h-6 flex-1 min-w-[8rem] px-2 text-[11px] border border-blue-300 rounded-md" placeholder={t("หมายเหตุ", "Note")} />
              ) : (
                <button type="button" disabled={!canEdit} onClick={() => setEditNote({ batch: b.batch, val: b.note ?? "" })} className="flex-1 min-w-0 inline-flex items-center gap-1 text-left text-[11px] text-slate-500 hover:text-slate-800 disabled:cursor-default" title={canEdit ? t("กดเพื่อแก้หมายเหตุ", "Click to edit the note") : undefined}>
                  {b.note ? <><Icon value="i:notes" className="text-[12px] shrink-0 text-slate-400" /><span className="truncate">{b.note}</span></> : (canEdit ? <span className="text-slate-300">{t("＋ หมายเหตุ", "＋ Note")}</span> : null)}
                </button>
              )}
              {canEdit && (
                <Popover align="right" panelClassName="w-56 py-1"
                  trigger={(open, opened) => (
                    <button type="button" onClick={open} aria-label={t("คำสั่งของครั้งนี้", "Round actions")} title={t("แก้ไข · คัดลอกเป็นครั้งใหม่ · ลบ", "Edit · copy as new round · delete")}
                      className={`h-6 w-6 shrink-0 inline-flex items-center justify-center rounded-md border text-slate-500 bg-white hover:bg-slate-50 ${opened ? "border-slate-400" : "border-slate-200"}`}>
                      <Icon value="i:dots-vertical" className="text-[14px]" />
                    </button>
                  )}>
                  {(close) => {
                    const item = "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent";
                    return (
                      <>
                        <button type="button" disabled={formOpen} className={`${item} text-slate-700`} title={formOpen ? t("บันทึกหรือยกเลิกฟอร์มที่เปิดอยู่ก่อน", "Save or cancel the open form first") : t("แก้ทั้งการ์ด: ราคา · ไซส์ · ขั้นจำนวน · วันที่ · สถานะ · หมายเหตุ", "Edit the whole card: prices · sizes · quantity tiers · date · status · note")}
                          onClick={() => { close(); setOpenMap((m) => ({ ...m, [cardKey(b)]: true })); setEditKey(cardKey(b)); }}>
                          <Icon value="i:pencil" className="text-[15px] text-slate-400" />{t("แก้ไข", "Edit")}</button>
                        <button type="button" disabled={formOpen} className={`${item} text-blue-700`} title={t("เปิดฟอร์มครั้งใหม่ โดยใส่ไซส์/ขั้นจำนวน/ราคาของครั้งนี้มาให้แก้ต่อ (ต่อรองรอบถัดไป)", "Open a new round prefilled with this round's sizes/quantity tiers/prices (for the next negotiation)")}
                          onClick={() => { close(); setAddFrom(b); setAddOpen(true); }}>
                          <Icon value="i:copy" className="text-[15px]" />{t("คัดลอกเป็นครั้งใหม่", "Copy as new round")}</button>
                        <div className="my-1 border-t border-slate-100" />
                        <button type="button" className={`${item} text-rose-600`} onClick={() => { close(); setDelBatch(b); }}>
                          <Icon value="i:trash" className="text-[15px]" />{t("ลบครั้งนี้", "Delete round")}</button>
                      </>
                    );
                  }}
                </Popover>
              )}
            </div>

            {isOpen && <>
            {/* ที่เปลี่ยนจากครั้งก่อน (ต่อไซส์) */}
            {changes.length > 0 && (
              <div className="px-3 py-1.5 border-b border-slate-100 bg-amber-50/40 text-[11px] space-y-0.5">
                {changes.map(({ size, q }) => q!.changes ? (
                  q!.changes.text
                    ? <div key={size}><span className="text-slate-500">{sizeLabel(size)}:</span>{" "}
                        <button type="button" onClick={() => openV(q!.changes!.prev_snapshot_id, q!.changes!.snapshot_id, size)} className={`text-left hover:underline ${q!.changes.total_diff > 0 ? "text-rose-700" : q!.changes.total_diff < 0 ? "text-emerald-700" : "text-slate-600"}`} title={t("กดดูรายละเอียดเทียบเวอร์ชันตีราคา", "Click to compare costing versions")}>🔁 {q!.changes.text}</button></div>
                    : <div key={size} className="text-slate-400">{sizeLabel(size)}: {t(`ต้นทุนเหมือนครั้งที่ ${q!.changes.prev_round}`, `Same cost as round ${q!.changes.prev_round}`)}</div>
                ) : (
                  <div key={size} className="text-slate-400">{sizeLabel(size)}: <button type="button" onClick={() => openV(q!.cost_snapshot_id ?? null, "current", size)} className="hover:underline">{t("ครั้งแรกของไซส์นี้ · ดูต้นทุนที่ใช้", "First round for this size · view the cost used")}</button></div>
                ))}
              </div>
            )}

            {/* ตารางไขว้: ไซส์ × ขั้นจำนวน */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-[11px] text-slate-500">
                    <th className="px-3 py-1.5 text-left font-medium w-28">{t("ไซส์", "Size")}</th>
                    <th className="px-2 py-1.5 text-right font-medium w-36" title={t("ราคาจากตีราคาตอนเสนอ → ตีราคาปัจจุบันของไซส์นี้ (ต้นทุนขึ้น=แดง ลง=เขียว)", "Costing at quote time → current costing for this size (cost up = red, down = green)")}>{t("ตีราคา → ปัจจุบัน", "Costing → now")}</th>
                    {b.qtys.map((qty) => <th key={qtyKey(qty)} className="px-2 py-1.5 text-right font-medium min-w-[7rem] bg-blue-50/60 text-blue-700">{qty == null ? t("ไม่ระบุจำนวน", "No qty") : t(`${fmtInt(qty)} ชิ้น`, `${fmtInt(qty)} pcs`)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {b.sizes.map((size) => {
                    const first = b.quotes.find((q) => (q.parent_code ?? "") === size);
                    const costAt = first?.price ?? null; const cur = currentCost(size, first?.qty); const dCost = costAt != null && cur > 0 ? cur - costAt : null;
                    return (
                      <Fragment key={size}>
                      <tr className="border-t border-slate-100">
                        <td className="px-3 py-1.5 text-xs font-medium text-slate-700">{sizeLabel(size)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums leading-tight">
                          <div className="text-slate-500 text-xs">{fmtBaht(costAt)}</div>
                          {dCost != null && (first?.cost_snapshot_id
                            ? <button type="button" onClick={() => openV(first.cost_snapshot_id ?? null, "current", size)} className={`text-[10px] hover:underline ${Math.abs(dCost) < 0.005 ? "text-slate-400" : costCls(dCost)}`} title={t("กดดูว่าวัสดุอะไรเปลี่ยน", "Click to see which materials changed")}>{Math.abs(dCost) < 0.005 ? t("= ปัจจุบัน", "= current") : `→ ${fmtBaht(cur)} (${sgn(dCost)})`}</button>
                            : <div className={`text-[10px] ${Math.abs(dCost) < 0.005 ? "text-slate-400" : costCls(dCost)}`} title={t(`ตีราคาปัจจุบัน ${fmtBaht(cur)} − ตอนเสนอ ${fmtBaht(costAt)}`, `Current costing ${fmtBaht(cur)} − at quote ${fmtBaht(costAt)}`)}>{Math.abs(dCost) < 0.005 ? t("= ปัจจุบัน", "= current") : `→ ${fmtBaht(cur)} (${sgn(dCost)})`}</div>)}
                        </td>
                        {b.qtys.map((qty) => {
                          const q = cellOf(b, size, qty);
                          if (!q) return (
                            <td key={qtyKey(qty)} className="px-2 py-1.5 text-right text-slate-300 bg-blue-50/20">
                              {canEdit ? <button type="button" onClick={() => void addCell(b, size, qty)} className="text-xs hover:text-blue-600" title={t("เพิ่มช่องนี้ (ราคาเริ่มต้น = ตีราคาปัจจุบัน)", "Add this cell (starting price = current costing)")}>＋</button> : "—"}
                            </td>
                          );
                          const offered = q.offered_price ?? q.price;
                          const margin = offered != null && q.price != null ? offered - q.price : null;
                          const pct = margin != null && offered ? (margin / offered) * 100 : null;
                          const pq = prev ? cellOf(prev, size, qty) : null; const pOff = pq ? (pq.offered_price ?? pq.price) : null;
                          const vs = pOff != null && offered != null ? offered - pOff : null;
                          const cst = QUOTE_STATUS[q.status] ?? QUOTE_STATUS.pending;
                          const isEd = editCell?.id === q.id;
                          // ทุกช่องสถานะเดียวกัน (ตั้งที่หัวการ์ดแล้ว) → ซ่อนตัวเลือกรายช่องจนกว่าจะชี้ · จอสัมผัสชี้ไม่ได้ = โชว์ตลอด
                          const quietStatus = b.status !== "mixed" && canHover;
                          return (
                            <td key={q.id} className="px-2 py-1.5 text-right tabular-nums bg-blue-50/20 leading-tight align-top group">
                              {isEd ? (
                                <input autoFocus type="number" min={0} step="any" value={editCell!.val} onChange={(e) => setEditCell({ id: q.id, val: e.target.value })}
                                  onBlur={() => commitCell(q)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditCell(null); }}
                                  className="h-7 w-24 px-1 text-sm text-right border border-blue-400 rounded-md" />
                              ) : (
                                <span className="inline-flex items-baseline justify-end gap-1 whitespace-nowrap">
                                  <button type="button" disabled={!canEdit} onClick={() => setEditCell({ id: q.id, val: offered != null ? String(offered) : "" })} className="font-semibold text-blue-700 hover:underline disabled:no-underline disabled:cursor-default" title={canEdit ? t("กดเพื่อแก้ราคาที่เสนอ", "Click to edit the offered price") : undefined}>{fmtBaht(offered)}</button>
                                  {margin != null && (
                                    <span className={`text-[10px] ${upDown(margin)}`} title={`${t(`กำไร ${sgn(margin)}/ชิ้น`, `Profit ${sgn(margin)}/pc`)}${pct != null ? t(` (${pct.toFixed(1)}% ของราคาที่เสนอ)`, ` (${pct.toFixed(1)}% of offered price)`) : ""}${q.qty != null ? t(` · รวม ${sgn(margin * q.qty)} (${fmtInt(q.qty)} ชิ้น)`, ` · total ${sgn(margin * q.qty)} (${fmtInt(q.qty)} pcs)`) : ""}`}>
                                      {sgnShort(margin)}{pct != null ? ` (${pct.toFixed(0)}%)` : ""}
                                    </span>
                                  )}
                                </span>
                              )}
                              <div className="flex items-center justify-end gap-1 mt-0.5">
                                {vs != null && <span className={`text-[10px] ${vs === 0 ? "text-slate-300" : "text-slate-500"}`} title={t(`ครั้งที่ ${prev?.batch} เสนอ ${fmtBaht(pOff)}`, `Round ${prev?.batch} offered ${fmtBaht(pOff)}`)}>{vs === 0 ? "=" : sgn(vs)}</span>}
                                {canEdit
                                  ? <select value={q.status} onChange={(e) => void patchCell(q, { status: e.target.value })} title={t("สถานะช่องนี้", "Status of this cell")} className={`h-5 px-1 text-[10px] rounded cursor-pointer ${cst.cls} ${quietStatus ? "opacity-0 group-hover:opacity-100 focus:opacity-100" : ""}`}>{QUOTE_STATUS_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                                  : b.status === "mixed" ? <span className={`text-[10px] px-1 rounded ${cst.cls}`}>{cst.label}</span> : null}
                                {canEdit && <button type="button" onClick={() => setDelCell(q)} className="text-[10px] text-slate-300 opacity-0 group-hover:opacity-100 hover:text-rose-500" title={t("ลบช่องนี้", "Delete this cell")}>✕</button>}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                      {colorRow(b, size)}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>}
          </div>
        );
      })}

      <ConfirmDialog open={delBatch !== null} onClose={() => setDelBatch(null)} title={t(`ลบการเสนอราคาครั้งที่ ${delBatch?.batch ?? ""}`, `Delete quote round ${delBatch?.batch ?? ""}`)} variant="danger" confirmText={t("ลบทั้งครั้ง", "Delete round")} cancelText={t("ยกเลิก", "Cancel")}
        message={t(`ลบทุกช่องของครั้งนี้ (${delBatch?.quotes.length ?? 0} ช่อง · ${delBatch?.sizes.length ?? 0} ไซส์) หรือไม่? ย้อนกลับไม่ได้`, `Delete every cell in this round (${delBatch?.quotes.length ?? 0} cells · ${delBatch?.sizes.length ?? 0} sizes)? This can't be undone.`)}
        onConfirm={async () => { const b = delBatch; setDelBatch(null); if (b) await call(async () => { await api(`/api/design-sheets/${sheetId}/quotes/batch?batch=${b.batch}`, { method: "DELETE" }); }, tr("ลบครั้งนี้แล้ว", "Round deleted")); }} />
      <ConfirmDialog open={delCell !== null} onClose={() => setDelCell(null)} title={t("ลบช่องราคา", "Delete price cell")} variant="danger" confirmText={t("ลบ", "Delete")} cancelText={t("ยกเลิก", "Cancel")}
        message={delCell ? t(`ลบ ${sizeLabel(delCell.parent_code)} ${delCell.qty != null ? fmtInt(delCell.qty) + " ชิ้น" : ""} ราคา ${fmtBaht(delCell.offered_price ?? delCell.price)} ออกจากครั้งนี้?`, `Remove ${sizeLabel(delCell.parent_code)} ${delCell.qty != null ? fmtInt(delCell.qty) + " pcs" : ""} at ${fmtBaht(delCell.offered_price ?? delCell.price)} from this round?`) : ""}
        onConfirm={async () => { const q = delCell; setDelCell(null); if (q) await call(async () => { await api(`/api/design-sheets/${sheetId}/quotes/${q.id}`, { method: "DELETE" }); }, tr("ลบช่องแล้ว", "Cell deleted")); }} />
    </div>
  );
}

/** ฟอร์มเสนอราคา — ตารางไขว้กรอกทีเดียว (ไซส์ × ขั้นจำนวน)
 *  ครั้งใหม่: เตรียมค่าจากครั้งล่าสุด/ครั้งที่คัดลอก
 *  แก้ไข (editing): ใส่ค่าของการ์ดนั้น → บันทึกเฉพาะที่เปลี่ยน ทีละช่อง (ช่องเดิมแก้ราคา/จำนวน · ล้างราคา/ปิดไซส์/เอาขั้นออก = ลบช่อง · ช่องใหม่ = เพิ่ม)
 *  วันที่/สถานะ/หมายเหตุ แก้เฉพาะช่องของการ์ดนี้ (ข้อมูลเก่าที่ครั้งเดียวกันแยกเป็นหลาย "รายการ" จะไม่กระทบกัน) */
function RoundEditor({ sheetId, nextBatch, sizes, sizeLabel, currentCost, last, copiedFrom = null, editing = null, fill = null, costDirty, saveCost, onClose, onSaved, onReload }: {
  copiedFrom?: number | null;   // คัดลอกมาจากครั้งที่ (โชว์ที่หัวฟอร์ม)
  fill?: PriceFill | null;      // 💰 จากตัวช่วยตั้งราคา: ใส่ราคา = ตีราคาของช่อง × ตัวคูณ (ทุกไซส์ที่ติ๊ก × ทุกขั้นจำนวน)
  editing?: Batch | null;       // ✏️ แก้ไขการ์ดนี้ (null = เสนอครั้งใหม่)
  onReload?: () => Promise<void>;   // แก้ไขแล้วพลาดกลางทาง → โหลดของจริงมาโชว์
  sheetId: string; nextBatch: number; sizes: Size[]; sizeLabel: (code: string | null) => string; currentCost: (key: string, qty?: number | null) => number;
  last: Batch | null; costDirty: boolean; saveCost: () => Promise<boolean>; onClose: () => void; onSaved: (batch: number) => Promise<void>;
}) {
  const t = useT();
  const toast = useToast();
  const src = editing ?? last;
  // แก้ไข: ไซส์ที่การ์ดมีแต่แท็บตีราคาถูกเอาออกไปแล้ว ก็ยังต้องโชว์ (ไม่งั้นบันทึกแล้วช่องเดิมจะถูกลบ)
  const rowSizes: Size[] = [...sizes, ...(editing?.sizes ?? []).filter((k) => !sizes.some((s) => s.key === k)).map((k) => ({ key: k, label: sizeLabel(k) }))];
  const initQtys = src?.qtys.length ? src.qtys : [100, 200, 500, 1000];
  const [date, setDate] = useState(editing ? editing.date ?? "" : todayStr());
  const [status, setStatus] = useState<string>(editing?.status ?? "pending");
  const [note, setNote] = useState(editing?.note ?? "");
  const [qtys, setQtys] = useState<(number | null)[]>(() => initQtys);
  // แก้ไข: ขั้นจำนวนในฟอร์ม → ขั้นจำนวนเดิมของช่อง (เปลี่ยนตัวเลขขั้นแล้ว ช่องเดิมยังเป็นช่องเดิม ไม่ลบสร้างใหม่)
  const [origQty, setOrigQty] = useState<Record<string, number | null>>(() => Object.fromEntries((editing?.qtys ?? []).map((q) => [qtyKey(q), q])));
  const [onSizes, setOnSizes] = useState<string[]>(() => (editing ? editing.sizes : last?.sizes.length ? last.sizes.filter((s) => sizes.some((x) => x.key === s)) : sizes.map((s) => s.key)));
  const [cells, setCells] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const s of rowSizes) for (const qty of initQtys) {
      const pq = src?.quotes.find((q) => (q.parent_code ?? "") === s.key && qtyKey(q.qty) === qtyKey(qty));
      const v = pq ? (pq.offered_price ?? pq.price) : null;
      m[`${s.key}|${qtyKey(qty)}`] = v != null ? String(v) : "";
    }
    return m;
  });
  // 🎨 สีต่อไซส์: รายการสี + ราคาต่าง (ใช้ทุกขั้นจำนวน) · จำนวนต่อสีแยกตามขั้น (key = ไซส์|ขั้น|ชื่อสี) · โหมด % = 1 ค่าต่อสีใช้ทุกขั้น
  type ColorDef = { name: string; hex: string | null; delta: string };
  const ckey = (sz: string, qty: number | null, name: string) => `${sz}|${qtyKey(qty)}|${name}`;
  const [colorInit] = useState(() => {
    const defs: Record<string, ColorDef[]> = {}; const qty: Record<string, string> = {}; const split: Record<string, boolean> = {};
    for (const q of src?.quotes ?? []) {
      const sz = q.parent_code ?? "";
      for (const c of cleanQuoteColors(q.colors) ?? []) {
        const list = defs[sz] ?? (defs[sz] = []);
        if (!list.some((x) => x.name === c.name)) list.push({ name: c.name, hex: c.hex, delta: c.delta ? String(c.delta) : "" });
        if (c.delta) split[sz] = true;
        if (c.qty != null) qty[ckey(sz, q.qty, c.name)] = String(c.qty);
      }
    }
    return { defs, qty, split };
  });
  const [colorDefs, setColorDefs] = useState<Record<string, ColorDef[]>>(colorInit.defs);
  const [colorQty, setColorQty] = useState<Record<string, string>>(colorInit.qty);
  const [splitBy, setSplitBy] = useState<Record<string, boolean>>(colorInit.split);
  const [pctBy, setPctBy] = useState<Record<string, boolean>>({});
  const [pcts, setPcts] = useState<Record<string, string>>({});   // key = ไซส์|ชื่อสี
  const [pickerFor, setPickerFor] = useState<string | null>(null);   // ไซส์ที่เปิดจานสีอยู่
  const [customColor, setCustomColor] = useState("");
  const colorsOf = (sz: string) => colorDefs[sz] ?? [];
  const addColor = (sz: string, name: string, hex?: string | null) => {
    const n = name.trim().slice(0, 40); if (!n) return;
    if (colorsOf(sz).some((c) => c.name === n)) { toast.info(tr(`มีสี ${n} แล้ว`, `${n} is already added`)); return; }
    setColorDefs((m) => ({ ...m, [sz]: [...(m[sz] ?? []), { name: n, hex: hex ?? paletteHex(n), delta: "" }] }));
  };
  const removeColor = (sz: string, name: string) => setColorDefs((m) => ({ ...m, [sz]: (m[sz] ?? []).filter((c) => c.name !== name) }));
  const setDelta = (sz: string, name: string, v: string) => setColorDefs((m) => ({ ...m, [sz]: (m[sz] ?? []).map((c) => (c.name === name ? { ...c, delta: v } : c)) }));
  const splitEven = (sz: string) => {
    const cs = colorsOf(sz); if (!cs.length) return;
    setPctBy((m) => ({ ...m, [sz]: false }));
    setColorQty((m) => { const n = { ...m }; for (const qty of qtys) { if (qty == null) continue; splitEvenly(cs.length, qty).forEach((v, i) => { n[ckey(sz, qty, cs[i].name)] = String(v); }); } return n; });
  };
  const colorQtyFor = (sz: string, qty: number | null, i: number): number | null => {
    const cs = colorsOf(sz); const c = cs[i]; if (!c) return null;
    if (pctBy[sz]) return qty == null ? null : percentsToQty(cs.map((x) => Number(pcts[`${sz}|${x.name}`]) || 0), qty)[i];
    const v = colorQty[ckey(sz, qty, c.name)]?.trim();
    return v ? Math.max(0, Math.round(Number(v)) || 0) : null;
  };
  const setPctMode = (sz: string, on: boolean) => {
    if (on) {   // เปิดโหมด % = ตั้งต้นจากจำนวนของขั้นแรกที่มีตัวเลข
      const cs = colorsOf(sz); const tier = qtys.find((q) => q != null) ?? null;
      setPcts((m) => { const n = { ...m }; for (const c of cs) n[`${sz}|${c.name}`] = tier ? String(qtyToPercent(Number(colorQty[ckey(sz, tier, c.name)]) || 0, tier)) : ""; return n; });
    } else {   // ปิดโหมด % = เก็บจำนวนที่คำนวณได้ไว้ในช่องชิ้น
      setColorQty((m) => { const n = { ...m }; for (const qty of qtys) colorsOf(sz).forEach((c, i) => { const v = colorQtyFor(sz, qty, i); if (v != null) n[ckey(sz, qty, c.name)] = String(v); }); return n; });
    }
    setPctBy((m) => ({ ...m, [sz]: on }));
  };
  /** สีของช่อง (ไซส์ × ขั้น) ที่จะบันทึก · ไม่มีสี = null */
  const colorsForCell = (sz: string, qty: number | null): QuoteColor[] | null =>
    cleanQuoteColors(colorsOf(sz).map((c, i) => ({ name: c.name, hex: c.hex, qty: colorQtyFor(sz, qty, i), delta: splitBy[sz] ? Number(c.delta) || 0 : null })));
  const [newQty, setNewQty] = useState("");
  const [editQty, setEditQty] = useState<{ from: number | null; val: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const key = (s: string, qty: number | null) => `${s}|${qtyKey(qty)}`;
  const addQty = () => { const n = Number(newQty); if (!Number.isFinite(n) || n <= 0) { toast.error(tr("ใส่จำนวนเป็นตัวเลขมากกว่า 0", "Enter a quantity greater than 0")); return; } if (qtys.some((q) => q === n)) { toast.error(tr("มีขั้นจำนวนนี้แล้ว", "This quantity tier already exists")); return; } setQtys((qs) => [...qs, n].sort(byQty)); setNewQty(""); };
  const removeQty = (qty: number | null) => {
    setQtys((qs) => qs.filter((q) => q !== qty));
    setOrigQty((o) => { const n = { ...o }; delete n[qtyKey(qty)]; return n; });
  };
  // กดตัวเลขขั้นจำนวนที่หัวตารางเพื่อแก้ (ราคาในคอลัมน์ย้ายตามไปด้วย) · เว้นว่าง = ไม่ระบุจำนวน
  const renameQty = () => {
    if (!editQty) return;
    const { from, val } = editQty; setEditQty(null);
    const v = val.trim(); const to = v === "" ? null : Number(v);
    if (to !== null && (!Number.isFinite(to) || to <= 0)) { toast.error(tr("ใส่จำนวนเป็นตัวเลขมากกว่า 0 (เว้นว่าง = ไม่ระบุจำนวน)", "Enter a quantity greater than 0 (blank = no qty)")); return; }
    if (qtyKey(to) === qtyKey(from)) return;
    if (qtys.some((q) => qtyKey(q) === qtyKey(to))) { toast.error(tr("มีขั้นจำนวนนี้แล้ว", "This quantity tier already exists")); return; }
    setQtys((qs) => qs.map((q) => (qtyKey(q) === qtyKey(from) ? to : q)).sort(byQty));
    setCells((m) => { const n = { ...m }; for (const s of rowSizes) { const a = key(s.key, from); if (a in n) { n[key(s.key, to)] = n[a]; delete n[a]; } } return n; });
    setColorQty((m) => { const n = { ...m }; for (const s of rowSizes) for (const c of colorsOf(s.key)) { const a = ckey(s.key, from, c.name); if (a in n) { n[ckey(s.key, to, c.name)] = n[a]; delete n[a]; } } return n; });
    setOrigQty((o) => { const n = { ...o }; if (qtyKey(from) in n) { n[qtyKey(to)] = n[qtyKey(from)]; delete n[qtyKey(from)]; } return n; });
  };
  // 💰 ตัวช่วยตั้งราคาส่งวิธีคิดมา → ใส่ทุกช่อง (ไซส์ที่ติ๊ก × ขั้นจำนวน) จากตีราคาของช่องนั้น · ช่องที่ยังไม่ได้ตีราคา ไม่แตะ
  const [fillNote, setFillNote] = useState<string | null>(null);
  useEffect(() => {
    if (!fill) return;
    const next = { ...cells }; let n = 0; let skipped = 0;
    for (const s of rowSizes) {
      if (!onSizes.includes(s.key)) continue;
      for (const qty of qtys) {
        const p = fill.disc?.length && qty != null ? tierPrice((q) => currentCost(s.key, q), qty, fill.mult, fill.round, fill.disc) : priceFromCost(currentCost(s.key, qty), fill.mult, fill.round);
        if (p == null) { skipped++; continue; }
        next[key(s.key, qty)] = String(p); n++;
      }
    }
    setCells(next);
    setFillNote(n ? tr(`ใส่ราคา ${n} ช่อง (${fill.label})${skipped ? ` · ${skipped} ช่องยังไม่ได้ตีราคา ไม่ได้ใส่` : ""} — ตรวจแล้วกดบันทึก`, `Filled ${n} cells (${fill.label})${skipped ? ` · ${skipped} uncosted cells skipped` : ""} — check, then save`)
      : tr("ยังไม่มีช่องที่ตีราคาไว้ — ตีราคาก่อน หรือติ๊กไซส์ที่ตีราคาแล้ว", "No costed cells yet — cost first, or tick a costed size"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fill?.id]);
  const fillFromCost = () => setCells((m) => { const n = { ...m }; for (const s of rowSizes) for (const qty of qtys) { const c = currentCost(s.key, qty); if (c > 0 && !n[key(s.key, qty)]) n[key(s.key, qty)] = String(Math.round(c * 100) / 100); } return n; });
  // ± บาท ทุกช่อง (เจ้าของขอ 2026-10-21: "+10 → 400 เป็น 410, 380 เป็น 390") — เฉพาะช่องที่ใส่ราคาแล้ว + ไซส์ที่ติ๊ก · ช่องว่างไม่แตะ
  const [shift, setShift] = useState("");
  const shiftAll = () => {
    const d = Number(shift);
    if (!shift.trim() || !Number.isFinite(d) || d === 0) { toast.error(tr("ใส่จำนวนบาท เช่น 10 (บวก) หรือ -10 (ลด)", "Enter an amount, e.g. 10 (up) or -10 (down)")); return; }
    const next = { ...cells }; let count = 0; const neg: string[] = [];
    for (const s of rowSizes) {
      if (!onSizes.includes(s.key)) continue;
      for (const qty of qtys) {
        const k = key(s.key, qty); const v = next[k]?.trim(); if (!v) continue;
        const n = Number(v); if (!Number.isFinite(n)) continue;
        const r = Math.round((n + d) * 100) / 100;
        if (r < 0) neg.push(`${s.label} ${qty == null ? "" : `${fmtInt(qty)} ${tr("ชิ้น", "pcs")}`}`.trim());
        next[k] = String(r); count++;
      }
    }
    if (!count) { toast.error(tr("ยังไม่มีช่องที่ใส่ราคา — ใส่ราคาก่อนแล้วค่อยปรับทุกช่อง", "No prices entered yet — enter prices first, then adjust all")); return; }
    const negList = `${neg.slice(0, 3).join(", ")}${neg.length > 3 ? " …" : ""}`;
    if (neg.length) { toast.error(tr(`ลดแล้วราคาติดลบ ${neg.length} ช่อง (${negList}) — ลองลดน้อยลง`, `${neg.length} prices would go below zero (${negList}) — try a smaller cut`)); return; }   // ไม่เดาค่าแทน (ไม่ตัดเป็น 0 เอง)
    setCells(next); setShift("");
    const amt = `${d > 0 ? "+" : "−"}${fmtBaht(Math.abs(d))}`;
    toast.success(tr(`ปรับราคาที่เสนอ ${count} ช่อง ${amt} บาท`, `Adjusted ${count} prices by ${amt} THB`));
  };
  // ✏️ บันทึกการแก้ไข: เทียบกับช่องเดิมของการ์ด แล้วยิงเฉพาะที่เปลี่ยน (ทุก API มี audit อยู่แล้ว)
  const saveEdit = async (b: Batch) => {
    const priceOf = (s: string, qty: number | null): number | null => { const v = cells[key(s, qty)]?.trim(); return v ? Number(v) : null; };
    for (const s of rowSizes) if (onSizes.includes(s.key)) for (const qty of qtys) {
      const n = priceOf(s.key, qty);
      if (n !== null && (!Number.isFinite(n) || n < 0)) { const qtyTxt = qty == null ? "" : `${fmtInt(qty)} ${tr("ชิ้น", "pcs")}`; toast.error(tr(`ราคา ${s.label} ${qtyTxt} ไม่ถูกต้อง`, `Invalid price: ${s.label} ${qtyTxt}`)); return; }
    }
    const newDate = date || null; const newNote = note.trim() || null; const newStatus = status === "mixed" ? null : status;
    // หัวการ์ดเปลี่ยนจากที่เห็นตอนเปิดฟอร์มไหม (ไม่เปลี่ยน = ไม่แตะค่าของแต่ละช่อง)
    const dateChanged = newDate !== (b.date ?? null);
    const noteChanged = newNote !== (b.note?.trim() || null);
    const statusChanged = newStatus !== null && newStatus !== b.status;
    const changes: { id: string; patch: Record<string, unknown> }[] = [];
    const removes: DesignSheetQuote[] = [];
    const kept = new Set<string>();
    for (const q of b.quotes) {
      const size = q.parent_code ?? "";
      const ci = qtys.findIndex((c) => qtyKey(c) in origQty && qtyKey(origQty[qtyKey(c)]) === qtyKey(q.qty));   // คอลัมน์ที่ช่องนี้อยู่ตอนนี้
      const col = ci >= 0 ? qtys[ci] : null;
      const n = ci >= 0 && onSizes.includes(size) ? priceOf(size, col) : null;
      if (n === null) { removes.push(q); continue; }
      kept.add(key(size, col));
      const patch: Record<string, unknown> = {};
      if (n !== (q.offered_price ?? q.price)) patch.offered_price = n;
      if (qtyKey(col) !== qtyKey(q.qty)) patch.qty = col;
      const nc = colorsForCell(size, col);
      if (JSON.stringify(nc) !== JSON.stringify(cleanQuoteColors(q.colors))) patch.colors = nc;
      if (dateChanged && newDate !== (q.quote_date ?? null)) patch.quote_date = newDate;
      if (noteChanged && newNote !== (q.note?.trim() || null)) patch.note = newNote;
      if (statusChanged && newStatus !== q.status) patch.status = newStatus;
      if (Object.keys(patch).length) changes.push({ id: q.id, patch });
    }
    const adds: { parent_code: string; qty: number | null; offered: number; colors: QuoteColor[] | null }[] = [];
    for (const s of rowSizes) {
      if (!onSizes.includes(s.key)) continue;
      for (const qty of qtys) {
        const n = priceOf(s.key, qty);
        if (n !== null && !kept.has(key(s.key, qty))) adds.push({ parent_code: s.key, qty, offered: n, colors: colorsForCell(s.key, qty) });
      }
    }
    if (!changes.length && !removes.length && !adds.length) { toast.info(tr("ไม่มีอะไรเปลี่ยน", "Nothing changed")); onClose(); return; }
    if (removes.length === b.quotes.length && !adds.length) { toast.error(tr("ล้างทุกช่องแล้ว — ถ้าจะลบทั้งครั้ง ใช้ปุ่ม 🗑 ลบครั้งนี้", "All cells cleared — to delete the whole round, use 🗑 Delete round")); return; }
    setSaving(true);
    let done = 0;
    try {
      if (adds.length && costDirty && !(await saveCost())) return;   // ช่องใหม่ผูกกับเวอร์ชันตีราคาที่เห็นจริง
      const call = async (path: string, init: RequestInit) => { const r = await apiFetch(path, init); const j = await r.json(); if (j.error) throw new Error(j.error); done++; };
      const json = (body: unknown, method: string): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      await Promise.all([
        ...removes.map((q) => call(`/api/design-sheets/${sheetId}/quotes/${q.id}`, { method: "DELETE" })),
        ...changes.map((c) => call(`/api/design-sheets/${sheetId}/quotes/${c.id}`, json(c.patch, "PATCH"))),
      ]);
      for (const a of adds) {   // ทีละช่อง — API นับเลข round ต่อจากล่าสุด ยิงพร้อมกันจะชนกัน
        const c = currentCost(a.parent_code, a.qty);
        await call(`/api/design-sheets/${sheetId}/quotes`, json({
          quote_date: newDate ?? todayStr(), price: c > 0 ? Math.round(c * 100) / 100 : null, offered_price: a.offered, qty: a.qty,
          status: newStatus ?? "pending", note: newNote, parent_code: a.parent_code, batch: b.batch, colors: a.colors,
        }, "POST"));
      }
      await onSaved(b.batch);
    } catch (e) {
      const msg = e instanceof Error ? e.message : tr("บันทึกไม่สำเร็จ", "Save failed");
      if (done > 0) { toast.error(tr(`${msg} — บันทึกไปแล้วบางส่วน (${done} รายการ) โหลดข้อมูลล่าสุดให้แล้ว`, `${msg} — partly saved (${done} items); latest data reloaded`)); await onReload?.(); onClose(); }
      else toast.error(msg);
    } finally { setSaving(false); }
  };
  const save = async () => {
    if (editing) return saveEdit(editing);
    const list: { parent_code: string; qty: number | null; price: number | null; offered_price: number | null; colors: QuoteColor[] | null }[] = [];
    for (const s of sizes.filter((x) => onSizes.includes(x.key))) for (const qty of qtys) {
      const v = cells[key(s.key, qty)]?.trim(); if (!v) continue;
      const n = Number(v); if (!Number.isFinite(n) || n < 0) { toast.error(tr(`ราคา ${sizeLabel(s.key)} ${qty ?? ""} ไม่ถูกต้อง`, `Invalid price: ${sizeLabel(s.key)} ${qty ?? ""}`)); return; }
      const c = currentCost(s.key, qty);
      list.push({ parent_code: s.key, qty, price: c > 0 ? Math.round(c * 100) / 100 : null, offered_price: n, colors: colorsForCell(s.key, qty) });
    }
    if (!list.length) { toast.error(tr("ใส่ราคาที่เสนออย่างน้อย 1 ช่อง", "Enter at least 1 offered price")); return; }
    setSaving(true);
    try {
      if (costDirty && !(await saveCost())) return;   // ผูกครั้งนี้กับเวอร์ชันตีราคาที่เห็นจริง
      const r = await apiFetch(`/api/design-sheets/${sheetId}/quotes/batch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quote_date: date, status, note: note || null, cells: list }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      await onSaved(j.batch as number);
    } catch (e) { toast.error(e instanceof Error ? e.message : tr("บันทึกไม่สำเร็จ", "Save failed")); }
    finally { setSaving(false); }
  };
  return (
    <div className="rounded-xl border-2 border-blue-300 bg-blue-50/30 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-blue-50 border-b border-blue-200">
        <span className="h-7 px-2 rounded-lg bg-blue-600 text-white text-xs font-semibold flex items-center">
          {editing ? t(`✏️ แก้ไขครั้งที่ ${editing.batch}`, `✏️ Edit round ${editing.batch}`) + (editing.part > 0 ? t(` · รายการที่ ${editing.part + 1}`, ` · entry ${editing.part + 1}`) : "") : t(`＋ ครั้งที่ ${nextBatch}`, `＋ Round ${nextBatch}`)}
        </span>
        {fillNote && <span className="text-[11px] text-emerald-700">{fillNote}</span>}
        {copiedFrom != null && <span className="text-[11px] text-blue-700">{t(`คัดลอกจากครั้งที่ ${copiedFrom} — แก้ราคาแล้วบันทึก`, `Copied from round ${copiedFrom} — edit prices, then save`)}</span>}
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-7 px-1.5 text-xs border border-slate-200 rounded-md bg-white" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-7 px-1.5 text-xs border border-slate-200 rounded-md bg-white">
          {editing?.status === "mixed" && <option value="mixed">{t("◐ ผสม (คงตามรายช่อง)", "◐ Mixed (keep per cell)")}</option>}
          {QUOTE_STATUS_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("หมายเหตุ (เช่น ลูกค้าขอลด 5%)", "Note (e.g. customer asked for 5% off)")} className="h-7 flex-1 min-w-[10rem] px-2 text-xs border border-slate-200 rounded-md bg-white" />
        <button type="button" onClick={fillFromCost} className="h-7 px-2 text-xs border border-slate-200 bg-white rounded-md text-slate-600 hover:bg-slate-50" title={t("ช่องที่ยังว่าง ใส่ราคาเท่าตีราคาปัจจุบัน", "Fill empty cells with the current costing")}>{t("เติมจากตีราคา", "Fill from costing")}</button>
        <span className="inline-flex items-center gap-1 h-7 pl-2 pr-1 text-xs border border-slate-200 bg-white rounded-md text-slate-600" title={t("บวก/ลบราคาที่เสนอทุกช่องพร้อมกัน เช่น 10 → 400 เป็น 410 · -10 → 400 เป็น 390 (ช่องว่างไม่แตะ)", "Add/subtract on every offered price at once, e.g. 10 → 400 becomes 410 · -10 → 390 (empty cells untouched)")}>
          {t("ปรับทุกช่อง ±", "Adjust all ±")}
          <input type="number" step="any" value={shift} onChange={(e) => setShift(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") shiftAll(); }} placeholder="10 / -10" aria-label={t("ปรับราคาทุกช่อง (บาท)", "Adjust all prices (THB)")}
            className="h-5 w-16 px-1 text-xs text-right border border-slate-200 rounded" />
          {t("บาท", "THB")}
          <button type="button" onClick={shiftAll} className="h-5 px-1.5 text-[11px] rounded bg-blue-600 text-white hover:bg-blue-700">{t("ใช้", "Apply")}</button>
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-[11px] text-slate-500">
              <th className="px-3 py-1.5 text-left font-medium w-28">{t("ไซส์", "Size")}</th>
              <th className="px-2 py-1.5 text-right font-medium w-28">{t("ตีราคาปัจจุบัน", "Current costing")}</th>
              {qtys.map((qty) => (
                <th key={qtyKey(qty)} className="px-2 py-1.5 text-right font-medium min-w-[7rem] text-blue-700">
                  {editQty && qtyKey(editQty.from) === qtyKey(qty) ? (
                    <input autoFocus type="number" min={1} value={editQty.val} onChange={(e) => setEditQty({ from: qty, val: e.target.value })}
                      onBlur={renameQty} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditQty(null); }}
                      placeholder={t("ไม่ระบุ", "No qty")} aria-label={t("จำนวนชิ้นของขั้นนี้", "Quantity for this tier")} className="h-6 w-20 px-1 text-[11px] text-right border border-blue-400 rounded" />
                  ) : (
                    <button type="button" onClick={() => setEditQty({ from: qty, val: qty == null ? "" : String(qty) })} className="hover:underline" title={t("กดเพื่อแก้จำนวน (ราคาในคอลัมน์ย้ายตามไปด้วย)", "Click to edit the quantity (prices in this column move with it)")}>{qty == null ? t("ไม่ระบุ", "No qty") : t(`${fmtInt(qty)} ชิ้น`, `${fmtInt(qty)} pcs`)}</button>
                  )}
                  {qtys.length > 1 && <button type="button" onClick={() => removeQty(qty)} className="ml-1 text-slate-300 hover:text-rose-500" title={t("เอาขั้นจำนวนนี้ออก", "Remove this quantity tier")}>✕</button>}
                </th>
              ))}
              <th className="px-2 py-1.5 text-left font-normal">
                <span className="inline-flex items-center gap-1"><input type="number" min={1} value={newQty} onChange={(e) => setNewQty(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addQty(); }} placeholder={t("เพิ่มจำนวน", "Add qty")} className="h-6 w-20 px-1 text-[11px] border border-slate-200 rounded" /><button type="button" onClick={addQty} className="h-6 px-1.5 text-[11px] border border-slate-200 bg-white rounded hover:bg-slate-50">＋</button></span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rowSizes.map((s) => {
              const on = onSizes.includes(s.key); const cost = currentCost(s.key);
              const cs = colorsOf(s.key);
              return (
                <Fragment key={s.key}>
                <tr className={`border-t border-blue-100 ${on ? "" : "opacity-40"}`}>
                  <td className="px-3 py-1 text-xs"><label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={on} onChange={(e) => setOnSizes((xs) => (e.target.checked ? [...xs, s.key] : xs.filter((x) => x !== s.key)))} className="h-3.5 w-3.5" /><span className="font-medium text-slate-700">{s.label}</span></label></td>
                  <td className="px-2 py-1 text-right text-xs text-slate-500 tabular-nums">{cost > 0 ? fmtBaht(cost) : <span className="text-slate-300" title={t("ยังไม่ได้ตีราคาไซส์นี้", "This size hasn't been costed yet")}>—</span>}</td>
                  {qtys.map((qty) => {
                    const v = cells[key(s.key, qty)] ?? ""; const n = Number(v); const margin = v && cost > 0 && Number.isFinite(n) ? n - cost : null;
                    return (
                      <td key={qtyKey(qty)} className="px-2 py-1 text-right align-top">
                        <input type="number" min={0} step="any" disabled={!on} value={v} onChange={(e) => setCells((m) => ({ ...m, [key(s.key, qty)]: e.target.value }))} placeholder="—"
                          className="h-8 w-24 px-1.5 text-sm text-right border border-blue-300 bg-white rounded-md font-medium text-blue-700 disabled:bg-slate-50" />
                        {margin != null && <div className={`text-[10px] tabular-nums ${upDown(margin)}`}>{sgn(margin)}{n ? ` (${((margin / n) * 100).toFixed(0)}%)` : ""}</div>}
                      </td>
                    );
                  })}
                  <td />
                </tr>
                {/* 🎨 สีของไซส์นี้: ชิป + เพิ่มสี + แยกราคาตามสี + แบ่งเท่ากัน + ชิ้น/% · แถวละสี (จำนวนต่อขั้น) · แถวสถานะแบ่งครบ/ขาด/เกิน */}
                {on && (
                  <tr className="bg-white/50">
                    <td colSpan={qtys.length + 3} className="px-3 pb-1">
                      <div className="flex flex-wrap items-center gap-1.5 pl-5 text-[11px] text-slate-500">
                        <span>{t("สี", "Colors")}</span>
                        {cs.map((c) => (
                          <span key={c.name} className="inline-flex h-6 items-center gap-1 rounded-full border border-slate-200 bg-white pl-1.5 pr-1 text-xs text-slate-700">
                            <ColorDot hex={c.hex} />{c.name}
                            <button type="button" onClick={() => removeColor(s.key, c.name)} aria-label={t(`เอาสี ${c.name} ออก`, `Remove ${c.name}`)} className="px-0.5 text-slate-400 hover:text-rose-500">×</button>
                          </span>
                        ))}
                        <button type="button" onClick={() => { setPickerFor(pickerFor === s.key ? null : s.key); setCustomColor(""); }}
                          className={`inline-flex h-6 items-center rounded-full border border-dashed px-2 text-xs ${pickerFor === s.key ? "border-blue-400 text-blue-700" : "border-slate-300 text-slate-500 hover:border-blue-300 hover:text-blue-600"}`}>{t("＋ สี", "＋ Color")}</button>
                        {cs.length > 0 && <>
                          <label className="ml-1 inline-flex cursor-pointer items-center gap-1" title={t("บางสีแพงกว่า — ใส่ ± บาท จากราคาไซส์ (ใช้ทุกขั้นจำนวน)", "Some colors cost more — enter ± THB from the size price (all tiers)")}>
                            <input type="checkbox" checked={!!splitBy[s.key]} onChange={(e) => setSplitBy((m) => ({ ...m, [s.key]: e.target.checked }))} className="h-3.5 w-3.5" />{t("แยกราคาตามสี", "Price per color")}
                          </label>
                          <button type="button" onClick={() => splitEven(s.key)} className="h-6 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-600 hover:bg-slate-50" title={t("แบ่งจำนวนทุกขั้นให้ทุกสีเท่ากัน", "Split every tier equally across colors")}>{t("แบ่งเท่ากัน", "Split equally")}</button>
                          <span className="inline-flex overflow-hidden rounded-md border border-slate-200 text-xs">
                            <button type="button" onClick={() => setPctMode(s.key, false)} className={`h-6 px-2 ${pctBy[s.key] ? "bg-white text-slate-600" : "bg-slate-800 text-white"}`}>{t("ชิ้น", "pcs")}</button>
                            <button type="button" onClick={() => setPctMode(s.key, true)} className={`h-6 px-2 ${pctBy[s.key] ? "bg-slate-800 text-white" : "bg-white text-slate-600"}`} title={t("ใส่เป็น % — ระบบแปลงเป็นชิ้นทุกขั้นให้", "Enter % — converted to pieces for every tier")}>%</button>
                          </span>
                        </>}
                      </div>
                      {pickerFor === s.key && (
                        <div className="mt-1 flex flex-wrap items-center gap-1 pl-5">
                          {QUOTE_COLOR_PALETTE.filter((p) => !cs.some((c) => c.name === p.name)).map((p) => (
                            <button key={p.name} type="button" onClick={() => addColor(s.key, p.name, p.hex)} className="inline-flex h-6 items-center gap-1 rounded-full border border-slate-200 bg-white px-2 text-xs text-slate-700 hover:border-blue-300">
                              <ColorDot hex={p.hex} />{p.name}
                            </button>
                          ))}
                          <input value={customColor} onChange={(e) => setCustomColor(e.target.value)} placeholder={t("พิมพ์สีเอง แล้ว Enter", "Type a color, then Enter")}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addColor(s.key, customColor); setCustomColor(""); } }}
                            className="h-6 w-36 rounded-md border border-slate-200 px-2 text-xs" />
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                {on && cs.map((c, i) => (
                  <tr key={`c-${c.name}`} className="bg-white/50">
                    <td className="py-0.5 pl-9 pr-2 text-xs text-slate-600"><span className="inline-flex items-center gap-1.5"><ColorDot hex={c.hex} />{c.name}</span></td>
                    <td className="px-2 py-0.5 text-right">
                      <span className="inline-flex items-center justify-end gap-1">
                        {splitBy[s.key] && <input type="number" step="any" value={c.delta} onChange={(e) => setDelta(s.key, c.name, e.target.value)} placeholder={t("± บาท", "± THB")}
                          title={t("ราคาต่างจากราคาไซส์ (บาท) เช่น 3 = แพงกว่า 3 บาท", "Price difference from the size price (THB), e.g. 3 = 3 THB more")} className="h-7 w-16 rounded border border-slate-200 px-1 text-right text-xs" />}
                        {pctBy[s.key] && <><input type="number" min={0} step="any" value={pcts[`${s.key}|${c.name}`] ?? ""} onChange={(e) => setPcts((m) => ({ ...m, [`${s.key}|${c.name}`]: e.target.value }))}
                          aria-label={t(`สัดส่วนสี ${c.name} (%)`, `${c.name} share (%)`)} className="h-7 w-14 rounded border border-slate-200 px-1 text-right text-xs" /><span className="text-[11px] text-slate-400">%</span></>}
                      </span>
                    </td>
                    {qtys.map((qty) => {
                      const v = cells[key(s.key, qty)]; const cp = v && Number(c.delta) ? colorUnitPrice(Number(v), { delta: Number(c.delta) }) : null;
                      return (
                        <td key={qtyKey(qty)} className="px-2 py-0.5 text-right align-top">
                          {pctBy[s.key]
                            ? <span className="inline-block w-24 text-right text-xs tabular-nums text-slate-600">{qty == null ? "—" : fmtInt(colorQtyFor(s.key, qty, i) ?? 0)}</span>
                            : <input type="number" min={0} step={1} value={colorQty[ckey(s.key, qty, c.name)] ?? ""} onChange={(e) => setColorQty((m) => ({ ...m, [ckey(s.key, qty, c.name)]: e.target.value }))}
                                placeholder={qty == null ? "—" : "0"} aria-label={t(`จำนวนสี ${c.name}`, `${c.name} quantity`)} className="h-7 w-24 rounded border border-slate-200 bg-white px-1.5 text-right text-xs tabular-nums" />}
                          {splitBy[s.key] && cp != null && <div className="text-[10px] tabular-nums text-slate-500">{t("ราคา", "price")} {fmtBaht(cp)}</div>}
                        </td>
                      );
                    })}
                    <td />
                  </tr>
                ))}
                {on && cs.length > 0 && (
                  <tr className="bg-white/50">
                    <td colSpan={2} className="py-0.5 pl-9 text-[10px] text-slate-400">{t("แบ่งจำนวน", "Split")}</td>
                    {qtys.map((qty) => {
                      const st = colorQtyStatus(cs.map((_, i) => ({ qty: colorQtyFor(s.key, qty, i) })), qty);
                      return (
                        <td key={qtyKey(qty)} className="px-2 pb-1 text-right text-[10px]">
                          {st.state === "ok" && <span className="text-emerald-600">{t(`ครบ ${fmtInt(qty)}`, `All ${fmtInt(qty)}`)}</span>}
                          {st.state === "under" && <span className="text-amber-600">{t(`ยังไม่แบ่ง ${fmtInt(st.remaining)}`, `${fmtInt(st.remaining)} unassigned`)}</span>}
                          {st.state === "over" && <span className="text-rose-600">{t(`เกิน ${fmtInt(-st.remaining)}`, `${fmtInt(-st.remaining)} over`)}</span>}
                        </td>
                      );
                    })}
                    <td />
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-blue-200 bg-blue-50/60">
        <span className="text-[11px] text-slate-500">
          {editing ? t("ล้างราคา / ปิดไซส์ / เอาขั้นออก = ลบช่องนั้น · กดตัวเลขขั้นจำนวนที่หัวตารางเพื่อแก้", "Clear price / untick size / remove tier = delete that cell · click a tier number in the header to edit it") : t("ช่องว่าง = ไม่เสนอขั้นนั้น", "Empty cell = not quoted for that tier")}{t(" · ตัวเลขเล็กใต้ช่อง = กำไร/ชิ้น เทียบตีราคาปัจจุบัน", " · small number under a cell = profit/pc vs current costing")}{costDirty ? t(" · ตีราคาที่ยังไม่บันทึก ระบบจะบันทึกให้ก่อน", " · unsaved costing will be saved first") : ""}
        </span>
        <div className="flex gap-1.5">
          <button type="button" onClick={onClose} disabled={saving} className="h-8 px-3 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
          <button type="button" onClick={() => void save()} disabled={saving} className="h-8 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? t("กำลังบันทึก…", "Saving…") : editing ? t("💾 บันทึกการแก้ไข", "💾 Save changes") : t(`💾 บันทึกครั้งที่ ${nextBatch}`, `💾 Save round ${nextBatch}`)}</button>
        </div>
      </div>
    </div>
  );
}
