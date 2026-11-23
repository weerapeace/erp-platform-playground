"use client";

// ============================================================
// PartnerDetail — หน้ารายละเอียดคู่ค้าแบบ B (เจ้าของเลือกจาก widget 2026-11-23 + ข้อเสนอ 1-11)
//   ซ้าย: การ์ดร้าน (โลโก้ · ป้าย · ปุ่มด่วน · ตัวเลขสรุป · ขาดข้อมูลอะไร)
//   ขวา: แท็บ ภาพรวม · สินค้า (รูป) · ใบสั่งซื้อ · บิลจีน · ประวัติราคา · ติดต่อ/ที่อยู่ · ไฟล์แนบ · โน้ตทีม · ประวัติแก้
//   แก้ในช่อง (กดดินสอ) → PATCH master-v2 (สิทธิ์ field + audit) + ปุ่มย้อนกลับ · จำแท็บล่าสุด (เครื่องนี้)
//   ข้อมูลแท็บมาจาก GET /api/partners/[id]/related (ตรรกะ lib/partner-insights) · มือถือ = เรียงลงมา + แถบปุ่มล่าง
//   ของกลางที่ใช้: RecordFilesField · CommentThread · RecordHistoryInline · PoDetailModal · PoCreateModal · PoPayChip
//                 MasterRecordDrawer (SKU) · PurchaseCreditTermInput · PurchaseLeadTimeInput · Icon · toast.undo
// ============================================================

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import nextDynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useAuth } from "@/components/auth";
import { Spinner } from "@/components/spinner";
import { Icon } from "@/components/icon";
import { PoPayChip } from "@/components/po-pay-chip";
import { poPayState } from "@/lib/po-pay-state";
import { r2ImageUrl } from "@/lib/r2-image";
import { PurchaseCreditTermInput } from "@/components/purchase-credit-term-input";
import { PurchaseLeadTimeInput } from "@/components/purchase-lead-time-input";
import { formatCreditTerm, formatLeadTime, salesCreditTermOf } from "@/lib/credit-term";
import { partnerGaps, isChinaPartner } from "@/lib/partner-data-check";
import { normCur, type PricePoint } from "@/lib/partner-insights";
import type { PartnerSummaryRow } from "@/app/api/partners/summary/route";

const MasterRecordDrawer = nextDynamic(() => import("@/components/master-crud").then((m) => m.MasterRecordDrawer), { ssr: false });
const PoDetailModal = nextDynamic(() => import("@/components/po-detail-modal").then((m) => m.PoDetailModal), { ssr: false });
const PoCreateModal = nextDynamic(() => import("@/app/purchasing/po-list/create-modal").then((m) => m.PoCreateModal), { ssr: false });
const RecordFilesField = nextDynamic(() => import("@/components/record-files").then((m) => m.RecordFilesField), { ssr: false });
const CommentThread = nextDynamic(() => import("@/components/comment-thread").then((m) => m.CommentThread), { ssr: false });
const RecordHistoryInline = nextDynamic(() => import("@/components/activity-feed/record-history-drawer").then((m) => m.RecordHistoryInline), { ssr: false });

type Partner = Record<string, unknown> & { id: string };
const s = (p: Partner, k: string): string => { const v = p[k]; return v == null ? "" : String(v); };
const b = (p: Partner, k: string): boolean => p[k] === true;

const SYM: Record<string, string> = { RMB: "¥", THB: "฿", USD: "$" };
const fmtMoney = (n: number | null | undefined, cur?: string | null) => {
  const v = Number(n); if (!Number.isFinite(v) || v <= 0) return "";
  const c = normCur(cur); return (SYM[c] ?? "") + v.toLocaleString("th-TH", { maximumFractionDigits: 2 }) + (SYM[c] ? "" : ` ${c}`);
};
const fmtByCur = (m: Record<string, number> | undefined) => {
  const parts = Object.entries(m ?? {}).filter(([, v]) => v > 0).map(([c, v]) => fmtMoney(v, c));
  return parts.length ? parts.join(" · ") : "—";
};
const fmtD = (v: unknown) => {
  const t = v ? String(v).slice(0, 10) : ""; if (!t) return "";
  const d = new Date(t + "T00:00:00"); return isNaN(d.getTime()) ? "" : d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
};
const lineUrl = (id: string) => `https://line.me/R/ti/p/${id.startsWith("@") ? id : "~" + id}`;
const CURRENCIES = ["THB", "CNY", "RMB", "USD"];

type Material = { id: string; sku_id: string | null; sku_code: string; sku_name: string; img: string | null; supplier_sku: string; price: number | null; currency: string;
  moq: number | null; lead_time_days: number | null; is_default: boolean; last_buy: { date: string | null; price: number; currency: string } | null };
type PoItem = { id: string; po_no: string | null; order_date: string | null; grand_total: number | null; status: string | null; currency: string | null;
  payment_status: string | null; paid_date: string | null; payment_due_date: string | null; china_bill_id: string | null; line_count: number; recv: "none" | "partial" | "full" | null };
type Bill = { id: string; status: string | null; bill_date: string | null; transfer_date: string | null; amount_rmb: number | null; paid_rmb: number | null; created_at: string | null };
type PriceRow = { sku_id: string; sku_code: string; sku_name: string; img: string | null; points: PricePoint[]; change_pct: number | null };
type Related = {
  is_supplier: boolean; is_customer: boolean; materials: Material[]; purchase_orders: PoItem[]; china_bills: Bill[];
  offer_sheets: { id: string; title: string | null; status: string | null; created_at: string | null }[];
  price_history: PriceRow[]; kpi: { year_buy: Record<string, number>; last_po: string | null };
  counts: Record<string, number>;
};

type TabKey = "ov" | "pr" | "po" | "cb" | "ph" | "qt" | "ct" | "fi" | "nt" | "hi";
const TAB_LS = "partnerDetailTab";
const VIEW_LS = "partnerProdView";
const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* โหมดส่วนตัว */ } };

/** กล่องรูปสินค้า (ย่อผ่าน proxy) · ไม่มีรูป = ไอคอนกล่อง */
function Thumb({ img, size, className = "" }: { img: string | null; size: number; className?: string }) {
  const src = r2ImageUrl(img, size * 2);
  return (
    <div style={{ width: size, height: size }} className={`flex-none rounded-lg bg-slate-100 overflow-hidden flex items-center justify-center text-slate-400 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" loading="lazy" className="w-full h-full object-cover" /> : <Icon name="package" size={Math.round(size * 0.42)} />}
    </div>
  );
}

const Chip = ({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "green" | "red" | "amber" | "blue" | "indigo" }) => {
  const C = { slate: "bg-slate-100 text-slate-600", green: "bg-emerald-50 text-emerald-700", red: "bg-red-50 text-red-700", amber: "bg-amber-50 text-amber-700", blue: "bg-blue-50 text-blue-700", indigo: "bg-indigo-50 text-indigo-700" }[tone];
  return <span className={`inline-flex items-center gap-1 text-[10.5px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${C}`}>{children}</span>;
};
const SecLab = ({ children, right }: { children: ReactNode; right?: ReactNode }) =>
  <div className="flex items-center gap-2 mb-2"><div className="text-[11px] font-bold tracking-wide text-slate-400">{children}</div>{right && <div className="ml-auto">{right}</div>}</div>;

// ───────── แก้ในช่อง (ข้อเสนอ 11) ─────────
type FieldKind = "text" | "textarea" | "money" | "term" | "lead" | "select" | "toggle";
type FieldDef = { k: string; label: string; kind?: FieldKind; options?: string[]; display?: (p: Partner) => string; ph?: string };

function InlineField({ def, partner, canEdit, editing, onStart, onCancel, onSave }: {
  def: FieldDef; partner: Partner; canEdit: boolean; editing: boolean;
  onStart: () => void; onCancel: () => void; onSave: (k: string, v: unknown) => Promise<boolean>;
}) {
  const kind = def.kind ?? "text";
  const raw = partner[def.k];
  const shown = def.display ? def.display(partner) : (raw == null ? "" : String(raw));
  const [draft, setDraft] = useState<unknown>(raw ?? null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (editing) setDraft(raw ?? null); }, [editing, raw]);

  if (kind === "toggle") {
    const on = raw === true;
    return (
      <div className="flex items-center justify-between gap-2 py-1.5">
        <span className="text-[12.5px] text-slate-500">{def.label}</span>
        <button type="button" disabled={!canEdit || busy} aria-pressed={on}
          onClick={async () => { setBusy(true); await onSave(def.k, !on); setBusy(false); }}
          className={`w-[38px] h-[22px] rounded-full relative transition disabled:opacity-60 ${on ? "bg-indigo-500" : "bg-slate-300"}`}>
          <span className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-all ${on ? "left-[19px]" : "left-[3px]"}`} />
        </button>
      </div>
    );
  }

  // ว่าง + แก้ไม่ได้ = ไม่โชว์เลย (ข้อเสนอ 3 · ไม่มีแถว "ไม่มีข้อมูล" ให้รก)
  if (!shown && !canEdit && !editing) return null;

  const save = async () => {
    let v: unknown = draft;
    if (typeof v === "string") v = v.trim() === "" ? null : v.trim();
    if (kind === "money") { const n = Number(String(draft ?? "").replace(/,/g, "")); v = draft == null || String(draft).trim() === "" ? null : (Number.isFinite(n) && n >= 0 ? n : NaN); }
    if (Number.isNaN(v)) return;
    setBusy(true); const ok = await onSave(def.k, v); setBusy(false);
    if (ok) onCancel();
  };

  return (
    <div className="group py-1.5 min-w-0" data-field={def.k}>
      <div className="text-[11px] text-slate-400">{def.label}</div>
      {editing ? (
        <div className="mt-1 flex flex-col gap-1.5">
          {kind === "term" ? <PurchaseCreditTermInput value={(draft as string) || null} onChange={(v) => setDraft(v)} size="sm" />
            : kind === "lead" ? <PurchaseLeadTimeInput value={(draft as string) || null} onChange={(v) => setDraft(v)} />
            : kind === "select" ? (
              <select value={String(draft ?? "")} onChange={(e) => setDraft(e.target.value)} className="h-8 border border-slate-200 rounded-lg px-2 text-[13px]">
                {(def.options ?? []).map((o) => <option key={o}>{o}</option>)}
              </select>)
            : kind === "textarea" ? (
              <textarea autoFocus value={String(draft ?? "")} onChange={(e) => setDraft(e.target.value)} placeholder={def.ph}
                className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-[13px] min-h-[64px] focus:outline-2 focus:outline-indigo-500" />)
            : (
              <input autoFocus value={String(draft ?? "")} onChange={(e) => setDraft(e.target.value)} placeholder={def.ph}
                inputMode={kind === "money" ? "decimal" : undefined}
                onKeyDown={(e) => { if (e.key === "Enter") void save(); if (e.key === "Escape") { e.stopPropagation(); onCancel(); } }}
                className="h-8 w-full border border-slate-200 rounded-lg px-2.5 text-[13px] focus:outline-2 focus:outline-indigo-500" />)}
          <div className="flex gap-1.5">
            <button onClick={() => void save()} disabled={busy} className="h-7 px-3 text-[12px] font-semibold rounded-lg bg-indigo-600 text-white disabled:opacity-50 inline-flex items-center gap-1">{busy ? <Spinner /> : <Icon name="done" />} บันทึก</button>
            <button onClick={onCancel} disabled={busy} className="h-7 px-3 text-[12px] font-semibold rounded-lg border border-slate-200 text-slate-600">ยกเลิก</button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-1.5 min-w-0">
          {shown ? <div className={`text-[13px] text-slate-800 break-words min-w-0 ${kind === "textarea" ? "whitespace-pre-wrap" : ""}`}>{shown}</div>
            : <button onClick={onStart} className="text-[12.5px] text-indigo-500 hover:underline">+ เพิ่ม</button>}
          {shown && canEdit && (
            <button onClick={onStart} aria-label={`แก้ ${def.label}`} title={`แก้ ${def.label}`}
              className="shrink-0 text-slate-300 hover:text-indigo-600 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 transition"><Icon name="edit" size={13} /></button>
          )}
        </div>
      )}
    </div>
  );
}

// ───────── ตัวหลัก ─────────
export function PartnerDetail({ partner, canEdit, summary, avatar, badges, topSlot, onSaved, onEditAll, onDeactivate }: {
  partner: Partner; canEdit: boolean; summary?: PartnerSummaryRow;
  avatar: ReactNode; badges: ReactNode;
  /** กล่องเติมช่องที่ขาด (เปิดจากแท็บข้อมูลไม่ครบ) */
  topSlot?: ReactNode;
  onSaved: (p: Partner) => void; onEditAll: () => void; onDeactivate: () => void;
}) {
  const toast = useToast();
  const { can } = useAuth();
  const showMoney = can("cashflow.view");
  const canPo = can("products.edit" as Parameters<typeof can>[0]);
  const isSup = b(partner, "is_supplier");
  const isCus = b(partner, "is_customer");
  const china = isChinaPartner(partner);

  const [rel, setRel] = useState<Related | null>(null);
  const [relLoading, setRelLoading] = useState(true);
  const [relErr, setRelErr] = useState(false);
  const loadRel = useCallback(async () => {
    setRelLoading(true); setRelErr(false);
    try { const r = await apiFetch(`/api/partners/${partner.id}/related`); const j = await r.json(); if (!r.ok || j.error) throw new Error(); setRel(j as Related); }
    catch { setRelErr(true); }
    finally { setRelLoading(false); }
  }, [partner.id]);
  useEffect(() => { void loadRel(); }, [loadRel]);

  const tabs = useMemo(() => {
    const c = rel?.counts ?? {};
    const t: { k: TabKey; label: string; n?: number }[] = [{ k: "ov", label: "ภาพรวม" }];
    if (isSup) t.push({ k: "pr", label: "สินค้า", n: c.materials }, { k: "po", label: "ใบสั่งซื้อ", n: c.purchase_orders }, { k: "cb", label: "บิลจีน", n: c.china_bills }, { k: "ph", label: "ประวัติราคา", n: c.price_history });
    if (isCus) t.push({ k: "qt", label: "ใบเสนอราคา", n: c.offer_sheets });
    t.push({ k: "ct", label: "ติดต่อ/ที่อยู่" }, { k: "fi", label: "ไฟล์แนบ" }, { k: "nt", label: "โน้ตทีม" }, { k: "hi", label: "ประวัติแก้" });
    return t;
  }, [rel, isSup, isCus]);

  // จำแท็บล่าสุด (ข้อเสนอ 10) — แท็บที่ร้านนี้ไม่มี → ภาพรวม
  const [tab, setTabState] = useState<TabKey>(() => (lsGet(TAB_LS) as TabKey) || "ov");
  const activeTab: TabKey = tabs.some((t) => t.k === tab) ? tab : "ov";
  const setTab = (k: TabKey) => { setTabState(k); lsSet(TAB_LS, k); };

  const [editKey, setEditKey] = useState<string | null>(null);
  useEffect(() => { setEditKey(null); }, [partner.id]);
  const [skuId, setSkuId] = useState<string | null>(null);
  const [poId, setPoId] = useState<string | null>(null);
  const [creatingPo, setCreatingPo] = useState(false);

  const patch = useCallback(async (changes: Record<string, unknown>) => {
    const res = await apiFetch(`/api/master-v2/partners/${partner.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
    return (j.data ?? {}) as Partner;
  }, [partner.id]);

  const saveField = useCallback(async (k: string, v: unknown, label: string): Promise<boolean> => {
    const old = partner[k] ?? null;
    if ((old ?? null) === (v ?? null)) return true;
    try {
      const d = await patch({ [k]: v });
      const next = { ...partner, ...d, [k]: d[k] ?? v } as Partner;
      onSaved(next);
      toast.undo(`บันทึก${label}แล้ว`, async () => {
        try { const back = await patch({ [k]: old }); onSaved({ ...next, ...back, [k]: old } as Partner); toast.success("ย้อนกลับแล้ว"); }
        catch (e) { toast.error(e instanceof Error ? e.message : "ย้อนกลับไม่สำเร็จ"); }
      }, { ms: 10000 });
      return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); return false; }
  }, [partner, patch, onSaved, toast]);

  const field = (def: FieldDef) => (
    <InlineField key={def.k} def={def} partner={partner} canEdit={canEdit} editing={editKey === def.k}
      onStart={() => setEditKey(def.k)} onCancel={() => setEditKey(null)} onSave={(k, v) => saveField(k, v, def.label)} />
  );

  // ขาดข้อมูลอะไร (ข้อเสนอ 3) — กดแล้วไปแท็บติดต่อ + เปิดช่องนั้น
  const gaps = useMemo(() => {
    const g: { label: string; k: string }[] = partnerGaps(partner).map((x) => ({
      label: x.label, k: x.key === "address" ? "address_line" : x.key === "tax" ? "tax_id" : x.key === "phone" ? "phone" : "name_th" }));
    const term = isSup ? s(partner, "purchase_credit_term") : (salesCreditTermOf(partner as { sales_credit_term?: unknown }) ?? "");
    if (!term) g.push({ label: "เครดิตเทอม", k: isSup ? "purchase_credit_term" : "sales_credit_term" });
    return g;
  }, [partner, isSup]);
  const goFix = (k: string) => {
    const onOverview = ["purchase_credit_term", "sales_credit_term"].includes(k);
    setTab(onOverview ? "ov" : "ct");
    if (canEdit) setEditKey(k);
    setTimeout(() => document.querySelector(`[data-field="${k}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 80);
  };

  const phone = s(partner, "mobile") || s(partner, "phone");
  const copy = async (text: string, what: string) => { try { await navigator.clipboard.writeText(text); toast.success(`คัดลอก ${what} แล้ว`); } catch { toast.error("คัดลอกไม่ได้"); } };

  // ── ตัวเลขสรุป (ข้อเสนอ 1) ──
  const kpis: { label: string; value: string; tone?: string }[] = isSup ? [
    { label: "ยอดสั่งซื้อปีนี้", value: rel ? fmtByCur(rel.kpi.year_buy) : "…" },
    showMoney ? { label: "ค้างจ่าย", value: fmtMoney(summary?.payOpen, "THB") || "—", tone: (summary?.payOpen ?? 0) > 0 ? "text-red-600" : "" }
      : { label: "ใบค้างจ่าย", value: rel ? `${rel.purchase_orders.filter((p) => p.status !== "cancelled" && p.payment_status !== "paid").length} ใบ` : "…" },
    { label: "ครบกำหนดถัดไป", value: (showMoney && summary?.nextDue ? fmtD(summary.nextDue) : "") || formatCreditTerm(s(partner, "purchase_credit_term") || null) || "—",
      tone: showMoney && (summary?.overdueDocs ?? 0) > 0 ? "text-red-600" : "" },
    { label: "ซื้อล่าสุด", value: fmtD(rel?.kpi.last_po ?? summary?.buyLast) || "—" },
  ] : [
    { label: "ใบเสนอราคา", value: rel ? `${rel.counts.offer_sheets ?? 0} ใบ` : "…" },
    showMoney ? { label: "ค้างรับ", value: fmtMoney(summary?.recvOpen, "THB") || "—", tone: (summary?.recvOpen ?? 0) > 0 ? "text-amber-600" : "" }
      : { label: "ใบขาย", value: `${summary?.sellCount ?? 0} ใบ` },
    { label: "ครบกำหนดถัดไป", value: (showMoney && summary?.nextDue ? fmtD(summary.nextDue) : "") || formatCreditTerm(salesCreditTermOf(partner as { sales_credit_term?: unknown })) || "—" },
    { label: "ขายล่าสุด", value: fmtD(summary?.sellLast) || "—" },
  ];

  const left = (
    <div className="p-4 md:p-5 flex flex-col gap-3.5">
      <div className="flex gap-3 items-start pr-9 md:pr-0">
        {avatar}
        <div className="min-w-0">
          <h2 className="text-[17px] font-bold leading-tight break-words">{s(partner, "display_name") || s(partner, "name_th") || s(partner, "name_en") || s(partner, "code")}</h2>
          <div className="text-[12px] text-slate-500 mt-0.5 break-words">{s(partner, "name_en") && <>{s(partner, "name_en")} · </>}<span className="font-mono">{s(partner, "code") || "—"}</span></div>
        </div>
      </div>
      <div className="flex gap-1 flex-wrap">
        {badges}
        {china && <Chip tone="red">ร้านจีน</Chip>}
        {b(partner, "is_taobao") && <Chip tone="amber">Taobao</Chip>}
        {china && (b(partner, "ship_before_pay") ? <Chip tone="green">ส่งก่อนจ่าย</Chip> : <Chip tone="amber">จ่ายก่อนส่ง</Chip>)}
        {china && (b(partner, "buy_bill") ? <Chip tone="blue">มีบิล</Chip> : <Chip>ไม่มีบิล</Chip>)}
      </div>

      {/* ปุ่มด่วน (ข้อเสนอ 2) */}
      <div className="flex gap-1.5 flex-wrap">
        {isSup && canPo && (
          <button onClick={() => setCreatingPo(true)} className="h-8 px-3 text-[12.5px] font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 inline-flex items-center gap-1.5"><Icon name="cart" /> สร้างใบสั่งซื้อ</button>
        )}
        {phone && <a href={`tel:${phone}`} className="h-8 px-2.5 text-[12.5px] font-semibold rounded-lg border border-slate-200 text-slate-700 inline-flex items-center gap-1.5 no-underline hover:border-indigo-300"><Icon name="phone" /> โทร</a>}
        {s(partner, "line_id") && <a href={lineUrl(s(partner, "line_id"))} target="_blank" rel="noopener noreferrer" className="h-8 px-2.5 text-[12.5px] font-semibold rounded-lg border border-slate-200 text-slate-700 inline-flex items-center gap-1.5 no-underline hover:border-indigo-300"><Icon name="chat" /> LINE</a>}
        {s(partner, "wechat_id") && <button onClick={() => void copy(s(partner, "wechat_id"), "WeChat")} className="h-8 px-2.5 text-[12.5px] font-semibold rounded-lg border border-slate-200 text-slate-700 inline-flex items-center gap-1.5 hover:border-indigo-300"><Icon name="list" /> WeChat</button>}
        {s(partner, "email") && <a href={`mailto:${s(partner, "email")}`} className="h-8 px-2.5 text-[12.5px] font-semibold rounded-lg border border-slate-200 text-slate-700 inline-flex items-center gap-1.5 no-underline hover:border-indigo-300"><Icon name="mail" /> อีเมล</a>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {kpis.map((k) => (
          <div key={k.label} className="bg-slate-50 rounded-[10px] px-3 py-2 min-w-0">
            <div className="text-[10.5px] text-slate-400">{k.label}</div>
            <div className={`text-[14px] font-bold mt-0.5 truncate ${k.tone || "text-slate-800"}`} title={k.value}>{k.value}</div>
          </div>
        ))}
      </div>

      {gaps.length > 0 && (
        <div className="rounded-[10px] bg-amber-50 border border-amber-100 px-3 py-2 text-[12px] text-amber-800">
          <div className="flex items-center gap-1.5 font-semibold"><Icon name="warning" /> ขาดข้อมูล</div>
          <div className="flex gap-1 flex-wrap mt-1.5">
            {gaps.map((g) => <button key={g.label} onClick={() => goFix(g.k)} className="text-[11.5px] px-2 py-0.5 rounded-full bg-white border border-amber-200 hover:border-amber-400">{g.label}{canEdit ? " +" : ""}</button>)}
          </div>
        </div>
      )}

      {canEdit && (
        <div className="hidden md:flex gap-1.5 pt-1">
          <button onClick={onEditAll} className="h-8 px-3 text-[12.5px] font-semibold rounded-lg bg-indigo-50 text-indigo-700 inline-flex items-center gap-1.5"><Icon name="edit" /> แก้ไขทั้งหมด</button>
          <button onClick={onDeactivate} title="ย้ายไปถังขยะ (กู้คืนได้ · เอกสารเก่ายังอ้างถึงได้)" className="h-8 px-3 text-[12.5px] font-semibold rounded-lg border border-red-200 text-red-600 hover:bg-red-50 inline-flex items-center gap-1.5 ml-auto"><Icon name="delete" /> ถังขยะ</button>
        </div>
      )}
    </div>
  );

  const body = (() => {
    if (activeTab === "ct") return <ContactTab field={field} china={china || isSup} />;
    if (activeTab === "fi") return <RecordFilesField entityType="partners_v2" entityId={partner.id} readonly={!canEdit} title="ไฟล์แนบของคู่ค้า" description="นามบัตร · ใบเสนอราคาร้าน · สัญญา · รูปหน้าร้าน" />;
    if (activeTab === "nt") return <CommentThread entityType="partners_v2" entityId={partner.id} title="โน้ตภายในทีม (เห็นกันเฉพาะในบริษัท)" maxHeight={520} />;
    if (activeTab === "hi") return <RecordHistoryInline entityType="partners_v2" entityId={partner.id} emptyMessage="ยังไม่มีประวัติการแก้" />;
    if (relLoading && !rel) return <div className="py-12 text-center text-slate-400 text-[13px]"><Spinner /> กำลังโหลด…</div>;
    if (relErr && !rel) return <div className="py-12 text-center text-slate-500 text-[13px]">โหลดข้อมูลไม่สำเร็จ <button onClick={() => void loadRel()} className="text-indigo-600 underline ml-1">ลองใหม่</button></div>;
    if (!rel) return null;
    if (activeTab === "pr") return <ProductsTab rows={rel.materials} total={rel.counts.materials ?? 0} onOpen={setSkuId} />;
    if (activeTab === "po") return <PoTab rows={rel.purchase_orders} partner={partner} onOpen={setPoId} />;
    if (activeTab === "cb") return <BillsTab rows={rel.china_bills} />;
    if (activeTab === "ph") return <PriceTab rows={rel.price_history} onOpenSku={setSkuId} onOpenPo={setPoId} />;
    if (activeTab === "qt") return <QuotesTab rows={rel.offer_sheets} />;
    return <OverviewTab partner={partner} rel={rel} isSup={isSup} isCus={isCus} showMoney={showMoney} field={field} onOpenSku={setSkuId} onOpenPo={setPoId} onTab={setTab} />;
  })();

  return (
    <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden">
      <aside className="md:w-[290px] md:flex-none md:border-r border-slate-100 md:overflow-y-auto bg-white">{left}</aside>
      <section className="flex-1 min-w-0 flex flex-col md:min-h-0">
        <div className="sticky top-0 z-10 bg-white flex gap-0.5 px-3 border-b border-slate-100 overflow-x-auto md:pr-12">
          {tabs.map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={`text-[13px] font-semibold px-2.5 py-2.5 border-b-2 -mb-px whitespace-nowrap ${activeTab === t.k ? "text-indigo-700 border-indigo-500" : "text-slate-400 border-transparent hover:text-slate-600"}`}>
              {t.label}{t.n != null && t.n > 0 && <span className="ml-1 text-[10.5px] px-1.5 rounded-full bg-slate-100 text-slate-500 tabular-nums">{t.n}</span>}
            </button>
          ))}
        </div>
        <div className="flex-1 md:overflow-y-auto px-4 md:px-5 py-4">
          {topSlot}
          {body}
        </div>
        {/* มือถือ: แถบปุ่มล่าง */}
        {(canEdit || (isSup && canPo)) && (
          <div className="md:hidden sticky bottom-0 bg-white border-t border-slate-100 p-2.5 flex gap-2">
            {isSup && canPo && <button onClick={() => setCreatingPo(true)} className="flex-1 h-10 text-[13px] font-semibold rounded-lg bg-indigo-600 text-white inline-flex items-center justify-center gap-1.5"><Icon name="cart" /> สร้างใบสั่งซื้อ</button>}
            {canEdit && <button onClick={onEditAll} className="flex-1 h-10 text-[13px] font-semibold rounded-lg bg-indigo-50 text-indigo-700 inline-flex items-center justify-center gap-1.5"><Icon name="edit" /> แก้ไข</button>}
            {canEdit && <button onClick={onDeactivate} aria-label="ย้ายไปถังขยะ" className="h-10 w-10 rounded-lg border border-red-200 text-red-600 inline-flex items-center justify-center"><Icon name="delete" /></button>}
          </div>
        )}
      </section>

      {skuId && <MasterRecordDrawer key={skuId} moduleKey="skus-v2" recordId={skuId} onClose={() => setSkuId(null)} />}
      {poId && <PoDetailModal poId={poId} onClose={() => setPoId(null)} onSaved={() => void loadRel()} />}
      {creatingPo && (
        <PoCreateModal initialSeller={{ id: partner.id, name: s(partner, "display_name") || s(partner, "name_th") || s(partner, "name_en") }}
          onClose={() => setCreatingPo(false)}
          onCreated={(id) => { setCreatingPo(false); toast.success("สร้างใบสั่งซื้อแล้ว"); void loadRel(); setTab("po"); setPoId(id); }} />
      )}
    </div>
  );
}

// ───────── แท็บต่าง ๆ ─────────
type FieldFn = (def: FieldDef) => ReactNode;

function OverviewTab({ partner, rel, isSup, isCus, showMoney, field, onOpenSku, onOpenPo, onTab }: {
  partner: Partner; rel: Related; isSup: boolean; isCus: boolean; showMoney: boolean; field: FieldFn;
  onOpenSku: (id: string) => void; onOpenPo: (id: string) => void; onTab: (k: TabKey) => void;
}) {
  const cur = s(partner, "default_currency") || "THB";
  const frequent = useMemo(() => [...rel.materials].filter((m) => m.sku_id)
    .sort((a, b) => (b.last_buy?.date ?? "").localeCompare(a.last_buy?.date ?? "") || Number(b.is_default) - Number(a.is_default)).slice(0, 8), [rel.materials]);
  const recentPo = rel.purchase_orders.slice(0, 3);
  return (
    <div className="space-y-5">
      <section>
        <SecLab>การเงินและเครดิต</SecLab>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-4 bg-slate-50 rounded-[10px] px-3.5 py-2">
          {isSup && field({ k: "purchase_credit_term", label: "เทอมการจ่าย (เราจ่ายร้าน)", kind: "term", display: (p) => s(p, "purchase_credit_term") ? formatCreditTerm(s(p, "purchase_credit_term")) : "" })}
          {isCus && field({ k: "sales_credit_term", label: "เทอมชำระ (ลูกค้าจ่ายเรา)", kind: "term", display: (p) => { const t = salesCreditTermOf(p as { sales_credit_term?: unknown }); return t ? formatCreditTerm(t) : ""; } })}
          {showMoney && field({ k: "credit_limit", label: "วงเงินเครดิต", kind: "money", display: (p) => fmtMoney(Number(p.credit_limit), cur) || "ไม่จำกัด" })}
          {field({ k: "default_currency", label: "สกุลเงิน", kind: "select", options: CURRENCIES })}
          {field({ k: "purchase_lead_time", label: isSup ? "ระยะส่งของ" : "รอบวางบิล", kind: "lead", display: (p) => s(p, "purchase_lead_time") ? formatLeadTime(s(p, "purchase_lead_time")) : "" })}
        </div>
      </section>

      {isSup && (
        <section>
          <SecLab right={rel.materials.length > 0 && <button onClick={() => onTab("pr")} className="text-[12px] text-indigo-600 hover:underline">ดูทั้งหมด {rel.counts.materials} →</button>}>สินค้าที่ซื้อบ่อย</SecLab>
          {frequent.length === 0 ? <div className="text-[12.5px] text-slate-400">ยังไม่มีสินค้าผูกกับร้านนี้</div> : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {frequent.map((m) => (
                <button key={m.id} onClick={() => m.sku_id && onOpenSku(m.sku_id)} title={`${m.sku_code} ${m.sku_name}`} className="flex-none w-[84px] text-left">
                  <Thumb img={m.img} size={84} className="hover:ring-2 hover:ring-indigo-300" />
                  <div className="text-[11px] font-medium truncate mt-1">{m.sku_code}</div>
                  <div className="text-[11px] text-slate-500">{fmtMoney(m.last_buy?.price ?? m.price, m.last_buy?.currency ?? m.currency) || "—"}</div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {isSup && recentPo.length > 0 && (
        <section>
          <SecLab right={<button onClick={() => onTab("po")} className="text-[12px] text-indigo-600 hover:underline">ดูทั้งหมด {rel.purchase_orders.length} →</button>}>ใบสั่งซื้อล่าสุด</SecLab>
          <div className="border border-slate-100 rounded-[10px] divide-y divide-slate-100">
            {recentPo.map((p) => <PoRow key={p.id} p={p} partner={partner} onOpen={onOpenPo} />)}
          </div>
        </section>
      )}

      <section>
        <SecLab>โน้ตสั้นของร้าน</SecLab>
        {field({ k: "notes", label: "โน้ต (โชว์ในหน้าร้าน)", kind: "textarea", ph: "เช่น ส่งช้าช่วงตรุษจีน · ต้องสั่งขั้นต่ำ 500 ชิ้น" })}
      </section>
    </div>
  );
}

function ContactTab({ field, china }: { field: FieldFn; china: boolean }) {
  const G = ({ title, children }: { title: string; children: ReactNode }) => (
    <section><SecLab>{title}</SecLab><div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5">{children}</div></section>
  );
  return (
    <div className="space-y-5">
      <G title="ติดต่อ">
        {field({ k: "phone", label: "เบอร์โทร" })}{field({ k: "mobile", label: "มือถือ" })}
        {field({ k: "line_id", label: "LINE ID" })}{field({ k: "wechat_id", label: "WeChat ID" })}
        {field({ k: "email", label: "อีเมล" })}{field({ k: "website", label: "เว็บไซต์ / ลิงก์ร้าน" })}
        {field({ k: "sale_name", label: "ผู้ติดต่อขาย" })}
      </G>
      <G title="ที่อยู่">
        {field({ k: "address_line", label: "ที่อยู่" })}{field({ k: "sub_district", label: "ตำบล/แขวง" })}
        {field({ k: "district", label: "อำเภอ/เขต" })}{field({ k: "province", label: "จังหวัด" })}
        {field({ k: "postal_code", label: "รหัสไปรษณีย์" })}{field({ k: "country", label: "ประเทศ" })}
      </G>
      <G title="ภาษี">{field({ k: "tax_id", label: "เลขผู้เสียภาษี", ph: "13 หลัก" })}{field({ k: "tax_branch", label: "สาขา", ph: "สำนักงานใหญ่ / 00000" })}</G>
      <G title="ธนาคาร">{field({ k: "bank_name_brief", label: "ธนาคาร" })}{field({ k: "account_number", label: "เลขบัญชี" })}{field({ k: "bank_account_name", label: "ชื่อบัญชี" })}</G>
      {china && (
        <section><SecLab>ร้านจีน</SecLab>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5">
            {field({ k: "shop_country", label: "ประเทศร้าน", ph: "เช่น จีน" })}
            <div>
              {field({ k: "is_taobao", label: "ร้าน Taobao", kind: "toggle" })}
              {field({ k: "ship_before_pay", label: "ส่งก่อนจ่ายได้", kind: "toggle" })}
              {field({ k: "buy_bill", label: "ออกบิลซื้อได้", kind: "toggle" })}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function ProductsTab({ rows, total, onOpen }: { rows: Material[]; total: number; onOpen: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [onlyMain, setOnlyMain] = useState(false);
  const [view, setViewState] = useState<"list" | "grid">(() => (lsGet(VIEW_LS) === "grid" ? "grid" : "list"));
  const setView = (v: "list" | "grid") => { setViewState(v); lsSet(VIEW_LS, v); };
  const [limit, setLimit] = useState(60);
  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return rows.filter((r) => (!onlyMain || r.is_default) && (!kw || [r.sku_code, r.sku_name, r.supplier_sku].join(" ").toLowerCase().includes(kw)));
  }, [rows, q, onlyMain]);
  const shown = filtered.slice(0, limit);
  const price = (r: Material) => fmtMoney(r.price, r.currency) || "—";
  const meta = (r: Material) => [r.moq ? `ขั้นต่ำ ${r.moq.toLocaleString("th-TH")}` : "", r.lead_time_days ? `ส่ง ${r.lead_time_days} วัน` : "", r.supplier_sku ? `รหัสร้าน ${r.supplier_sku}` : ""].filter(Boolean).join(" · ");
  const last = (r: Material) => r.last_buy ? `ซื้อล่าสุด ${fmtMoney(r.last_buy.price, r.last_buy.currency)} · ${fmtD(r.last_buy.date)}` : "";

  if (rows.length === 0) return <div className="py-10 text-center text-slate-400 text-[13px]">ยังไม่มีสินค้าผูกกับร้านนี้</div>;
  return (
    <div>
      <div className="flex gap-2 items-center mb-3 flex-wrap">
        <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(60); }} placeholder="ค้นหารหัส / ชื่อ / รหัสร้าน…"
          className="h-8 flex-1 min-w-[160px] border border-slate-200 rounded-lg px-2.5 text-[12.5px] focus:outline-2 focus:outline-indigo-500" />
        <button onClick={() => setOnlyMain((v) => !v)} aria-pressed={onlyMain}
          className={`h-8 px-2.5 text-[12px] font-semibold rounded-lg border ${onlyMain ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500"}`}>เฉพาะร้านหลัก</button>
        <div className="flex border border-slate-200 rounded-lg overflow-hidden">
          <button onClick={() => setView("list")} aria-label="ดูแบบรายการ" className={`h-8 w-8 inline-flex items-center justify-center ${view === "list" ? "bg-indigo-50 text-indigo-700" : "text-slate-400"}`}><Icon name="table-view" /></button>
          <button onClick={() => setView("grid")} aria-label="ดูแบบการ์ดรูป" className={`h-8 w-8 inline-flex items-center justify-center ${view === "grid" ? "bg-indigo-50 text-indigo-700" : "text-slate-400"}`}><Icon name="grid-view" /></button>
        </div>
      </div>
      {filtered.length === 0 ? <div className="py-8 text-center text-slate-400 text-[13px]">ไม่พบสินค้าที่ตรงคำค้น</div>
        : view === "grid" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {shown.map((r) => (
              <button key={r.id} onClick={() => r.sku_id && onOpen(r.sku_id)} className="text-left border border-slate-200 rounded-xl overflow-hidden hover:border-indigo-300 hover:shadow-sm transition">
                <div className="aspect-square bg-slate-100 relative">
                  {r.img ? (/* eslint-disable-next-line @next/next/no-img-element */<img src={r2ImageUrl(r.img, 320) ?? ""} alt="" loading="lazy" className="w-full h-full object-cover" />)
                    : <div className="w-full h-full flex items-center justify-center text-slate-300"><Icon name="package" size={34} /></div>}
                  {r.is_default && <span className="absolute top-1.5 left-1.5"><Chip tone="green">หลัก</Chip></span>}
                </div>
                <div className="p-2">
                  <div className="text-[12px] font-semibold truncate">{r.sku_code}</div>
                  <div className="text-[11px] text-slate-500 truncate">{r.sku_name || "—"}</div>
                  <div className="text-[12.5px] font-bold mt-1 tabular-nums">{price(r)}</div>
                  {meta(r) && <div className="text-[10.5px] text-slate-400 truncate">{meta(r)}</div>}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="border border-slate-100 rounded-[10px] divide-y divide-slate-100">
            {shown.map((r) => (
              <button key={r.id} onClick={() => r.sku_id && onOpen(r.sku_id)} className="w-full text-left flex items-center gap-3 px-3 py-2 hover:bg-slate-50">
                <Thumb img={r.img} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold truncate flex items-center gap-1.5">{r.sku_code}{r.is_default && <Chip tone="green">หลัก</Chip>}</div>
                  <div className="text-[11.5px] text-slate-500 truncate">{r.sku_name || "—"}</div>
                  {(meta(r) || last(r)) && <div className="text-[10.5px] text-slate-400 truncate">{[meta(r), last(r)].filter(Boolean).join(" · ")}</div>}
                </div>
                <div className="text-[13px] font-bold tabular-nums shrink-0">{price(r)}</div>
                <span className="text-slate-300 shrink-0"><Icon name="open" size={14} /></span>
              </button>
            ))}
          </div>
        )}
      {filtered.length > shown.length && <div className="text-center mt-3"><button onClick={() => setLimit((n) => n + 60)} className="h-8 px-4 text-[12.5px] font-semibold rounded-lg border border-slate-200 text-slate-600">แสดงเพิ่ม ({filtered.length - shown.length})</button></div>}
      <p className="text-[11px] text-slate-400 mt-2">กดสินค้าเพื่อดูรายละเอียด{total > rows.length ? ` · โหลดมา ${rows.length} จาก ${total}` : ""}</p>
    </div>
  );
}

const RECV: Record<string, [string, "green" | "amber" | "slate"]> = { full: ["รับครบ", "green"], partial: ["รับบางส่วน", "amber"], none: ["รอรับของ", "slate"] };
const PO_STATUS: Record<string, string> = { draft: "ร่าง", purchase: "สั่งแล้ว", partial: "รับบางส่วน", received: "รับแล้ว", cancelled: "ยกเลิก" };
const payOf = (p: PoItem, partner: Partner) => poPayState({
  payment_status: p.payment_status, paid_date: p.paid_date, china_bill_id: p.china_bill_id, order_date: p.order_date, payment_due_date: p.payment_due_date,
  credit_term: s(partner, "purchase_credit_term") || null, ship_before_pay: b(partner, "ship_before_pay"),
});

function PoRow({ p, partner, onOpen }: { p: PoItem; partner: Partner; onOpen: (id: string) => void }) {
  const recv = p.recv ? RECV[p.recv] : null;
  const cancelled = p.status === "cancelled";
  return (
    <button onClick={() => onOpen(p.id)} className={`w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 ${cancelled ? "opacity-60" : ""}`}>
      <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center flex-none"><Icon name="document" /></div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold truncate">{p.po_no || "ใบสั่งซื้อ"}</div>
        <div className="text-[11.5px] text-slate-500">{[fmtD(p.order_date), p.line_count ? `${p.line_count} รายการ` : "", PO_STATUS[p.status ?? ""] ?? p.status].filter(Boolean).join(" · ")}</div>
        {!cancelled && <div className="flex gap-1 mt-1 flex-wrap">{recv && <Chip tone={recv[1]}>{recv[0]}</Chip>}<PoPayChip pay={payOf(p, partner)} /></div>}
      </div>
      <div className="text-[13px] font-bold tabular-nums shrink-0">{fmtMoney(p.grand_total, p.currency) || "—"}</div>
    </button>
  );
}

function PoTab({ rows, partner, onOpen }: { rows: PoItem[]; partner: Partner; onOpen: (id: string) => void }) {
  const [f, setF] = useState<"all" | "unpaid" | "recv">("all");
  const live = rows.filter((p) => p.status !== "cancelled");
  const isUnpaid = (p: PoItem) => payOf(p, partner).state !== "paid";
  const isWaiting = (p: PoItem) => p.recv === "none" || p.recv === "partial";
  const list = f === "all" ? rows : live.filter(f === "unpaid" ? isUnpaid : isWaiting);
  const total: Record<string, number> = {};
  for (const p of list) if (p.status !== "cancelled") { const c = normCur(p.currency); total[c] = (total[c] ?? 0) + (Number(p.grand_total) || 0); }
  const F = (k: typeof f, label: string, n: number) => (
    <button onClick={() => setF(k)} className={`h-7 px-2.5 text-[12px] font-semibold rounded-full border ${f === k ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-500"}`}>{label} <span className="tabular-nums">{n}</span></button>
  );
  if (rows.length === 0) return <div className="py-10 text-center text-slate-400 text-[13px]">ยังไม่มีใบสั่งซื้อจากร้านนี้</div>;
  return (
    <div>
      <div className="flex gap-1.5 items-center flex-wrap mb-3">
        {F("all", "ทั้งหมด", rows.length)}{F("unpaid", "ค้างจ่าย", live.filter(isUnpaid).length)}{F("recv", "รอรับของ", live.filter(isWaiting).length)}
        <span className="ml-auto text-[12px] text-slate-500">รวม <b className="text-slate-800">{fmtByCur(total)}</b></span>
      </div>
      {list.length === 0 ? <div className="py-8 text-center text-slate-400 text-[13px]">ไม่มีใบในกลุ่มนี้</div> : (
        <div className="border border-slate-100 rounded-[10px] divide-y divide-slate-100">{list.map((p) => <PoRow key={p.id} p={p} partner={partner} onOpen={onOpen} />)}</div>
      )}
      <p className="text-[11px] text-slate-400 mt-2">กดใบเพื่อเปิดรายละเอียด · สถานะจ่ายเงินตามเครดิตของร้าน</p>
    </div>
  );
}

function BillsTab({ rows }: { rows: Bill[] }) {
  if (rows.length === 0) return (
    <div className="py-10 text-center text-slate-500 text-[13px]">
      <div className="text-slate-300 mb-1"><Icon name="yuan" size={26} /></div>ยังไม่มีบิลจีนของร้านนี้
      <div className="mt-2"><a href="/app/china-pay" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">ไปแอปโอนเงินจีน →</a></div>
    </div>
  );
  const tone = (st: string | null) => st === "โอนแล้ว" ? "green" : st === "ยกเลิก" ? "slate" : "amber";
  return (
    <div className="border border-slate-100 rounded-[10px] divide-y divide-slate-100">
      {rows.map((c) => (
        <a key={c.id} href={`/app/china-pay?bill=${encodeURIComponent(c.id)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 no-underline text-inherit">
          <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center flex-none"><Icon name="yuan" /></div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold">บิลจีน {fmtD(c.bill_date || c.created_at)}</div>
            <div className="text-[11.5px] text-slate-500">{c.transfer_date ? `โอน ${fmtD(c.transfer_date)}` : "ยังไม่โอน"}</div>
          </div>
          <Chip tone={tone(c.status)}>{c.status || "—"}</Chip>
          <div className="text-[13px] font-bold tabular-nums shrink-0">{fmtMoney(c.amount_rmb, "RMB") || "—"}</div>
          <span className="text-slate-300"><Icon name="open" size={14} /></span>
        </a>
      ))}
    </div>
  );
}

function PriceTab({ rows, onOpenSku, onOpenPo }: { rows: PriceRow[]; onOpenSku: (id: string) => void; onOpenPo: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const list = rows.filter((r) => !q.trim() || `${r.sku_code} ${r.sku_name}`.toLowerCase().includes(q.trim().toLowerCase()));
  if (rows.length === 0) return <div className="py-10 text-center text-slate-400 text-[13px]">ยังไม่มีประวัติราคา (มาจากราคาในใบสั่งซื้อของร้านนี้)</div>;
  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาสินค้า…" className="h-8 w-full mb-3 border border-slate-200 rounded-lg px-2.5 text-[12.5px] focus:outline-2 focus:outline-indigo-500" />
      <div className="border border-slate-100 rounded-[10px] divide-y divide-slate-100">
        {list.map((r) => {
          const now = r.points[0]; const pct = r.change_pct; const isOpen = open === r.sku_id;
          return (
            <div key={r.sku_id}>
              <div className="flex items-center gap-3 px-3 py-2">
                <button onClick={() => onOpenSku(r.sku_id)} aria-label={`เปิดสินค้า ${r.sku_code}`}><Thumb img={r.img} size={40} /></button>
                <button onClick={() => setOpen(isOpen ? null : r.sku_id)} className="min-w-0 flex-1 text-left">
                  <div className="text-[13px] font-semibold truncate">{r.sku_code}</div>
                  <div className="text-[11px] text-slate-500 truncate">{r.sku_name || "—"} · ซื้อ {r.points.length} ครั้ง</div>
                </button>
                {pct != null && pct !== 0 && <Chip tone={pct > 0 ? "red" : "green"}>{pct > 0 ? "▲" : "▼"} {Math.abs(pct)}%</Chip>}
                <div className="text-right shrink-0"><div className="text-[13px] font-bold tabular-nums">{fmtMoney(now?.price, now?.currency)}</div><div className="text-[10.5px] text-slate-400">{fmtD(now?.date)}</div></div>
              </div>
              {isOpen && (
                <div className="px-3 pb-2.5 pl-[64px] flex flex-wrap gap-1.5">
                  {r.points.map((pt, i) => (
                    <button key={i} onClick={() => onOpenPo(pt.po_id)} className="text-[11px] px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 hover:border-indigo-300 tabular-nums">
                      {fmtD(pt.date)} · <b>{fmtMoney(pt.price, pt.currency)}</b> · {pt.po_no}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-400 mt-2">ราคาจากใบสั่งซื้อของร้านนี้ (ไม่นับใบยกเลิก) · กดชื่อเพื่อดูทุกครั้ง · กดรูปเพื่อเปิดสินค้า</p>
    </div>
  );
}

function QuotesTab({ rows }: { rows: Related["offer_sheets"] }) {
  if (rows.length === 0) return <div className="py-10 text-center text-slate-400 text-[13px]">ยังไม่มีใบเสนอราคา</div>;
  return (
    <div className="border border-slate-100 rounded-[10px] divide-y divide-slate-100">
      {rows.map((o) => (
        <div key={o.id} className="flex items-center gap-3 px-3 py-2.5">
          <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center flex-none"><Icon name="receipt" /></div>
          <div className="min-w-0 flex-1"><div className="text-[13px] font-semibold truncate">{o.title || "ใบเสนอราคา"}</div><div className="text-[11.5px] text-slate-500">{fmtD(o.created_at)}</div></div>
          {o.status && <Chip>{o.status}</Chip>}
        </div>
      ))}
    </div>
  );
}
