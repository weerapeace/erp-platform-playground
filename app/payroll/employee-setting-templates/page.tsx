import { PayrollEmployeeSettingTemplatesCard } from "@/components/payroll/payroll-employee-setting-templates-card";

export default function PayrollEmployeeSettingTemplatesPage() {
  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Template เงินเดือนรายคน (Payroll)</h1>
          <p className="mt-1 text-sm text-slate-500">
            ตั้งค่าประกันสังคม ภาษี OT เบิกกลางเดือน และตัวเลือกคำนวณรายคนตามประเภทสัญญา แล้วนำไปใช้กับพนักงานเป็นชุด
          </p>
        </div>
        <PayrollEmployeeSettingTemplatesCard />
      </div>
    </div>
  );
}
