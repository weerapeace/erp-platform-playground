"use client";

/**
 * Payroll — หน้าประวัติพนักงาน (แบบดูง่าย / ลงง่าย)
 *
 * ทำไมมีหน้านี้: ฟอร์มในตารางเป็นช่องยาว ~40 ช่องรวดเดียว กรอกแล้วงง
 * หน้านี้แยกเป็น "การ์ดหมวด" — อ่านง่ายในโหมดดู, กดแก้ทีละการ์ด, บอกด้วยว่ายังกรอกไม่ครบตรงไหน
 *
 * ข้อมูลทั้งหมดมาจาก /api/payroll/employee-profile/<id> (ยิงครั้งเดียวได้ครบ)
 * บันทึกผ่านของเดิม PATCH /api/payroll/core/employees/<id>
 * แท็บสัญญา/รายการประจำ/ใบเตือน ใช้ของกลาง EmployeeRecordsPanel (เพิ่ม/แก้/ลบ ได้)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import { EmployeeRecordsPanel, type EmployeeRecords, type RecordKind } from "@/components/payroll/employee-records-panel";
import { EmployeeSkillsField } from "../../employee-skills-field";
import { BankPicker, bankAccountDigits, useBanks } from "@/components/bank-picker";
import { BankAccountInput } from "@/components/bank-account-input";

const ImageInput = dynamic(() => import("@/components/image-input").then((m) => m.ImageInput), { ssr: false });
const AttachmentPanel = dynamic(() => import("@/components/attachment-panel").then((m) => m.AttachmentPanel), { ssr: false });

type Emp = Record<string, unknown>;
type Opt = { v: string; th: string };
type IdName = { id: string; name: string };
type Options = { departments: IdName[]; positions: IdName[]; employees: IdName[] };

type Profile = {
  employee: Emp;
  department: { id: string; name: string; manager_employee_id: string | null } | null;
  heads_of: IdName[];
  is_department_head: boolean;
  records: EmployeeRecords;
};

const s = (v: unknown) => (v == null ? "" : String(v));
const nn = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const baht = (v: unknown) => (nn(v) > 0 ? `฿${nn(v).toLocaleString("th-TH")}` : "");
const dateTH = (v: unknown) => {
  const raw = s(v); if (!raw) return "";
  const d = new Date(raw); if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
};
const daysUntil = (v: unknown) => {
  const raw = s(v); if (!raw) return null;
  const d = new Date(raw); if (Number.isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - Date.now()) / 86400000);
};
/** อายุ/อายุงาน แบบ "4 ปี 5 เดือน" */
const duration = (from: unknown) => {
  const raw = s(from); if (!raw) return "";
  const d = new Date(raw); if (Number.isNaN(d.getTime())) return "";
  const months = Math.max(0, Math.round((Date.now() - d.getTime()) / 2629800000));
  const y = Math.floor(months / 12), m = months % 12;
  return y > 0 ? `${y} ปี${m ? ` ${m} เดือน` : ""}` : `${m} เดือน`;
};

// ข้อมูลเดิมในฐานข้อมูลมีทั้ง "FEMALE" / "female" / "หญิง" → เทียบแบบไม่สนตัวพิมพ์
const GENDER: Opt[] = [{ v: "male", th: "ชาย" }, { v: "female", th: "หญิง" }];
const GENDER_TH = (v: unknown) => {
  const k = s(v).trim().toLowerCase();
  if (["male", "m", "ชาย"].includes(k)) return "ชาย";
  if (["female", "f", "หญิง"].includes(k)) return "หญิง";
  return s(v);
};
const STATUS: Opt[] = [
  { v: "active", th: "ทำงานอยู่" }, { v: "inactive", th: "ไม่ใช้งาน" },
  { v: "resigned", th: "ลาออก" }, { v: "suspended", th: "พักงาน" },
];
const STATUS_CLS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700", inactive: "bg-slate-100 text-slate-600",
  resigned: "bg-red-100 text-red-700", suspended: "bg-amber-100 text-amber-700",
};
const CONTRACT_TH: Record<string, string> = {
  permanent: "ประจำ", regular_external: "ประจำ (นอกระบบ)", daily: "รายวัน", contractor: "ช่างเหมา", hourly: "รายชั่วโมง",
};
const TITLE_OPTS: Opt[] = ["นาย", "นาง", "นางสาว", "Mr.", "Mrs.", "Ms."].map((v) => ({ v, th: v }));
const LANG: Opt[] = [{ v: "th", th: "ไทย" }, { v: "en", th: "อังกฤษ" }];

type PField = {
  key: string; label: string;
  // bank = ตัวเลือกธนาคาร (ค้นหา/เพิ่มได้) · bank_account = ช่องเลขบัญชีแบบนับหลัก
  type: "text" | "number" | "date" | "select" | "textarea" | "readonly" | "bank" | "bank_account";
  options?: Opt[]; optionsFrom?: "departments" | "positions" | "employees";
  span?: 1 | 2; hint?: string;
  format?: (v: unknown, e: Emp) => string;      // แปลงค่าโชว์ในโหมดดู
};
type Section = { key: string; title: string; icon: string; fields: PField[] };
type BankAccountRow = {
  id: string; bank_name: string; bank_branch: string | null; account_no: string; account_name: string;
  replaced_at: string | null; changed_by_name: string | null; created_at: string;
};

/** การ์ดหมวดในแท็บ "ประวัติ" — ลำดับนี้คือลำดับที่โชว์บนหน้าจอ */
const SECTIONS: Section[] = [
  {
    key: "identity", title: "ชื่อ-สกุล", icon: "🪪",
    fields: [
      { key: "employee_code", label: "รหัสพนักงาน", type: "readonly" },
      { key: "title", label: "คำนำหน้า", type: "select", options: TITLE_OPTS },
      { key: "first_name", label: "ชื่อ", type: "text" },
      { key: "last_name", label: "นามสกุล", type: "text" },
      { key: "nickname", label: "ชื่อเล่น", type: "text" },
      { key: "first_name_th", label: "ชื่อ (ไทย)", type: "text" },
      { key: "last_name_th", label: "นามสกุล (ไทย)", type: "text" },
      { key: "first_name_en", label: "ชื่อ (อังกฤษ)", type: "text" },
      { key: "last_name_en", label: "นามสกุล (อังกฤษ)", type: "text" },
    ],
  },
  {
    key: "personal", title: "ข้อมูลส่วนตัว", icon: "👤",
    fields: [
      { key: "birth_date", label: "วันเกิด", type: "date", format: (v) => (s(v) ? `${dateTH(v)} (${duration(v)})` : "") },
      { key: "gender", label: "เพศ", type: "select", options: GENDER, format: (v) => GENDER_TH(v) },
      { key: "marital_status", label: "สถานภาพสมรส", type: "text" },
      { key: "nationality", label: "สัญชาติ", type: "text" },
      { key: "national_id", label: "เลขบัตรประชาชน", type: "text", hint: "ข้อมูลอ่อนไหว" },
      { key: "address", label: "ที่อยู่", type: "textarea", span: 2 },
    ],
  },
  {
    key: "contact", title: "ติดต่อ / ฉุกเฉิน", icon: "📞",
    fields: [
      { key: "phone", label: "เบอร์โทร", type: "text" },
      { key: "email", label: "อีเมล", type: "text" },
      { key: "emergency_contact_name", label: "ผู้ติดต่อฉุกเฉิน", type: "text" },
      { key: "emergency_contact_phone", label: "เบอร์ฉุกเฉิน", type: "text" },
      { key: "line_display_name", label: "LINE", type: "readonly", hint: "พนักงานผูกเองผ่าน portal" },
    ],
  },
  {
    key: "work", title: "งาน / สังกัด", icon: "🏭",
    fields: [
      { key: "department_id", label: "แผนก", type: "select", optionsFrom: "departments", format: (_v, e) => s(e.department_name) },
      { key: "position_id", label: "ตำแหน่ง", type: "select", optionsFrom: "positions", format: (_v, e) => s(e.position_name) },
      { key: "supervisor_id", label: "หัวหน้าของคนนี้", type: "select", optionsFrom: "employees", format: (_v, e) => s(e.supervisor_name) },
      { key: "employment_status", label: "สถานะการทำงาน", type: "select", options: STATUS },
      { key: "start_date", label: "วันเริ่มงาน", type: "date", format: (v) => (s(v) ? `${dateTH(v)} (อายุงาน ${duration(v)})` : "") },
      { key: "resign_date", label: "วันลาออก", type: "date", format: (v) => dateTH(v) },
      { key: "scanner_employee_code", label: "รหัสเครื่องสแกน", type: "text", hint: "รหัสที่ผูกกับเครื่องสแกนนิ้ว/หน้า" },
      { key: "payslip_language", label: "ภาษาสลิป", type: "select", options: LANG },
    ],
  },
  {
    key: "pay", title: "ค่าจ้าง / ธนาคาร", icon: "💰",
    fields: [
      { key: "payroll_register_base_salary", label: "เงินเดือนฐาน (ทะเบียน)", type: "number", format: (v) => baht(v) },
      { key: "current_contract_salary", label: "เงินเดือนตามสัญญาปัจจุบัน", type: "readonly", format: (v) => baht(v) },
      { key: "bank_name", label: "ธนาคาร", type: "bank" },
      { key: "bank_account_no", label: "เลขบัญชี", type: "bank_account", hint: "ข้อมูลอ่อนไหว · เปลี่ยนบัญชีแล้วบัญชีเดิมถูกเก็บเป็นประวัติ" },
      { key: "bank_account_name", label: "ชื่อบัญชี", type: "text" },
      { key: "bank_branch", label: "สาขา", type: "text" },
    ],
  },
  {
    key: "docs", title: "เอกสาร / ต่างชาติ", icon: "🛂",
    fields: [
      { key: "passport_no", label: "เลขพาสปอร์ต", type: "text" },
      { key: "visa_no", label: "เลขวีซ่า", type: "text" },
      { key: "work_permit_id", label: "ใบอนุญาตทำงาน", type: "text" },
      { key: "work_permit_id_expire_date", label: "วันหมดอายุ Work Permit", type: "date", format: (v) => dateTH(v) },
    ],
  },
];

/** ช่องที่นับว่า "ข้อมูลครบ" (ใช้คิด % และปุ่มดูช่องที่ว่าง) */
const COMPLETENESS_KEYS = [
  "first_name", "last_name", "nickname", "birth_date", "gender", "nationality", "national_id",
  "phone", "address", "emergency_contact_name", "emergency_contact_phone",
  "department_id", "position_id", "start_date", "employment_status",
  "payroll_register_base_salary", "bank_name", "bank_account_no", "profile_photo_key",
];

const TABS: { key: string; label: string; icon: string }[] = [
  { key: "profile", label: "ประวัติ", icon: "📋" },
  { key: "contracts", label: "สัญญา", icon: "📄" },
  { key: "recurring", label: "รายการประจำ", icon: "🔁" },
  { key: "warnings", label: "ใบเตือน", icon: "⚠️" },
  { key: "payroll", label: "เงินเดือน", icon: "✅" },
  { key: "payslips", label: "สลิป", icon: "🧾" },
  { key: "files", label: "ไฟล์แนบ", icon: "📎" },
];

const PAY_STATUS_CLS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600", calculated: "bg-blue-100 text-blue-700", review: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700", paid: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700", issued: "bg-blue-100 text-blue-700", locked: "bg-slate-200 text-slate-700",
};
const PAY_STATUS_TH: Record<string, string> = {
  draft: "ร่าง", calculated: "คำนวณแล้ว", review: "รอตรวจ", approved: "อนุมัติ",
  paid: "จ่ายแล้ว", cancelled: "ยกเลิก", issued: "ออกแล้ว", locked: "ล็อกแล้ว",
};

export default function EmployeeProfilePage() {
  const params = useParams<{ id: string }>();
  const id = s(params?.id);
  const router = useRouter();

  const [p, setP] = useState<Profile | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState("profile");
  const [editKey, setEditKey] = useState<string | null>(null);      // การ์ดที่กำลังแก้
  const [form, setForm] = useState<Emp>({});
  const [saving, setSaving] = useState(false);
  const [opts, setOpts] = useState<Options | null>(null);
  const [showGaps, setShowGaps] = useState(false);                   // ไฮไลต์ช่องที่ยังว่าง
  const [bankHistory, setBankHistory] = useState<BankAccountRow[]>([]);   // บัญชีเดิมที่เคยใช้

  const load = useCallback(async () => {
    setErr(null);
    try {
      const j = await apiFetch(`/api/payroll/employee-profile/${id}`).then((r) => r.json());
      if (j.error) { setErr(j.error); return; }
      setP(j as Profile);
    } catch { setErr("โหลดข้อมูลไม่ได้"); }
  }, [id]);
  useEffect(() => { if (id) void load(); }, [id, load]);

  // ประวัติบัญชีเดิม (บัญชีที่เคยใช้ก่อนเปลี่ยน)
  const loadBankHistory = useCallback(async () => {
    try {
      const j = await apiFetch(`/api/payroll/employee-bank-accounts?employee_id=${id}`).then((r) => r.json());
      if (!j.error) setBankHistory((j.data?.history ?? []) as BankAccountRow[]);
    } catch { /* ไม่มีประวัติก็ไม่เป็นไร */ }
  }, [id]);
  useEffect(() => { if (id) void loadBankHistory(); }, [id, loadBankHistory]);

  // ตัวเลือก (แผนก/ตำแหน่ง/หัวหน้า) — โหลดครั้งเดียวตอนกดแก้ครั้งแรก
  const ensureOptions = useCallback(async () => {
    if (opts) return;
    try {
      const j = await apiFetch(`/api/payroll/employee-profile/${id}?only=options`).then((r) => r.json());
      if (!j.error) setOpts(j.options as Options);
    } catch { /* ปล่อยผ่าน — ช่องจะเป็นตัวเลือกว่าง */ }
  }, [id, opts]);

  const emp = p?.employee ?? {};
  const photo = r2ImageUrl(s(emp.profile_photo_key) || null, 240);

  const filled = useMemo(() => COMPLETENESS_KEYS.filter((k) => s(emp[k]).trim() !== "" && s(emp[k]) !== "0"), [emp]);
  const pct = COMPLETENESS_KEYS.length ? Math.round((filled.length / COMPLETENESS_KEYS.length) * 100) : 0;
  const isGap = (k: string) => COMPLETENESS_KEYS.includes(k) && !filled.includes(k);

  // เตือนของใกล้หมดอายุ (work permit + สัญญาปัจจุบัน)
  const alerts = useMemo(() => {
    const out: string[] = [];
    const wp = daysUntil(emp.work_permit_id_expire_date);
    if (wp != null && wp <= 60) out.push(wp < 0 ? `Work Permit หมดอายุแล้ว (${dateTH(emp.work_permit_id_expire_date)})` : `Work Permit หมดอายุใน ${wp} วัน (${dateTH(emp.work_permit_id_expire_date)})`);
    const cur = (p?.records.contracts ?? []).find((c) => c.is_current === true);
    const ce = daysUntil(cur?.end_date);
    if (ce != null && ce <= 60) out.push(ce < 0 ? `สัญญาปัจจุบันหมดอายุแล้ว (${dateTH(cur?.end_date)})` : `สัญญาปัจจุบันหมดใน ${ce} วัน (${dateTH(cur?.end_date)})`);
    return out;
  }, [emp, p]);

  const startEdit = async (sec: Section) => {
    await ensureOptions();
    const f: Emp = {};
    for (const fl of sec.fields) if (fl.type !== "readonly") f[fl.key] = emp[fl.key] ?? "";
    setForm(f); setEditKey(sec.key); setErr(null);
  };

  const saveSection = async () => {
    // ส่งเฉพาะช่องที่ "แก้จริง" — กันไปเขียนทับช่องที่ไม่ได้แตะ (ว่าง null จะกลายเป็นค่าว่าง "")
    const changed: Emp = {};
    for (const [k, v] of Object.entries(form)) if (s(v) !== s(emp[k])) changed[k] = v;
    if (Object.keys(changed).length === 0) { setEditKey(null); return; }

    setSaving(true); setErr(null);
    try {
      // ช่องธนาคารต้องบันทึกผ่าน employee_bank_accounts (ตารางที่หน้าจอ "อ่าน" จริง)
      // เดิมเขียนลงคอลัมน์ employees.bank_* ซึ่งถูกตารางนั้นทับ → แก้แล้วจอไม่เปลี่ยน
      // และเปลี่ยนบัญชีที่นี่ = บัญชีเดิมถูกเก็บเป็นประวัติให้อัตโนมัติ
      const BANK_KEYS = ["bank_name", "bank_account_no", "bank_account_name", "bank_branch"];
      const bankTouched = BANK_KEYS.some((k) => k in changed);
      if (bankTouched) {
        const bankName = s(form.bank_name ?? emp.bank_name);
        const accountNo = s(form.bank_account_no ?? emp.bank_account_no);
        const accountName = s(form.bank_account_name ?? emp.bank_account_name);
        if (!bankName || !accountNo || !accountName) {
          setErr("บัญชีธนาคารต้องกรอกให้ครบ: ธนาคาร + เลขบัญชี + ชื่อบัญชี");
          return;
        }
        const jb = await apiFetch("/api/payroll/employee-bank-accounts", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employee_id: id, bank_name: bankName, account_no: accountNo,
            account_name: accountName, bank_branch: s(form.bank_branch ?? emp.bank_branch),
          }),
        }).then((r) => r.json());
        if (jb.error) { setErr(jb.error); return; }
        for (const k of BANK_KEYS) delete changed[k];
      }

      if (Object.keys(changed).length > 0) {
        const j = await apiFetch(`/api/payroll/core/employees/${id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changed),
        }).then((r) => r.json());
        if (j.error) { setErr(j.error); return; }
      }
      setEditKey(null);
      await load();
      if (bankTouched) await loadBankHistory();
    } catch { setErr("บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const savePhoto = async (key: string | null) => {
    try {
      await apiFetch(`/api/payroll/core/employees/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile_photo_key: key ?? "" }),
      });
      await load();
    } catch { setErr("บันทึกรูปไม่สำเร็จ"); }
  };

  /** ตั้ง/ยกเลิก "หัวหน้าประจำแผนก" ของแผนกที่คนนี้สังกัด */
  const toggleDeptHead = async () => {
    if (!p?.department) return;
    const nowHead = p.department.manager_employee_id === id;
    setSaving(true); setErr(null);
    try {
      const j = await apiFetch(`/api/payroll/master/departments/${p.department.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manager_employee_id: nowHead ? "" : id }),
      }).then((r) => r.json());
      if (j.error) { setErr(j.error); return; }
      await load();
    } catch { setErr("ตั้งหัวหน้าแผนกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  if (err && !p) return <div className="p-8"><div className="rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm">{err}</div></div>;
  if (!p) return <div className="p-10 text-center text-slate-400 text-sm">กำลังโหลด…</div>;

  const statusKey = s(emp.employment_status);
  const ctype = s(emp.current_contract_type);
  const isDeptHead = p.department?.manager_employee_id === id;

  return (
    <div className="p-4 md:p-6 max-w-[1100px] mx-auto">
      {/* ── หัวหน้า: รูป + ชื่อ + ป้าย + ความครบถ้วน ── */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex flex-col sm:flex-row gap-4 p-4">
          <div className="w-24 shrink-0">
            {editKey === "__photo" ? (
              <div className="w-24">
                <ImageInput value={s(emp.profile_photo_key) || null} folder="employees" compact
                  onChange={(k) => { void savePhoto(k); setEditKey(null); }} />
                <button onClick={() => setEditKey(null)} className="mt-1 w-full text-[11px] text-slate-500 hover:text-slate-700">ปิด</button>
              </div>
            ) : (
              <button onClick={() => setEditKey("__photo")} title="เปลี่ยนรูป"
                className="group relative w-24 h-24 rounded-2xl overflow-hidden bg-slate-100 flex items-center justify-center">
                {photo
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={photo} alt={s(emp.full_name)} className="w-full h-full object-cover" />
                  : <span className="text-3xl text-slate-300">👤</span>}
                <span className="absolute inset-x-0 bottom-0 bg-black/50 text-white text-[10px] py-0.5 opacity-0 group-hover:opacity-100 transition">เปลี่ยนรูป</span>
              </button>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-800 truncate">{s(emp.full_name) || s(emp.nickname) || s(emp.employee_code)}</h1>
              {s(emp.nickname) && <span className="text-sm text-slate-500">({s(emp.nickname)})</span>}
              {ctype && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">{CONTRACT_TH[ctype] ?? ctype}</span>}
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLS[statusKey] ?? "bg-slate-100 text-slate-600"}`}>
                {STATUS.find((o) => o.v === statusKey)?.th ?? statusKey}
              </span>
              {p.heads_of.map((d) => (
                <span key={d.id} className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">⭐ หัวหน้าแผนก{d.name}</span>
              ))}
            </div>
            <div className="text-sm text-slate-500 mt-1 truncate">
              {s(emp.employee_code)}
              {s(emp.department_name) && ` · ${s(emp.department_name)}`}
              {s(emp.position_name) && ` · ${s(emp.position_name)}`}
              {s(emp.supervisor_name) && ` · หัวหน้า: ${s(emp.supervisor_name)}`}
            </div>

            <div className="flex items-center gap-2 mt-3">
              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full ${pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-400" : "bg-rose-400"}`} style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs text-slate-500 whitespace-nowrap">กรอกครบ {pct}%</span>
              <button onClick={() => { setShowGaps((v) => !v); setTab("profile"); }}
                className="h-7 px-2.5 text-xs border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 whitespace-nowrap">
                {showGaps ? "เลิกไฮไลต์" : "ดูช่องที่ว่าง"}
              </button>
            </div>
          </div>

          <div className="flex sm:flex-col gap-2 shrink-0">
            <button onClick={() => void toggleDeptHead()} disabled={!p.department || saving}
              title={p.department ? `ตั้งเป็นหัวหน้าแผนก${p.department.name}` : "ยังไม่ได้ระบุแผนก"}
              className={`h-9 px-3 text-sm rounded-lg border whitespace-nowrap disabled:opacity-40 ${isDeptHead ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
              {isDeptHead ? "⭐ เป็นหัวหน้าแผนกอยู่" : "☆ ตั้งเป็นหัวหน้าแผนก"}
            </button>
            <div className="flex gap-2">
              <Link href="/payroll/board" className="h-9 px-3 inline-flex items-center text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">🗂️ ผัง</Link>
              <button onClick={() => router.push("/payroll/employees")} className="h-9 px-3 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">📋 ตาราง</button>
            </div>
          </div>
        </div>

        {alerts.length > 0 && (
          <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-200 text-sm text-amber-800 flex gap-2 flex-wrap">
            <span>⚠️</span><span>{alerts.join(" · ")}</span>
          </div>
        )}

        {/* แท็บ */}
        <div className="flex gap-1 px-3 py-2 border-t border-slate-100 bg-slate-50/60 overflow-x-auto">
          {TABS.map((t) => {
            const on = t.key === tab;
            const count = t.key === "contracts" ? p.records.contracts.length
              : t.key === "recurring" ? p.records.recurring.filter((r) => s(r.status) === "active").length
              : t.key === "warnings" ? p.records.warnings.filter((r) => s(r.status) === "active").length : null;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-3 h-8 rounded-full text-sm whitespace-nowrap transition ${on ? "bg-white border border-slate-300 text-slate-800 font-medium" : "text-slate-500 hover:text-slate-700"}`}>
                {t.icon} {t.label}{count != null && <span className="ml-1 text-slate-400">{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {err && <div className="mt-3 rounded-lg bg-red-50 text-red-700 px-4 py-2.5 text-sm">{err}</div>}

      {/* ── เนื้อหาแท็บ ── */}
      {tab === "profile" && (
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
          {SECTIONS.map((sec) => (
            <div key={sec.key} className="space-y-3">
              <SectionCard sec={sec} emp={emp} opts={opts}
                editing={editKey === sec.key} form={form} setForm={setForm} saving={saving}
                showGaps={showGaps} isGap={isGap}
                onEdit={() => void startEdit(sec)} onCancel={() => setEditKey(null)} onSave={() => void saveSection()} />
              {/* บัญชีเดิมที่เคยใช้ — โผล่ใต้การ์ดค่าจ้าง/ธนาคาร เมื่อเคยเปลี่ยนบัญชี */}
              {sec.key === "pay" && bankHistory.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="mb-2 text-[13px] font-semibold text-slate-600">🕘 บัญชีเดิมที่เคยใช้ ({bankHistory.length})</h3>
                  <div className="space-y-2">
                    {bankHistory.map((b) => (
                      <div key={b.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                        <div className="font-medium text-slate-700">{b.bank_name}</div>
                        <div className="font-mono text-slate-600">{b.account_no}</div>
                        <div className="text-slate-400">
                          {b.account_name}
                          {b.replaced_at ? ` · เลิกใช้ ${dateTH(b.replaced_at)}` : ""}
                          {b.changed_by_name ? ` · เปลี่ยนโดย ${b.changed_by_name}` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">เก็บไว้อ้างอิงเท่านั้น — การโอนเงินใช้บัญชีหลักด้านบน</p>
                </div>
              )}
            </div>
          ))}

          {/* ทักษะ/ความสามารถ — ช่องติ๊ก (คลังทักษะ 3 ภาษา) ใช้ของกลางตัวเดียวกับ drawer ในตาราง */}
          <SkillsCard
            value={Array.isArray(emp.skills) ? (emp.skills as string[]) : []}
            onSave={async (next) => {
              const j = await apiFetch(`/api/payroll/core/employees/${id}`, {
                method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ skills: next }),
              }).then((r) => r.json());
              if (j.error) { setErr(j.error); return false; }
              await load();
              return true;
            }}
          />
        </div>
      )}

      {(tab === "payroll" || tab === "payslips") && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <PayHistory employeeId={id} kind={tab === "payroll" ? "payroll-lines" : "payslips"} />
        </div>
      )}

      {(tab === "contracts" || tab === "recurring" || tab === "warnings") && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
          <EmployeeRecordsPanel
            employeeId={id}
            employeeName={s(emp.full_name)}
            kinds={[tab as RecordKind]}
            initialRecords={p.records}
            onChanged={() => void load()}
          />
        </div>
      )}

      {tab === "files" && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <AttachmentPanel entityType="payroll-employees" entityId={id} title="📎 ไฟล์แนบ / เอกสาร" />
        </div>
      )}
    </div>
  );
}

/** การ์ด "ทักษะ / ความสามารถ" — ติ๊กเลือกแล้วบันทึกลง employees.skills */
function SkillsCard({ value, onSave }: { value: string[]; onSave: (next: string[]) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>(value);
  const [saving, setSaving] = useState(false);

  const start = () => { setDraft(value); setEditing(true); };
  const save = async () => {
    setSaving(true);
    const ok = await onSave(draft);
    setSaving(false);
    if (ok) setEditing(false);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 lg:col-span-2">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-slate-800 text-[15px]">🛠️ ทักษะ / ความสามารถ</h2>
        {editing ? (
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} disabled={saving} className="h-8 px-3 text-xs border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button>
            <button onClick={() => void save()} disabled={saving} className="h-8 px-3 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "💾 บันทึก"}</button>
          </div>
        ) : (
          <button onClick={start} className="h-8 px-3 text-xs border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">✏️ แก้</button>
        )}
      </div>
      {editing
        ? <EmployeeSkillsField value={draft} onChange={setDraft} />
        : value.length > 0
          ? <EmployeeSkillsField value={value} onChange={() => {}} disabled />
          : <div className="text-sm text-slate-300">ยังไม่ได้ระบุทักษะ</div>}
    </div>
  );
}

/** ประวัติเงินเดือน / สลิป ของพนักงานคนนี้ (อ่านอย่างเดียว — คำนวณจากระบบเงินเดือน) */
function PayHistory({ employeeId, kind }: { employeeId: string; kind: "payroll-lines" | "payslips" }) {
  const [rows, setRows] = useState<Emp[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    setRows(null); setErr(null);
    const flt = encodeURIComponent(JSON.stringify({ employee_id: { type: "text", value: employeeId } }));
    apiFetch(`/api/payroll/view/${kind}?limit=100&filters=${flt}`)
      .then((r) => r.json())
      .then((j) => { if (cancel) return; if (j.error) setErr(j.error); else setRows((j.data ?? []) as Emp[]); })
      .catch(() => { if (!cancel) setErr("โหลดไม่ได้"); });
    return () => { cancel = true; };
  }, [employeeId, kind]);

  const badge = (v: unknown) => {
    const k = s(v);
    return <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${PAY_STATUS_CLS[k] ?? "bg-slate-100 text-slate-600"}`}>{PAY_STATUS_TH[k] ?? (k || "—")}</span>;
  };

  if (err) return <div className="rounded-lg bg-red-50 text-red-700 px-4 py-2.5 text-sm">{err}</div>;
  if (!rows) return <div className="py-8 text-center text-sm text-slate-400">กำลังโหลด…</div>;
  if (rows.length === 0) {
    return <div className="py-8 text-center text-sm text-slate-400">{kind === "payslips" ? "ยังไม่มีสลิปของคนนี้" : "ยังไม่มีผลคำนวณเงินเดือนของคนนี้"}</div>;
  }

  return (
    <div className="space-y-1.5">
      <div className="text-xs text-slate-500 mb-1">{rows.length} รายการ · ข้อมูลจากระบบคำนวณเงินเดือน (แก้ที่หน้างวดเงินเดือน)</div>
      {rows.map((r, i) => (
        <div key={s(r.id) || i} className="rounded-xl border border-slate-200 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-slate-700 truncate">
              {kind === "payslips" ? <span className="font-mono text-xs">{s(r.payslip_no) || "—"}</span> : s(r.period_name) || "—"}
              {kind === "payslips" && s(r.period_name) && <span className="text-slate-400 text-xs"> · {s(r.period_name)}</span>}
            </span>
            {badge(r.status)}
          </div>
          <div className="grid grid-cols-3 gap-2 mt-1.5 text-xs">
            <div><div className="text-slate-400">รายได้รวม</div><span className="tabular-nums">{baht(r.gross_pay) || "—"}</span></div>
            <div><div className="text-slate-400">หัก</div><span className="tabular-nums">{baht(r.total_deduction) || "—"}</span></div>
            <div><div className="text-slate-400">สุทธิ</div><b className="tabular-nums text-slate-800">{baht(r.net_pay) || "—"}</b></div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionCard({
  sec, emp, opts, editing, form, setForm, saving, showGaps, isGap, onEdit, onCancel, onSave,
}: {
  sec: Section; emp: Emp; opts: Options | null;
  editing: boolean; form: Emp; setForm: (f: Emp) => void; saving: boolean;
  showGaps: boolean; isGap: (k: string) => boolean;
  onEdit: () => void; onCancel: () => void; onSave: () => void;
}) {
  const banks = useBanks();   // ใช้หาจำนวนหลักเลขบัญชีของธนาคารที่เลือก
  const optionsOf = (f: PField): Opt[] => {
    const base = f.options ?? (f.optionsFrom && opts ? opts[f.optionsFrom].map((o) => ({ v: o.id, th: o.name })) : []);
    // ค่าที่มีอยู่เดิมในฐานข้อมูลอาจไม่ตรงตัวเลือก (เช่น gender = "FEMALE")
    // → เติมเป็นตัวเลือกให้เห็นค่าจริง กันเผลอกดบันทึกแล้วค่าเดิมหาย
    const cur = s(form[f.key]);
    return cur && !base.some((o) => o.v === cur) ? [...base, { v: cur, th: `${cur} (ค่าเดิม)` }] : base;
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-slate-800 text-[15px]">{sec.icon} {sec.title}</h2>
        {editing ? (
          <div className="flex gap-2">
            <button onClick={onCancel} disabled={saving} className="h-8 px-3 text-xs border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button>
            <button onClick={onSave} disabled={saving} className="h-8 px-3 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "💾 บันทึก"}</button>
          </div>
        ) : (
          <button onClick={onEdit} className="h-8 px-3 text-xs border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">✏️ แก้</button>
        )}
      </div>

      {editing ? (
        <div className="grid grid-cols-2 gap-2">
          {sec.fields.filter((f) => f.type !== "readonly").map((f) => (
            <div key={f.key} className={f.span === 2 || f.type === "textarea" ? "col-span-2" : ""}>
              <label className="block text-[11px] text-slate-500 mb-0.5">{f.label}</label>
              {f.type === "bank" ? (
                <BankPicker
                  value={s(form[f.key])}
                  onChange={(name) => setForm({ ...form, [f.key]: name })}
                />
              ) : f.type === "bank_account" ? (
                <BankAccountInput
                  value={s(form[f.key])}
                  expectedDigits={bankAccountDigits(s(form.bank_name), banks)}
                  onChange={(v) => setForm({ ...form, [f.key]: v })}
                />
              ) : f.type === "select" ? (
                <select value={s(form[f.key])} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  className="w-full h-9 px-2 border border-slate-300 rounded-lg text-sm bg-white">
                  <option value="">— ไม่ระบุ —</option>
                  {optionsOf(f).map((o) => <option key={o.v} value={o.v}>{o.th}</option>)}
                </select>
              ) : f.type === "textarea" ? (
                <textarea value={s(form[f.key])} rows={2} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm" />
              ) : (
                <input type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                  value={s(form[f.key])} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  className="w-full h-9 px-2 border border-slate-300 rounded-lg text-sm" />
              )}
              {f.hint && <div className="text-[10px] text-slate-400 mt-0.5">{f.hint}</div>}
            </div>
          ))}
        </div>
      ) : (
        <div className="divide-y divide-slate-50">
          {sec.fields.map((f) => {
            // ช่องแบบตัวเลือก → โชว์ภาษาไทยตามตัวเลือก (ไม่ใช่ค่าดิบ เช่น "active")
            const asOption = f.type === "select" && f.options ? f.options.find((o) => o.v === s(emp[f.key]))?.th : undefined;
            const shown = f.format ? f.format(emp[f.key], emp) : (asOption ?? s(emp[f.key]));
            const gap = showGaps && isGap(f.key) && !shown;
            return (
              <div key={f.key} className={`flex items-start justify-between gap-3 py-1.5 text-sm ${gap ? "bg-amber-50 -mx-2 px-2 rounded" : ""}`}>
                <span className="text-slate-400 shrink-0">{f.label}</span>
                <span className={`text-right ${shown ? "text-slate-700" : "text-slate-300"} break-words`}>
                  {shown || (gap ? "ยังไม่กรอก" : "—")}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
