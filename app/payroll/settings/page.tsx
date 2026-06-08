"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { PayrollGlobalRulesCard } from "@/components/payroll/payroll-global-rules-card";

type SettingsCenter = {
  latestPeriod: {
    id: string;
    period_name: string;
    status: string;
    start_date: string;
    end_date: string;
    default_work_days: number | null;
    default_hours_per_day: number | null;
    locked_at: string | null;
    paid_at: string | null;
  } | null;
  counts: {
    employeeSettings: number;
    appSettings: number;
    attendanceEntries: number;
    leaveEntries: number;
    overtimeEntries: number;
    paymentBatches: number;
    payslips: number;
    payrollRuns: number;
  };
  readiness: {
    appRuleStorage: boolean;
    appRuleStorageReason: string;
    employeeSettingsReady: boolean;
    periodWorkflowReady: boolean;
    timestampImportReady: boolean;
    reportsReady: boolean;
    paymentBatchReady: boolean;
  };
};

const EMPTY_COUNTS: SettingsCenter["counts"] = {
  employeeSettings: 0,
  appSettings: 0,
  attendanceEntries: 0,
  leaveEntries: 0,
  overtimeEntries: 0,
  paymentBatches: 0,
  payslips: 0,
  payrollRuns: 0,
};

const EMPTY_READINESS: SettingsCenter["readiness"] = {
  appRuleStorage: false,
  appRuleStorageReason: "",
  employeeSettingsReady: false,
  periodWorkflowReady: false,
  timestampImportReady: false,
  reportsReady: false,
  paymentBatchReady: false,
};

const statusText: Record<string, string> = {
  draft: "ร่าง",
  review: "รอตรวจ",
  approved: "อนุมัติ",
  locked: "ล็อกแล้ว",
  paid: "จ่ายแล้ว",
  cancelled: "ยกเลิก",
};

const featureCards = [
  {
    no: "2",
    title: "Import Timestamp",
    href: "/payroll/manual-input",
    tone: "sky",
    description: "นำเข้าเวลาแบบ preview ก่อนบันทึก แล้วค่อยส่งเข้าตารางเข้างาน",
    next: "ทำ tab Import/Timestamp ให้รับไฟล์และตรวจรายการซ้ำ",
  },
  {
    no: "5",
    title: "Payment Batch",
    href: "/payroll/payments",
    tone: "emerald",
    description: "รวมยอดที่ตรวจแล้วเป็นชุดจ่าย แยกโอน/เงินสด และกันจ่ายซ้ำ",
    next: "ต่อจากงวดที่ reviewed/locked แล้วสร้าง batch จ่ายจริง",
  },
  {
    no: "6",
    title: "Reports",
    href: "/payroll/review",
    tone: "amber",
    description: "รายงานเงินเดือนรวม, โอนธนาคาร, ภาษี, ประกันสังคม, สาย/ขาด/ลา/OT",
    next: "ทำ report pack จาก payroll_runs และ payslips",
  },
  {
    no: "7",
    title: "Payroll Settings",
    href: "/payroll/employee-settings",
    tone: "violet",
    description: "กฎคำนวณกลาง + ค่ารายคน เช่น ภาษี ประกันสังคม OT เบิกกลางเดือน",
    next: "เพิ่ม storage สำหรับกฎกลางทั้งระบบด้วย migration",
  },
  {
    no: "8",
    title: "Lock Period",
    href: "/payroll/periods",
    tone: "slate",
    description: "สถานะงวด draft -> review -> approved -> locked -> paid เพื่อกันแก้ย้อนหลัง",
    next: "เพิ่มปุ่ม workflow ให้ใช้ง่ายในหน้างวด/คำนวณ",
  },
];

const toneClasses: Record<string, string> = {
  sky: "border-sky-200 bg-sky-50 text-sky-700",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  violet: "border-violet-200 bg-violet-50 text-violet-700",
  slate: "border-slate-200 bg-slate-50 text-slate-700",
};

function formatCount(n: number) {
  return n.toLocaleString("th-TH");
}

function HealthPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
      ok ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-amber-50 text-amber-700 border border-amber-100"
    }`}>
      {ok ? "พร้อม" : "ต้องทำต่อ"} · {label}
    </span>
  );
}

export default function PayrollSettingsCenterPage() {
  const [data, setData] = useState<SettingsCenter | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    apiFetch("/api/payroll/settings-center", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (!alive) return;
        if (json.error) setError(json.error);
        setData(json.data ?? null);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
      });
    return () => { alive = false; };
  }, []);

  const period = data?.latestPeriod ?? null;
  const counts = data?.counts ?? EMPTY_COUNTS;
  const readiness = data?.readiness ?? EMPTY_READINESS;
  const locked = period?.status === "locked" || period?.status === "paid";
  const inputTotal = useMemo(() => {
    return counts.attendanceEntries + counts.leaveEntries + counts.overtimeEntries;
  }, [counts]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">ศูนย์ตั้งค่า Payroll</h1>
          <p className="mt-1 text-sm text-slate-500">
            รวมสถานะของงาน 2, 5, 6, 7, 8 ไว้หน้าเดียว เพื่อเห็นว่าตรงไหนพร้อมใช้งานแล้ว และตรงไหนต้องทำต่อ
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!data && !error && (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
            กำลังโหลดศูนย์ตั้งค่า...
          </div>
        )}

        {data && (
          <>
            <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-400">งวดล่าสุด</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">
                      {period ? period.period_name : "ยังไม่มีงวด"}
                    </div>
                    {period && (
                      <div className="mt-1 text-sm text-slate-500">
                        {period.start_date} ถึง {period.end_date}
                      </div>
                    )}
                  </div>
                  {period && (
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      locked ? "bg-purple-50 text-purple-700" : "bg-slate-100 text-slate-600"
                    }`}>
                      {statusText[period.status] ?? period.status}
                    </span>
                  )}
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <Metric label="วันทำงานเริ่มต้น" value={period?.default_work_days ?? "-"} />
                  <Metric label="ชั่วโมง/วัน" value={period?.default_hours_per_day ?? "-"} />
                  <Metric label="ข้อมูลเวลา/ลา/OT" value={formatCount(inputTotal)} />
                </div>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
                <div className="text-sm font-semibold text-amber-900">ข้อควรรู้ก่อนทำ Settings กลาง</div>
                <p className="mt-2 text-sm leading-6 text-amber-800">
                  ตาราง payroll_app_settings ตอนนี้ใช้เก็บรหัส admin ของแอปเก่า ยังไม่ใช่ที่เก็บกฎคำนวณกลาง
                  ถ้าจะให้แก้กฎสาย/OT/ภาษีจากหน้านี้ได้จริง ต้องเพิ่ม migration แบบไม่กระทบข้อมูลเดิม
                </p>
              </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <HealthPill ok={readiness.employeeSettingsReady} label={`ตั้งค่ารายคน ${formatCount(counts.employeeSettings)} รายการ`} />
              <HealthPill ok={readiness.periodWorkflowReady} label="workflow งวดมี API แล้ว" />
              <HealthPill ok={readiness.timestampImportReady} label="Import Timestamp" />
              <HealthPill ok={readiness.reportsReady} label={`Reports/Slip ${formatCount(counts.payslips)} รายการ`} />
              <HealthPill ok={readiness.paymentBatchReady} label={`Payment ${formatCount(counts.paymentBatches)} รอบ`} />
            </section>

            <PayrollGlobalRulesCard />

            <section className="grid gap-4 xl:grid-cols-5">
              {featureCards.map((card) => (
                <Link
                  key={card.no}
                  href={card.href}
                  className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm"
                >
                  <div className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClasses[card.tone]}`}>
                    ข้อ {card.no}
                  </div>
                  <div className="mt-3 text-base font-semibold text-slate-900">{card.title}</div>
                  <p className="mt-2 min-h-[60px] text-sm leading-5 text-slate-500">{card.description}</p>
                  <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
                    ถัดไป: {card.next}
                  </div>
                </Link>
              ))}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-base font-semibold text-slate-900">ลำดับงานที่ผมจะเดินต่อ</div>
              <div className="mt-4 grid gap-3 lg:grid-cols-4">
                <Step no="1" title="เพิ่ม migration กฎกลาง" text="เพิ่มที่เก็บค่า setting แบบ key/value หรือ json โดยไม่แตะ password เดิม" />
                <Step no="2" title="ทำฟอร์ม Settings" text="ให้แก้กฎสาย/ขาด/ลา/OT/ภาษี/ประกันสังคมจากหน้าเดียว" />
                <Step no="3" title="ผูกเข้าคำนวณ" text="ให้เครื่องคำนวณอ่านค่ากลางก่อน แล้ว fallback ไปค่างวด/รายคน" />
                <Step no="4" title="ต่อ Import/Reports/Payment" text="ใช้กฎเดียวกันทั้ง flow เพื่อไม่ให้ยอดแต่ละหน้าต่างกัน" />
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{value}</div>
    </div>
  );
}

function Step({ no, title, text }: { no: string; title: string; text: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">{no}</span>
        <span className="font-medium text-slate-800">{title}</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-500">{text}</p>
    </div>
  );
}
