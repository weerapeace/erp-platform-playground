"use client";
// Loan & OD Playground — OD side + Permission + States
import React, { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { StatusChip, ToneChip, CardBox, Field, UtilizationBar, MockNote } from "./ui";
import { OD_LIFECYCLE, utilizationTone } from "./workflow";
import {
  THB, MOCK_OD, MOCK_STATEMENT_ROWS, MOCK_RECON, MOCK_COLLATERAL,
  type ODFacility,
} from "./mock";

// ============================================================
// OD SECTION (list + detail + statement import)
// ============================================================
export function ODSection() {
  const [selected, setSelected] = useState<ODFacility | null>(null);
  const [importMode, setImportMode] = useState(false);

  if (importMode) return <StatementImportWizard onBack={() => setImportMode(false)} />;
  if (selected) return <ODDetail od={selected} onBack={() => setSelected(null)} onImport={() => setImportMode(true)} />;
  return <ODList onOpen={setSelected} onImport={() => setImportMode(true)} />;
}

const OD_COLUMNS: ColumnDef<ODFacility>[] = [
  { id: "od_code", accessorKey: "od_code", header: "รหัส", size: 120,
    cell: ({ getValue }) => <span className="font-mono text-xs font-bold text-slate-700">{getValue() as string}</span> },
  { id: "lender", accessorKey: "lender", header: "ธนาคาร", size: 150, meta: { filterable: true },
    cell: ({ getValue, row }) => <div><p className="text-sm text-slate-700">{getValue() as string}</p><p className="text-[11px] text-slate-400 font-mono">{row.original.bank_account}</p></div> },
  { id: "limit_amount", accessorKey: "limit_amount", header: "วงเงิน", size: 110, meta: { filterable: true, filterType: "number" },
    cell: ({ getValue }) => <span className="text-sm text-slate-700 tabular-nums">{THB(getValue() as number)}</span> },
  { id: "utilization_percent", accessorKey: "utilization_percent", header: "ใช้วงเงิน", size: 170,
    cell: ({ getValue, row }) => {
      const pct = getValue() as number;
      const tone = utilizationTone(pct);
      return (
        <div className="w-40">
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="tabular-nums text-slate-600">{THB(row.original.current_used_amount)}</span>
            <span className={`tabular-nums font-medium ${pct >= 85 ? "text-red-600" : pct >= 70 ? "text-amber-600" : "text-slate-500"}`}>{pct}%</span>
          </div>
          <UtilizationBar percent={pct} tone={tone} />
        </div>
      );
    } },
  { id: "available_limit", accessorKey: "available_limit", header: "เหลือวงเงิน", size: 110,
    cell: ({ getValue }) => <span className="text-sm text-slate-700 tabular-nums">{THB(getValue() as number)}</span> },
  { id: "lifecycle_status", accessorKey: "lifecycle_status", header: "สถานะ", size: 110, enableSorting: false,
    cell: ({ getValue }) => <StatusChip meta={OD_LIFECYCLE[getValue() as keyof typeof OD_LIFECYCLE]} size="xs" /> },
];

function ODList({ onOpen, onImport }: { onOpen: (o: ODFacility) => void; onImport: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-900">วงเงินเบิกเกินบัญชี (OD Facilities)</h2>
          <p className="text-xs text-slate-500 mt-0.5">แต่ละวงเงินคำนวณยอดใช้จากยอดเดินบัญชีรายวัน</p>
        </div>
        <button onClick={onImport} className="h-9 px-4 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
          ⬆️ นำเข้า Statement
        </button>
      </div>

      <MockNote>
        เตือนอัตโนมัติเมื่อใช้วงเงินเกิน <b>50% / 70% / 85% / 95%</b> — ตอนนี้ OD-2026-03 อยู่ที่ 99.6% (แดง) และ OD-2026-01 อยู่ที่ 82.5% (ส้ม)
      </MockNote>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <DataTable<ODFacility>
          data={MOCK_OD}
          columns={OD_COLUMNS}
          title="วงเงิน OD"
          description="ข้อมูล mock"
          searchPlaceholder="ค้นหาจากรหัส / ธนาคาร..."
          searchableKeys={["od_code", "lender", "bank_account"]}
          views={[
            { id: "all", label: "ทั้งหมด" },
            { id: "over70", label: "ใช้เกิน 70%", filter: (r: Record<string, unknown>) => (r.utilization_percent as number) >= 70 },
            { id: "over85", label: "ใช้เกิน 85%", filter: (r: Record<string, unknown>) => (r.utilization_percent as number) >= 85 },
          ]}
          rowActions={[
            { label: "ดูรายละเอียด", onClick: (row) => onOpen(row) },
            { label: "นำเข้า Statement", onClick: () => onImport() },
            { label: "เปลี่ยนวงเงิน", onClick: (row) => alert(`(mock) เปลี่ยนวงเงิน ${row.od_code} — เก็บประวัติแบบ Effective Date + ต้องอนุมัติ`) },
          ]}
          onRowClick={(row) => onOpen(row)}
        />
      </div>
    </div>
  );
}

function ODDetail({ od, onBack, onImport }: { od: ODFacility; onBack: () => void; onImport: () => void }) {
  const tone = utilizationTone(od.utilization_percent);
  return (
    <div className="space-y-5 max-w-4xl">
      <button onClick={onBack} className="text-sm text-slate-500 hover:text-slate-700">← กลับรายการ OD</button>

      <CardBox>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-slate-700">{od.od_code}</span>
              <StatusChip meta={OD_LIFECYCLE[od.lifecycle_status]} size="xs" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 mt-1">{od.lender}</h2>
            <p className="text-xs text-slate-500 font-mono mt-0.5">{od.bank_account}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400">ใช้วงเงิน</p>
            <p className={`text-2xl font-bold ${od.utilization_percent >= 85 ? "text-red-600" : od.utilization_percent >= 70 ? "text-amber-600" : "text-slate-900"}`}>{od.utilization_percent}%</p>
          </div>
        </div>
        <div className="mt-4">
          <UtilizationBar percent={od.utilization_percent} tone={tone} />
          <div className="flex justify-between text-xs text-slate-500 mt-1.5">
            <span>ใช้ไป {THB(od.current_used_amount)}</span>
            <span>วงเงิน {THB(od.limit_amount)}</span>
          </div>
        </div>
      </CardBox>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { l: "เหลือวงเงิน", v: THB(od.available_limit) },
          { l: "ใช้สูงสุดเดือนนี้", v: THB(od.highest_used_this_month) },
          { l: "ดอกเบี้ยประมาณเดือนนี้", v: THB(od.estimated_interest_this_month) },
          { l: "ใช้ต่อเนื่อง", v: `${od.continuous_usage_days} วัน` },
        ].map((x) => (
          <div key={x.l} className="bg-white rounded-xl border border-slate-200 shadow-sm p-3.5">
            <p className="text-xs text-slate-500">{x.l}</p>
            <p className="mt-1 text-sm font-semibold text-slate-800 tabular-nums">{x.v}</p>
          </div>
        ))}
      </div>

      <CardBox title="เงื่อนไขวงเงิน">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label="อัตราดอกเบี้ย" value={`${od.interest_rate.toFixed(2)}%`} />
          <Field label="อ้างอิง" value={od.interest_rate_reference} />
          <Field label="วันเริ่ม" value={od.start_date} />
          <Field label="วันทบทวน" value={od.review_date} />
          <Field label="วันหมดอายุ" value={od.expiry_date} />
          <Field label="ผู้รับผิดชอบ" value={od.responsible} />
        </div>
      </CardBox>

      <div className="flex gap-2">
        <button onClick={onImport} className="h-9 px-4 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">⬆️ นำเข้า Statement</button>
        <button onClick={() => alert("(mock) ดูรายการเดินบัญชีรายวัน (Daily Balance)")} className="h-9 px-4 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">📅 ยอดใช้รายวัน</button>
      </div>
    </div>
  );
}

// ============================================================
// STATEMENT IMPORT WIZARD (preview)
// ============================================================
function StatementImportWizard({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState(3); // เริ่มที่ Preview ให้เห็นผลเลย
  const steps = ["เลือกไฟล์", "จับคู่คอลัมน์", "ตรวจสอบ (Preview)", "ยืนยันนำเข้า"];

  const dupCount = MOCK_STATEMENT_ROWS.filter((r) => r.flag === "duplicate").length;
  const warnCount = MOCK_STATEMENT_ROWS.filter((r) => r.flag === "warning").length;
  const okCount = MOCK_STATEMENT_ROWS.filter((r) => r.flag === "ok").length;

  const flagMeta = {
    ok: { tone: "success" as const, icon: "✓", label: "พร้อมนำเข้า" },
    warning: { tone: "warning" as const, icon: "!", label: "เตือน — ยืนยันได้" },
    duplicate: { tone: "danger" as const, icon: "⧉", label: "ซ้ำ — จะข้าม" },
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-sm text-slate-500 hover:text-slate-700">← กลับ</button>
        <h2 className="text-lg font-bold text-slate-900">นำเข้า Statement ธนาคาร (OD-2026-01)</h2>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-1">
        {steps.map((s, i) => (
          <React.Fragment key={s}>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
              i + 1 === step ? "bg-blue-600 text-white" : i + 1 < step ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-400"
            }`}>
              <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px]">{i + 1 < step ? "✓" : i + 1}</span>
              {s}
            </div>
            {i < steps.length - 1 && <div className="w-4 h-px bg-slate-200" />}
          </React.Fragment>
        ))}
      </div>

      <MockNote>
        ระบบสร้าง <b>ลายนิ้วมือ (fingerprint)</b> จากวันที่+จำนวนเงิน+ยอดคงเหลือ+รายละเอียด เพื่อกันรายการซ้ำ · ต้องเห็น Preview ก่อนเสมอ ห้ามสร้างรายการจริงก่อนยืนยัน
      </MockNote>

      {/* Validation summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3"><p className="text-xs text-emerald-700">พร้อมนำเข้า</p><p className="text-xl font-bold text-emerald-700">{okCount}</p></div>
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3"><p className="text-xs text-amber-700">เตือน</p><p className="text-xl font-bold text-amber-700">{warnCount}</p></div>
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3"><p className="text-xs text-red-700">รายการซ้ำ (ข้าม)</p><p className="text-xl font-bold text-red-700">{dupCount}</p></div>
      </div>

      <CardBox title="ตัวอย่างข้อมูล (Preview)" description="ตรวจก่อนยืนยัน — รายการซ้ำจะถูกข้าม">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-100">
                <th className="text-left py-2 font-medium">วันที่</th>
                <th className="text-left py-2 font-medium">รายละเอียด</th>
                <th className="text-right py-2 font-medium">เงินเข้า</th>
                <th className="text-right py-2 font-medium">เงินออก</th>
                <th className="text-right py-2 font-medium">ยอดคงเหลือ</th>
                <th className="text-center py-2 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_STATEMENT_ROWS.map((r, i) => {
                const m = flagMeta[r.flag];
                return (
                  <tr key={i} className={`border-b border-slate-50 last:border-0 ${r.flag === "duplicate" ? "opacity-50" : ""}`}>
                    <td className="py-2 text-slate-600">{r.date}</td>
                    <td className="py-2 text-slate-700">{r.description}</td>
                    <td className="py-2 text-right tabular-nums text-emerald-600">{r.money_in ? THB(r.money_in) : "—"}</td>
                    <td className="py-2 text-right tabular-nums text-red-600">{r.money_out ? THB(r.money_out) : "—"}</td>
                    <td className={`py-2 text-right tabular-nums font-medium ${r.balance < 0 ? "text-red-600" : "text-slate-700"}`}>{THB(r.balance)}</td>
                    <td className="py-2 text-center"><ToneChip tone={m.tone}>{m.icon} {m.label}</ToneChip></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-2 mt-4">
          <button onClick={() => { setStep(4); alert(`(mock) นำเข้าสำเร็จ ${okCount + warnCount} รายการ, ข้ามซ้ำ ${dupCount} รายการ → สร้าง Daily Balance + คำนวณ OD Usage`); onBack(); }}
            className="h-9 px-4 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">
            ✓ ยืนยันนำเข้า {okCount + warnCount} รายการ
          </button>
          <button onClick={onBack} className="h-9 px-4 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
        </div>
      </CardBox>
    </div>
  );
}

// ============================================================
// INTEREST RECONCILIATION
// ============================================================
export function ReconciliationView() {
  const statusMeta = {
    accepted: { tone: "success" as const, label: "ยอมรับส่วนต่าง" },
    need_review: { tone: "danger" as const, label: "ต้องตรวจสอบ" },
    waiting: { tone: "neutral" as const, label: "รอ Statement" },
  };
  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h2 className="text-lg font-bold text-slate-900">กระทบยอดดอกเบี้ย OD (OD-2026-01)</h2>
        <p className="text-xs text-slate-500 mt-0.5">เทียบดอกเบี้ยที่ระบบประมาณการ กับที่ธนาคารหักจริง</p>
      </div>

      <MockNote>
        ประมาณการคิดจาก <b>ยอดใช้รายวัน × อัตรา ÷ วันในปี</b> · เกณฑ์เตือน: ต่างเกิน <b>฿100 หรือ 1%</b> = ต้องตรวจสอบ · การยอมรับส่วนต่างต้องบันทึกเหตุผล + Audit Log
      </MockNote>

      <CardBox>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-100">
                <th className="text-left py-2 font-medium">เดือน</th>
                <th className="text-right py-2 font-medium">ประมาณการ</th>
                <th className="text-right py-2 font-medium">ธนาคารหักจริง</th>
                <th className="text-right py-2 font-medium">ส่วนต่าง</th>
                <th className="text-right py-2 font-medium">%</th>
                <th className="text-center py-2 font-medium">สถานะ</th>
                <th className="text-center py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {MOCK_RECON.map((r) => {
                const m = statusMeta[r.status];
                return (
                  <tr key={r.month} className="border-b border-slate-50 last:border-0">
                    <td className="py-2.5 text-slate-700 font-medium">{r.month}</td>
                    <td className="py-2.5 text-right tabular-nums text-slate-700">{THB(r.estimated)}</td>
                    <td className="py-2.5 text-right tabular-nums text-slate-700">{r.actual != null ? THB(r.actual) : "—"}</td>
                    <td className={`py-2.5 text-right tabular-nums font-medium ${r.diff == null ? "text-slate-400" : Math.abs(r.diff) > 100 ? "text-red-600" : "text-slate-600"}`}>{r.diff != null ? (r.diff > 0 ? "+" : "") + THB(r.diff) : "—"}</td>
                    <td className={`py-2.5 text-right tabular-nums ${r.diff_pct == null ? "text-slate-400" : Math.abs(r.diff_pct) > 1 ? "text-red-600" : "text-slate-500"}`}>{r.diff_pct != null ? `${r.diff_pct > 0 ? "+" : ""}${r.diff_pct}%` : "—"}</td>
                    <td className="py-2.5 text-center"><ToneChip tone={m.tone}>{m.label}</ToneChip></td>
                    <td className="py-2.5 text-center">
                      {r.status === "need_review" && (
                        <button onClick={() => alert("(mock) ยอมรับส่วนต่าง — ต้องระบุเหตุผล + สร้าง Audit Log")} className="text-xs text-blue-600 border border-blue-200 rounded-lg px-2 py-1 hover:bg-blue-50">ยอมรับ</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardBox>
    </div>
  );
}

// ============================================================
// COLLATERAL
// ============================================================
export function CollateralView() {
  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h2 className="text-lg font-bold text-slate-900">หลักประกันและผู้ค้ำ (Collateral & Guarantees)</h2>
        <p className="text-xs text-slate-500 mt-0.5">หลักประกัน 1 ชิ้นผูกได้หลายสัญญา/วงเงิน</p>
      </div>
      <CardBox>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-100">
                <th className="text-left py-2 font-medium">รหัส</th>
                <th className="text-left py-2 font-medium">ประเภท</th>
                <th className="text-left py-2 font-medium">เจ้าของ</th>
                <th className="text-right py-2 font-medium">มูลค่าประเมิน</th>
                <th className="text-right py-2 font-medium">วงเงินค้ำ</th>
                <th className="text-left py-2 font-medium">ผูกกับ</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_COLLATERAL.map((c) => (
                <tr key={c.code} className="border-b border-slate-50 last:border-0">
                  <td className="py-2.5 font-mono text-xs text-slate-600">{c.code}</td>
                  <td className="py-2.5 text-slate-700">{c.type}</td>
                  <td className="py-2.5 text-slate-600">{c.owner}</td>
                  <td className="py-2.5 text-right tabular-nums text-slate-700">{c.appraised_value ? THB(c.appraised_value) : "—"}</td>
                  <td className="py-2.5 text-right tabular-nums font-medium text-slate-800">{THB(c.pledged_amount)}</td>
                  <td className="py-2.5 font-mono text-[11px] text-slate-500">{c.linked_to}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBox>
    </div>
  );
}

// ============================================================
// PERMISSION PREVIEW
// ============================================================
export function PermissionView() {
  const roles = ["Owner", "Finance Mgr", "Accounting", "Auditor", "Viewer"];
  const matrix: { perm: string; label: string; allow: boolean[] }[] = [
    { perm: "loan_contracts.approve", label: "อนุมัติสัญญา", allow: [true, false, false, false, false] },
    { perm: "loan_contracts.create", label: "สร้างสัญญา", allow: [true, true, true, false, false] },
    { perm: "loan_payments.verify", label: "ยืนยันการจ่าย", allow: [true, true, false, false, false] },
    { perm: "loan_payments.create", label: "บันทึกการจ่าย", allow: [true, true, true, false, false] },
    { perm: "loan_od.principal.view", label: "ดูยอดเงินต้น", allow: [true, true, true, true, false] },
    { perm: "loan_od.interest_rate.view", label: "ดูอัตราดอกเบี้ย", allow: [true, true, true, true, false] },
    { perm: "loan_od.accounting_export", label: "ส่งออกข้อมูลบัญชี", allow: [true, true, false, true, false] },
  ];

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h2 className="text-lg font-bold text-slate-900">ตัวอย่างสิทธิ์การใช้งาน (Permission)</h2>
        <p className="text-xs text-slate-500 mt-0.5">สิทธิ์เป็นค่าเริ่มต้น — ผู้ดูแลปรับจริงได้ที่ Permission กลาง</p>
      </div>

      <MockNote>
        ข้อมูลยอดเงิน อัตราดอกเบี้ย เลขบัญชี และหลักประกัน <b>ซ่อนโดยปริยาย</b> — ไม่เปิดเผยแค่เพราะผู้ใช้เข้าโมดูลได้ · ผู้สร้างรายการไม่ควรอนุมัติรายการตัวเอง (Maker/Checker)
      </MockNote>

      <CardBox title="ตารางสิทธิ์ตัวอย่าง (Role × Permission)">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-100">
                <th className="text-left py-2 font-medium">สิทธิ์</th>
                {roles.map((r) => <th key={r} className="text-center py-2 font-medium px-2">{r}</th>)}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row) => (
                <tr key={row.perm} className="border-b border-slate-50 last:border-0">
                  <td className="py-2.5"><p className="text-slate-700">{row.label}</p><p className="font-mono text-[10px] text-slate-400">{row.perm}</p></td>
                  {row.allow.map((a, i) => (
                    <td key={i} className="text-center py-2.5">{a ? <span className="text-emerald-600">✓</span> : <span className="text-slate-300">—</span>}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBox>

      <CardBox title="ตัวอย่าง: ผู้ใช้สิทธิ์ Viewer เปิดหน้าสัญญา">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label="รหัสสัญญา" value="LOAN-2026-0001" />
          <Field label="ชื่อสัญญา" value="เงินกู้ซื้อเครื่องจักร" />
          <Field label="เงินต้นคงเหลือ" value={<span className="inline-flex items-center gap-1 text-slate-400"><span>🔒</span> ไม่มีสิทธิ์ดู</span>} />
          <Field label="อัตราดอกเบี้ย" value={<span className="inline-flex items-center gap-1 text-slate-400"><span>🔒</span> ไม่มีสิทธิ์ดู</span>} />
        </div>
      </CardBox>
    </div>
  );
}

// ============================================================
// STATES (Loading / Empty / Error / Permission denied)
// ============================================================
export function StatesView() {
  const [mode, setMode] = useState<"loading" | "empty" | "filtered" | "error" | "denied" | "partial">("loading");
  const modes: { id: typeof mode; label: string }[] = [
    { id: "loading", label: "กำลังโหลด" },
    { id: "empty", label: "ไม่มีข้อมูล" },
    { id: "filtered", label: "กรองแล้วไม่เจอ" },
    { id: "error", label: "ผิดพลาด" },
    { id: "denied", label: "ไม่มีสิทธิ์" },
    { id: "partial", label: "นำเข้าบางส่วนล้มเหลว" },
  ];

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h2 className="text-lg font-bold text-slate-900">สถานะหน้าจอ (Loading / Empty / Error)</h2>
        <p className="text-xs text-slate-500 mt-0.5">ทุกหน้าต้องมีสถานะพวกนี้ครบ พร้อมข้อความภาษาคน</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {modes.map((m) => (
          <button key={m.id} onClick={() => setMode(m.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${mode === m.id ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"}`}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 min-h-[240px] flex items-center justify-center">
        {mode === "loading" && (
          <div className="w-full space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="h-4 w-24 bg-slate-100 rounded" />
                <div className="h-4 flex-1 bg-slate-100 rounded" />
                <div className="h-4 w-16 bg-slate-100 rounded" />
              </div>
            ))}
            <p className="text-center text-xs text-slate-400 pt-2">กำลังโหลดข้อมูลสัญญาเงินกู้...</p>
          </div>
        )}
        {mode === "empty" && (
          <div className="text-center">
            <p className="text-4xl mb-2">📄</p>
            <p className="font-semibold text-slate-700">ยังไม่มีสัญญาเงินกู้</p>
            <p className="text-sm text-slate-500 mt-1">เริ่มต้นด้วยการสร้างสัญญาเงินกู้ฉบับแรก</p>
            <button className="mt-3 h-9 px-4 text-sm font-medium text-white bg-blue-600 rounded-lg">+ สร้างสัญญาเงินกู้</button>
          </div>
        )}
        {mode === "filtered" && (
          <div className="text-center">
            <p className="text-4xl mb-2">🔍</p>
            <p className="font-semibold text-slate-700">ไม่พบรายการตามตัวกรอง</p>
            <p className="text-sm text-slate-500 mt-1">ลองล้างตัวกรอง หรือเปลี่ยนคำค้นหา (ระบบมีข้อมูลอยู่ แต่ไม่ตรงเงื่อนไข)</p>
            <button className="mt-3 h-9 px-4 text-sm text-slate-600 border border-slate-200 rounded-lg">ล้างตัวกรอง</button>
          </div>
        )}
        {mode === "error" && (
          <div className="text-center">
            <p className="text-4xl mb-2">⚠️</p>
            <p className="font-semibold text-red-600">เกิดข้อผิดพลาดในการโหลดข้อมูล</p>
            <p className="text-sm text-slate-500 mt-1">กรุณาลองใหม่อีกครั้ง หากยังไม่ได้ให้แจ้งผู้ดูแลระบบ</p>
            <button className="mt-3 h-9 px-4 text-sm font-medium text-white bg-blue-600 rounded-lg">ลองใหม่</button>
          </div>
        )}
        {mode === "denied" && (
          <div className="text-center">
            <p className="text-4xl mb-2">🔒</p>
            <p className="font-semibold text-slate-700">คุณไม่มีสิทธิ์เข้าถึงหน้านี้</p>
            <p className="text-sm text-slate-500 mt-1">ต้องมีสิทธิ์ <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">loan_od.view</span> — ติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์</p>
          </div>
        )}
        {mode === "partial" && (
          <div className="w-full">
            <div className="text-center mb-4">
              <p className="text-4xl mb-2">📥</p>
              <p className="font-semibold text-amber-600">นำเข้าสำเร็จบางส่วน</p>
              <p className="text-sm text-slate-500 mt-1">สำเร็จ 48 รายการ · ล้มเหลว 3 รายการ</p>
            </div>
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700 space-y-1">
              <p>แถว 12: วันที่ไม่ถูกต้อง (31/13/2026)</p>
              <p>แถว 25: ยอดคงเหลือว่าง</p>
              <p>แถว 40: จำนวนเงินไม่ใช่ตัวเลข</p>
            </div>
            <button className="mt-3 h-9 px-4 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg">⬇️ ดาวน์โหลดรายการที่ผิด</button>
          </div>
        )}
      </div>
    </div>
  );
}
