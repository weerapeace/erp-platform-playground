"use client";

/**
 * Payroll module — หน้าพนักงาน (Phase 1 — ของจริง)
 *
 * โมดูลหลักใหม่: ย้าย payroll มาใช้ของกลาง erp
 * — ใช้ Universal DataTable (master-crud) ตัวเดียวกับทุกหน้าใน erp
 * — แทน EmployeesView.jsx (2,009 บรรทัด) ของแอปเก่า ด้วย config object เดียว
 *
 * Data source: /api/payroll/employees → ตาราง employees จริง (78 คน)
 * ใน Supabase เดียวกับที่ payroll app ใช้อยู่ (cyivhke...) — ดู docs/migration-payroll-to-erp.md
 */

import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";
import { money, statusBadge, PAY_STATUS } from "@/components/payroll/cells";
import { ContractPeekCell } from "@/components/payroll/contract-peek-cell";
import { RecordPeekCell } from "@/components/payroll/record-peek-cell";

// render แต่ละแถวใน drawer (ค่าประจำ / เงินเดือน / สลิป)
const peekRecurring = (r: Record<string, unknown>) => (
  <div className="rounded-lg border border-slate-200 p-3">
    <div className="flex items-center justify-between gap-2">
      <span className="font-medium text-slate-800 text-sm truncate">{String(r.item_name ?? "")}</span>
      <span className="text-sm tabular-nums">{money(r.amount_per_period)}</span>
    </div>
    <div className="text-xs text-slate-400 mt-0.5">
      {r.item_type === "earning" ? "🟢 เพิ่ม" : r.item_type === "deduction" ? "🔴 หัก" : String(r.item_type ?? "")} · {String(r.status ?? "")}
    </div>
  </div>
);
const peekLine = (r: Record<string, unknown>) => (
  <div className="rounded-lg border border-slate-200 p-3">
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-slate-700 truncate">{String(r.period_name || "—")}</span>
      {statusBadge(PAY_STATUS)(r.status)}
    </div>
    <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
      <div><div className="text-slate-400">รายได้รวม</div>{money(r.gross_pay)}</div>
      <div><div className="text-slate-400">หัก</div>{money(r.total_deduction)}</div>
      <div><div className="text-slate-400">สุทธิ</div><b>{money(r.net_pay)}</b></div>
    </div>
  </div>
);
const peekSlip = (r: Record<string, unknown>) => (
  <div className="rounded-lg border border-slate-200 p-3">
    <div className="flex items-center justify-between gap-2">
      <span className="font-mono text-xs">{String(r.payslip_no ?? "")}</span>
      {statusBadge(PAY_STATUS)(r.status)}
    </div>
    <div className="flex items-center justify-between mt-1 text-xs text-slate-500">
      <span className="truncate">{String(r.period_name || "")}</span>
      <span>{money(r.net_pay)}</span>
    </div>
  </div>
);

// UI constants (กำหนดในหน้า — ไม่ import จาก db lib ที่มี service-role เพื่อกัน bundle รั่วเข้า client)
const DEPARTMENT_NAMES = ["ประกอบ", "ตัด/เตรียม", "ช่างเหมา"];
const EMPLOYMENT_STATUS = ["active", "inactive", "resigned", "suspended"];

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const STATUS_LABEL: Record<string, { th: string; cls: string }> = {
  active:    { th: "ใช้งาน",    cls: "bg-emerald-100 text-emerald-700" },
  inactive:  { th: "ไม่ใช้งาน", cls: "bg-slate-100 text-slate-600" },
  resigned:  { th: "ลาออก",     cls: "bg-red-100 text-red-700" },
  suspended: { th: "พักงาน",    cls: "bg-amber-100 text-amber-700" },
};

const fmtBaht = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0
    ? <span className="tabular-nums text-slate-700">฿{n.toLocaleString("th-TH")}</span>
    : <span className="text-slate-300">—</span>;
};

// ของพิเศษทั้งหมดของหน้าพนักงาน — registry mode merge ตาม field key (ไม่หาย)
const employeeCellRenderers: NonNullable<MasterCRUDConfig["cellRenderers"]> = {
  current_contract_no: (v) =>
    v ? <span className="font-mono text-xs">{String(v)}</span> : <span className="text-slate-300">— ไม่มีสัญญา —</span>,
  current_contract_salary: fmtBaht,
  payroll_register_base_salary: fmtBaht,
  employment_status: (v) => {
    const s = STATUS_LABEL[String(v)] ?? { th: String(v), cls: "bg-slate-100 text-slate-600" };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>{s.th}</span>;
  },
  // ปุ่มกระโดดดูข้อมูลพนักงานในหน้าอื่น (สัญญา / ค่าประจำ / เงินเดือน / สลิป)
  id: (v, row) => {
    const id = String(v); const code = String(row?.employee_code ?? ""); const name = String(row?.full_name ?? "");
    return (
      <span className="flex gap-1.5 flex-wrap items-center">
        <ContractPeekCell employeeId={id} employeeCode={code} employeeName={name} />
        <RecordPeekCell label="🔁 ค่าประจำ" title="รายการประจำ" employeeId={id} employeeCode={code} employeeName={name}
          apiPath="/api/payroll/view/recurring" empty="ไม่มีรายการประจำ" renderRow={peekRecurring} />
        <RecordPeekCell label="✅ เงินเดือน" title="ผลคำนวณเงินเดือน" employeeId={id} employeeCode={code} employeeName={name}
          apiPath="/api/payroll/view/payroll-lines" empty="ยังไม่มีบรรทัดเงินเดือน" renderRow={peekLine} />
        <RecordPeekCell label="🧾 สลิป" title="สลิปเงินเดือน" employeeId={id} employeeCode={code} employeeName={name}
          apiPath="/api/payroll/view/payslips" empty="ยังไม่มีสลิป" renderRow={peekSlip} />
      </span>
    );
  },
};

const CONFIG: MasterCRUDConfig = {
  apiBase:     "/api/payroll/core/",
  apiPath:     "employees",
  tableId:     "payroll-employees",
  moduleKey:   "payroll-employees",
  title:       "พนักงาน (Payroll)",
  icon:        "🪪",
  description: "ทะเบียนพนักงานจริง 78 คน — โมดูลเงินเดือนเวอร์ชันใช้ของกลาง erp",
  uniqueKey:   "employee_code",
  activeField: "active",
  exportEntityType: "payroll_employee",
  searchKeys:  ["employee_code", "first_name", "last_name", "nickname", "full_name", "phone", "scanner_employee_code"],
  permissions: { view: "employees.view", create: "employees.create", edit: "employees.edit" },
  defaultShowAllColumns: true,
  // registry override fields[] เมื่อโหลดสำเร็จ; cellRenderers ประคองของพิเศษไว้
  cellRenderers: employeeCellRenderers,
  // fields[] ด้านล่าง = fallback ถ้าโหลดทะเบียนไม่ได้
  fields: [
    { key: "employee_code", label: "รหัส",        type: "text",   colSize: 100, placeholder: "อัตโนมัติ", groupKey: "core", order: 10 },
    { key: "first_name",    label: "ชื่อ",         type: "text",   colSize: 130, required: true, groupKey: "core", order: 20 },
    { key: "last_name",     label: "นามสกุล",      type: "text",   colSize: 130, groupKey: "core", order: 30 },
    { key: "nickname",      label: "ชื่อเล่น",     type: "text",   colSize: 90,  groupKey: "core", order: 40 },
    { key: "title",         label: "คำนำหน้า",     type: "select", colSize: 90, options: ["นาย", "นาง", "นางสาว", "Mr.", "Mrs.", "Ms."], groupKey: "core", order: 22 },
    { key: "first_name_th", label: "ชื่อ (ไทย)",   type: "text", colSize: 120, groupKey: "core", order: 24 },
    { key: "last_name_th",  label: "นามสกุล (ไทย)", type: "text", colSize: 120, groupKey: "core", order: 26 },
    { key: "first_name_en", label: "ชื่อ (Eng)",   type: "text", colSize: 120, groupKey: "core", order: 28 },
    { key: "last_name_en",  label: "นามสกุล (Eng)", type: "text", colSize: 120, groupKey: "core", order: 29 },
    { key: "department_name", label: "แผนก",       type: "select", colSize: 120, options: DEPARTMENT_NAMES, filterable: true, groupKey: "core", order: 50,
      helpText: "เลือกแผนก — ระบบจะผูกกับ department_id ให้อัตโนมัติ" },
    // สัญญาปัจจุบันของพนักงาน (จาก employee_contracts) — โชว์ความสัมพันธ์พนักงาน ↔ สัญญา
    { key: "current_contract_no", label: "สัญญาปัจจุบัน", type: "text", colSize: 160, readonly: true, hideInForm: true, groupKey: "contract", order: 54,
      cellRender: (v) => v ? <span className="font-mono text-xs">{String(v)}</span> : <span className="text-slate-300">— ไม่มีสัญญา —</span> },
    { key: "current_contract_salary", label: "เงินเดือน(สัญญา)", type: "number", colSize: 120, readonly: true, hideInForm: true, groupKey: "contract", order: 55, cellRender: fmtBaht },
    { key: "employment_status", label: "สถานะ",    type: "select", colSize: 110, options: EMPLOYMENT_STATUS, filterable: true, groupKey: "core", order: 60,
      cellRender: (v) => {
        const s = STATUS_LABEL[String(v)] ?? { th: String(v), cls: "bg-slate-100 text-slate-600" };
        return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>{s.th}</span>;
      } },
    { key: "start_date",    label: "วันเริ่มงาน",  type: "text",   colSize: 110, placeholder: "YYYY-MM-DD", groupKey: "work", order: 70 },
    { key: "phone",         label: "เบอร์โทร",     type: "text",   colSize: 120, groupKey: "work", order: 80 },
    { key: "email",         label: "อีเมล",        type: "text",   colSize: 170, groupKey: "work", order: 90, validations: ["email"] },
    { key: "scanner_employee_code", label: "รหัสสแกน", type: "text", colSize: 90, groupKey: "work", order: 100,
      helpText: "รหัสที่ผูกกับเครื่องสแกนนิ้ว/หน้า (ZKTeco)" },
    { key: "payroll_register_base_salary", label: "เงินเดือนฐาน", type: "number", colSize: 120, groupKey: "pay", order: 110,
      helpText: "ข้อมูลอ่อนไหว — ควรจำกัดสิทธิ์การมองเห็น (Phase 4: field permission)",
      cellRender: fmtBaht },
    { key: "national_id",   label: "เลขบัตร ปชช.", type: "text",   colSize: 130, groupKey: "pay", order: 120, helpText: "ข้อมูลอ่อนไหว" },
    // บัญชีธนาคาร (จากตาราง employee_bank_accounts — บัญชีหลัก)
    { key: "bank_name",        label: "ธนาคาร",     type: "text", colSize: 110, readonly: true, groupKey: "ธนาคาร", order: 400 },
    { key: "bank_account_no",  label: "เลขบัญชี",   type: "text", colSize: 150, readonly: true, groupKey: "ธนาคาร", order: 402, helpText: "ข้อมูลอ่อนไหว" },
    { key: "bank_account_name", label: "ชื่อบัญชี",  type: "text", colSize: 160, readonly: true, groupKey: "ธนาคาร", order: 404 },
    { key: "bank_branch",      label: "สาขา",       type: "text", colSize: 120, readonly: true, groupKey: "ธนาคาร", order: 406 },
    { key: "line_display_name", label: "LINE", type: "text", colSize: 110, readonly: true, groupKey: "work", order: 130,
      helpText: "ชื่อ LINE ที่พนักงานผูกผ่าน portal (แก้ไม่ได้)" },
    { key: "resign_date",   label: "วันลาออก",     type: "text", colSize: 110, placeholder: "YYYY-MM-DD", groupKey: "work", order: 72 },
    { key: "payslip_language", label: "ภาษาสลิป",  type: "select", colSize: 90, options: ["th", "en"], groupKey: "work", order: 135 },
    // ข้อมูลส่วนตัว
    { key: "birth_date",    label: "วันเกิด",      type: "text", colSize: 110, placeholder: "YYYY-MM-DD", groupKey: "ข้อมูลส่วนตัว", order: 200 },
    { key: "gender",        label: "เพศ",          type: "text", colSize: 80,  groupKey: "ข้อมูลส่วนตัว", order: 202 },
    { key: "marital_status", label: "สถานภาพสมรส", type: "text", colSize: 110, groupKey: "ข้อมูลส่วนตัว", order: 204 },
    { key: "nationality",   label: "สัญชาติ",      type: "text", colSize: 90,  groupKey: "ข้อมูลส่วนตัว", order: 206 },
    { key: "address",       label: "ที่อยู่",      type: "textarea", formSpan: 2, groupKey: "ข้อมูลส่วนตัว", order: 208 },
    { key: "emergency_contact_name",  label: "ผู้ติดต่อฉุกเฉิน", type: "text", colSize: 140, groupKey: "ข้อมูลส่วนตัว", order: 210 },
    { key: "emergency_contact_phone", label: "เบอร์ฉุกเฉิน",   type: "text", colSize: 120, groupKey: "ข้อมูลส่วนตัว", order: 212 },
    // เอกสาร / ต่างชาติ
    { key: "passport_no",   label: "เลขพาสปอร์ต",  type: "text", colSize: 120, groupKey: "เอกสาร/ต่างชาติ", order: 220 },
    { key: "visa_no",       label: "เลขวีซ่า",     type: "text", colSize: 120, groupKey: "เอกสาร/ต่างชาติ", order: 222 },
    { key: "work_permit_id", label: "ใบอนุญาตทำงาน", type: "text", colSize: 130, groupKey: "เอกสาร/ต่างชาติ", order: 224 },
    { key: "work_permit_id_expire_date", label: "วันหมด Work Permit", type: "text", colSize: 130, placeholder: "YYYY-MM-DD", groupKey: "เอกสาร/ต่างชาติ", order: 226 },
    // ตำแหน่ง/สังกัด (FK — แสดงผล, แก้ผ่าน picker ภายหลัง)
    { key: "supervisor_name", label: "หัวหน้า", type: "text", colSize: 160, readonly: true, groupKey: "ตำแหน่ง/สังกัด", order: 300 },
    { key: "position_id", label: "ตำแหน่ง (id)", type: "text", colSize: 120, readonly: true, groupKey: "ตำแหน่ง/สังกัด", order: 302 },
    { key: "cost_center_id", label: "ศูนย์ต้นทุน (id)", type: "text", colSize: 120, readonly: true, groupKey: "ตำแหน่ง/สังกัด", order: 304 },
    // ไฟล์แนบ
    { key: "profile_photo_key", label: "รูปโปรไฟล์ (key)", type: "text", colSize: 140, readonly: true, groupKey: "ไฟล์", order: 320 },
    { key: "document_file_key", label: "เอกสารแนบ (key)", type: "text", colSize: 140, readonly: true, groupKey: "ไฟล์", order: 322 },
    // LINE
    { key: "line_user_id",   label: "LINE User ID", type: "text", colSize: 140, readonly: true, groupKey: "LINE", order: 340 },
    { key: "line_picture_url", label: "รูป LINE", type: "text", colSize: 140, readonly: true, groupKey: "LINE", order: 342 },
    { key: "line_linked_at", label: "ผูก LINE เมื่อ", type: "text", colSize: 150, readonly: true, groupKey: "LINE", order: 344 },
    // ระบบ
    { key: "created_at", label: "สร้างเมื่อ", type: "text", colSize: 150, readonly: true, hideInForm: false, groupKey: "ระบบ", order: 360 },
    { key: "updated_at", label: "แก้ล่าสุด", type: "text", colSize: 150, readonly: true, hideInForm: false, groupKey: "ระบบ", order: 362 },
    // เชื่อมความสัมพันธ์: กระโดดไปดูข้อมูลของพนักงานคนนี้ในหน้าอื่น (กรองอัตโนมัติ)
    { key: "id", label: "เชื่อมโยง", type: "text", colSize: 250, sortable: false, hideInForm: true, order: 150,
      cellRender: (v, row) => {
        const id = String(v); const code = String(row?.employee_code ?? ""); const name = String(row?.full_name ?? "");
        return (
        <span className="flex gap-1.5 flex-wrap items-center">
          <ContractPeekCell employeeId={id} employeeCode={code} employeeName={name} />
          <RecordPeekCell label="🔁 ค่าประจำ" title="รายการประจำ" employeeId={id} employeeCode={code} employeeName={name}
            apiPath="/api/payroll/view/recurring" empty="ไม่มีรายการประจำ" renderRow={peekRecurring} />
          <RecordPeekCell label="✅ เงินเดือน" title="ผลคำนวณเงินเดือน" employeeId={id} employeeCode={code} employeeName={name}
            apiPath="/api/payroll/view/payroll-lines" empty="ยังไม่มีบรรทัดเงินเดือน" renderRow={peekLine} />
          <RecordPeekCell label="🧾 สลิป" title="สลิปเงินเดือน" employeeId={id} employeeCode={code} employeeName={name}
            apiPath="/api/payroll/view/payslips" empty="ยังไม่มีสลิป" renderRow={peekSlip} />
        </span>
        );
      } },
  ],
};

export default function PayrollEmployeesPage() {
  return <MasterCRUDPage config={CONFIG} />;
}
