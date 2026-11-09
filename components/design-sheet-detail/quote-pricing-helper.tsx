"use client";
/**
 * 💰 ตัวช่วยตั้งราคา — ปุ่มในแท็บเสนอราคา ใบงานออกแบบ (เจ้าของขอ 2026-11-09 · แบบง่าย 2026-11-09)
 *   บนสุด: ไซส์ · จำนวนที่สั่ง (− / + ตั้งต้นจากแถบจำนวนที่สั่ง) · ต้นทุน/ใบ (คิดตามจำนวน: หารจำนวนสั่ง + ลังส่ง)
 *   บวกกำไร: แถบเลื่อน + พิมพ์ % + ปุ่ม 25–200% + "แบรนด์นี้เคยตกลงเฉลี่ย"
 *   ผล 4 ช่อง: ราคา/ใบ · กำไร/ใบ · ยอดขายทั้งล็อต · กำไรทั้งล็อต · ปัดเลขสวย (0/5/9)
 *   ราคาตามจำนวน (100/300/500/1,000 + ที่ใส่) · ตัวช่วยเพิ่มเติม (พับไว้): งานในแบรนด์ · ราคาป้าย · VAT · งบลูกค้า · วิธีปัดอื่น
 *   กด "ใส่ราคาในรอบเสนอราคา" → ส่ง "ตัวคูณ" กลับไปให้ฟอร์มรอบเสนอราคาคูณกับตีราคาของทุกช่อง (ไซส์ × ขั้นจำนวน)
 *
 *   สูตร: lib/quote-pricing · ข้อมูล: GET /api/design-sheets/[id]/price-refs (สิทธิ์เห็นต้นทุน)
 *   ของกลาง: ERPModal · Icon · apiFetch · QUOTE_STATUS
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { apiFetch } from "@/lib/api";
import { QUOTE_STATUS } from "@/lib/design-sheets-meta";
import {
  brandMarkupSummary, budgetCheck, costShareOfPrice, markupPctOf, median, priceFromCost, withVat,
  PRICE_STEPS, ROUND_LABEL,
  type BrandQuoteRef, type BrandSkuRef, type PriceRound,
} from "@/lib/quote-pricing";

/** ที่ส่งกลับไปให้ฟอร์มรอบเสนอราคา: ราคา = ตีราคาของช่อง × mult แล้วปัด */
export type PriceFill = { id: number; mult: number; round: PriceRound; label: string };

type Size = { key: string; label: string };
type Refs = { brand: { id: string; name: string } | null; quotes: BrandQuoteRef[]; skus: BrandSkuRef[] };

const TIER_QTYS = [100, 300, 500, 1000];
const fmt = (n: number | null | undefined, dp = 0) => (n == null || !Number.isFinite(n) ? "—" : Number(n).toLocaleString("th-TH", { minimumFractionDigits: dp, maximumFractionDigits: dp }));
const money = (n: number | null | undefined) => fmt(n, 2);
const pctTxt = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : `${Math.round(n)}%`);
const stepQty = (q: number, dir: 1 | -1) => (dir > 0 ? (q >= 100 ? q + 100 : q + 1) : Math.max(1, q > 100 ? q - 100 : q - 1));

export function QuotePricingHelper({ open, onClose, sheetId, sizes, currentCost, orderQtyFor, qtys, onApply }: {
  open: boolean; onClose: () => void; sheetId: string;
  sizes: Size[];
  currentCost: (key: string, qty?: number | null) => number;
  /** จำนวนที่สั่งของไซส์ (แถบจำนวนที่สั่ง) — ตั้งต้นช่องจำนวน */
  orderQtyFor?: (key: string) => number | null;
  qtys: (number | null)[];                         // ขั้นจำนวนของรอบเสนอราคาล่าสุด (สำรอง ถ้าไซส์นั้นยังไม่มีจำนวนที่สั่ง)
  onApply: (f: Omit<PriceFill, "id">) => void;
}) {
  const t = useT();
  const firstCosted = sizes.find((s) => currentCost(s.key) > 0)?.key ?? sizes[0]?.key ?? "";
  const [sizeKey, setSizeKey] = useState(firstCosted);
  const qtyDefault = (key: string) => orderQtyFor?.(key) ?? (qtys.find((q) => q != null && q > 0) as number | undefined) ?? 300;
  const [qtyText, setQtyText] = useState(() => String(qtyDefault(firstCosted)));
  const [pct, setPct] = useState(50);
  const [round, setRound] = useState<PriceRound>("nice");
  const [vat, setVat] = useState(false);
  const [budget, setBudget] = useState("");
  const [more, setMore] = useState(false);
  const [refs, setRefs] = useState<Refs | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [skuQ, setSkuQ] = useState("");

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoadErr(null);
    apiFetch(`/api/design-sheets/${sheetId}/price-refs`).then((r) => r.json()).then((j) => {
      if (!alive) return;
      if (j.error) { setLoadErr(String(j.error)); return; }
      setRefs({ brand: j.brand ?? null, quotes: j.quotes ?? [], skus: j.skus ?? [] });
    }).catch(() => { if (alive) setLoadErr(t("โหลดราคาอ้างอิงไม่สำเร็จ ลองใหม่อีกครั้ง", "Couldn't load reference prices. Try again.")); });
    return () => { alive = false; };
  }, [open, sheetId, t]);

  const qty = Math.max(1, Math.round(Number(qtyText)) || 1);
  const cost = currentCost(sizeKey, qty);
  const costNoQty = currentCost(sizeKey);
  const mult = 1 + Math.max(0, pct) / 100;
  const raw = cost > 0 ? cost * mult : null;
  const price = priceFromCost(cost, mult, round);
  const profit = price != null ? price - cost : null;
  const summary = useMemo(() => brandMarkupSummary(refs?.quotes ?? []), [refs]);
  const brandPct = summary.suggestPct != null ? Math.round(summary.suggestPct) : null;
  const showVat = (v: number | null) => (v == null ? null : vat ? withVat(v) : v);
  const bud = budgetCheck(Number(budget), cost, mult, vat);
  const tiers = [...new Set([...TIER_QTYS, qty])].sort((a, b) => a - b);
  const quotesShown = refs ? (showAll ? refs.quotes : refs.quotes.slice(0, 8)) : [];
  const skuList = useMemo(() => {
    const q = skuQ.trim().toLowerCase();
    const all = refs?.skus ?? [];
    return (q ? all.filter((s) => `${s.code} ${s.name ?? ""}`.toLowerCase().includes(q)) : all).slice(0, 12);
  }, [refs, skuQ]);
  const skuMedian = useMemo(() => median((refs?.skus ?? []).map((s) => s.max)), [refs]);
  const label = t(`บวกกำไร ${pct}%`, `Markup ${pct}%`) + (round !== "none" ? ` · ${ROUND_LABEL[round]}` : "");

  const chip = (on: boolean, tone: "blue" | "green" = "blue") => `h-7 rounded-md border px-2.5 text-xs tabular-nums ${on
    ? tone === "blue" ? "border-blue-500 bg-blue-600 text-white" : "border-emerald-500 bg-emerald-600 text-white"
    : tone === "blue" ? "border-slate-200 bg-white text-slate-600 hover:bg-slate-50" : "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"}`;
  const tile = "rounded-lg bg-slate-50 px-3 py-2";

  return (
    <ERPModal open={open} onClose={onClose} size="lg" title={t("ตัวช่วยตั้งราคา", "Pricing helper")}
      description={refs?.brand ? t(`แบรนด์ ${refs.brand.name}`, `Brand ${refs.brand.name}`) : undefined}
      footer={<>
        <div className="mr-auto text-sm text-slate-600">
          {t("ราคาที่เลือก", "Selected")} <b className="text-lg tabular-nums text-blue-700">{money(showVat(price))}</b> {t("บาท/ใบ", "THB/pc")}
          <span className="ml-2 text-xs text-slate-400">{label}{vat ? t(" · รวม VAT", " · incl. VAT") : ""}</span>
        </div>
        <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">{t("ปิด", "Close")}</button>
        <button type="button" disabled={!(cost > 0)} onClick={() => { onApply({ mult, round, label }); onClose(); }}
          title={t("ใส่ราคาให้ทุกไซส์ที่ติ๊ก × ทุกขั้นจำนวนในฟอร์ม คิดจากตีราคาของแต่ละช่อง × บวกกำไรเดียวกัน", "Fill every ticked size × quantity tier in the form from each cell's costing × the same markup")}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
          <Icon value="i:check" className="text-[14px]" />{t("ใส่ราคาในรอบเสนอราคา", "Put into quote round")}
        </button>
      </>}>
      <div className="space-y-3">
        {/* ไซส์ · จำนวน · ต้นทุน */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
          {sizes.length > 1 && (
            <label className="flex items-center gap-1.5 text-xs text-slate-500">{t("ไซส์", "Size")}
              <select value={sizeKey} onChange={(e) => { setSizeKey(e.target.value); setQtyText(String(qtyDefault(e.target.value))); }} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm">
                {sizes.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </label>
          )}
          <span className="flex items-center gap-1 text-xs text-slate-500">{t("จำนวนที่สั่ง", "Order qty")}
            <button type="button" onClick={() => setQtyText(String(stepQty(qty, -1)))} aria-label={t("ลดจำนวน", "Decrease")} className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"><Icon value="i:minus" className="text-[14px]" /></button>
            <input type="number" min={1} step={1} value={qtyText} onChange={(e) => setQtyText(e.target.value)} aria-label={t("จำนวนที่สั่ง", "Order qty")}
              className="h-8 w-24 rounded-md border border-slate-300 bg-white px-2 text-right text-sm font-semibold tabular-nums" />
            <button type="button" onClick={() => setQtyText(String(stepQty(qty, 1)))} aria-label={t("เพิ่มจำนวน", "Increase")} className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"><Icon value="i:plus" className="text-[14px]" /></button>
            {t("ใบ", "pcs")}
          </span>
          <span className="text-xs text-slate-500">{t("ต้นทุน/ใบ", "Cost/pc")} <b className="text-base tabular-nums text-slate-800">{cost > 0 ? money(cost) : "—"}</b></span>
          <span className="text-[11px] text-slate-400">
            {!(cost > 0) ? t("ไซส์นี้ยังไม่ได้ตีราคา", "This size isn't costed yet")
              : Math.abs(cost - costNoQty) > 0.004 ? t(`คิดที่ ${fmt(qty)} ใบ (ค่าที่หารตามจำนวน · ลังส่ง) · รวมที่ยังไม่บันทึก`, `At ${fmt(qty)} pcs (per-order fees · cartons) · incl. unsaved`)
              : t("จากตีราคาปัจจุบัน (รวมที่ยังไม่บันทึก)", "From current costing (incl. unsaved)")}
          </span>
        </div>

        {/* บวกกำไร */}
        <div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-semibold text-slate-700">{t("บวกกำไร", "Markup")}</span>
            <input type="range" min={0} max={300} step={5} value={Math.min(300, pct)} onChange={(e) => setPct(Number(e.target.value))} aria-label={t("บวกกำไร %", "Markup %")} className="min-w-[12rem] flex-1 accent-blue-600" />
            <span className="flex items-center gap-1"><input type="number" min={0} step={1} value={pct} onChange={(e) => setPct(Math.max(0, Math.round(Number(e.target.value)) || 0))} aria-label={t("เปอร์เซ็นต์", "Percent")}
              className="h-8 w-16 rounded-md border border-slate-200 px-1.5 text-right text-sm tabular-nums" />%</span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {PRICE_STEPS.map((p) => <button key={p} type="button" onClick={() => setPct(p)} className={chip(pct === p)}>{p}%</button>)}
            {brandPct != null && (
              <button type="button" onClick={() => setPct(brandPct)} className={chip(pct === brandPct, "green")}
                title={summary.basis === "passed" ? t(`งานที่ลูกค้าตกลงแล้ว ${summary.byStatus.passed?.n ?? 0} รอบ บวกกลาง ๆ`, `${summary.byStatus.passed?.n ?? 0} accepted rounds`) : t("ทุกรอบที่เคยเสนอ (ยังไม่มีรอบที่ผ่าน)", "All quoted rounds (none passed yet)")}>
                {summary.basis === "passed" ? t(`แบรนด์นี้เคยตกลงเฉลี่ย ${brandPct}%`, `Brand accepted ~${brandPct}%`) : t(`แบรนด์นี้เคยเสนอเฉลี่ย ${brandPct}%`, `Brand quoted ~${brandPct}%`)}
              </button>
            )}
          </div>
        </div>

        {/* ผล */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className={tile}>
            <div className="text-[11px] text-slate-500">{vat ? t("ราคาขาย/ใบ (รวม VAT)", "Price/pc (incl. VAT)") : t("ราคาขาย/ใบ", "Price/pc")}</div>
            <div className="text-xl font-semibold tabular-nums text-blue-700">{money(showVat(price))}</div>
            <div className="truncate text-[11px] text-slate-400">{raw != null && price != null && Math.abs(price - raw) > 0.004 ? t(`คิดได้ ${money(raw)} → ปัดเป็น ${fmt(price, price % 1 ? 2 : 0)}`, `${money(raw)} → rounded`) : t(`ต้นทุน × ${fmt(mult, 2)}`, `cost × ${fmt(mult, 2)}`)}</div>
          </div>
          <div className={tile}>
            <div className="text-[11px] text-slate-500">{t("กำไร/ใบ", "Profit/pc")}</div>
            <div className="text-xl font-semibold tabular-nums text-slate-800">{money(profit)}</div>
            <div className="text-[11px] text-slate-400">{price ? t(`${pctTxt(((profit ?? 0) / price) * 100)} ของราคาขาย`, `${pctTxt(((profit ?? 0) / price) * 100)} of price`) : "—"}</div>
          </div>
          <div className={tile}>
            <div className="text-[11px] text-slate-500">{t("ยอดขายทั้งล็อต", "Order sales")}</div>
            <div className="text-xl font-semibold tabular-nums text-slate-800">{price != null ? fmt(showVat(price)! * qty) : "—"}</div>
            <div className="text-[11px] text-slate-400">{price != null ? `${money(showVat(price))} × ${fmt(qty)}` : "—"}</div>
          </div>
          <div className={tile}>
            <div className="text-[11px] text-slate-500">{t("กำไรทั้งล็อต", "Order profit")}</div>
            <div className="text-xl font-semibold tabular-nums text-emerald-700">{profit != null ? fmt(profit * qty) : "—"}</div>
            <div className="text-[11px] text-slate-400">{t("หักต้นทุนทั้งหมดแล้ว", "After all costs")}</div>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={round === "nice"} onChange={(e) => setRound(e.target.checked ? "nice" : "none")} className="h-3.5 w-3.5" />
          {t("ปัดราคาขึ้นเป็นเลขสวย (ลงท้าย 0 / 5 / 9)", "Round up to a tidy price (ends in 0 / 5 / 9)")}
          {round !== "nice" && round !== "none" && <span className="text-slate-400">· {t("ตอนนี้ใช้", "now")} {ROUND_LABEL[round]}</span>}
        </label>

        {/* ราคาตามจำนวน */}
        <div>
          <div className="mb-1 text-sm font-semibold text-slate-700">{t("ราคาตามจำนวน", "Price by quantity")} <span className="text-[11px] font-normal text-slate-400">{t("— สั่งน้อย ต้นทุน/ใบสูงขึ้น (ค่าที่หารตามจำนวน · ลังส่ง) · บวกกำไรเท่ากัน", "— fewer pieces cost more each · same markup")}</span></div>
          <table className="w-full text-sm">
            <thead><tr className="text-[11px] text-slate-500">
              <th className="py-1 text-left font-medium">{t("จำนวน", "Qty")}</th>
              <th className="py-1 text-right font-medium">{t("ต้นทุน/ใบ", "Cost/pc")}</th>
              <th className="py-1 text-right font-medium">{vat ? t("ราคา/ใบ (รวม VAT)", "Price/pc (incl. VAT)") : t("ราคา/ใบ", "Price/pc")}</th>
              <th className="py-1 text-right font-medium">{t("กำไร/ใบ", "Profit/pc")}</th>
              <th className="py-1 text-right font-medium">{t("กำไรทั้งล็อต", "Order profit")}</th>
            </tr></thead>
            <tbody>
              {tiers.map((q) => {
                const c = currentCost(sizeKey, q);
                const p = priceFromCost(c, mult, round);
                const cur = q === qty;
                return (
                  <tr key={q} onClick={() => setQtyText(String(q))} className={`cursor-pointer border-t border-slate-100 ${cur ? "bg-blue-50 text-blue-800" : "hover:bg-slate-50"}`} title={t("กด = ใช้จำนวนนี้", "Click to use this qty")}>
                    <td className="py-1.5">{fmt(q)} {t("ใบ", "pcs")}{cur ? t(" (ที่ใส่)", " (entered)") : ""}</td>
                    <td className="py-1.5 text-right tabular-nums text-slate-500">{c > 0 ? money(c) : "—"}</td>
                    <td className="py-1.5 text-right font-medium tabular-nums">{money(showVat(p))}</td>
                    <td className="py-1.5 text-right tabular-nums text-emerald-700">{p != null ? money(p - c) : "—"}</td>
                    <td className="py-1.5 text-right tabular-nums">{p != null ? fmt((p - c) * q) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ตัวช่วยเพิ่มเติม (พับไว้) */}
        <div className="rounded-lg border border-slate-200">
          <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more} className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50">
            <Icon value={more ? "i:chevron-down" : "i:chevron-right"} className="text-[13px] text-slate-400" />
            {t("ตัวช่วยเพิ่มเติม", "More tools")}
            <span className="text-[11px] text-slate-400">{t("งานอื่นในแบรนด์ · ราคาป้าย · VAT · งบลูกค้า · วิธีปัดอื่น", "Brand jobs · retail prices · VAT · budget · rounding")}</span>
          </button>
          {more && (
            <div className="space-y-3 border-t border-slate-100 px-3 py-2.5">
              {/* งานอื่นในแบรนด์ */}
              <section>
                <div className="mb-1 text-xs font-medium text-slate-600">{t("งานอื่นในแบรนด์นี้เคยเสนอเท่าไหร่ (กด = ใช้ % เท่างานนั้น)", "Other jobs in this brand (click = use its markup)")}</div>
                {loadErr ? <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{loadErr}</div>
                  : !refs ? <div className="py-2 text-center text-xs text-slate-400">{t("กำลังโหลดราคาอ้างอิง…", "Loading reference prices…")}</div>
                  : !refs.brand ? <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{t("ใบงานนี้ยังไม่ได้เลือกแบรนด์ — เลือกแบรนด์ในแท็บข้อมูลก่อน", "This job has no brand yet — set one in the Info tab")}</div>
                  : refs.quotes.length === 0 ? <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">{t("แบรนด์นี้ยังไม่มีงานอื่นที่เสนอราคาไว้", "No other quoted jobs in this brand yet")}</div>
                  : (<>
                    <table className="w-full table-fixed text-xs">
                      <thead><tr className="text-[11px] text-slate-500">
                        <th className="w-[40%] py-1 text-left font-medium">{t("งาน", "Job")}</th>
                        <th className="py-1 text-left font-medium">{t("ไซส์ · จำนวน", "Size · qty")}</th>
                        <th className="py-1 text-right font-medium">{t("ต้นทุน", "Cost")}</th>
                        <th className="py-1 text-right font-medium">{t("เสนอ", "Offered")}</th>
                        <th className="py-1 text-right font-medium">{t("บวก", "Markup")}</th>
                        <th className="w-14 py-1 text-right font-medium">{t("ผล", "Result")}</th>
                      </tr></thead>
                      <tbody>
                        {quotesShown.map((r, i) => {
                          const st = QUOTE_STATUS[r.status] ?? QUOTE_STATUS.pending;
                          const m = markupPctOf(r.cost, r.offered);
                          return (
                            <tr key={i} onClick={() => { if (m != null) setPct(Math.max(0, Math.round(m))); }} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50">
                              <td className="truncate py-1"><span className="text-slate-400">{r.sheet_code}</span> {r.sheet_name}</td>
                              <td className="truncate py-1 text-slate-500">{[r.parent_code, r.qty != null ? t(`${fmt(r.qty)} ชิ้น`, `${fmt(r.qty)} pcs`) : null].filter(Boolean).join(" · ") || "—"}</td>
                              <td className="py-1 text-right tabular-nums text-slate-500">{money(r.cost)}</td>
                              <td className="py-1 text-right font-medium tabular-nums">{money(r.offered)}</td>
                              <td className="py-1 text-right tabular-nums">{pctTxt(m)}</td>
                              <td className="py-1 text-right"><span className={`rounded-full px-1.5 py-0.5 text-[10px] ${st.cls}`}>{st.label}</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {refs.quotes.length > 8 && <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-1 text-xs text-blue-600 hover:underline">{showAll ? t("ย่อ", "Show less") : t(`ดูทั้งหมด ${refs.quotes.length} รอบ`, `Show all ${refs.quotes.length}`)}</button>}
                  </>)}
              </section>
              {/* ราคาป้าย */}
              {refs?.brand && (
                <section>
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <span>{t(`ราคาป้าย (ขายปลีก) ในแบรนด์ ${refs.skus.length} รุ่น · กลาง ๆ ${fmt(skuMedian)} บาท`, `Retail: ${refs.skus.length} models · typical ${fmt(skuMedian)} THB`)}</span>
                    {refs.skus.length > 0 && <input value={skuQ} onChange={(e) => setSkuQ(e.target.value)} placeholder={t("ค้นรุ่น เช่น tote", "Search, e.g. tote")} className="ml-auto h-7 w-40 rounded border border-slate-200 px-2 text-xs" />}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {skuList.map((s) => {
                      const share = costShareOfPrice(cost, s.max);
                      return <span key={s.code} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600"><b className="font-medium text-slate-700">{s.code}</b> {s.name ?? ""} · {s.min !== s.max ? `${fmt(s.min)}–${fmt(s.max)}` : fmt(s.max)} {t("บ.", "THB")}{share != null && <span className="ml-1 text-slate-400">({t("ทุน", "cost")} {pctTxt(share)})</span>}</span>;
                    })}
                    {refs.skus.length > 0 && skuList.length === 0 && <span className="text-xs text-slate-400">{t("ไม่พบรุ่นที่ค้น", "No matching models")}</span>}
                  </div>
                </section>
              )}
              {/* VAT · งบลูกค้า · วิธีปัด */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <div className="mb-1 text-xs text-slate-500">{t("วิธีปัดราคา (ปัดขึ้นเสมอ)", "Rounding (always up)")}</div>
                  <div className="flex flex-wrap gap-1">{(Object.keys(ROUND_LABEL) as PriceRound[]).map((r) => <button key={r} type="button" onClick={() => setRound(r)} className={chip(round === r)}>{ROUND_LABEL[r]}</button>)}</div>
                </div>
                <div>
                  <div className="mb-1 text-xs text-slate-500">{t("ภาษี", "Tax")}</div>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={vat} onChange={(e) => setVat(e.target.checked)} className="h-4 w-4" />{t("โชว์ราคารวม VAT 7%", "Show incl. 7% VAT")}</label>
                  <div className="mt-0.5 text-[11px] text-slate-400">{t("แค่ไว้บอกลูกค้า — ราคาที่ใส่ในรอบเสนอราคายังเป็นก่อน VAT", "Display only — quote rounds keep pre-VAT prices")}</div>
                </div>
                <div>
                  <div className="mb-1 text-xs text-slate-500">{t("ย้อนจากงบลูกค้า (บาท/ใบ)", "From the customer's budget (THB/pc)")}</div>
                  <input type="number" min={0} step="any" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder={vat ? t("งบรวม VAT", "Budget incl. VAT") : "180"} className="h-8 w-28 rounded-md border border-slate-200 px-2 text-right text-sm" />
                  {bud && (
                    <div className="mt-1 text-[11px] leading-relaxed text-slate-600">
                      {t(`ต้นทุนต้องไม่เกิน ${money(bud.maxCost)} บ. ถึงได้บวก ${pct}%`, `Cost must stay ≤ ${money(bud.maxCost)} THB for ${pct}%`)}<br />
                      {cost > 0 && (bud.profit >= 0
                        ? <span className="text-emerald-700">{t(`ตอนนี้กำไร ${money(bud.profit)} บ./ใบ (บวก ${pctTxt(bud.markupPct)})`, `Now: profit ${money(bud.profit)} THB/pc`)}</span>
                        : <span className="text-rose-600">{t(`ตอนนี้ขาดทุน ${money(-bud.profit)} บ./ใบ`, `Now: loss ${money(-bud.profit)} THB/pc`)}</span>)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ERPModal>
  );
}
