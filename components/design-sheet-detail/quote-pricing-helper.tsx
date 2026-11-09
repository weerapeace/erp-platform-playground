"use client";
/**
 * 💰 ตัวช่วยตั้งราคา — ปุ่มในแท็บเสนอราคา ใบงานออกแบบ (เจ้าของขอ 2026-11-09)
 *   1) บวกกำไรจากต้นทุน 25/50/75/100/150/200% (+ใส่ % เอง) · สลับ "บวกจากต้นทุน" ↔ "กำไรคิดจากราคาขาย"
 *   2) งานอื่นในแบรนด์เดียวกันเคยเสนอเท่าไหร่ (บวกกี่ % · ลูกค้าตกลงไหม) + ราคาป้ายสินค้าในแบรนด์
 *   3) ตัวช่วยอื่น: ปัดราคาให้สวย · โชว์ราคารวม VAT · ย้อนจากงบลูกค้า · ราคาตามจำนวน (ตีราคาต่อขั้นจำนวนรวมค่าที่หารตามจำนวนแล้ว)
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
  brandMarkupSummary, budgetCheck, costShareOfPrice, markupPctOf, markupTable, median, multiplierOf, priceFromCost, withVat,
  MODE_HINT, MODE_LABEL, PRICE_STEPS, ROUND_LABEL,
  type BrandQuoteRef, type BrandSkuRef, type PriceMode, type PriceRound,
} from "@/lib/quote-pricing";

/** ที่ส่งกลับไปให้ฟอร์มรอบเสนอราคา: ราคา = ตีราคาของช่อง × mult แล้วปัด */
export type PriceFill = { id: number; mult: number; round: PriceRound; label: string };

type Size = { key: string; label: string };
type Refs = { brand: { id: string; name: string } | null; quotes: BrandQuoteRef[]; skus: BrandSkuRef[] };
type Sel = { kind: "step"; pct: number } | { kind: "custom" } | { kind: "ref"; idx: number } | { kind: "suggest" };

const fmt = (n: number | null | undefined, dp = 0) => (n == null || !Number.isFinite(n) ? "—" : Number(n).toLocaleString("th-TH", { minimumFractionDigits: dp, maximumFractionDigits: dp }));
const fmtMoney = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : Number(n).toLocaleString("th-TH", { maximumFractionDigits: 2 }));
const pctTxt = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : `${Math.round(n)}%`);

export function QuotePricingHelper({ open, onClose, sheetId, sizes, currentCost, qtys, onApply }: {
  open: boolean; onClose: () => void; sheetId: string;
  sizes: Size[];
  currentCost: (key: string, qty?: number | null) => number;
  qtys: (number | null)[];                         // ขั้นจำนวนที่ใช้ดูราคาตามจำนวน (จากครั้งล่าสุด)
  onApply: (f: Omit<PriceFill, "id">) => void;
}) {
  const t = useT();
  const firstCosted = sizes.find((s) => currentCost(s.key) > 0)?.key ?? sizes[0]?.key ?? "";
  const [sizeKey, setSizeKey] = useState(firstCosted);
  const [costInput, setCostInput] = useState("");   // ว่าง = ใช้ตีราคาจริง · พิมพ์ = ลองดูตัวเลขเฉย ๆ
  const [mode, setMode] = useState<PriceMode>("markup");
  const [round, setRound] = useState<PriceRound>("none");
  const [vat, setVat] = useState(false);
  const [budget, setBudget] = useState("");
  const [customPct, setCustomPct] = useState("");
  const [sel, setSel] = useState<Sel>({ kind: "step", pct: 100 });
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

  const realCost = currentCost(sizeKey);
  const typed = costInput.trim() !== "" ? Number(costInput) : null;
  const cost = typed != null && Number.isFinite(typed) && typed >= 0 ? typed : realCost;
  const rows = useMemo(() => markupTable(cost, mode, round), [cost, mode, round]);
  const summary = useMemo(() => brandMarkupSummary(refs?.quotes ?? []), [refs]);

  // ตัวคูณ + คำอธิบายของวิธีที่เลือก
  const pick = useMemo((): { mult: number | null; label: string } => {
    if (sel.kind === "step") return { mult: multiplierOf(mode, sel.pct), label: `${MODE_LABEL[mode]} ${sel.pct}%` };
    if (sel.kind === "custom") { const p = Number(customPct); return { mult: customPct.trim() ? multiplierOf(mode, p) : null, label: `${MODE_LABEL[mode]} ${customPct || "?"}%` }; }
    if (sel.kind === "suggest") return { mult: summary.suggestPct != null ? 1 + summary.suggestPct / 100 : null, label: t(`กลาง ๆ ของแบรนด์นี้ (บวก ${pctTxt(summary.suggestPct)})`, `Brand typical (markup ${pctTxt(summary.suggestPct)})`) };
    const r = refs?.quotes[sel.idx];
    const m = r ? markupPctOf(r.cost, r.offered) : null;
    return { mult: m != null ? 1 + m / 100 : null, label: t(`เท่างาน ${r?.sheet_code ?? ""} (บวก ${pctTxt(m)})`, `Same as ${r?.sheet_code ?? ""} (markup ${pctTxt(m)})`) };
  }, [sel, mode, customPct, summary, refs, t]);
  const pickPrice = pick.mult != null ? priceFromCost(cost, pick.mult, round) : null;
  const showVat = (v: number | null) => (v == null ? null : vat ? withVat(v) : v);
  const bud = budgetCheck(Number(budget), cost, pick.mult ?? 0, vat);

  const switchMode = (m: PriceMode) => { setMode(m); if (m === "margin" && sel.kind === "step" && sel.pct >= 100) setSel({ kind: "step", pct: 50 }); };
  const quotesShown = refs ? (showAll ? refs.quotes : refs.quotes.slice(0, 8)) : [];
  const skuList = useMemo(() => {
    const q = skuQ.trim().toLowerCase();
    const all = refs?.skus ?? [];
    return (q ? all.filter((s) => `${s.code} ${s.name ?? ""}`.toLowerCase().includes(q)) : all).slice(0, 12);
  }, [refs, skuQ]);
  const skuMedian = useMemo(() => median((refs?.skus ?? []).map((s) => s.max)), [refs]);
  const tierQtys = qtys.length ? qtys : [100, 200, 500, 1000];
  const tierVaries = tierQtys.some((q) => Math.abs(currentCost(sizeKey, q) - realCost) > 0.004);

  const seg = (on: boolean) => `h-7 px-2.5 text-xs rounded-md border ${on ? "border-blue-400 bg-blue-50 text-blue-700 font-medium" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`;
  const rowCls = (on: boolean) => `cursor-pointer border-t border-slate-100 ${on ? "bg-blue-50 text-blue-800" : "hover:bg-slate-50"}`;
  const sectionHd = "flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-700 mb-2";

  return (
    <ERPModal open={open} onClose={onClose} size="xl" title={t("ตัวช่วยตั้งราคา", "Pricing helper")}
      description={refs?.brand ? t(`แบรนด์ ${refs.brand.name} · กดแถวเพื่อเลือกวิธีคิดราคา`, `Brand ${refs.brand.name} · click a row to pick a pricing method`) : t("กดแถวเพื่อเลือกวิธีคิดราคา", "Click a row to pick a pricing method")}
      footer={<>
        <div className="mr-auto text-sm text-slate-600">
          {t("ราคาที่เลือก", "Selected")} <b className="text-lg text-blue-700 tabular-nums">{fmtMoney(showVat(pickPrice))}</b> {t("บาท/ใบ", "THB/pc")}
          <span className="ml-2 text-xs text-slate-400">{pick.label}{vat ? t(" · รวม VAT", " · incl. VAT") : ""}</span>
        </div>
        <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">{t("ปิด", "Close")}</button>
        <button type="button" disabled={pick.mult == null} onClick={() => { if (pick.mult != null) { onApply({ mult: pick.mult, round, label: pick.label }); onClose(); } }}
          title={t("ใส่ราคาให้ทุกไซส์ที่ติ๊ก × ทุกขั้นจำนวนในฟอร์ม คิดจากตีราคาของแต่ละช่อง", "Fill every ticked size × quantity tier in the form, based on each cell's costing")}
          className="h-9 rounded-lg bg-blue-600 px-4 text-sm text-white hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1.5">
          <Icon value="i:check" className="text-[14px]" />{t("ใส่ราคาในรอบเสนอราคา", "Put into quote round")}
        </button>
      </>}>
      <div className="space-y-4">
        {/* ต้นทุนที่ใช้คิด */}
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
          {sizes.length > 1 && (
            <label className="flex items-center gap-1.5 text-xs text-slate-500">{t("ไซส์", "Size")}
              <select value={sizeKey} onChange={(e) => { setSizeKey(e.target.value); setCostInput(""); }} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm">
                {sizes.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </label>
          )}
          <label className="flex items-center gap-1.5 text-xs text-slate-500">{t("ต้นทุน/ใบ", "Cost/pc")}
            <input type="number" min={0} step="any" value={costInput} onChange={(e) => setCostInput(e.target.value)} placeholder={realCost > 0 ? fmtMoney(realCost) : t("ยังไม่ได้ตีราคา", "Not costed")}
              className="h-8 w-28 rounded-md border border-slate-200 bg-white px-2 text-right text-sm tabular-nums" />
          </label>
          <span className="text-xs text-slate-400">
            {typed != null ? t("ลองพิมพ์ต้นทุนดูตัวเลขได้ — ตอนใส่ราคายังใช้ตีราคาจริงของแต่ละช่อง", "Trying a cost only changes the numbers here — filling still uses each cell's real costing")
              : realCost > 0 ? t("จากตีราคาปัจจุบัน (รวมที่ยังไม่บันทึก)", "From current costing (incl. unsaved)") : t("ไซส์นี้ยังไม่ได้ตีราคา — พิมพ์ต้นทุนเพื่อลองดูได้", "This size isn't costed yet — type a cost to try")}
          </span>
        </div>

        {/* 1) บวกกำไรจากต้นทุน */}
        <section>
          <div className={sectionHd}>
            <Icon value="i:trending-up" className="text-[16px] text-blue-600" />{t("1. บวกกำไรจากต้นทุน", "1. Add profit on cost")}
            <span className="ml-auto flex gap-1">
              {(["markup", "margin"] as PriceMode[]).map((m) => <button key={m} type="button" onClick={() => switchMode(m)} className={seg(mode === m)}>{MODE_LABEL[m]}</button>)}
            </span>
          </div>
          <div className="mb-1 text-xs text-slate-400">{MODE_HINT[mode]}</div>
          <table className="w-full text-sm">
            <thead><tr className="text-[11px] text-slate-500">
              <th className="py-1 text-left font-medium">%</th>
              <th className="py-1 text-right font-medium">{vat ? t("ราคาขาย/ใบ (รวม VAT)", "Price/pc (incl. VAT)") : t("ราคาขาย/ใบ", "Price/pc")}</th>
              <th className="py-1 text-right font-medium">{t("กำไร/ใบ", "Profit/pc")}</th>
              <th className="py-1 text-right font-medium">{mode === "markup" ? t("กำไรคิดจากราคาขาย", "Margin on price") : t("บวกจากต้นทุน", "Markup on cost")}</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.pct} onClick={() => setSel({ kind: "step", pct: r.pct })} className={rowCls(sel.kind === "step" && sel.pct === r.pct)}>
                  <td className="py-1.5">{mode === "markup" ? t(`บวก ${r.pct}%`, `+${r.pct}%`) : t(`กำไร ${r.pct}%`, `Margin ${r.pct}%`)}</td>
                  <td className="py-1.5 text-right font-medium tabular-nums">{fmtMoney(showVat(r.price))}</td>
                  <td className="py-1.5 text-right tabular-nums text-emerald-700">{fmtMoney(r.profit)}</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-500">{pctTxt(mode === "markup" ? r.marginPct : r.markupPct)}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={4} className="py-3 text-center text-xs text-slate-400">{t("ใส่ต้นทุนก่อน ตารางถึงจะคิดราคาให้", "Enter a cost to see prices")}</td></tr>}
              <tr onClick={() => setSel({ kind: "custom" })} className={rowCls(sel.kind === "custom")}>
                <td className="py-1.5" colSpan={4}>
                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">{t("ใส่ % เอง", "Custom %")}
                    <input type="number" min={0} step="any" value={customPct} onChange={(e) => { setCustomPct(e.target.value); setSel({ kind: "custom" }); }} onClick={(e) => e.stopPropagation()}
                      placeholder={mode === "markup" ? "120" : "40"} className="h-7 w-20 rounded border border-slate-200 bg-white px-1.5 text-right text-sm" />%
                    {sel.kind === "custom" && customPct.trim() !== "" && (pick.mult == null
                      ? <span className="text-rose-600">{t("กำไรจากราคาขายต้องไม่ถึง 100%", "Margin must be under 100%")}</span>
                      : <span className="text-slate-700">→ <b className="tabular-nums">{fmtMoney(showVat(pickPrice))}</b> {t("บาท", "THB")}</span>)}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
          <div className="mt-1 text-[11px] text-slate-400">{t(`ขั้นที่มีให้: ${PRICE_STEPS.join(" / ")}% · โหมด "กำไรคิดจากราคาขาย" ตั้งได้ไม่ถึง 100%`, `Steps: ${PRICE_STEPS.join(" / ")}% · margin mode must stay under 100%`)}</div>
        </section>

        {/* 2) งานอื่นในแบรนด์เดียวกัน */}
        <section>
          <div className={sectionHd}><Icon value="i:building-store" className="text-[16px] text-blue-600" />{t("2. งานอื่นในแบรนด์นี้เคยเสนอเท่าไหร่", "2. What other jobs in this brand quoted")}</div>
          {loadErr ? <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{loadErr}</div>
            : !refs ? <div className="py-4 text-center text-xs text-slate-400">{t("กำลังโหลดราคาอ้างอิง…", "Loading reference prices…")}</div>
            : !refs.brand ? <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{t("ใบงานนี้ยังไม่ได้เลือกแบรนด์ — เลือกแบรนด์ในแท็บข้อมูลก่อน ถึงจะเทียบกับงานอื่นได้", "This job has no brand yet — set one in the Info tab to compare with other jobs")}</div>
            : (<>
              {refs.quotes.length === 0 ? (
                <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">{t("แบรนด์นี้ยังไม่มีงานอื่นที่เสนอราคาไว้ (ต้องมีทั้งตีราคาและราคาที่เสนอ)", "No other quoted jobs in this brand yet (needs both costing and offered price)")}</div>
              ) : (<>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  {summary.basis === "passed"
                    ? <span>{t(`งานที่ลูกค้าตกลงแล้ว ${summary.byStatus.passed?.n ?? 0} รอบ บวกกลาง ๆ`, `${summary.byStatus.passed?.n ?? 0} accepted rounds, typical markup`)} <b>{pctTxt(summary.suggestPct)}</b></span>
                    : <span>{t("ยังไม่มีรอบที่กด \"ผ่าน\" — ทุกรอบบวกกลาง ๆ", "No \"passed\" rounds yet — all rounds typical markup")} <b>{pctTxt(summary.suggestPct)}</b></span>}
                  {summary.suggestPct != null && cost > 0 && (
                    <button type="button" onClick={() => setSel({ kind: "suggest" })} className={seg(sel.kind === "suggest")}>
                      {t(`ใช้ % นี้ → ${fmtMoney(showVat(priceFromCost(cost, 1 + summary.suggestPct / 100, round)))} บาท`, `Use it → ${fmtMoney(showVat(priceFromCost(cost, 1 + summary.suggestPct / 100, round)))} THB`)}
                    </button>
                  )}
                </div>
                <table className="w-full table-fixed text-sm">
                  <thead><tr className="text-[11px] text-slate-500">
                    <th className="w-[38%] py-1 text-left font-medium">{t("งาน", "Job")}</th>
                    <th className="py-1 text-left font-medium">{t("ไซส์ · จำนวน", "Size · qty")}</th>
                    <th className="py-1 text-right font-medium">{t("ต้นทุน", "Cost")}</th>
                    <th className="py-1 text-right font-medium">{t("เสนอ", "Offered")}</th>
                    <th className="py-1 text-right font-medium">{t("บวก", "Markup")}</th>
                    <th className="w-16 py-1 text-right font-medium">{t("ผล", "Result")}</th>
                  </tr></thead>
                  <tbody>
                    {quotesShown.map((r, i) => {
                      const st = QUOTE_STATUS[r.status] ?? QUOTE_STATUS.pending;
                      return (
                        <tr key={i} onClick={() => setSel({ kind: "ref", idx: i })} className={rowCls(sel.kind === "ref" && sel.idx === i)} title={t("กด = ใช้ % บวกเท่างานนี้", "Click = use this job's markup")}>
                          <td className="truncate py-1.5"><span className="text-xs text-slate-400">{r.sheet_code}</span> {r.sheet_name}</td>
                          <td className="truncate py-1.5 text-xs text-slate-500">{[r.parent_code, r.qty != null ? t(`${fmt(r.qty)} ชิ้น`, `${fmt(r.qty)} pcs`) : null].filter(Boolean).join(" · ") || "—"}</td>
                          <td className="py-1.5 text-right tabular-nums text-slate-500">{fmtMoney(r.cost)}</td>
                          <td className="py-1.5 text-right font-medium tabular-nums">{fmtMoney(r.offered)}</td>
                          <td className="py-1.5 text-right tabular-nums">{pctTxt(markupPctOf(r.cost, r.offered))}</td>
                          <td className="py-1.5 text-right"><span className={`rounded-full px-2 py-0.5 text-[11px] ${st.cls}`}>{st.label}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {refs.quotes.length > 8 && (
                  <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-1 text-xs text-blue-600 hover:underline">
                    {showAll ? t("ย่อ", "Show less") : t(`ดูทั้งหมด ${refs.quotes.length} รอบ`, `Show all ${refs.quotes.length} rounds`)}
                  </button>
                )}
              </>)}

              {/* ราคาป้ายสินค้าในแบรนด์ */}
              <div className="mt-3 rounded-lg border border-slate-100 px-3 py-2">
                <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{t(`ราคาป้าย (ขายปลีก) สินค้าในแบรนด์ ${refs.skus.length} รุ่น · กลาง ๆ ${fmt(skuMedian)} บาท`, `Retail prices: ${refs.skus.length} models · typical ${fmt(skuMedian)} THB`)}</span>
                  {refs.skus.length > 0 && <input value={skuQ} onChange={(e) => setSkuQ(e.target.value)} placeholder={t("ค้นรุ่น/ชื่อ เช่น tote", "Search model, e.g. tote")} className="ml-auto h-7 w-44 rounded border border-slate-200 px-2 text-xs" />}
                </div>
                {refs.skus.length === 0 ? <div className="text-xs text-slate-400">{t("แบรนด์นี้ยังไม่มีสินค้าที่ตั้งราคาป้าย", "No retail prices set for this brand yet")}</div> : (
                  <div className="flex flex-wrap gap-1.5">
                    {skuList.map((s) => {
                      const share = costShareOfPrice(cost, s.max);
                      return (
                        <span key={s.code} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600" title={share != null ? t(`ต้นทุนงานนี้ = ${pctTxt(share)} ของราคาป้าย`, `This job's cost = ${pctTxt(share)} of retail`) : undefined}>
                          <b className="font-medium text-slate-700">{s.code}</b> {s.name ?? ""} · {s.min !== s.max ? `${fmt(s.min)}–${fmt(s.max)}` : fmt(s.max)} {t("บ.", "THB")}
                          {share != null && <span className="ml-1 text-slate-400">({t("ทุน", "cost")} {pctTxt(share)})</span>}
                        </span>
                      );
                    })}
                    {skuList.length === 0 && <span className="text-xs text-slate-400">{t("ไม่พบรุ่นที่ค้น", "No matching models")}</span>}
                  </div>
                )}
              </div>
            </>)}
        </section>

        {/* 3) ตัวช่วยอื่น */}
        <section>
          <div className={sectionHd}><Icon value="i:tools" className="text-[16px] text-blue-600" />{t("3. ตัวช่วยอื่น", "3. More tools")}</div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <div className="mb-1 text-xs text-slate-500">{t("ปัดราคาให้สวย (ปัดขึ้นเสมอ)", "Round prices (always up)")}</div>
              <div className="flex flex-wrap gap-1">{(Object.keys(ROUND_LABEL) as PriceRound[]).map((r) => <button key={r} type="button" onClick={() => setRound(r)} className={seg(round === r)}>{ROUND_LABEL[r]}</button>)}</div>
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">{t("ภาษี", "Tax")}</div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={vat} onChange={(e) => setVat(e.target.checked)} className="h-4 w-4" />{t("โชว์ราคารวม VAT 7%", "Show prices incl. 7% VAT")}</label>
              <div className="mt-0.5 text-[11px] text-slate-400">{t("แค่ไว้บอกลูกค้า — ราคาที่ใส่ในรอบเสนอราคายังเป็นก่อน VAT", "Display only — quote rounds keep pre-VAT prices")}</div>
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">{t("ย้อนจากงบลูกค้า (บาท/ใบ)", "From the customer's budget (THB/pc)")}</div>
              <input type="number" min={0} step="any" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder={vat ? t("งบรวม VAT", "Budget incl. VAT") : "180"} className="h-8 w-28 rounded-md border border-slate-200 px-2 text-right text-sm" />
              {bud && (
                <div className="mt-1 text-[11px] leading-relaxed text-slate-600">
                  {t(`ต้นทุนต้องไม่เกิน ${fmtMoney(bud.maxCost)} บ. ถึงได้ตามที่เลือก`, `Cost must stay ≤ ${fmtMoney(bud.maxCost)} THB for the selected method`)}<br />
                  {cost > 0 && (bud.profit >= 0
                    ? <span className="text-emerald-700">{t(`ตอนนี้กำไร ${fmtMoney(bud.profit)} บ./ใบ (บวก ${pctTxt(bud.markupPct)})`, `Now: profit ${fmtMoney(bud.profit)} THB/pc (markup ${pctTxt(bud.markupPct)})`)}</span>
                    : <span className="text-rose-600">{t(`ตอนนี้ขาดทุน ${fmtMoney(-bud.profit)} บ./ใบ`, `Now: loss ${fmtMoney(-bud.profit)} THB/pc`)}</span>)}
                </div>
              )}
            </div>
          </div>

          {/* ราคาตามจำนวน */}
          <div className="mt-3">
            <div className="mb-1 text-xs text-slate-500">
              {t("ราคาตามจำนวน (ใช้วิธีที่เลือก)", "Price by quantity (selected method)")}
              {tierVaries ? t(" · ต้นทุนแต่ละขั้นรวมค่าที่หารตามจำนวน (เช่น ค่าบล็อก) แล้ว", " · each tier's cost already spreads per-order fees (e.g. block fee)") : t(" · ตีราคานี้ไม่มีค่าที่หารตามจำนวน ต้นทุนทุกขั้นเท่ากัน", " · no per-order fees in this costing, so cost is the same for every tier")}
            </div>
            <table className="w-full text-sm">
              <thead><tr className="text-[11px] text-slate-500">
                <th className="py-1 text-left font-medium">{t("จำนวน", "Qty")}</th>
                <th className="py-1 text-right font-medium">{t("ต้นทุน/ใบ", "Cost/pc")}</th>
                <th className="py-1 text-right font-medium">{vat ? t("ราคาเสนอ/ใบ (รวม VAT)", "Offer/pc (incl. VAT)") : t("ราคาเสนอ/ใบ", "Offer/pc")}</th>
                <th className="py-1 text-right font-medium">{t("ยอดทั้งงาน", "Order total")}</th>
              </tr></thead>
              <tbody>
                {tierQtys.map((q) => {
                  const c = typed != null ? cost : currentCost(sizeKey, q);
                  const p = pick.mult != null ? priceFromCost(c, pick.mult, round) : null;
                  const pv = showVat(p);
                  return (
                    <tr key={String(q)} className="border-t border-slate-100">
                      <td className="py-1.5">{q == null ? t("ไม่ระบุ", "No qty") : t(`${fmt(q)} ใบ`, `${fmt(q)} pcs`)}</td>
                      <td className="py-1.5 text-right tabular-nums text-slate-500">{fmtMoney(c > 0 ? c : null)}</td>
                      <td className="py-1.5 text-right font-medium tabular-nums">{fmtMoney(pv)}</td>
                      <td className="py-1.5 text-right tabular-nums text-slate-500">{pv != null && q != null ? fmtMoney(Math.round(pv * q * 100) / 100) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </ERPModal>
  );
}
