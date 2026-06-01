"use client";

import { useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import {
  ERPForm, ERPFormSection, ERPFormField, ERPInput, ERPSelect, ERPTextarea, LineItems,
  type LineItem,
} from "@/components/form";
import { ProductPicker, SupplierPicker, type ProductOption, type SupplierOption } from "@/components/pickers";
import {
  type PRStatus, type ActivityEntry,
  STATUS_CONFIG, STATUS_ACTIONS, getAvailableActions, isTerminalStatus,
  WorkflowStatusBadge, WorkflowDiagram, ActivityTimeline,
} from "@/components/workflow";

// ---- Types ----

type PRItem = {
  id: string; number: string; title: string; department: string;
  requiredDate: string; priority: string; status: PRStatus;
  total: number; createdBy: string; createdAt: string;
  items: LineItem[]; supplier: SupplierOption | null; note: string;
  activity: ActivityEntry[];
};

// ---- Mock data ----

const DEPT_OPTIONS = [
  { value: "purchase", label: "จัดซื้อ" }, { value: "it", label: "ไอที" },
  { value: "hr", label: "HR" }, { value: "finance", label: "บัญชี" },
];
const PRIORITY_OPTIONS = [
  { value: "low", label: "ต่ำ" }, { value: "normal", label: "ปกติ" },
  { value: "high", label: "สูง — เร่งด่วน" }, { value: "urgent", label: "ด่วนมาก" },
];
const ACTION_STYLE: Record<string, string> = {
  primary: "bg-blue-600 text-white hover:bg-blue-700 border-transparent",
  success: "bg-emerald-600 text-white hover:bg-emerald-700 border-transparent",
  danger:  "bg-red-600 text-white hover:bg-red-700 border-transparent",
  warning: "bg-amber-500 text-white hover:bg-amber-600 border-transparent",
  ghost:   "bg-white text-slate-600 hover:bg-slate-50 border-slate-200",
};

const INITIAL_PRS: PRItem[] = [
  {
    id: "1", number: "PR-2026-00043", title: "ขอซื้ออุปกรณ์ไอทีประจำไตรมาส",
    department: "ไอที", requiredDate: "2026-06-10", priority: "high",
    status: "approved", total: 15200, createdBy: "ธนา เก่งมาก", createdAt: "20 พ.ค. 2026",
    items: [], supplier: null, note: "",
    activity: [
      { id: "a1", actor: "ธนา เก่งมาก", role: "Staff (ไอที)", action: "สร้างใบขอซื้อ", toStatus: "draft", timestamp: "20 พ.ค. 2026, 09:00" },
      { id: "a2", actor: "ธนา เก่งมาก", role: "Staff (ไอที)", action: "ส่งใบขอซื้อ", fromStatus: "draft", toStatus: "submitted", timestamp: "20 พ.ค. 2026, 09:30" },
      { id: "a3", actor: "วิชัย มั่นคง", role: "Manager", action: "อนุมัติ", fromStatus: "waiting_approval", toStatus: "approved", comment: "อนุมัติ ตามแผนงบประมาณ", timestamp: "21 พ.ค. 2026, 10:15" },
    ],
  },
  {
    id: "2", number: "PR-2026-00044", title: "ขอซื้อเครื่องเขียนประจำเดือน",
    department: "จัดซื้อ", requiredDate: "2026-06-05", priority: "normal",
    status: "waiting_approval", total: 3450, createdBy: "สุดา รักงาน", createdAt: "25 พ.ค. 2026",
    items: [], supplier: null, note: "",
    activity: [
      { id: "b1", actor: "สุดา รักงาน", role: "Staff (จัดซื้อ)", action: "สร้างใบขอซื้อ", toStatus: "draft", timestamp: "25 พ.ค. 2026, 08:30" },
      { id: "b2", actor: "สุดา รักงาน", role: "Staff (จัดซื้อ)", action: "ส่งใบขอซื้อ", fromStatus: "draft", toStatus: "submitted", timestamp: "25 พ.ค. 2026, 09:00" },
    ],
  },
];

let prCounter = 45;

export default function PurchaseRequestDemoPage() {
  const [view, setView] = useState<"list" | "create" | "detail">("list");
  const [prs, setPRs] = useState<PRItem[]>(INITIAL_PRS);
  const [selectedPR, setSelectedPR] = useState<PRItem | null>(null);

  // Form state
  const [formData, setFormData] = useState({ title: "", department: "", requiredDate: "", priority: "normal", note: "" });
  const [formItems, setFormItems] = useState<LineItem[]>([]);
  const [formSupplier, setFormSupplier] = useState<SupplierOption | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formLoading, setFormLoading] = useState(false);

  // Action dialog
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [actionComment, setActionComment] = useState("");

  const updateForm = (key: string, val: string) => {
    setFormData((prev) => ({ ...prev, [key]: val }));
    if (formErrors[key]) setFormErrors((prev) => ({ ...prev, [key]: "" }));
  };

  const validateForm = () => {
    const errs: Record<string, string> = {};
    if (!formData.title.trim()) errs.title = "กรุณาระบุหัวข้อ";
    if (!formData.department) errs.department = "กรุณาเลือกแผนก";
    if (!formData.requiredDate) errs.requiredDate = "กรุณาระบุวันที่ต้องการ";
    if (formItems.length === 0) errs.items = "กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ";
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreate = () => {
    if (!validateForm()) return;
    setFormLoading(true);
    setTimeout(() => {
      const total = formItems.reduce((s, i) => s + i.qty * i.price, 0);
      const now = new Date().toLocaleString("th-TH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
      const newPR: PRItem = {
        id: String(Date.now()),
        number: `PR-2026-00${prCounter++}`,
        title: formData.title,
        department: DEPT_OPTIONS.find((d) => d.value === formData.department)?.label ?? formData.department,
        requiredDate: formData.requiredDate,
        priority: formData.priority,
        status: "draft",
        total,
        createdBy: "ผู้ใช้ (Demo)",
        createdAt: now,
        items: formItems,
        supplier: formSupplier,
        note: formData.note,
        activity: [{ id: String(Date.now()), actor: "ผู้ใช้ (Demo)", role: "Staff", action: "สร้างใบขอซื้อ", toStatus: "draft", timestamp: now }],
      };
      setPRs((prev) => [newPR, ...prev]);
      setFormLoading(false);
      setFormData({ title: "", department: "", requiredDate: "", priority: "normal", note: "" });
      setFormItems([]); setFormSupplier(null); setFormErrors({});
      setView("list");
    }, 1200);
  };

  const handleSelectPR = (pr: PRItem) => {
    setSelectedPR(pr);
    setActiveActionId(null);
    setActionComment("");
    setView("detail");
  };

  const executeAction = (pr: PRItem, actionId: string, comment: string) => {
    const action = STATUS_ACTIONS[pr.status]?.find((a) => a.id === actionId);
    if (!action) return;
    const now = new Date().toLocaleString("th-TH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const actors: Record<string, string> = { submit: "ผู้ใช้ (Demo)", send_approval: "ผู้ใช้ (Demo)", approve: "วิชัย (Manager)", reject: "วิชัย (Manager)", cancel: "ผู้ใช้ (Demo)" };
    const roles: Record<string, string> = { submit: "Staff", send_approval: "Staff", approve: "Manager", reject: "Manager", cancel: "Staff" };
    const labels: Record<string, string> = { submit: "ส่งใบขอซื้อ", send_approval: "ส่งเพื่ออนุมัติ", approve: "อนุมัติ", reject: "ปฏิเสธ", cancel: "ยกเลิก" };
    const newEntry: ActivityEntry = {
      id: String(Date.now()),
      actor: actors[actionId] ?? "ระบบ",
      role: roles[actionId] ?? "",
      action: labels[actionId] ?? actionId,
      fromStatus: pr.status, toStatus: action.toStatus,
      comment: comment || undefined, timestamp: now,
    };
    const updated = { ...pr, status: action.toStatus, activity: [newEntry, ...pr.activity] };
    setPRs((prev) => prev.map((p) => p.id === pr.id ? updated : p));
    setSelectedPR(updated);
    setActiveActionId(null);
    setActionComment("");
  };

  const handleActionClick = (actionId: string) => {
    const action = STATUS_ACTIONS[selectedPR!.status]?.find((a) => a.id === actionId);
    if (!action) return;
    if (action.requiresComment || action.requiresReason) {
      setActiveActionId(actionId);
      setActionComment("");
    } else {
      executeAction(selectedPR!, actionId, "");
    }
  };

  const statusBadge = (status: PRStatus) => {
    const cfg = STATUS_CONFIG[status];
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
        {cfg.icon} {cfg.labelTH}
      </span>
    );
  };

  return (
    <PlaygroundShell>
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full text-xs font-medium mb-3">
          ✅ Phase 8 — Example Module
        </div>
        <h1 className="text-2xl font-bold text-slate-900">📋 Purchase Request — ตัวอย่าง Module จริง</h1>
        <p className="text-slate-500 mt-1">รวม Form + Picker + Workflow + Audit Log ในหน้าเดียว</p>
      </div>

      <div className="px-8 py-6">

        {/* ===== LIST VIEW ===== */}
        {view === "list" && (
          <div className="space-y-6">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
              <span className="text-xl mt-0.5">🎯</span>
              <div>
                <p className="text-sm font-semibold text-emerald-800">ทุกอย่างทำงานร่วมกันแล้ว!</p>
                <p className="text-sm text-emerald-700 mt-0.5">
                  กด &ldquo;สร้างใบขอซื้อ&rdquo; → กรอกฟอร์ม → บันทึก → ดูในรายการ → คลิกเพื่อดำเนินการ Workflow
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800">รายการใบขอซื้อทั้งหมด ({prs.length})</h2>
              <button
                onClick={() => setView("create")}
                className="h-9 px-4 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                + สร้างใบขอซื้อ
              </button>
            </div>

            <div className="space-y-3">
              {prs.map((pr) => (
                <button
                  key={pr.id}
                  onClick={() => handleSelectPR(pr)}
                  className="w-full bg-white rounded-xl border border-slate-200 shadow-sm p-5 text-left hover:border-blue-300 hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono text-xs font-bold text-slate-600">{pr.number}</span>
                        {statusBadge(pr.status)}
                        <span className="text-xs text-slate-400">{pr.department}</span>
                      </div>
                      <p className="font-semibold text-slate-800 truncate">{pr.title}</p>
                      <p className="text-xs text-slate-400 mt-1">สร้างโดย {pr.createdBy} · {pr.createdAt}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-slate-900">฿{pr.total.toLocaleString("th-TH")}</p>
                      <p className="text-xs text-slate-400 mt-0.5">ต้องการ {pr.requiredDate}</p>
                    </div>
                  </div>
                  {getAvailableActions(pr.status).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-1">
                      <span className="text-xs text-slate-400">ทำได้ต่อไป:</span>
                      {getAvailableActions(pr.status).map((a) => (
                        <span key={a.id} className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{a.icon} {a.labelTH}</span>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ===== CREATE VIEW ===== */}
        {view === "create" && (
          <div className="space-y-6 max-w-3xl">
            <div className="flex items-center gap-3">
              <button onClick={() => setView("list")} className="text-sm text-slate-500 hover:text-slate-700">
                ← กลับ
              </button>
              <h2 className="text-base font-semibold text-slate-800">สร้างใบขอซื้อใหม่</h2>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-900">ใบขอซื้อ (Purchase Request)</h3>
                    <p className="text-xs text-slate-500 mt-0.5">กรอกข้อมูลให้ครบแล้วกด &ldquo;บันทึกใบขอซื้อ&rdquo;</p>
                  </div>
                  <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-full font-mono">DRAFT</span>
                </div>
              </div>
              <div className="px-6 py-6">
                <ERPForm onSubmit={handleCreate} onCancel={() => setView("list")} loading={formLoading} submitText="บันทึกใบขอซื้อ" cancelText="ยกเลิก" isDirty={!!formData.title}>
                  <ERPFormSection title="ข้อมูลทั่วไป" columns={2}>
                    <ERPFormField label="หัวข้อ" required error={formErrors.title} span={2}>
                      <ERPInput value={formData.title} onChange={(e) => updateForm("title", e.target.value)} placeholder="เช่น ขอซื้ออุปกรณ์สำนักงาน มิ.ย." error={!!formErrors.title} />
                    </ERPFormField>
                    <ERPFormField label="แผนก" required error={formErrors.department}>
                      <ERPSelect value={formData.department} onChange={(e) => updateForm("department", e.target.value)} options={DEPT_OPTIONS} placeholder="— เลือกแผนก —" error={!!formErrors.department} />
                    </ERPFormField>
                    <ERPFormField label="วันที่ต้องการ" required error={formErrors.requiredDate}>
                      <ERPInput type="date" value={formData.requiredDate} onChange={(e) => updateForm("requiredDate", e.target.value)} error={!!formErrors.requiredDate} />
                    </ERPFormField>
                    <ERPFormField label="ความเร่งด่วน">
                      <ERPSelect value={formData.priority} onChange={(e) => updateForm("priority", e.target.value)} options={PRIORITY_OPTIONS} />
                    </ERPFormField>
                    <ERPFormField label="ผู้จำหน่าย" hint="ถ้าไม่ระบุ จัดซื้อจะเลือกให้">
                      <SupplierPicker value={formSupplier} onChange={setFormSupplier} />
                    </ERPFormField>
                  </ERPFormSection>
                  <div className="border-t border-slate-100 my-6" />
                  <ERPFormSection title="รายการสินค้า">
                    {formErrors.items && (
                      <div className="col-span-full text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">⚠ {formErrors.items}</div>
                    )}
                    <div className="col-span-full">
                      <LineItems items={formItems} onChange={setFormItems} />
                    </div>
                  </ERPFormSection>
                  <div className="border-t border-slate-100 my-6" />
                  <ERPFormSection title="หมายเหตุ">
                    <ERPFormField label="หมายเหตุ" hint="ข้อมูลเพิ่มเติม" span={2}>
                      <ERPTextarea value={formData.note} onChange={(e) => updateForm("note", e.target.value)} rows={3} placeholder="ระบุเงื่อนไขพิเศษ..." />
                    </ERPFormField>
                  </ERPFormSection>
                </ERPForm>
              </div>
            </div>
          </div>
        )}

        {/* ===== DETAIL VIEW ===== */}
        {view === "detail" && selectedPR && (
          <div className="space-y-6 max-w-3xl">
            <div className="flex items-center gap-3">
              <button onClick={() => setView("list")} className="text-sm text-slate-500 hover:text-slate-700">
                ← กลับรายการ
              </button>
            </div>

            {/* PR Header */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-mono text-sm font-bold text-slate-700">{selectedPR.number}</span>
                  <WorkflowStatusBadge status={selectedPR.status} />
                </div>
                <h2 className="font-semibold text-slate-900 mt-2">{selectedPR.title}</h2>
              </div>
              <div className="px-6 py-5 space-y-5">
                {/* Workflow diagram */}
                <WorkflowDiagram currentStatus={selectedPR.status} />

                {/* Info grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div><p className="text-xs text-slate-400">แผนก</p><p className="text-sm font-medium text-slate-800 mt-0.5">{selectedPR.department}</p></div>
                  <div><p className="text-xs text-slate-400">สร้างโดย</p><p className="text-sm font-medium text-slate-800 mt-0.5">{selectedPR.createdBy}</p></div>
                  <div><p className="text-xs text-slate-400">วันที่ต้องการ</p><p className="text-sm font-medium text-slate-800 mt-0.5">{selectedPR.requiredDate}</p></div>
                  <div><p className="text-xs text-slate-400">ยอดรวม</p><p className="text-sm font-bold text-slate-900 mt-0.5">฿{selectedPR.total.toLocaleString("th-TH")}</p></div>
                </div>

                {/* Actions */}
                {!isTerminalStatus(selectedPR.status) && getAvailableActions(selectedPR.status).length > 0 && (
                  <div>
                    <p className="text-xs text-slate-500 mb-2">การดำเนินการ:</p>
                    <div className="flex flex-wrap gap-2">
                      {getAvailableActions(selectedPR.status).map((action) => (
                        <button
                          key={action.id}
                          onClick={() => handleActionClick(action.id)}
                          className={`h-9 px-4 text-sm font-medium rounded-lg border transition-colors flex items-center gap-1.5 ${ACTION_STYLE[action.variant]}`}
                        >
                          {action.icon} {action.labelTH}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action comment dialog */}
                {activeActionId && (() => {
                  const action = STATUS_ACTIONS[selectedPR.status]?.find((a) => a.id === activeActionId);
                  if (!action) return null;
                  return (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                      <p className="text-sm font-semibold text-slate-800">{action.icon} {action.labelTH}</p>
                      <textarea
                        value={actionComment}
                        onChange={(e) => setActionComment(e.target.value)}
                        rows={2}
                        placeholder={action.requiresReason ? "กรุณาระบุเหตุผล *" : "ความคิดเห็น (ถ้ามี)"}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => { if (action.requiresReason && !actionComment.trim()) return; executeAction(selectedPR, activeActionId, actionComment); }}
                          className={`h-8 px-4 text-xs font-medium rounded-lg border ${ACTION_STYLE[action.variant]}`}
                        >
                          ยืนยัน{action.labelTH}
                        </button>
                        <button onClick={() => setActiveActionId(null)} className="h-8 px-4 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-white">
                          ยกเลิก
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Activity log */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-800 text-sm">📋 Audit Log</h3>
                <p className="text-xs text-slate-500 mt-0.5">ประวัติการดำเนินการทั้งหมด</p>
              </div>
              <div className="px-6 py-5">
                <ActivityTimeline entries={selectedPR.activity} />
              </div>
            </div>
          </div>
        )}

      </div>
    </PlaygroundShell>
  );
}
