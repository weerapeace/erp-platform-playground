"use client";

/**
 * Accounting (I) — GL core: ผังบัญชี + สมุดรายวัน (double-entry) + งบทดลอง
 * ใช้ DataTable กลาง + ERPModal กลาง
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { PlaygroundShell } from "@/components/playground-shell";
import { DataTable } from "@/components/data-table";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import type { Account } from "@/app/api/accounting/accounts/route";
import type { Journal, JournalLineInput } from "@/app/api/accounting/journals/route";
import type { TrialBalanceRow } from "@/app/api/accounting/trial-balance/route";

const TYPE_LABEL: Record<string, { label: string; color: string }> = {
  asset:     { label: "สินทรัพย์",      color: "bg-blue-50 text-blue-700 border-blue-200" },
  liability: { label: "หนี้สิน",         color: "bg-rose-50 text-rose-700 border-rose-200" },
  equity:    { label: "ส่วนของเจ้าของ",  color: "bg-purple-50 text-purple-700 border-purple-200" },
  income:    { label: "รายได้",          color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  expense:   { label: "ค่าใช้จ่าย",      color: "bg-amber-50 text-amber-700 border-amber-200" },
};
const baht = (n: number) => "฿" + Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });

type Tab = "accounts" | "journals" | "trial";
type EditLine = { account_code: string; description: string; debit: string; credit: string };
const emptyLine = (): EditLine => ({ account_code: "", description: "", debit: "", credit: "" });

export default function AccountingPage() {
  const canView   = usePermission("accounting.view");
  const canManage = usePermission("accounting.manage");
  const canPost   = usePermission("accounting.post");
  const { user, can } = useAuth();

  const [tab, setTab] = useState<Tab>("journals");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [trial, setTrial]       = useState<TrialBalanceRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error,   setError]     = useState<string | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  // journal create modal
  const [jOpen, setJOpen]       = useState(false);
  const [jDate, setJDate]       = useState("");
  const [jDesc, setJDesc]       = useState("");
  const [jRef, setJRef]         = useState("");
  const [jLines, setJLines]     = useState<EditLine[]>([emptyLine(), emptyLine()]);
  const [jSaving, setJSaving]   = useState(false);
  const [jErr, setJErr]         = useState<string | null>(null);

  // journal detail + post
  const [detail, setDetail]     = useState<{ header: Journal; lines: Array<JournalLineInput & { account_name: string; line_no: number }> } | null>(null);
  const [postTarget, setPostTarget] = useState<Journal | null>(null);

  const loadAccounts = useCallback(async () => {
    const res = await apiFetch("/api/accounting/accounts");
    const json = await res.json();
    if (!json.error) setAccounts(json.data as Account[]);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      if (tab === "accounts") {
        const res = await apiFetch("/api/accounting/accounts");
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        setAccounts(json.data as Account[]);
      } else if (tab === "journals") {
        const res = await apiFetch("/api/accounting/journals");
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        setJournals(json.data as Journal[]);
      } else {
        const res = await apiFetch("/api/accounting/trial-balance");
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        setTrial(json.data as TrialBalanceRow[]);
      }
    } catch (err) { setError(err instanceof Error ? err.message : "โหลดไม่ได้"); }
    finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { if (canView) fetchData(); }, [canView, fetchData]);
  useEffect(() => { if (canView) loadAccounts(); }, [canView, loadAccounts]);

  // ---- live balance ของ journal modal ----
  const jTotals = useMemo(() => {
    const d = jLines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
    const c = jLines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
    return { debit: d, credit: c, balanced: Math.round(d * 100) === Math.round(c * 100) && d > 0 };
  }, [jLines]);

  const openJournal = () => {
    setJDate(""); setJDesc(""); setJRef("");
    setJLines([emptyLine(), emptyLine()]); setJErr(null); setJOpen(true);
  };
  const setLine = (i: number, patch: Partial<EditLine>) =>
    setJLines(ls => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const addLine = () => setJLines(ls => [...ls, emptyLine()]);
  const removeLine = (i: number) => setJLines(ls => ls.length > 2 ? ls.filter((_, idx) => idx !== i) : ls);

  const saveJournal = async () => {
    if (!jTotals.balanced) { setJErr("เดบิตต้องเท่ากับเครดิต และมากกว่า 0"); return; }
    const lines: JournalLineInput[] = jLines
      .filter(l => l.account_code && (parseFloat(l.debit) || parseFloat(l.credit)))
      .map(l => ({ account_code: l.account_code, description: l.description || undefined,
                   debit: parseFloat(l.debit) || 0, credit: parseFloat(l.credit) || 0 }));
    if (lines.length < 2) { setJErr("ต้องมีอย่างน้อย 2 บรรทัดที่มีบัญชี + จำนวน"); return; }
    setJSaving(true); setJErr(null);
    try {
      const res = await apiFetch("/api/accounting/journals", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entry_date: jDate || undefined, description: jDesc, reference: jRef, lines, actor: user?.name }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash(`สร้าง ${json.data?.entry_number ?? "สมุดรายวัน"} แล้ว`);
      setJOpen(false);
      await fetchData();
    } catch (err) { setJErr(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ"); }
    finally { setJSaving(false); }
  };

  const openDetail = async (j: Journal) => {
    const res = await apiFetch(`/api/accounting/journals/${j.id}`);
    const json = await res.json();
    if (!json.error) setDetail(json.data);
  };

  const doPost = async (j: Journal) => {
    try {
      const res = await apiFetch(`/api/accounting/journals/${j.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actor: user?.name }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash("ผ่านรายการแล้ว (posted)");
      await fetchData();
      setDetail(null);
    } catch (err) { setError(err instanceof Error ? err.message : "post ไม่สำเร็จ"); }
    finally { setPostTarget(null); }
  };

  // ---- columns ----
  const accountColumns = useMemo<ColumnDef<Account>[]>(() => [
    { id: "code", accessorKey: "code", header: "รหัส", size: 90,
      cell: ({ getValue }) => <span className="font-mono text-sm text-slate-700">{String(getValue())}</span> },
    { id: "name", accessorKey: "name", header: "ชื่อบัญชี", size: 280 },
    { id: "account_type", accessorKey: "account_type", header: "ประเภท", size: 130,
      meta: { filterType: "select" },
      cell: ({ getValue }) => { const t = TYPE_LABEL[String(getValue())]; return <span className={`text-xs px-2 py-0.5 rounded border ${t?.color}`}>{t?.label}</span>; } },
    { id: "parent_code", accessorKey: "parent_code", header: "บัญชีแม่", size: 90,
      cell: ({ getValue }) => <span className="font-mono text-xs text-slate-400">{String(getValue() ?? "—")}</span> },
    { id: "is_active", accessorKey: "is_active", header: "ใช้งาน", size: 80, meta: { filterType: "select" },
      cell: ({ getValue }) => getValue() ? <span className="text-xs text-emerald-600">✓</span> : <span className="text-xs text-slate-400">—</span> },
  ], []);

  const journalColumns = useMemo<ColumnDef<Journal>[]>(() => [
    { id: "entry_number", accessorKey: "entry_number", header: "เลขที่", size: 130,
      cell: ({ getValue }) => <span className="font-mono text-xs text-slate-700">{String(getValue() ?? "—")}</span> },
    { id: "entry_date", accessorKey: "entry_date", header: "วันที่", size: 110, meta: { filterType: "text" },
      cell: ({ getValue }) => <span className="text-xs">{String(getValue() ?? "").slice(0, 10)}</span> },
    { id: "description", accessorKey: "description", header: "คำอธิบาย", size: 240 },
    { id: "total_debit", accessorKey: "total_debit", header: "เดบิต", size: 120,
      cell: ({ getValue }) => <span className="tabular-nums font-mono text-xs">{baht(getValue() as number)}</span> },
    { id: "status", accessorKey: "status", header: "สถานะ", size: 100, meta: { filterType: "select" },
      cell: ({ getValue }) => {
        const s = String(getValue());
        return <span className={`text-xs px-2 py-0.5 rounded ${s === "posted" ? "bg-emerald-50 text-emerald-700" : s === "void" ? "bg-slate-100 text-slate-500" : "bg-amber-50 text-amber-700"}`}>
          {s === "posted" ? "ผ่านแล้ว" : s === "void" ? "ยกเลิก" : "ร่าง"}</span>;
      } },
  ], []);

  const trialColumns = useMemo<ColumnDef<TrialBalanceRow>[]>(() => [
    { id: "account_code", accessorKey: "account_code", header: "รหัส", size: 90,
      cell: ({ getValue }) => <span className="font-mono text-sm">{String(getValue())}</span> },
    { id: "account_name", accessorKey: "account_name", header: "ชื่อบัญชี", size: 260 },
    { id: "debit", accessorKey: "debit", header: "เดบิต", size: 130,
      cell: ({ getValue }) => { const n = getValue() as number; return <span className="tabular-nums font-mono text-xs">{n ? baht(n) : "—"}</span>; } },
    { id: "credit", accessorKey: "credit", header: "เครดิต", size: 130,
      cell: ({ getValue }) => { const n = getValue() as number; return <span className="tabular-nums font-mono text-xs">{n ? baht(n) : "—"}</span>; } },
    { id: "balance", accessorKey: "balance", header: "ยอดคงเหลือ", size: 130,
      cell: ({ getValue }) => { const n = getValue() as number; return <span className={`tabular-nums font-mono text-xs font-semibold ${n < 0 ? "text-rose-700" : "text-slate-700"}`}>{baht(Math.abs(n))} {n < 0 ? "CR" : "DR"}</span>; } },
  ], []);

  const trialTotals = useMemo(() => ({
    debit:  trial.reduce((s, r) => s + r.debit, 0),
    credit: trial.reduce((s, r) => s + r.credit, 0),
  }), [trial]);

  if (!canView) return <PlaygroundShell><AccessDenied message="หน้าบัญชีต้องมีสิทธิ์ accounting.view" /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">📒 บัญชี (Accounting)</h1>
            <p className="text-sm text-slate-500 mt-0.5">ผังบัญชี · สมุดรายวันแบบ double-entry · งบทดลอง</p>
          </div>
          {tab === "journals" && canManage && (
            <button onClick={openJournal}
              className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              ＋ บันทึกรายการ
            </button>
          )}
        </div>

        {error && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {error}</div>}

        {/* tabs */}
        <div className="mb-4 flex border border-slate-200 rounded-lg overflow-hidden w-fit">
          {([["journals","📓 สมุดรายวัน"],["accounts","🗂️ ผังบัญชี"],["trial","⚖️ งบทดลอง"]] as [Tab,string][]).map(([t, label], i) => (
            <button key={t} onClick={() => setTab(t)}
              className={`h-9 px-4 text-sm font-medium ${i > 0 ? "border-l border-slate-200" : ""} ${tab === t ? "bg-blue-600 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === "accounts" && (
          <DataTable tableId="accounting-accounts" data={accounts} columns={accountColumns} loading={loading}
            searchableKeys={["code", "name"]} searchPlaceholder="ค้นหา รหัส / ชื่อบัญชี..."
            exportFilename="chart-of-accounts" exportEntityType="erp_playground_account"
            canCheck={(p) => can(p as Parameters<typeof can>[0])} pageSize={50} />
        )}

        {tab === "journals" && (
          <DataTable tableId="accounting-journals" data={journals} columns={journalColumns} loading={loading}
            searchableKeys={["entry_number", "description", "reference"]} searchPlaceholder="ค้นหา เลขที่ / คำอธิบาย..."
            onRowClick={(j) => openDetail(j)}
            rowActions={[
              { label: "ดูรายละเอียด", icon: "👁", onClick: (j) => openDetail(j) },
              ...(canPost ? [{ label: "ผ่านรายการ (post)", icon: "✅", onClick: (j: Journal) => { if (j.status === "draft") setPostTarget(j); } }] : []),
            ]}
            exportFilename="journals" exportEntityType="erp_playground_journal"
            canCheck={(p) => can(p as Parameters<typeof can>[0])} pageSize={30} />
        )}

        {tab === "trial" && (
          <>
            <DataTable tableId="accounting-trial" data={trial} columns={trialColumns} loading={loading}
              searchableKeys={["account_code", "account_name"]} searchPlaceholder="ค้นหาบัญชี..."
              exportFilename="trial-balance" exportEntityType="erp_playground_trial_balance"
              canCheck={(p) => can(p as Parameters<typeof can>[0])} pageSize={100} />
            {!loading && trial.length > 0 && (
              <div className="mt-3 flex justify-end gap-8 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm">
                <div>รวมเดบิต: <span className="font-mono font-semibold tabular-nums">{baht(trialTotals.debit)}</span></div>
                <div>รวมเครดิต: <span className="font-mono font-semibold tabular-nums">{baht(trialTotals.credit)}</span></div>
                <div className={Math.round(trialTotals.debit*100) === Math.round(trialTotals.credit*100) ? "text-emerald-600" : "text-rose-600 font-semibold"}>
                  {Math.round(trialTotals.debit*100) === Math.round(trialTotals.credit*100) ? "✓ สมดุล" : "⚠ ไม่สมดุล"}
                </div>
              </div>
            )}
          </>
        )}

        {toast && <div className="fixed bottom-6 right-6 px-4 py-3 bg-emerald-600 text-white rounded-lg shadow-lg text-sm">✓ {toast}</div>}
      </div>

      {/* Journal create modal */}
      <ERPModal open={jOpen} onClose={() => !jSaving && setJOpen(false)} size="xl" title="📓 บันทึกรายการสมุดรายวัน"
        footer={
          <>
            <button onClick={() => setJOpen(false)} disabled={jSaving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ยกเลิก</button>
            <button onClick={saveJournal} disabled={jSaving || !jTotals.balanced}
              className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
              {jSaving ? "..." : "บันทึก (ร่าง)"}
            </button>
          </>
        }>
        <div className="space-y-3">
          {jErr && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠ {jErr}</div>}
          <div className="grid grid-cols-3 gap-3">
            <label className="block"><span className="text-xs font-medium text-slate-600">วันที่</span>
              <input type="date" value={jDate} onChange={e => setJDate(e.target.value)} className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded" /></label>
            <label className="block col-span-2"><span className="text-xs font-medium text-slate-600">คำอธิบาย</span>
              <input value={jDesc} onChange={e => setJDesc(e.target.value)} placeholder="เช่น รับชำระจากลูกค้า" className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded" /></label>
          </div>

          {/* lines */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="grid grid-cols-[2fr_2fr_1fr_1fr_auto] gap-px bg-slate-100 text-[11px] font-medium text-slate-500 px-2 py-1.5">
              <span>บัญชี</span><span>คำอธิบาย</span><span className="text-right">เดบิต</span><span className="text-right">เครดิต</span><span />
            </div>
            {jLines.map((l, i) => (
              <div key={i} className="grid grid-cols-[2fr_2fr_1fr_1fr_auto] gap-1.5 items-center px-2 py-1.5 border-t border-slate-100">
                <select value={l.account_code} onChange={e => setLine(i, { account_code: e.target.value })}
                  className="h-8 px-2 text-xs border border-slate-200 rounded bg-white">
                  <option value="">— เลือกบัญชี —</option>
                  {accounts.filter(a => a.is_active).map(a => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
                </select>
                <input value={l.description} onChange={e => setLine(i, { description: e.target.value })}
                  className="h-8 px-2 text-xs border border-slate-200 rounded" />
                <input type="number" value={l.debit} step="any" onChange={e => setLine(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })}
                  className="h-8 px-2 text-xs text-right border border-slate-200 rounded tabular-nums" />
                <input type="number" value={l.credit} step="any" onChange={e => setLine(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })}
                  className="h-8 px-2 text-xs text-right border border-slate-200 rounded tabular-nums" />
                <button onClick={() => removeLine(i)} disabled={jLines.length <= 2}
                  className="w-7 h-7 text-slate-400 hover:text-red-600 disabled:opacity-30">×</button>
              </div>
            ))}
            <button onClick={addLine} className="w-full px-2 py-1.5 text-xs text-blue-600 hover:bg-blue-50 border-t border-slate-100 text-left">＋ เพิ่มบรรทัด</button>
          </div>

          {/* balance indicator */}
          <div className={`flex justify-end gap-6 px-3 py-2 rounded-lg text-sm ${jTotals.balanced ? "bg-emerald-50" : "bg-amber-50"}`}>
            <span>เดบิต: <span className="font-mono tabular-nums">{baht(jTotals.debit)}</span></span>
            <span>เครดิต: <span className="font-mono tabular-nums">{baht(jTotals.credit)}</span></span>
            <span className={jTotals.balanced ? "text-emerald-700 font-medium" : "text-amber-700 font-medium"}>
              {jTotals.balanced ? "✓ สมดุล" : `ต่าง ${baht(Math.abs(jTotals.debit - jTotals.credit))}`}
            </span>
          </div>
        </div>
      </ERPModal>

      {/* Journal detail modal */}
      <ERPModal open={detail !== null} onClose={() => setDetail(null)} size="lg"
        title={detail ? `${detail.header.entry_number ?? "สมุดรายวัน"}` : ""}>
        {detail && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <div>
                <div className="text-slate-700">{detail.header.description}</div>
                <div className="text-xs text-slate-400">{String(detail.header.entry_date).slice(0,10)} {detail.header.reference && `· ${detail.header.reference}`}</div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded ${detail.header.status === "posted" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                {detail.header.status === "posted" ? "ผ่านแล้ว" : "ร่าง"}</span>
            </div>
            <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
              <thead className="bg-slate-50 text-xs text-slate-500"><tr>
                <th className="text-left px-3 py-2">บัญชี</th><th className="text-left px-3 py-2">คำอธิบาย</th>
                <th className="text-right px-3 py-2">เดบิต</th><th className="text-right px-3 py-2">เครดิต</th>
              </tr></thead>
              <tbody>
                {detail.lines.map((l, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-3 py-1.5"><span className="font-mono text-xs text-slate-500">{l.account_code}</span> {l.account_name}</td>
                    <td className="px-3 py-1.5 text-xs text-slate-500">{l.description}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{l.debit ? baht(l.debit) : ""}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{l.credit ? baht(l.credit) : ""}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 font-semibold"><tr>
                <td className="px-3 py-2" colSpan={2}>รวม</td>
                <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{baht(detail.header.total_debit)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{baht(detail.header.total_credit)}</td>
              </tr></tfoot>
            </table>
            {detail.header.status === "draft" && canPost && (
              <button onClick={() => setPostTarget(detail.header)}
                className="w-full h-9 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
                ✅ ผ่านรายการ (Post) — ลงบัญชีจริง ย้อนไม่ได้
              </button>
            )}
          </div>
        )}
      </ERPModal>

      <ConfirmDialog open={postTarget !== null} onClose={() => setPostTarget(null)}
        title="ผ่านรายการ (Post)"
        message={`ผ่านรายการ ${postTarget?.entry_number ?? ""} ใช่ไหม? — เมื่อ post แล้วจะแก้ไขไม่ได้`}
        confirmText="ผ่านรายการ" cancelText="ยกเลิก"
        onConfirm={() => { if (postTarget) doPost(postTarget); }} />
    </PlaygroundShell>
  );
}
