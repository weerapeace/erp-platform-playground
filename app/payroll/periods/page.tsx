"use client";

/**
 * Payroll module — งวดเงินเดือน (Phase 2) — ของจริง 8 งวด
 * ต่อ payroll_periods ผ่าน /api/payroll/master/periods (route กลาง)
 */
import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";
import { apiFetch } from "@/lib/api";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const COMPANY_NAMES = ["ไอ.เอส.จี. เทรดดิ้ง", "หลุยส์ มอนตินี่"];
const PERIOD_STATUS = ["draft", "review", "approved", "locked", "paid", "cancelled"];
const STATUS_LABEL: Record<string, { th: string; cls: string }> = {
  draft:     { th: "ร่าง",       cls: "bg-slate-100 text-slate-600" },
  review:    { th: "รอตรวจ",     cls: "bg-amber-100 text-amber-700" },
  approved:  { th: "อนุมัติ",    cls: "bg-blue-100 text-blue-700" },
  locked:    { th: "ล็อกแล้ว",   cls: "bg-purple-100 text-purple-700" },
  paid:      { th: "จ่ายแล้ว",   cls: "bg-emerald-100 text-emerald-700" },
  cancelled: { th: "ยกเลิก",     cls: "bg-red-100 text-red-700" },
};

// แสดงสถานะงวดเป็น badge สี — เก็บไว้ที่ cellRenderers เพราะ registry mode อ่านจากตรงนี้
const renderStatus = (v: unknown) => {
  const s = STATUS_LABEL[String(v)] ?? { th: String(v), cls: "bg-slate-100 text-slate-600" };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>{s.th}</span>;
};

const CONFIG: MasterCRUDConfig = {
  apiBase: "/api/payroll/master/", apiPath: "periods", tableId: "payroll-periods-master",
  moduleKey: "payroll-periods",
  title: "งวดเงินเดือน (Payroll)", icon: "🗓️",
  description: "งวดเงินเดือนจริง 8 งวด — โมดูลเงินเดือนเวอร์ชันใช้ของกลาง erp",
  uniqueKey: "period_name", activeField: "active", exportEntityType: "payroll_period",
  searchKeys: ["period_name", "company_name"],
  permissions: { view: "employees.view", create: "employees.create", edit: "employees.edit" },
  defaultShowAllColumns: true,
  allowPermanentDelete: false,
  extraBulkActions: [
    {
      label: "🧪 ลบงวดทดสอบ",
      variant: "danger",
      onClick: async (selected) => {
        if (selected.length === 0) return;
        const names = selected.map((r) => String(r.period_name ?? r.name ?? r.id)).slice(0, 5).join("\n- ");
        const ans = window.prompt(`ลบงวดทดสอบ ${selected.length} รายการ\n\nระบบจะลบได้เฉพาะงวดที่เป็น test/demo/ทดสอบ และไม่มีข้อมูลเงินเดือนผูกอยู่\n\n- ${names}${selected.length > 5 ? "\n- ..." : ""}\n\nพิมพ์ "ลบงวดทดสอบ" เพื่อยืนยัน:`);
        if (ans == null) return;
        if (ans.trim() !== "ลบงวดทดสอบ") {
          window.alert('ยกเลิก: ต้องพิมพ์ "ลบงวดทดสอบ" ให้ตรง');
          return;
        }
        const res = await apiFetch("/api/payroll/periods/test-delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: selected.map((r) => r.id) }),
        });
        const json = await res.json();
        if (json.error && !json.data) throw new Error(json.error);
        const deleted = json.data?.deleted?.length ?? 0;
        const failed = json.data?.failed ?? [];
        if (failed.length) {
          window.alert(`ลบงวดทดสอบได้ ${deleted} รายการ\nลบไม่ได้ ${failed.length} รายการ\n\nรายการแรก: ${failed[0]?.name ?? failed[0]?.id}\nเหตุผล: ${failed[0]?.reason}`);
          return;
        }
        window.alert(`ลบงวดทดสอบแล้ว ${deleted} รายการ`);
      },
    },
    {
      label: "🗑 ลบงวดพร้อมข้อมูลคำนวณ",
      variant: "danger",
      onClick: async (selected) => {
        if (selected.length === 0) return;
        const names = selected.map((r) => String(r.period_name ?? r.name ?? r.id)).slice(0, 8).join("\n- ");
        const ans = window.prompt(
          `ลบงวดพร้อมข้อมูลคำนวณ ${selected.length} รายการ\n\n` +
          "ระบบจะลบข้อมูลในงวดนี้ด้วย เช่น รอบคำนวณ, รายการเงินเดือน, สลิป, สาย/ขาด/ลา/OT, เพิ่ม/หัก, วันหยุดงวด, ชุดจ่ายเงิน\n\n" +
          "ใช้สำหรับลบงวด test ที่สร้างผิดเท่านั้น และงวดสถานะ paid จะไม่ถูกลบจากปุ่มนี้\n\n" +
          `- ${names}${selected.length > 8 ? "\n- ..." : ""}\n\n` +
          'พิมพ์ "ลบงวดพร้อมข้อมูล" เพื่อยืนยัน:'
        );
        if (ans == null) return;
        if (ans.trim() !== "ลบงวดพร้อมข้อมูล") {
          window.alert('ยกเลิก: ต้องพิมพ์ "ลบงวดพร้อมข้อมูล" ให้ตรง');
          return;
        }
        const res = await apiFetch("/api/payroll/periods/purge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: selected.map((r) => r.id), confirm_text: ans.trim() }),
        });
        const json = await res.json();
        if (!res.ok || (json.error && !json.data)) throw new Error(json.error ?? `ลบไม่สำเร็จ (HTTP ${res.status})`);
        const deleted = json.data?.deleted ?? [];
        const failed = json.data?.failed ?? [];
        const deletedNames = deleted.map((r: { name?: string | null }) => r.name ?? "").filter(Boolean).slice(0, 5).join("\n- ");
        if (failed.length) {
          window.alert(
            `ลบสำเร็จ ${deleted.length} รายการ\nลบไม่ได้ ${failed.length} รายการ\n\n` +
            `รายการที่ลบได้:${deletedNames ? `\n- ${deletedNames}` : " -"}\n\n` +
            `รายการแรกที่ลบไม่ได้: ${failed[0]?.name ?? failed[0]?.id}\nเหตุผล: ${failed[0]?.reason}`
          );
          return;
        }
        window.alert(`ลบงวดพร้อมข้อมูลแล้ว ${deleted.length} รายการ${deletedNames ? `\n\n- ${deletedNames}` : ""}`);
      },
    },
  ],
  // ของพิเศษ (badge สถานะ) — registry mode merge ตาม field key
  cellRenderers: { status: renderStatus },
  fields: [
    { key: "period_name",  label: "ชื่องวด",   type: "text", colSize: 200, required: true, formSpan: 2, groupKey: "core", order: 10 },
    { key: "company_name", label: "บริษัท",    type: "select", colSize: 150, options: COMPANY_NAMES, filterable: true, groupKey: "core", order: 20 },
    { key: "start_date",   label: "เริ่มงวด",  type: "text", colSize: 110, placeholder: "YYYY-MM-DD", required: true, groupKey: "core", order: 30 },
    { key: "end_date",     label: "สิ้นงวด",   type: "text", colSize: 110, placeholder: "YYYY-MM-DD", required: true, groupKey: "core", order: 40 },
    { key: "payment_date", label: "วันจ่าย",   type: "text", colSize: 110, placeholder: "YYYY-MM-DD", groupKey: "core", order: 50 },
    { key: "default_work_days",     label: "วันทำงาน", type: "number", colSize: 90, groupKey: "calc", order: 60 },
    { key: "default_hours_per_day", label: "ชม./วัน",  type: "number", colSize: 80, groupKey: "calc", order: 70 },
    { key: "status", label: "สถานะ", type: "select", colSize: 110, options: PERIOD_STATUS, filterable: true, groupKey: "core", order: 80,
      cellRender: (v) => {
        const s = STATUS_LABEL[String(v)] ?? { th: String(v), cls: "bg-slate-100 text-slate-600" };
        return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>{s.th}</span>;
      } },
    // เวลา workflow (อ่านอย่างเดียว — ระบบบันทึกตอนล็อก/จ่าย/ซิงก์)
    { key: "locked_at",        label: "ล็อกเมื่อ",     type: "text", colSize: 150, readonly: true, hideInForm: true, groupKey: "workflow", order: 90 },
    { key: "paid_at",          label: "จ่ายเมื่อ",     type: "text", colSize: 150, readonly: true, hideInForm: true, groupKey: "workflow", order: 92 },
    { key: "synced_to_odoo_at", label: "ซิงก์ Odoo เมื่อ", type: "text", colSize: 150, readonly: true, hideInForm: true, groupKey: "workflow", order: 94 },
  ],
};

export default function PayrollPeriodsPage() {
  return <MasterCRUDPage config={CONFIG} />;
}
