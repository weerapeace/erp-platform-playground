"use client";

/**
 * 🏦 หนี้ธนาคาร — ทะเบียนหนี้ทุกก้อนในหน้าเดียว (ดูง่าย · กดแล้วลงละเอียดได้)
 * URL: /bank-debts (หน้าแรกของแอปการเงิน)
 *
 * เป็น "หน้าครอบ" ของเดิม: อ่านจาก /api/bank-debts ที่รวม สัญญาเงินกู้ + วงเงิน OD + บัตรเครดิต/วงเงินหมุนเวียน
 * ไม่มีตารางหนี้ใหม่ · กดบรรทัด = MasterRecordDrawer ของโมดูลนั้น (ฟอร์มเต็ม/ปุ่มบันทึกจ่าย/ปรับโครงสร้าง อยู่ในนั้น)
 * "เพิ่มหนี้ใหม่" = เปิดฟอร์มสร้างของโมดูลที่เลือก (สัญญาเงินกู้ / OD / บัตร) ไม่เขียนฟอร์มซ้ำ
 * จำมุมมอง (จัดกลุ่ม/บริษัท) ต่อคนใน localStorage
 */
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import type { DebtItem, DebtKind } from "@/app/api/bank-debts/route";

const MasterRecordDrawer = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterRecordDrawer),
  { ssr: false },
);

type Data = { as_of: string; companies: { id: string; name: string; code: string }[]; items: DebtItem[] };
type GroupBy = "lender" | "company" | "kind" | "owner";

const GROUPS: { key: GroupBy; label: string }[] = [
  { key: "lender", label: "ธนาคาร" }, { key: "company", label: "บริษัท" }, { key: "kind", label: "ชนิดหนี้" }, { key: "owner", label: "ใครกู้" },
];
const KIND_LABEL: Record<DebtKind, string> = { loan: "เงินกู้", od: "วงเงิน OD", card: "บัตรเครดิต / วงเงินหมุนเวียน" };
const KIND_ICON: Record<DebtKind, string> = { loan: "🏦", od: "💠", card: "💳" };
const TONE: Record<string, string> = {
  good: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warn: "bg-amber-50 text-amber-700 border-amber-200",
  bad:  "bg-red-50 text-red-700 border-red-200",
  grey: "bg-slate-100 text-slate-600 border-slate-200",
  od:   "bg-violet-50 text-violet-700 border-violet-200",
};
const THB = (n: number) => "฿" + n.toLocaleString("th-TH", { maximumFractionDigits: 0 });
const THB2 = (n: number) => "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const short = (n: number) => n >= 1_000_000 ? `฿${(n / 1_000_000).toFixed(2)} ล้าน` : THB(n);
const thDate = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
};
const addDays = (iso: string, d: number) => { const [y, m, dd] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + d)).toISOString().slice(0, 10); };
const bankInitials = (s: string) => {
  const m = /\(([A-Za-z .]+)\)/.exec(s);
  if (m) return m[1].replace(/[^A-Z]/g, "").slice(0, 3) || m[1].slice(0, 2).toUpperCase();
  return s.replace(/^ธนาคาร|^บริษัท/, "").trim().slice(0, 2);
};
const bankColor = (s: string) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360; return `hsl(${h} 45% 38%)`; };

export default function BankDebtsPage() {
  const canView = usePermission("loan_contracts.view");
  const canCreate = usePermission("loan_contracts.create");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("lender");
  const [company, setCompany] = useState<string>("all");
  const [open, setOpen] = useState<{ module: DebtItem["module"]; id: string | null } | null>(null);
  const [addMenu, setAddMenu] = useState(false);

  useEffect(() => {
    try {
      const g = localStorage.getItem("bank-debts.group") as GroupBy | null;
      if (g && GROUPS.some((x) => x.key === g)) setGroupBy(g);
      const c = localStorage.getItem("bank-debts.company"); if (c) setCompany(c);
    } catch { /* ignore */ }
  }, []);
  const pickGroup = (g: GroupBy) => { setGroupBy(g); try { localStorage.setItem("bank-debts.group", g); } catch { /* ignore */ } };
  const pickCompany = (c: string) => { setCompany(c); try { localStorage.setItem("bank-debts.company", c); } catch { /* ignore */ } };

  const load = useCallback(() => {
    setLoading(true); setErr("");
    apiFetch("/api/bank-debts").then((r) => r.json())
      .then((j) => { if (j?.error) setErr(String(j.error)); else setData(j.data as Data); })
      .catch(() => setErr("โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { if (canView) load(); }, [canView, load]);

  const today = data?.as_of ?? new Date().toISOString().slice(0, 10);
  const items = useMemo(() => (data?.items ?? []).filter((it) => company === "all" || it.company_id === company || (company === "none" && !it.company_id)), [data, company]);

  const summary = useMemo(() => {
    const loanOut = items.filter((i) => i.kind === "loan").reduce((s, i) => s + Math.max(0, i.outstanding), 0);
    const odOut = items.filter((i) => i.kind === "od").reduce((s, i) => s + i.outstanding, 0);
    const cardOut = items.filter((i) => i.kind === "card").reduce((s, i) => s + i.outstanding, 0);
    const monthly = items.reduce((s, i) => s + (i.kind === "card" ? 0 : i.monthly), 0);
    const cardMonthly = items.filter((i) => i.kind === "card").reduce((s, i) => s + i.monthly, 0);
    const in30 = items.filter((i) => i.next_due_date && i.next_due_date <= addDays(today, 30));
    const overdue = items.filter((i) => i.flags.some((f) => f.key === "overdue"));
    const avail = items.filter((i) => i.kind !== "loan" && i.limit).reduce((s, i) => s + Math.max(0, (i.limit ?? 0) - i.outstanding), 0);
    const nextDue = [...in30].sort((a, b) => (a.next_due_date ?? "").localeCompare(b.next_due_date ?? ""))[0];
    return { total: loanOut + odOut + cardOut, loanOut, odOut, cardOut, monthly, cardMonthly, in30, in30Amount: in30.reduce((s, i) => s + i.next_due_amount, 0), overdue, avail, nextDue };
  }, [items, today]);

  const groups = useMemo(() => {
    const keyOf = (i: DebtItem) =>
      groupBy === "lender" ? i.lender : groupBy === "company" ? (i.company_name || "ยังไม่เลือกบริษัท") : groupBy === "kind" ? KIND_LABEL[i.kind] : (i.owner_type === "person" ? "หนี้ส่วนตัว" : "ของบริษัท");
    const map = new Map<string, DebtItem[]>();
    for (const i of items) { const k = keyOf(i); if (!map.has(k)) map.set(k, []); map.get(k)!.push(i); }
    return [...map.entries()]
      .map(([label, rows]) => ({ label, rows: rows.sort((a, b) => b.outstanding - a.outstanding), total: rows.reduce((s, r) => s + Math.max(0, r.outstanding), 0) }))
      .sort((a, b) => b.total - a.total);
  }, [items, groupBy]);

  if (!canView) return <PlaygroundShell><AccessDenied message="ต้องมีสิทธิ์ loan_contracts.view" /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      {/* หัวหน้า */}
      <div className="bg-white border-b border-slate-200 px-4 md:px-8 py-4 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><span className="w-9 h-9 rounded-lg bg-teal-50 text-teal-700 grid place-items-center text-lg">฿</span>หนี้ธนาคาร</h1>
          <p className="text-slate-500 mt-1 text-sm">ทุกก้อนที่ติดธนาคาร รวมไว้ที่เดียว — กดที่บรรทัดเพื่อดูรายละเอียด บันทึกจ่าย หรือปรับโครงสร้าง</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/loan-contracts" className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50">📊 มุมมองตาราง</Link>
          <button type="button" onClick={load} className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50">🔄 โหลดใหม่</button>
          {canCreate && (
            <div className="relative">
              <button type="button" onClick={() => setAddMenu((v) => !v)} className="h-9 px-3 rounded-lg bg-teal-700 text-white text-sm font-medium hover:bg-teal-800">＋ เพิ่มหนี้ใหม่</button>
              {addMenu && (
                <div className="absolute right-0 mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-lg z-20 overflow-hidden text-sm">
                  {([["loan-contracts", "🏦 สัญญาเงินกู้ (ผ่อนเป็นงวด / คืนก้อนเดียว)"], ["od-facilities", "💠 วงเงิน OD"], ["debt-cards", "💳 บัตรเครดิต / วงเงินหมุนเวียน"]] as const).map(([m, l]) => (
                    <button key={m} type="button" onClick={() => { setAddMenu(false); setOpen({ module: m, id: null }); }} className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700">{l}</button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="px-4 md:px-8 py-4 space-y-4">
        {/* ตัวกรอง */}
        <div className="flex items-center gap-3 flex-wrap text-sm">
          <span className="text-xs text-slate-500">จัดกลุ่มตาม</span>
          <div className="inline-flex border border-slate-200 rounded-lg overflow-hidden bg-white">
            {GROUPS.map((g) => (
              <button key={g.key} type="button" onClick={() => pickGroup(g.key)} className={`px-3 py-1.5 ${groupBy === g.key ? "bg-teal-50 text-teal-800 font-semibold" : "text-slate-600 hover:bg-slate-50"}`}>{g.label}</button>
            ))}
          </div>
          <span className="text-xs text-slate-500 ml-2">บริษัท</span>
          <div className="inline-flex border border-slate-200 rounded-lg overflow-hidden bg-white flex-wrap">
            <button type="button" onClick={() => pickCompany("all")} className={`px-3 py-1.5 ${company === "all" ? "bg-teal-50 text-teal-800 font-semibold" : "text-slate-600 hover:bg-slate-50"}`}>ทั้งหมด</button>
            {(data?.companies ?? []).map((c) => (
              <button key={c.id} type="button" onClick={() => pickCompany(c.id)} className={`px-3 py-1.5 ${company === c.id ? "bg-teal-50 text-teal-800 font-semibold" : "text-slate-600 hover:bg-slate-50"}`}>{c.name}</button>
            ))}
            <button type="button" onClick={() => pickCompany("none")} className={`px-3 py-1.5 ${company === "none" ? "bg-teal-50 text-teal-800 font-semibold" : "text-slate-400 hover:bg-slate-50"}`}>ยังไม่เลือกบริษัท</button>
          </div>
        </div>

        {err && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>⚠️ {err}</span>
            <button type="button" onClick={load} className="h-8 px-3 rounded-md bg-red-600 text-white text-xs">ลองใหม่</button>
          </div>
        )}

        {/* การ์ด 4 ใบ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile label="หนี้คงเหลือรวม" value={loading ? "…" : short(summary.total)}
            sub={loading ? "" : `เงินกู้ ${short(summary.loanOut)} · OD ${short(summary.odOut)} · บัตร ${short(summary.cardOut)}`} />
          <Tile label="ต้องจ่ายต่อเดือน (ประมาณ)" value={loading ? "…" : THB(summary.monthly)}
            sub={loading ? "" : `งวดผ่อน + ดอกเบี้ย OD${summary.cardMonthly > 0 ? ` · บัตรรอบนี้อีก ${THB(summary.cardMonthly)}` : ""}`} />
          <Tile label="ครบกำหนดใน 30 วัน" value={loading ? "…" : `${summary.in30.length} รายการ · ${THB(summary.in30Amount)}`}
            sub={loading ? "" : summary.overdue.length > 0 ? `⚠️ เกินกำหนดแล้ว ${summary.overdue.length} รายการ` : summary.nextDue ? `ถัดไป ${thDate(summary.nextDue.next_due_date)} — ${summary.nextDue.lender}` : "ไม่มี"}
            tone={summary.overdue.length > 0 ? "bad" : summary.in30.length > 0 ? "warn" : "good"} />
          <Tile label="วงเงินที่ยังเบิกได้" value={loading ? "…" : THB(summary.avail)} sub={loading ? "" : "OD + บัตร (วงเงิน − ที่ใช้อยู่)"} />
        </div>

        {/* รายการตามกลุ่ม */}
        {loading && !data ? (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400 text-sm">กำลังโหลดหนี้ทุกก้อน...</div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
            ยังไม่มีหนี้ในระบบ{company !== "all" ? "สำหรับบริษัทนี้" : ""} — กด "＋ เพิ่มหนี้ใหม่" เพื่อลงสัญญาเงินกู้ วงเงิน OD หรือบัตรเครดิต
          </div>
        ) : groups.map((g) => (
          <section key={g.label} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <header className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
              {groupBy === "lender" && <span className="w-7 h-7 rounded-md grid place-items-center text-[11px] font-bold text-white" style={{ background: bankColor(g.label) }}>{bankInitials(g.label)}</span>}
              <span className="font-semibold text-slate-800">{g.label}</span>
              <span className="ml-auto text-xs text-slate-500">{g.rows.length} ก้อน · คงเหลือ <b className="tabular-nums text-slate-700">{THB(g.total)}</b></span>
            </header>
            {g.rows.map((it) => (
              <button key={it.id} type="button" onClick={() => setOpen({ module: it.module, id: it.id })}
                className="w-full text-left grid grid-cols-1 md:grid-cols-[minmax(240px,1.5fr)_1fr_1fr_1.1fr_1fr] gap-x-3 gap-y-1 items-center px-4 py-3 border-t border-slate-100 first:border-t-0 hover:bg-teal-50/40 transition-colors">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800 truncate">{KIND_ICON[it.kind]} {it.name} {it.code && <span className="font-mono text-[11px] text-slate-400 font-normal">{it.code}</span>}</div>
                  <div className="text-xs text-slate-500 truncate">{groupBy !== "lender" && <>{it.lender} · </>}{it.company_name || "ยังไม่เลือกบริษัท"} · {it.product}{it.rate != null && it.rate > 0 ? ` · ดอกเบี้ย ${it.rate}%` : ""}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">{it.kind === "loan" ? "คงเหลือ" : it.kind === "od" ? "ใช้ไป" : "ยอดค้างรอบนี้"}</div>
                  <div className={`font-semibold tabular-nums ${it.outstanding < 0 ? "text-red-600" : "text-slate-800"}`}>{THB2(it.outstanding)}</div>
                  {it.progress != null && (
                    <>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1"><div className={`h-full ${it.kind === "loan" ? "bg-teal-600" : it.kind === "od" ? "bg-violet-500" : "bg-amber-500"}`} style={{ width: `${it.progress}%` }} /></div>
                      <div className="text-[11px] text-slate-500 tabular-nums">{it.progress_label}</div>
                    </>
                  )}
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">{it.kind === "od" ? "ดอกเบี้ยเดือนนี้" : it.kind === "card" ? "ขั้นต่ำ / ต้องจ่าย" : "ต่อเดือน"}</div>
                  <div className="font-semibold tabular-nums text-slate-800">{it.monthly > 0 ? THB(it.monthly) : <span className="text-slate-300">—</span>}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">{it.kind === "od" ? "ต่ออายุ" : "งวดถัดไป"}</div>
                  {it.kind === "od" ? (
                    <div className="font-semibold text-slate-800">{thDate(it.end_date)}</div>
                  ) : it.next_due_date ? (
                    <>
                      <div className={`font-semibold ${it.next_due_date < today ? "text-red-600" : "text-slate-800"}`}>{thDate(it.next_due_date)}</div>
                      {it.next_due_amount > 0 && <div className="text-[11px] text-slate-500 tabular-nums">{THB2(it.next_due_amount)}</div>}
                    </>
                  ) : (
                    <div className="text-sm text-slate-400">{it.kind === "loan" ? "— ยังไม่มีตารางผ่อน" : "—"}</div>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {it.flags.map((f) => <span key={f.key} className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border ${TONE[f.tone]}`}>{f.label}</span>)}
                </div>
              </button>
            ))}
          </section>
        ))}

        <p className="text-[11px] text-slate-400">
          ป้ายสถานะบอกว่า "ต้องทำอะไรต่อ": ขาดตารางผ่อน = กดเข้าไปสร้างตารางผ่อน · ยอดคงเหลือผิด = ตรวจยอดยกมา/ใบเบิก · เกินกำหนด = ยังไม่ได้บันทึกจ่ายหรือค้างจริง · ตัวเลขทั้งหมดมาจากโมดูลเงินกู้ / OD / บัตร แก้ที่นั่นแล้วที่นี่เปลี่ยนตาม
        </p>
      </div>

      {open && (
        <MasterRecordDrawer
          moduleKey={open.module}
          recordId={open.id}
          onClose={() => setOpen(null)}
          onChanged={load}
          permissions={{ view: "loan_contracts.view", create: "loan_contracts.create", edit: "loan_contracts.edit" }}
        />
      )}
    </PlaygroundShell>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "warn" | "bad" }) {
  const bg = tone === "bad" ? "bg-red-50 border-red-100" : tone === "warn" ? "bg-amber-50 border-amber-100" : tone === "good" ? "bg-emerald-50 border-emerald-100" : "bg-white border-slate-200";
  const fg = tone === "bad" ? "text-red-700" : tone === "warn" ? "text-amber-800" : tone === "good" ? "text-emerald-700" : "text-slate-900";
  return (
    <div className={`rounded-xl border px-4 py-3 ${bg}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-xl font-bold tabular-nums mt-0.5 ${fg}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5 truncate" title={sub}>{sub}</div>}
    </div>
  );
}
