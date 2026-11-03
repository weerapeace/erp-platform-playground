"use client";

/**
 * แท็บ "หนี้ & วงเงิน" ของหน้ากระแสเงินสด (/cashflow) — เงินกู้ · วงเงิน OD · บัตรเครดิต ในที่เดียว
 * ข้อมูลจาก /api/bank-debts (ทะเบียนหนี้ภาพรวมของหน้า /bank-debts — ไม่มีตารางหนี้ใหม่)
 * "ลงหนี้ใหม่" / กดแถว = เปิด drawer ของโมดูลนั้น (MasterRecordDrawer) — ฟอร์ม ปุ่มบันทึกจ่าย ปรับโครงสร้าง อยู่ในนั้นแล้ว
 * สิทธิ์: ดู loan_contracts.view · สร้าง loan_contracts.create (หน้าแม่ส่งมา)
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { Icon } from "@/components/icon";
import { formatDate } from "@/lib/date";
import { THB } from "@/lib/cashflow";
import type { DebtItem, DebtKind } from "@/app/api/bank-debts/route";

const MasterRecordDrawer = dynamic(() => import("@/components/master-crud").then((m) => m.MasterRecordDrawer), { ssr: false });

const KIND: Record<DebtKind, { label: string; icon: string }> = {
  loan: { label: "เงินกู้", icon: "🏦" }, od: { label: "วงเงิน OD", icon: "💠" }, card: { label: "บัตร / หนี้อื่น", icon: "💳" },
};
/** ชนิดหนี้ที่ลงใหม่ได้ — "หนี้อื่น" = แถวในทะเบียนบัตร/วงเงิน (debt_cards) ชนิด other (ไม่มีตารางใหม่) */
export type NewDebtKey = "loan" | "od" | "card" | "other";
export const NEW_DEBT: { key: NewDebtKey; module: DebtItem["module"]; label: string; hint: string; defaults?: Record<string, unknown> }[] = [
  { key: "loan", module: "loan-contracts", label: "เงินกู้ธนาคาร", hint: "ผ่อนเป็นงวด / คืนก้อนเดียว — สร้างตารางผ่อนให้" },
  { key: "od", module: "od-facilities", label: "วงเงิน OD", hint: "เบิกเกินบัญชี — ดอกเบี้ยคิดตามยอดใช้" },
  { key: "card", module: "debt-cards", label: "บัตรเครดิต / Cash plus", hint: "ยอดตามใบแจ้งยอดทุกเดือน" },
  { key: "other", module: "debt-cards", label: "หนี้อื่น (ยืมบุคคล / ค้างจ่ายอื่น)", hint: "ยอดหนี้ = ช่องยอดตามใบแจ้งยอด · วันที่ต้องคืน = วันครบกำหนด", defaults: { card_kind: "other" } },
];
const TONE: Record<string, string> = {
  good: "bg-emerald-50 text-emerald-700 border-emerald-200", warn: "bg-amber-50 text-amber-700 border-amber-200",
  bad: "bg-red-50 text-red-700 border-red-200", grey: "bg-slate-100 text-slate-600 border-slate-200", od: "bg-violet-50 text-violet-700 border-violet-200",
};

/** สรุปหนี้ตามชนิด — หน้าแม่ใช้ทำการ์ดสรุป + เส้นวงเงิน OD บนกราฟ */
export function summarizeDebts(items: DebtItem[]) {
  const of = (k: DebtKind) => items.filter((i) => i.kind === k);
  const loans = of("loan"), ods = of("od"), cards = of("card");
  const odLimit = ods.reduce((s, i) => s + (i.limit ?? 0), 0), odUsed = ods.reduce((s, i) => s + i.outstanding, 0);
  return {
    loanCount: loans.length, loanOutstanding: loans.reduce((s, i) => s + i.outstanding, 0), loanMonthly: loans.reduce((s, i) => s + i.monthly, 0),
    odCount: ods.length, odLimit, odUsed, odHeadroom: Math.max(0, odLimit - odUsed),
    cardCount: cards.length, cardOutstanding: cards.reduce((s, i) => s + i.outstanding, 0),
  };
}

type Row = DebtItem & Record<string, unknown>;

export function CashflowDebtTab({ items, loading, error, canCreate, onChanged, startCreate, onStartCreateHandled, children }: {
  items: DebtItem[]; loading: boolean; error: string | null; canCreate: boolean; onChanged: () => void;
  /** เปิดฟอร์ม "ลงหนี้ใหม่" ชนิดนี้ทันที (มาจากปุ่ม ＋ เพิ่มรายการ บนหัวหน้า) — เปิดแล้วเรียก onStartCreateHandled */
  startCreate?: NewDebtKey | null;
  onStartCreateHandled?: () => void;
  /** แผงเสริมด้านบน (เช่น ตัดยอดเงินกู้ให้ตรง) */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState<{ module: DebtItem["module"]; id: string | null; defaults?: Record<string, unknown>; title?: string } | null>(null);
  const create = (k: NewDebtKey) => { const n = NEW_DEBT.find((x) => x.key === k); if (n) setOpen({ module: n.module, id: null, defaults: n.defaults, title: n.defaults ? n.label : undefined }); };
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    if (startCreate && canCreate) { create(startCreate); onStartCreateHandled?.(); }
  }, [startCreate, canCreate, onStartCreateHandled]);
  const s = useMemo(() => summarizeDebts(items), [items]);

  const columns = useMemo<ColumnDef<Row>[]>(() => [
    {
      id: "name", accessorKey: "name", header: "หนี้", size: 260,
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="font-medium text-slate-800 truncate"><Icon value={KIND[row.original.kind].icon} /> {row.original.name}</div>
          <div className="text-[11px] text-slate-500 truncate">{row.original.lender}{row.original.product ? ` · ${row.original.product}` : ""}{row.original.code ? ` · ${row.original.code}` : ""}</div>
        </div>
      ),
    },
    { id: "kind", header: "ชนิด", size: 110, accessorFn: (r) => KIND[r.kind].label },
    { id: "company", accessorKey: "company_name", header: "บริษัท", size: 110, cell: ({ row }) => <span className="text-slate-600">{row.original.company_name || "—"}</span> },
    {
      id: "outstanding", accessorKey: "outstanding", header: "ยอดคงเหลือ", size: 130,
      cell: ({ row }) => (
        <span className="tabular-nums font-semibold text-slate-800">{THB(row.original.outstanding)}
          {row.original.limit ? <span className="block text-[11px] font-normal text-slate-400">วงเงิน {THB(row.original.limit)}</span> : null}
        </span>
      ),
    },
    { id: "monthly", accessorKey: "monthly", header: "ต่อเดือน", size: 110, cell: ({ row }) => row.original.monthly ? <span className="tabular-nums">{THB(row.original.monthly)}</span> : <span className="text-slate-300">—</span> },
    {
      id: "next", accessorKey: "next_due_date", header: "งวดถัดไป", size: 130,
      cell: ({ row }) => row.original.next_due_date
        ? <span>{formatDate(row.original.next_due_date)}<span className="block text-[11px] text-slate-400 tabular-nums">{THB(row.original.next_due_amount)}</span></span>
        : <span className="text-slate-300">—</span>,
    },
    {
      id: "flags", header: "ต้องทำอะไรต่อ", size: 200,
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.flags.map((f) => <span key={f.key} className={`px-2 py-0.5 rounded-full text-[11px] border ${TONE[f.tone] ?? TONE.grey}`}>{f.label}</span>)}
        </div>
      ),
    },
  ], []);

  return (
    <div className="space-y-3">
      {children}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-slate-500">หนี้ทุกก้อนในที่เดียว — กดแถวเพื่อเปิดสัญญา (บันทึกจ่ายงวด · อัปเดตยอดบัตร · ปรับโครงสร้าง อยู่ในนั้น)</p>
        <div className="flex gap-2 relative">
          <Link href="/bank-debts" className="h-9 px-3 inline-flex items-center text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">ทะเบียนหนี้เต็ม</Link>
          {canCreate && (
            <button type="button" onClick={() => setMenu((v) => !v)} className="h-9 px-3 text-sm rounded-lg bg-teal-700 text-white hover:bg-teal-800">＋ ลงหนี้ใหม่</button>
          )}
          {menu && (
            <div className="absolute right-0 top-10 z-20 w-72 bg-white border border-slate-200 rounded-xl shadow-lg p-1">
              {NEW_DEBT.map((n) => (
                <button key={n.key} type="button" onClick={() => { setMenu(false); create(n.key); }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50">
                  <span className="block text-sm text-slate-800">{n.label}</span>
                  <span className="block text-[11px] text-slate-500">{n.hint}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Tile title={`เงินกู้ · ${s.loanCount} สัญญา`} value={THB(s.loanOutstanding)} sub={`เงินต้นคงเหลือ · ผ่อนรวมราว ${THB(s.loanMonthly)}/เดือน`} />
        <Tile title={`วงเงิน OD · ${s.odCount} วงเงิน`} value={`${THB(s.odHeadroom)} เหลือเบิก`} sub={`ใช้ไป ${THB(s.odUsed)} จาก ${THB(s.odLimit)}`}
          bar={s.odLimit ? s.odUsed / s.odLimit : null} />
        <Tile title={`บัตร / หนี้อื่น · ${s.cardCount} รายการ`} value={THB(s.cardOutstanding)} sub="ยอดที่ยังไม่จ่าย (บัตร · Cash plus · ยืมบุคคล · ค้างจ่ายอื่น)" />
      </div>

      <DataTable<Row>
        tableId="cashflow-debts"
        data={items as Row[]}
        columns={columns}
        title="หนี้ธนาคารทั้งหมด"
        loading={loading}
        error={error ?? undefined}
        emptyMessage="ยังไม่มีหนี้ในระบบ — กด “ลงหนี้ใหม่” เพื่อลงสัญญาเงินกู้ วงเงิน OD หรือบัตร"
        searchPlaceholder="ค้นหาชื่อหนี้ / ธนาคาร…"
        searchableKeys={["name", "lender", "code"]}
        onRowClick={(r) => setOpen({ module: r.module, id: r.id })}
        pageSize={25}
        exportFilename="bank-debts"
      />

      {open && (
        <MasterRecordDrawer moduleKey={open.module} recordId={open.id} onClose={() => setOpen(null)} onChanged={onChanged}
          createDefaults={open.defaults} createTitle={open.title}
          permissions={{ view: "loan_contracts.view", create: "loan_contracts.create", edit: "loan_contracts.edit" }} />
      )}
    </div>
  );
}

function Tile({ title, value, sub, bar }: { title: string; value: string; sub: string; bar?: number | null }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
      <div className="text-xs text-slate-500">{title}</div>
      <div className="text-xl font-bold tabular-nums text-slate-900 mt-0.5">{value}</div>
      {bar != null && (
        <div className="h-1.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
          <div className={`h-full ${bar > 0.85 ? "bg-red-500" : bar > 0.6 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, bar * 100)}%` }} />
        </div>
      )}
      <div className="text-[11px] text-slate-500 mt-1">{sub}</div>
    </div>
  );
}
