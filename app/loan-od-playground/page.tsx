"use client";
// Loan & OD Management — Playground (Phase 0, mock UI)
// หน้าตัวอย่างให้เจ้าของโปรเจกต์ดู/ให้ feedback ก่อนต่อฐานข้อมูลจริง
// ใช้ของกลาง: PlaygroundShell, DataTable, ERPForm, ERPModal/ConfirmDialog/Drawer
import { useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { DashboardView, LoanSection, PaymentSection } from "./views-loan";
import { ODSection, ReconciliationView, CollateralView, PermissionView, StatesView } from "./views-od";

type Section =
  | "dashboard" | "loans" | "payments" | "od" | "recon" | "collateral" | "permission" | "states";

const NAV: { group: string; items: { id: Section; icon: string; label: string }[] }[] = [
  {
    group: "ภาพรวม",
    items: [{ id: "dashboard", icon: "📊", label: "Dashboard" }],
  },
  {
    group: "เงินกู้ (Loans)",
    items: [
      { id: "loans", icon: "📄", label: "สัญญาเงินกู้" },
      { id: "payments", icon: "💸", label: "การจ่าย / ตัดยอด" },
    ],
  },
  {
    group: "วงเงิน OD",
    items: [
      { id: "od", icon: "🏦", label: "วงเงิน OD + Statement" },
      { id: "recon", icon: "📈", label: "กระทบยอดดอกเบี้ย" },
    ],
  },
  {
    group: "อื่น ๆ",
    items: [
      { id: "collateral", icon: "🏛️", label: "หลักประกัน / ค้ำ" },
      { id: "permission", icon: "🔐", label: "สิทธิ์ (Permission)" },
      { id: "states", icon: "⚙️", label: "สถานะหน้าจอ" },
    ],
  },
];

export default function LoanODPlaygroundPage() {
  const [section, setSection] = useState<Section>("dashboard");

  return (
    <PlaygroundShell>
      {/* Page header */}
      <div className="bg-white border-b border-slate-200 px-6 md:px-8 py-5">
        <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 rounded-full text-xs font-medium mb-2">
          🧪 Phase 0 — Mock UI (ยังไม่ต่อฐานข้อมูล)
        </div>
        <h1 className="text-2xl font-bold text-slate-900">💵 บริหารเงินกู้ & วงเงิน OD</h1>
        <p className="text-slate-500 mt-1 text-sm">
          ตัวอย่างหน้าตาระบบตามสเปก — ดูคำ / ปุ่ม / ลำดับข้อมูล แล้วบอกจุดที่อยากปรับได้เลยครับ
        </p>
      </div>

      <div className="flex flex-col md:flex-row">
        {/* Module sub-nav */}
        <aside className="md:w-56 flex-shrink-0 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50/60 px-3 py-4">
          <div className="flex md:block gap-1 overflow-x-auto md:space-y-4">
            {NAV.map((g) => (
              <div key={g.group} className="md:mb-0">
                <p className="hidden md:block text-[10px] font-semibold uppercase tracking-wide text-slate-400 px-2 mb-1">{g.group}</p>
                <div className="flex md:block gap-1 md:space-y-0.5">
                  {g.items.map((it) => (
                    <button
                      key={it.id}
                      onClick={() => setSection(it.id)}
                      className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors w-full text-left ${
                        section === it.id ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-blue-600"
                      }`}
                    >
                      <span>{it.icon}</span>
                      <span>{it.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0 px-4 md:px-8 py-6">
          {section === "dashboard" && <DashboardView onGoto={(s) => setSection(s as Section)} />}
          {section === "loans" && <LoanSection />}
          {section === "payments" && <PaymentSection />}
          {section === "od" && <ODSection />}
          {section === "recon" && <ReconciliationView />}
          {section === "collateral" && <CollateralView />}
          {section === "permission" && <PermissionView />}
          {section === "states" && <StatesView />}
        </main>
      </div>
    </PlaygroundShell>
  );
}
