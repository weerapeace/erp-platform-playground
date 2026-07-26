"use client";

// ============================================================
// PartnerManager (ของกลาง) — หน้า Partner: ลูกค้า + ผู้จำหน่าย (partners_v2)
//   list: การ์ดสรุป + แท็บประเภท + ค้นหา + ตาราง (ดึงครั้งเดียว กรอง/แบ่งหน้าฝั่ง client — 193 ราย)
//   drawer: ดู (view) + แก้ไข/เพิ่ม (form) · โซนร้านจีนเฉพาะผู้ขาย
//   บันทึกผ่าน master-v2 กลาง (POST/PATCH) → เคารพ field permission + audit
// ============================================================

import { useState, useEffect, useMemo, useCallback, Fragment, type ReactNode } from "react";
import { createPortal } from "react-dom";
import nextDynamic from "next/dynamic";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useAuth } from "@/components/auth";
import { Spinner } from "@/components/spinner";
import { Pager } from "@/components/pager";
import { ConfirmDialog } from "@/components/modal";
import { PurchaseCreditTermInput } from "@/components/purchase-credit-term-input";
import { PurchaseLeadTimeInput } from "@/components/purchase-lead-time-input";
import { formatCreditTerm, formatLeadTime } from "@/lib/credit-term";
import { useDrawerResize } from "@/lib/use-drawer-resize";

// drawer รายละเอียด record ของกลาง (คลิกวัตถุดิบ → เปิด SKU ตัวจริง) — โหลดเฉพาะตอนใช้
const MasterRecordDrawer = nextDynamic(() => import("@/components/master-crud").then((m) => m.MasterRecordDrawer), { ssr: false });

type Partner = Record<string, unknown> & { id: string };
type Tab = "all" | "customer" | "supplier" | "china";
type Mode = "view" | "edit" | "create";
const PAGE = 25;

const s = (p: Partner | null, k: string): string => { const v = p?.[k]; return v == null ? "" : String(v); };
const b = (p: Partner | null, k: string): boolean => p?.[k] === true;
const nameOf = (p: Partner) => s(p, "display_name") || s(p, "name_th") || s(p, "name_en") || s(p, "code") || "(ไม่มีชื่อ)";
const isChina = (p: Partner) => b(p, "is_supplier") && (b(p, "is_taobao") || !!s(p, "shop_country") || !!s(p, "wechat_id") || !!s(p, "sale_name"));

const AV = ["#4f46e5", "#0891b2", "#7c3aed", "#db2777", "#059669", "#d97706", "#2563eb", "#dc2626"];
function initials(n: string) { const m = n.replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/); return ((m[0]?.[0] || "") + (m.length > 1 ? m[m.length - 1][0] : (m[0]?.[1] || ""))).toUpperCase() || "?"; }
function avColor(code: string) { let h = 0; for (const c of code) h = (h * 31 + c.charCodeAt(0)) >>> 0; return AV[h % AV.length]; }
// สัญลักษณ์เงิน — ข้อมูลจริงใช้ทั้ง RMB / YUAN / CNY (จีน), THB, USD
const CUR_SYM: Record<string, string> = { CNY: "¥", RMB: "¥", YUAN: "¥", USD: "$", THB: "฿" };
function money(v: unknown, cur: string) { const n = Number(v); return n > 0 ? (CUR_SYM[(cur || "THB").toUpperCase()] ?? "") + n.toLocaleString("th-TH") + (CUR_SYM[(cur || "").toUpperCase()] ? "" : ` ${cur}`) : ""; }

// ส่งออก CSV (ฝั่ง client จากแถวที่กรองอยู่) — ใส่ BOM ให้ Excel อ่านภาษาไทยไม่เพี้ยน
function exportCsv(rows: Partner[]) {
  const cols: [string, (p: Partner) => string][] = [
    ["รหัส", (p) => s(p, "code")], ["ชื่อ", (p) => nameOf(p)], ["ชื่อ (EN)", (p) => s(p, "name_en")],
    ["ประเภท", (p) => [b(p, "is_customer") ? "ลูกค้า" : "", b(p, "is_supplier") ? "ผู้ขาย" : ""].filter(Boolean).join("+")],
    ["เบอร์โทร", (p) => s(p, "phone")], ["มือถือ", (p) => s(p, "mobile")], ["LINE", (p) => s(p, "line_id")], ["WeChat", (p) => s(p, "wechat_id")],
    ["อีเมล", (p) => s(p, "email")], ["จังหวัด", (p) => s(p, "province")], ["เลขภาษี", (p) => s(p, "tax_id")],
    ["วงเงินเครดิต", (p) => s(p, "credit_limit")], ["เทอมจ่าย", (p) => formatCreditTerm(s(p, "purchase_credit_term") || null)],
    ["สกุลเงิน", (p) => s(p, "default_currency")], ["ธนาคาร", (p) => s(p, "bank_name_brief")], ["เลขบัญชี", (p) => s(p, "account_number")],
    ["แท็ก", (p) => Array.isArray(p.tags) ? (p.tags as string[]).join(" ") : ""],
  ];
  const esc = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
  const lines = [cols.map((c) => esc(c[0])).join(","), ...rows.map((p) => cols.map((c) => esc(c[1](p))).join(","))];
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `partners-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Badges({ p }: { p: Partner }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {b(p, "is_customer") && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">🛍️ ลูกค้า</span>}
      {b(p, "is_supplier") && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">🏭 ผู้ขาย</span>}
      {isChina(p) && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-rose-50 text-rose-600">🇨🇳 จีน</span>}
    </div>
  );
}

export function PartnerManager() {
  const toast = useToast();
  const { can } = useAuth();
  const canEdit = can("products.edit" as Parameters<typeof can>[0]);
  const canCreate = can("products.create" as Parameters<typeof can>[0]);

  const [all, setAll] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState<Partner | null>(null);
  const [mode, setMode] = useState<Mode>("view");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/master-v2/partners?limit=2000&sort_by=display_name&sort_dir=asc");
      const j = await res.json();
      setAll((j.data ?? []) as Partner[]);
    } catch { toast.error("โหลดรายชื่อ Partner ไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => ({
    all: all.length,
    customer: all.filter((p) => b(p, "is_customer")).length,
    supplier: all.filter((p) => b(p, "is_supplier")).length,
    both: all.filter((p) => b(p, "is_customer") && b(p, "is_supplier")).length,
    china: all.filter(isChina).length,
  }), [all]);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return all.filter((p) => {
      if (tab === "customer" && !b(p, "is_customer")) return false;
      if (tab === "supplier" && !b(p, "is_supplier")) return false;
      if (tab === "china" && !isChina(p)) return false;
      if (kw) {
        const hay = [nameOf(p), s(p, "code"), s(p, "name_en"), s(p, "phone"), s(p, "mobile"), s(p, "tax_id"), s(p, "province")].join(" ").toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [all, tab, q]);

  useEffect(() => { setPage(0); }, [tab, q]);
  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);

  const openView = (p: Partner) => { setSel(p); setMode("view"); };
  const openCreate = () => {
    setSel({ id: "", default_currency: "THB", is_customer: tab === "customer", is_supplier: tab === "supplier" || tab === "china", is_company: true } as Partner);
    setMode("create");
  };
  const afterSave = (saved: Partner) => {
    setAll((rows) => { const i = rows.findIndex((r) => r.id === saved.id); if (i < 0) return [saved, ...rows]; const c = [...rows]; c[i] = saved; return c; });
    setSel(saved); setMode("view");
  };

  const TABS: { key: Tab; label: string; n: number }[] = [
    { key: "all", label: "ทั้งหมด", n: counts.all },
    { key: "customer", label: "ลูกค้า", n: counts.customer },
    { key: "supplier", label: "ผู้จำหน่าย", n: counts.supplier },
    { key: "china", label: "🇨🇳 ร้านจีน", n: counts.china },
  ];
  const STATS: { key: Tab; label: string; n: number; color: string; rail: string }[] = [
    { key: "all", label: "👥 ทั้งหมด", n: counts.all, color: "text-slate-800", rail: "bg-indigo-500" },
    { key: "customer", label: "🛍️ ลูกค้า", n: counts.customer, color: "text-blue-600", rail: "bg-blue-500" },
    { key: "supplier", label: "🏭 ผู้จำหน่าย", n: counts.supplier, color: "text-emerald-600", rail: "bg-emerald-500" },
    { key: "china", label: "🔄 ร้านจีน", n: counts.china, color: "text-rose-600", rail: "bg-rose-500" },
  ];

  return (
    <div className="p-5 max-w-[1180px] mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight flex items-center gap-2.5">🤝 Partners <span className="text-[15px] font-semibold text-slate-400 tabular-nums">{counts.all}</span></h1>
          <p className="mt-1 text-[13px] text-slate-500">ลูกค้า &amp; ผู้จำหน่าย — ติดต่อ ที่อยู่ ภาษี เครดิต และธนาคาร รวมที่เดียว</p>
        </div>
        {canCreate && <button onClick={openCreate} className="h-[38px] px-4 text-[13px] font-semibold bg-indigo-600 text-white rounded-[10px] hover:bg-indigo-700">＋ เพิ่ม Partner</button>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {STATS.map((st) => (
          <button key={st.key} onClick={() => setTab(st.key)}
            className={`relative overflow-hidden text-left bg-white border rounded-[14px] px-4 py-3.5 transition hover:-translate-y-px ${tab === st.key ? "border-indigo-300 ring-1 ring-indigo-200" : "border-slate-200 hover:border-indigo-300"}`}>
            <span className={`absolute left-0 top-0 bottom-0 w-[3px] ${st.rail}`} />
            <div className="text-[12px] text-slate-500">{st.label}</div>
            <div className={`text-[26px] font-bold mt-1 tabular-nums ${st.color}`}>{st.n}</div>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2.5 flex-wrap mb-3.5">
        <div className="inline-flex bg-white border border-slate-200 rounded-[11px] p-[3px] gap-0.5">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`text-[13px] font-semibold px-3.5 py-[7px] rounded-lg transition flex items-center gap-1.5 ${tab === t.key ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-50"}`}>
              {t.label} <span className="text-[11px] text-slate-400 tabular-nums">{t.n}</span>
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-3 top-3 text-slate-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ / รหัส / เบอร์โทร / เลขภาษี / จังหวัด…"
            className="w-full h-10 border border-slate-200 rounded-[11px] pl-9 pr-3.5 text-[13.5px] focus:outline-2 focus:outline-indigo-500" />
        </div>
        <button onClick={() => exportCsv(filtered)} disabled={!filtered.length}
          title="ส่งออกรายชื่อที่กรองอยู่เป็นไฟล์ CSV (เปิดใน Excel ได้)"
          className="h-10 px-3.5 text-[12.5px] font-semibold border border-slate-200 bg-white text-slate-600 rounded-[11px] hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-1.5 whitespace-nowrap">⬇ Export</button>
      </div>

      <div className="bg-white border border-slate-200 rounded-[14px] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[760px]">
            <thead><tr className="bg-slate-50 border-b border-slate-200">
              {["Partner", "ประเภท", "ติดต่อ", "ที่ตั้ง", "เครดิต / เทอม"].map((h, i) => (
                <th key={h} className={`text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400 px-4 py-3 whitespace-nowrap ${i === 3 ? "hidden md:table-cell" : ""}`}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-14 text-slate-400"><Spinner /> กำลังโหลด…</td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-14 text-slate-400">ไม่พบ Partner ที่ตรงเงื่อนไข</td></tr>
              ) : pageRows.map((p) => {
                const cur = s(p, "default_currency") || "THB";
                const credit = money(p.credit_limit, cur);
                const term = formatCreditTerm(s(p, "purchase_credit_term") || null);
                return (
                  <tr key={p.id} onClick={() => openView(p)} className="border-b border-slate-100 last:border-0 cursor-pointer hover:bg-slate-50/70">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <div className="w-[38px] h-[38px] rounded-[11px] flex-none flex items-center justify-center font-bold text-[13px] text-white" style={{ background: avColor(s(p, "code") || p.id) }}>{initials(nameOf(p))}</div>
                        <div className="min-w-0"><div className="font-semibold text-[13.5px] truncate max-w-[230px]">{nameOf(p)}</div><div className="text-[11.5px] text-slate-400 font-mono">{s(p, "code") || "—"}</div></div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5"><Badges p={p} /></td>
                    <td className="px-4 py-2.5">
                      <div className="text-[12.5px] text-slate-600">{s(p, "mobile") || s(p, "phone") || <span className="text-slate-300">—</span>}</div>
                      {(s(p, "line_id") || s(p, "wechat_id")) && <div className="text-[11px] text-slate-400">{s(p, "line_id") ? `LINE ${s(p, "line_id")}` : `WeChat ${s(p, "wechat_id")}`}</div>}
                    </td>
                    <td className="px-4 py-2.5 hidden md:table-cell"><div className="text-[12.5px] text-slate-600">{s(p, "province") || <span className="text-slate-300">—</span>}</div></td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1 items-center">
                        {credit && <span className="text-[10.5px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">💳 {credit}</span>}
                        {term !== "—" ? <span className="text-[10.5px] font-medium px-2 py-0.5 rounded-full bg-sky-50 text-sky-700">{term}</span> : (!credit && <span className="text-slate-300 text-xs">—</span>)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {!loading && filtered.length > PAGE && (
        <div className="mt-3"><Pager page={page} pageSize={PAGE} total={filtered.length} onPage={setPage} unitLabel="ราย" /></div>
      )}

      {sel && <PartnerDrawer partner={sel} mode={mode} canEdit={canEdit}
        onMode={setMode} onClose={() => setSel(null)} onSaved={afterSave} />}
    </div>
  );
}

// ============================================================
// PartnerDrawer — ดู / แก้ไข / เพิ่ม
// ============================================================
const CURRENCIES = ["THB", "CNY", "USD"];

function KV({ rows }: { rows: [string, ReactNode][] }) {
  const shown = rows.filter(([, v]) => v != null && v !== "" && v !== "—");
  if (!shown.length) return <div className="text-[12.5px] text-slate-400 px-3.5 py-2.5 rounded-[10px] bg-slate-50 border border-slate-100">— ไม่มีข้อมูล —</div>;
  return (
    <dl className="grid grid-cols-[118px_1fr] gap-y-2 gap-x-3">
      {shown.map(([k, v], i) => (<Fragment key={i}><dt className="text-[12.5px] text-slate-400">{k}</dt><dd className="m-0 text-[13px] font-medium text-slate-700">{v}</dd></Fragment>))}
    </dl>
  );
}

function PartnerDrawer({ partner, mode, canEdit, onMode, onClose, onSaved }: {
  partner: Partner; mode: Mode; canEdit: boolean;
  onMode: (m: Mode) => void; onClose: () => void; onSaved: (p: Partner) => void;
}) {
  const toast = useToast();
  const { width, startResize } = useDrawerResize("partnerDrawerWidth", 560);   // ของกลาง: ลากขอบซ้ายปรับกว้าง + จำค่า
  const [form, setForm] = useState<Partner>(partner);
  const [tab, setTab] = useState<"info" | "rel">("info");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const editing = mode === "edit" || mode === "create";

  useEffect(() => { setForm(partner); setDirty(false); setTab("info"); }, [partner, mode]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") tryClose(); };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, dirty]);

  const set = (k: string, v: unknown) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); };
  const tryClose = () => { if (editing && dirty) setConfirmClose(true); else onClose(); };

  const cur = s(form, "default_currency") || "THB";
  const isSup = b(form, "is_supplier");
  const showChina = editing ? isSup : isChina(form);

  const save = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      const FIELDS = ["code", "name_th", "name_en", "display_name", "is_customer", "is_supplier", "is_company",
        "phone", "mobile", "email", "line_id", "wechat_id", "website", "address_line", "sub_district", "district", "province", "postal_code", "country",
        "tax_id", "tax_branch", "credit_limit", "purchase_credit_term", "purchase_lead_time", "default_currency",
        "bank_name_brief", "account_number", "bank_account_name", "sale_name", "shop_country", "is_taobao", "ship_before_pay", "buy_bill", "notes", "tags"];
      for (const k of FIELDS) if (form[k] !== partner[k]) payload[k] = form[k] ?? null;
      if (mode === "create") for (const k of FIELDS) if (form[k] != null && form[k] !== "") payload[k] = form[k];

      if (Object.keys(payload).length === 0) { toast.error("ไม่มีข้อมูลที่เปลี่ยน"); setSaving(false); return; }
      const url = mode === "create" ? "/api/master-v2/partners" : `/api/master-v2/partners/${partner.id}`;
      const res = await apiFetch(url, { method: mode === "create" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      toast.success(mode === "create" ? "เพิ่ม Partner แล้ว" : "บันทึกแล้ว");
      onSaved({ ...form, ...(j.data as Partner) });
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const quick = ([
    (s(form, "mobile") || s(form, "phone")) && ["📞 โทร", `tel:${s(form, "mobile") || s(form, "phone")}`],
    s(form, "line_id") && ["💬 LINE", ""],
    s(form, "wechat_id") && ["💚 WeChat", ""],
    s(form, "email") && ["✉️ อีเมล", `mailto:${s(form, "email")}`],
    s(form, "website") && ["🌐 เว็บ", ""],
  ].filter(Boolean)) as [string, string][];

  const node = (
    <>
      <div className="fixed inset-0 bg-slate-900/40 z-40" onClick={tryClose} />
      <aside style={{ width }} className="fixed top-0 right-0 bottom-0 max-w-[97vw] bg-white shadow-2xl z-40 flex flex-col animate-[slidein_.25s_ease]">
        <style>{`@keyframes slidein{from{transform:translateX(100%)}to{transform:none}}`}</style>
        {/* จับลากปรับความกว้าง (ของกลาง useDrawerResize) */}
        <div onMouseDown={startResize} title="ลากเพื่อปรับความกว้าง"
          className="group absolute left-0 top-0 h-full w-1.5 cursor-ew-resize z-20 hover:bg-indigo-200/50 active:bg-indigo-300/60">
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-10 rounded-r bg-slate-300 group-hover:bg-indigo-400" />
        </div>
        {/* header */}
        <div className="px-[22px] pt-5 relative border-b border-slate-100">
          <button onClick={tryClose} className="absolute top-4 right-4 w-8 h-8 rounded-[9px] border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100">✕</button>
          <div className="flex gap-3.5 items-start">
            <div className="w-[56px] h-[56px] rounded-[15px] flex-none flex items-center justify-center font-bold text-[19px] text-white" style={{ background: avColor(s(form, "code") || partner.id || "P") }}>{initials(nameOf(form))}</div>
            <div className="min-w-0 pr-8">
              <h2 className="text-[18px] font-bold tracking-tight truncate">{mode === "create" ? "เพิ่ม Partner ใหม่" : nameOf(form)}</h2>
              <div className="text-[12.5px] text-slate-500 mt-0.5">{s(form, "name_en") && <span>{s(form, "name_en")} · </span>}<span className="font-mono">{s(form, "code") || "—"}</span></div>
              {mode !== "create" && <div className="mt-2"><Badges p={form} /></div>}
            </div>
          </div>
          <div className="flex gap-2 mt-3.5 pb-3.5 flex-wrap">
            {!editing && quick.map(([label, href]) => (
              <a key={label} href={href || undefined} className="h-[34px] px-3 text-[12.5px] font-semibold rounded-[9px] border border-slate-200 bg-slate-50 text-slate-700 flex items-center hover:border-indigo-300 hover:text-indigo-700 no-underline">{label}</a>
            ))}
            {!editing && canEdit && <button onClick={() => onMode("edit")} className="h-[34px] px-3 text-[12.5px] font-semibold rounded-[9px] bg-indigo-50 text-indigo-700 ml-auto">✏️ แก้ไข</button>}
          </div>
        </div>

        {/* tabs (view only) */}
        {!editing && (
          <div className="flex gap-0.5 px-[22px] border-b border-slate-100">
            <button onClick={() => setTab("info")} className={`text-[13px] font-semibold px-3 py-2.5 border-b-2 -mb-px ${tab === "info" ? "text-indigo-700 border-indigo-500" : "text-slate-400 border-transparent"}`}>ข้อมูล</button>
            <button onClick={() => setTab("rel")} className={`text-[13px] font-semibold px-3 py-2.5 border-b-2 -mb-px ${tab === "rel" ? "text-indigo-700 border-indigo-500" : "text-slate-400 border-transparent"}`}>{isSup ? "วัตถุดิบ / PO" : "ออเดอร์ / วางบิล"}</button>
          </div>
        )}

        <div className="px-[22px] py-4.5 overflow-y-auto flex-1">
          {editing ? <EditForm form={form} set={set} isSup={isSup} showChina={showChina} cur={cur} />
            : tab === "info" ? <ViewInfo form={form} isSup={isSup} showChina={showChina} cur={cur} />
              : <RelData partner={form} />}
        </div>

        {editing && (
          <div className="border-t border-slate-100 px-[22px] py-3 flex items-center gap-2.5">
            {dirty && <span className="text-[11.5px] text-amber-600 mr-auto flex items-center gap-1.5">● มีการแก้ไขที่ยังไม่บันทึก</span>}
            <button onClick={tryClose} className={`h-[38px] px-4 text-[13px] font-semibold rounded-[10px] border border-slate-200 bg-slate-50 text-slate-600 ${!dirty ? "ml-auto" : ""}`}>ยกเลิก</button>
            <button onClick={save} disabled={saving} className="h-[38px] px-[18px] text-[13px] font-semibold bg-indigo-600 text-white rounded-[10px] hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-2">{saving && <Spinner />}💾 บันทึก</button>
          </div>
        )}
      </aside>
      <ConfirmDialog open={confirmClose} onClose={() => setConfirmClose(false)} onConfirm={() => { setConfirmClose(false); onClose(); }}
        title="ออกโดยไม่บันทึก?" message="คุณมีข้อมูลที่ยังไม่ได้บันทึก ต้องการออกหรือไม่?" confirmText="ออกโดยไม่บันทึก" variant="danger" />
    </>
  );
  return typeof document !== "undefined" ? createPortal(node, document.body) : node;
}

const Lab = ({ children }: { children: ReactNode }) => <div className="text-[11px] font-bold tracking-wide uppercase text-slate-400 mb-2.5 flex items-center gap-1.5">{children}</div>;

function ViewInfo({ form, isSup, showChina, cur }: { form: Partner; isSup: boolean; showChina: boolean; cur: string }) {
  const fin: [string, ReactNode, string][] = [
    ["วงเงินเครดิต", money(form.credit_limit, cur) || "ไม่กำหนด", Number(form.credit_limit) > 0 ? "text-amber-600" : "text-slate-400"],
    [isSup ? "เทอมการจ่าย" : "เทอมชำระ", formatCreditTerm(s(form, "purchase_credit_term") || null), "text-slate-800"],
    ["สกุลเงิน", cur, "text-slate-800"],
    [isSup ? "ระยะเวลาส่งของ" : "รอบวางบิล", formatLeadTime(s(form, "purchase_lead_time") || null), "text-sky-600"],
  ];
  return (
    <div className="space-y-5">
      <section><Lab>💰 การเงิน &amp; เครดิต</Lab>
        <div className="bg-slate-50 border border-slate-100 rounded-[10px] p-3.5 grid grid-cols-2 gap-3">
          {fin.map(([l, v, c]) => (<div key={l}><div className="text-[11px] text-slate-400">{l}</div><div className={`text-[16px] font-bold mt-0.5 ${c}`}>{v}</div></div>))}
        </div>
      </section>
      <section><Lab>📇 ข้อมูลติดต่อ</Lab>
        <KV rows={[["เบอร์โทร", s(form, "phone")], ["มือถือ", s(form, "mobile")], ["LINE", s(form, "line_id")], ["WeChat", s(form, "wechat_id")], ["อีเมล", s(form, "email")], ["เว็บไซต์", s(form, "website")]]} />
      </section>
      <section><Lab>📍 ที่อยู่</Lab>
        {(s(form, "address_line") || s(form, "province")) ? (
          <div className="bg-slate-50 border border-slate-100 rounded-[10px] p-3.5 text-[13px] text-slate-700">
            {s(form, "address_line")}<br />{[s(form, "sub_district"), s(form, "district"), s(form, "province"), s(form, "postal_code"), s(form, "country")].filter(Boolean).join(" · ")}
          </div>
        ) : <KV rows={[]} />}
      </section>
      <section><Lab>🧾 ภาษี</Lab><KV rows={[["เลขผู้เสียภาษี", s(form, "tax_id")], ["สาขา", s(form, "tax_branch")]]} /></section>
      {showChina && (
        <section><Lab>🇨🇳 ข้อมูลร้านจีน</Lab>
          <div className="bg-slate-50 border border-slate-100 rounded-[10px] p-3.5">
            <KV rows={[["ผู้ติดต่อขาย", s(form, "sale_name")], ["WeChat", s(form, "wechat_id")], ["ประเทศร้าน", s(form, "shop_country")],
              ["ร้าน Taobao", b(form, "is_taobao") ? "✅ ใช่" : "❌ ไม่"], ["ส่งก่อนจ่าย", b(form, "ship_before_pay") ? "✅ ได้" : "❌ ต้องจ่ายก่อน"], ["ออกบิลซื้อ", b(form, "buy_bill") ? "✅ มีบิล" : "❌ ไม่มีบิล"]]} />
          </div>
        </section>
      )}
      <section><Lab>🏦 ธนาคาร</Lab><KV rows={[["ธนาคาร", s(form, "bank_name_brief")], ["เลขบัญชี", s(form, "account_number")], ["ชื่อบัญชี", s(form, "bank_account_name")]]} /></section>
      <section><Lab>🏷️ แท็ก &amp; โน้ต</Lab>
        <div className="flex gap-1.5 flex-wrap">{(Array.isArray(form.tags) ? form.tags as string[] : []).map((t, i) => <span key={i} className="text-[11px] bg-slate-50 border border-slate-200 rounded-full px-2.5 py-0.5 text-slate-600">{t}</span>)}</div>
        {s(form, "notes") && <div className="mt-2.5 text-[12.5px] text-slate-600 leading-relaxed bg-amber-50/70 border border-slate-100 rounded-[10px] px-3.5 py-2.5">📌 {s(form, "notes")}</div>}
      </section>
    </div>
  );
}

const IN = "h-[38px] w-full border border-slate-200 rounded-[9px] px-2.5 text-[13px] focus:outline-2 focus:outline-indigo-500";
function Fld({ label, k, form, set, span, ph, prefix }: { label: string; k: string; form: Partner; set: (k: string, v: unknown) => void; span?: boolean; ph?: string; prefix?: string }) {
  return (
    <div className={`flex flex-col gap-1.5 ${span ? "col-span-2" : ""}`}>
      <label className="text-[11.5px] font-semibold text-slate-600">{label}</label>
      <div className="relative">{prefix && <span className="absolute left-2.5 top-2 text-slate-400 text-[13px] pointer-events-none">{prefix}</span>}
        <input value={s(form, k)} onChange={(e) => set(k, e.target.value)} placeholder={ph} className={`${IN} ${prefix ? "pl-6" : ""}`} /></div>
    </div>
  );
}
function Tog({ label, k, form, set }: { label: string; k: string; form: Partner; set: (k: string, v: unknown) => void }) {
  const on = b(form, k);
  return (
    <button type="button" onClick={() => set(k, !on)} aria-pressed={on}
      className={`inline-flex items-center gap-2 border rounded-[10px] px-3 py-[7px] text-[12.5px] font-semibold ${on ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
      <span className={`w-[34px] h-5 rounded-full relative transition ${on ? "bg-indigo-500" : "bg-slate-300"}`}><span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${on ? "left-[16px]" : "left-0.5"}`} /></span>
      {label}
    </button>
  );
}

function EditForm({ form, set, isSup, showChina, cur }: { form: Partner; set: (k: string, v: unknown) => void; isSup: boolean; showChina: boolean; cur: string }) {
  const tagsStr = Array.isArray(form.tags) ? (form.tags as string[]).join(", ") : s(form, "tags");
  return (
    <div className="space-y-5">
      <section><Lab>🔖 ประเภท Partner</Lab>
        <div className="flex gap-2 flex-wrap"><Tog label="🛍️ เป็นลูกค้า" k="is_customer" form={form} set={set} /><Tog label="🏭 เป็นผู้จำหน่าย" k="is_supplier" form={form} set={set} /><Tog label="🏢 นิติบุคคล" k="is_company" form={form} set={set} /></div>
      </section>
      <section><Lab>🪪 ข้อมูลหลัก</Lab>
        <div className="grid grid-cols-2 gap-3">
          <Fld label="รหัส" k="code" form={form} set={set} ph="เว้นว่าง = ตั้งให้อัตโนมัติ" />
          <div className="flex flex-col gap-1.5"><label className="text-[11.5px] font-semibold text-slate-600">สกุลเงินหลัก</label>
            <select value={cur} onChange={(e) => set("default_currency", e.target.value)} className={IN}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></div>
          <Fld label="ชื่อ (ไทย)" k="name_th" form={form} set={set} span />
          <Fld label="ชื่อ (อังกฤษ/จีน)" k="name_en" form={form} set={set} span />
          <Fld label="ชื่อที่แสดง" k="display_name" form={form} set={set} span ph="เว้นว่าง = ใช้ชื่อไทย" />
        </div>
      </section>
      <section><Lab>📇 ติดต่อ</Lab>
        <div className="grid grid-cols-2 gap-3">
          <Fld label="เบอร์โทร" k="phone" form={form} set={set} /><Fld label="มือถือ" k="mobile" form={form} set={set} />
          <Fld label="LINE ID" k="line_id" form={form} set={set} /><Fld label="WeChat ID" k="wechat_id" form={form} set={set} />
          <Fld label="อีเมล" k="email" form={form} set={set} span /><Fld label="เว็บไซต์" k="website" form={form} set={set} span />
        </div>
      </section>
      <section><Lab>📍 ที่อยู่</Lab>
        <div className="grid grid-cols-2 gap-3">
          <Fld label="ที่อยู่" k="address_line" form={form} set={set} span />
          <Fld label="ตำบล/แขวง" k="sub_district" form={form} set={set} /><Fld label="อำเภอ/เขต" k="district" form={form} set={set} />
          <Fld label="จังหวัด" k="province" form={form} set={set} /><Fld label="รหัสไปรษณีย์" k="postal_code" form={form} set={set} />
        </div>
      </section>
      <section><Lab>🧾 ภาษี</Lab>
        <div className="grid grid-cols-2 gap-3"><Fld label="เลขผู้เสียภาษี" k="tax_id" form={form} set={set} ph="13 หลัก" /><Fld label="สาขา" k="tax_branch" form={form} set={set} ph="สำนักงานใหญ่" /></div>
      </section>
      <section><Lab>💰 การเงิน &amp; เครดิต</Lab>
        <div className="grid grid-cols-2 gap-3 items-start">
          <Fld label="วงเงินเครดิต" k="credit_limit" form={form} set={set} prefix={cur === "CNY" ? "¥" : "฿"} />
          <div />
          <div className="flex flex-col gap-1.5 col-span-2"><label className="text-[11.5px] font-semibold text-slate-600">เทอมการจ่าย</label>
            <PurchaseCreditTermInput value={s(form, "purchase_credit_term") || null} onChange={(v) => set("purchase_credit_term", v)} /></div>
          <div className="flex flex-col gap-1.5 col-span-2"><label className="text-[11.5px] font-semibold text-slate-600">ระยะเวลาส่งของ</label>
            <PurchaseLeadTimeInput value={s(form, "purchase_lead_time") || null} onChange={(v) => set("purchase_lead_time", v)} /></div>
        </div>
      </section>
      <section><Lab>🏦 ธนาคาร</Lab>
        <div className="grid grid-cols-2 gap-3">
          <Fld label="ธนาคาร" k="bank_name_brief" form={form} set={set} /><Fld label="เลขบัญชี" k="account_number" form={form} set={set} />
          <Fld label="ชื่อบัญชี" k="bank_account_name" form={form} set={set} span />
        </div>
      </section>
      {showChina && (
        <section><Lab>🇨🇳 ข้อมูลร้านจีน (เฉพาะผู้ขาย)</Lab>
          <div className="grid grid-cols-2 gap-3">
            <Fld label="ผู้ติดต่อขาย (Sale)" k="sale_name" form={form} set={set} /><Fld label="ประเทศร้าน" k="shop_country" form={form} set={set} ph="เช่น จีน" />
          </div>
          <div className="flex gap-2 flex-wrap mt-3"><Tog label="🛒 ร้าน Taobao" k="is_taobao" form={form} set={set} /><Tog label="🚚 ส่งก่อนจ่ายได้" k="ship_before_pay" form={form} set={set} /><Tog label="🧾 ออกบิลซื้อได้" k="buy_bill" form={form} set={set} /></div>
        </section>
      )}
      <section><Lab>🏷️ แท็ก &amp; โน้ต</Lab>
        <div className="flex flex-col gap-1.5"><label className="text-[11.5px] font-semibold text-slate-600">แท็ก (คั่นด้วย ,)</label>
          <input value={tagsStr} onChange={(e) => set("tags", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} className={IN} /></div>
        <div className="flex flex-col gap-1.5 mt-3"><label className="text-[11.5px] font-semibold text-slate-600">โน้ต</label>
          <textarea value={s(form, "notes")} onChange={(e) => set("notes", e.target.value)} className="w-full border border-slate-200 rounded-[9px] px-2.5 py-2 text-[13px] min-h-[62px] focus:outline-2 focus:outline-indigo-500" /></div>
      </section>
    </div>
  );
}

const fmtDate = (v: unknown) => { const t = v ? String(v) : ""; if (!t) return ""; const d = new Date(t); return isNaN(d.getTime()) ? "" : d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }); };
const STATUS_LABEL: Record<string, string> = { draft: "ร่าง", confirmed: "ยืนยัน", ordered: "สั่งแล้ว", received: "รับแล้ว", closed: "ปิด", cancelled: "ยกเลิก", paid: "จ่ายแล้ว", sent: "ส่งแล้ว" };

function RelSection({ icon, title, count, empty, rows }: { icon: string; title: string; count: number; empty: string; rows: { t: string; s?: string; r?: string }[] }) {
  return (
    <section className="mb-5">
      <Lab>{icon} {title} {count > 0 && <span className="text-slate-300 tabular-nums">({count})</span>}</Lab>
      {rows.length === 0 ? (
        <div className="text-[12.5px] text-slate-400 px-3.5 py-2.5 rounded-[10px] bg-slate-50 border border-slate-100">{empty}</div>
      ) : (
        <div className="bg-slate-50 border border-slate-100 rounded-[10px] px-3.5">
          {rows.map((it, i) => (
            <div key={i} className="flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-0">
              <div className="w-8 h-8 rounded-lg flex-none flex items-center justify-center text-[14px] bg-white border border-slate-100">{icon}</div>
              <div className="min-w-0"><div className="text-[13px] font-semibold truncate">{it.t}</div>{it.s && <div className="text-[11.5px] text-slate-400">{it.s}</div>}</div>
              {it.r && <div className="ml-auto text-[12.5px] font-bold text-slate-600 shrink-0 tabular-nums">{it.r}</div>}
            </div>
          ))}
          {count > rows.length && <div className="text-[11px] text-slate-400 py-2 text-center">แสดง {rows.length} จาก {count}</div>}
        </div>
      )}
    </section>
  );
}

type Material = { id: string; sku_id: string | null; sku_code: string; sku_name: string; supplier_sku: string; price: number | null; currency: string; moq: number | null; lead_time_days: number | null; is_default: boolean };
const MAT_PAGE = 20;

// ตารางวัตถุดิบที่รับซื้อ (MiniTable ของกลาง) + ค้นหา + แบ่งหน้า (Pager ของกลาง) + คลิกดู SKU
function MaterialsTable({ rows, total, onOpenSku }: { rows: Material[]; total: number; onOpenSku: (skuId: string) => void }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return rows;
    return rows.filter((r) => [r.sku_code, r.sku_name, r.supplier_sku].join(" ").toLowerCase().includes(kw));
  }, [rows, q]);
  useEffect(() => { setPage(0); }, [q]);
  const shown = filtered.slice(page * MAT_PAGE, page * MAT_PAGE + MAT_PAGE);

  const cols: MiniColumn<Material>[] = [
    { key: "code", header: "รหัส", width: "1.1fr", sortValue: (r) => r.sku_code, sortLabel: "รหัส",
      cell: (r) => (<div className="min-w-0"><div className="font-medium text-[12.5px] truncate">{r.sku_code}</div>{r.sku_name && <div className="text-[11px] text-slate-400 truncate">{r.sku_name}</div>}</div>) },
    // ราคา = ข้อมูลที่มีจริง (~85% ของ supplier_items) · MOQ/lead time/รหัสร้าน แทบไม่มีใครกรอก → ไม่ทำคอลัมน์เปล่า
    { key: "price", header: "ราคา/หน่วย", align: "right", width: "6.5rem", sortValue: (r) => r.price ?? -1,
      cell: (r) => r.price != null ? <span className="tabular-nums font-semibold text-[12.5px]">{money(r.price, r.currency)}</span> : <span className="text-slate-300">—</span> },
    { key: "def", header: "", align: "center", width: "2.8rem",
      cell: (r) => r.is_default ? <span title="ร้านหลักของวัตถุดิบนี้" className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600">หลัก</span> : null },
  ];

  return (
    <section className="mb-5">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <Lab>📦 วัตถุดิบที่รับซื้อ {total > 0 && <span className="text-slate-300 tabular-nums">({total})</span>}</Lab>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหารหัส / ชื่อ / รหัสร้าน…"
          className="ml-auto h-8 w-[190px] border border-slate-200 rounded-lg px-2.5 text-[12.5px] focus:outline-2 focus:outline-indigo-500" />
      </div>
      {rows.length === 0 ? (
        <div className="text-[12.5px] text-slate-400 px-3.5 py-2.5 rounded-[10px] bg-slate-50 border border-slate-100">ยังไม่มีวัตถุดิบผูกกับร้านนี้</div>
      ) : (
        <>
          <MiniTable<Material> rows={shown} columns={cols} rowKey={(r) => r.id} dense
            onRowClick={(r) => { if (r.sku_id) onOpenSku(r.sku_id); }}
            emptyText="ไม่พบวัตถุดิบที่ตรงคำค้น" countUnit="รายการ" />
          {filtered.length > MAT_PAGE && <div className="mt-2"><Pager page={page} pageSize={MAT_PAGE} total={filtered.length} onPage={setPage} unitLabel="รายการ" /></div>}
          <p className="text-[11px] text-slate-400 mt-1.5">คลิกแถวเพื่อดูรายละเอียดวัตถุดิบ (SKU){total > rows.length ? ` · โหลดมา ${rows.length} จาก ${total}` : ""}</p>
        </>
      )}
    </section>
  );
}

function RelData({ partner }: { partner: Partner }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [skuId, setSkuId] = useState<string | null>(null);
  useEffect(() => {
    let alive = true; setLoading(true);
    apiFetch(`/api/partners/${partner.id}/related`).then((r) => r.json()).then((j) => { if (alive) setData(j); }).catch(() => {}).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [partner.id]);

  if (loading) return <div className="py-10 text-center text-slate-400 text-[13px]"><Spinner /> กำลังโหลดรายการที่เกี่ยว…</div>;
  if (!data) return <div className="py-10 text-center text-slate-400 text-[13px]">โหลดไม่สำเร็จ</div>;

  const counts = (data.counts ?? {}) as Record<string, number>;
  const st = (v: unknown) => { const k = String(v ?? "").toLowerCase(); return STATUS_LABEL[k] ?? (v ? String(v) : ""); };
  const arr = (k: string) => (Array.isArray(data[k]) ? data[k] as Record<string, unknown>[] : []);

  return (
    <div>
      {data.is_supplier ? (
        <>
          <MaterialsTable rows={(data.materials ?? []) as Material[]} total={counts.materials ?? 0} onOpenSku={setSkuId} />
          <RelSection icon="🛒" title="ใบสั่งซื้อ (PO)" count={counts.purchase_orders ?? 0} empty="ยังไม่มีใบสั่งซื้อ"
            rows={arr("purchase_orders").map((o) => ({ t: String(o.po_no ?? "PO"), s: [fmtDate(o.order_date), st(o.status)].filter(Boolean).join(" · "), r: money(o.grand_total, "THB") }))} />
          <RelSection icon="🧾" title="บิลจีน" count={counts.china_bills ?? 0} empty="ยังไม่มีบิลจีน"
            rows={arr("china_bills").map((c) => ({ t: "บิลจีน", s: [fmtDate(c.created_at), st(c.status)].filter(Boolean).join(" · ") }))} />
        </>
      ) : null}
      {data.is_customer ? (
        <RelSection icon="📄" title="ใบเสนอราคา" count={counts.offer_sheets ?? 0} empty="ยังไม่มีใบเสนอราคา"
          rows={arr("offer_sheets").map((o) => ({ t: String(o.title || "ใบเสนอราคา"), s: [fmtDate(o.created_at), st(o.status)].filter(Boolean).join(" · ") }))} />
      ) : null}
      {skuId && <MasterRecordDrawer key={skuId} moduleKey="skus-v2" recordId={skuId} onClose={() => setSkuId(null)} />}
    </div>
  );
}
