"use client";

import { useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import {
  type PRStatus, type ActivityEntry,
  STATUS_CONFIG, STATUS_ACTIONS,
  getAvailableActions, isTerminalStatus,
  WorkflowStatusBadge, WorkflowDiagram, ActivityTimeline,
} from "@/components/workflow";

// ---- Mock PR document ----

const MOCK_PR = {
  number: "PR-2026-00045",
  title: "ขอซื้ออุปกรณ์สำนักงานประจำเดือน มิ.ย.",
  department: "ไอที",
  requiredDate: "2026-06-15",
  total: 12500,
  items: [
    { name: "กระดาษ A4 80gsm",  qty: 10, unit: "รีม",  price: 120 },
    { name: "หมึกปริ้นเตอร์ HP", qty: 5,  unit: "ชิ้น", price: 650 },
    { name: "เมาส์ USB Optical", qty: 3,  unit: "ชิ้น", price: 199 },
  ],
};

const INITIAL_ACTIVITY: ActivityEntry[] = [
  {
    id: "1", actor: "สมชาย ใจดี", role: "Staff (จัดซื้อ)",
    action: "สร้างใบขอซื้อ", toStatus: "draft",
    timestamp: "29 พ.ค. 2026, 09:00",
  },
];

// ---- Action button styles ----

const ACTION_STYLE: Record<string, string> = {
  primary: "bg-blue-600 text-white hover:bg-blue-700 border-transparent",
  success: "bg-emerald-600 text-white hover:bg-emerald-700 border-transparent",
  danger:  "bg-red-600 text-white hover:bg-red-700 border-transparent",
  warning: "bg-amber-500 text-white hover:bg-amber-600 border-transparent",
  ghost:   "bg-white text-slate-600 hover:bg-slate-50 border-slate-200",
};

export default function WorkflowPlaygroundPage() {
  const [status, setStatus] = useState<PRStatus>("draft");
  const [activity, setActivity] = useState<ActivityEntry[]>(INITIAL_ACTIVITY);

  // Dialog state
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [commentError, setCommentError] = useState("");

  const actions = getAvailableActions(status);

  const handleAction = (actionId: string) => {
    const action = actions.find((a) => a.id === actionId);
    if (!action) return;
    if (action.requiresComment || action.requiresReason) {
      setActiveAction(actionId);
      setComment("");
      setCommentError("");
    } else {
      executeAction(action.id, "");
    }
  };

  const executeAction = (actionId: string, userComment: string) => {
    const action = actions.find((a) => a.id === actionId);
    if (!action) return;

    const actors: Record<string, string> = {
      submit: "สมชาย ใจดี", send_approval: "สมชาย ใจดี",
      approve: "วิชัย มั่นคง (Manager)", reject: "วิชัย มั่นคง (Manager)",
      cancel: "สมชาย ใจดี",
    };
    const roles: Record<string, string> = {
      submit: "Staff (จัดซื้อ)", send_approval: "Staff (จัดซื้อ)",
      approve: "Manager (อนุมัติ)", reject: "Manager (อนุมัติ)",
      cancel: "Staff (จัดซื้อ)",
    };
    const actionLabels: Record<string, string> = {
      submit: "ส่งใบขอซื้อ", send_approval: "ส่งเพื่ออนุมัติ",
      approve: "อนุมัติใบขอซื้อ", reject: "ปฏิเสธใบขอซื้อ",
      cancel: "ยกเลิกใบขอซื้อ",
    };

    const newEntry: ActivityEntry = {
      id: String(Date.now()),
      actor: actors[actionId] ?? "ระบบ",
      role: roles[actionId] ?? "",
      action: actionLabels[actionId] ?? actionId,
      fromStatus: status,
      toStatus: action.toStatus,
      comment: userComment || undefined,
      timestamp: new Date().toLocaleString("th-TH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
    };

    setStatus(action.toStatus);
    setActivity((prev) => [newEntry, ...prev]);
    setActiveAction(null);
    setComment("");
  };

  const handleDialogConfirm = () => {
    const action = actions.find((a) => a.id === activeAction);
    if (!action) return;
    if ((action.requiresComment || action.requiresReason) && !comment.trim()) {
      setCommentError(action.requiresReason ? "กรุณาระบุเหตุผล" : "กรุณาใส่ความคิดเห็น");
      return;
    }
    executeAction(activeAction!, comment.trim());
  };

  const handleReset = () => {
    setStatus("draft");
    setActivity(INITIAL_ACTIVITY);
    setActiveAction(null);
    setComment("");
  };

  return (
    <PlaygroundShell>
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full text-xs font-medium mb-3">
          ✅ Phase 7 — Workflow & Approval
        </div>
        <h1 className="text-2xl font-bold text-slate-900">⚙️ Workflow Playground</h1>
        <p className="text-slate-500 mt-1">จำลอง Purchase Request ไหลผ่าน Draft → Submit → อนุมัติ/ปฏิเสธ</p>
      </div>

      <div className="px-8 py-6 space-y-8">

        {/* Concept */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-blue-900 mb-2">💡 Workflow คืออะไร?</h2>
          <p className="text-sm text-blue-700">
            Workflow กำหนดเส้นทางที่เอกสารต้องผ่าน — จาก Draft ไปสู่ Approved
            ระบบบังคับให้เอกสารผ่านขั้นตอนตามลำดับ ไม่สามารถข้ามขั้นได้
            และทุกการเปลี่ยนสถานะจะถูกบันทึกใน Audit Log อัตโนมัติ
          </p>
        </div>

        {/* Workflow diagram */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-base font-semibold text-slate-900">เส้นทาง Workflow</h2>
            <button
              onClick={handleReset}
              className="h-7 px-3 text-xs text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              🔄 Reset
            </button>
          </div>
          <div className="px-6 py-4">
            <WorkflowDiagram currentStatus={status} />
          </div>
        </div>

        {/* PR Document Card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-bold text-slate-700">{MOCK_PR.number}</span>
              <WorkflowStatusBadge status={status} />
            </div>
            {isTerminalStatus(status) && (
              <span className="text-xs text-slate-400 italic">เอกสารปิดแล้ว — ไม่สามารถแก้ไขได้</span>
            )}
          </div>

          <div className="px-6 py-5">
            {/* PR Info */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
              <div><p className="text-xs text-slate-400">หัวข้อ</p><p className="text-sm text-slate-800 mt-0.5">{MOCK_PR.title}</p></div>
              <div><p className="text-xs text-slate-400">แผนก</p><p className="text-sm text-slate-800 mt-0.5">{MOCK_PR.department}</p></div>
              <div><p className="text-xs text-slate-400">วันที่ต้องการ</p><p className="text-sm text-slate-800 mt-0.5">{MOCK_PR.requiredDate}</p></div>
              <div><p className="text-xs text-slate-400">ยอดรวม</p><p className="text-sm font-bold text-slate-900 mt-0.5">฿{MOCK_PR.total.toLocaleString("th-TH")}</p></div>
            </div>

            {/* Items */}
            <div className="overflow-x-auto rounded-lg border border-slate-200 mb-5">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">สินค้า</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 w-20">จำนวน</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 w-16">หน่วย</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 w-28">ราคา/หน่วย</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 w-28">รวม</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {MOCK_PR.items.map((item, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-800">{item.name}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{item.qty}</td>
                      <td className="px-3 py-2 text-slate-500">{item.unit}</td>
                      <td className="px-3 py-2 text-right text-slate-700">฿{item.price.toLocaleString("th-TH")}</td>
                      <td className="px-3 py-2 text-right font-medium text-slate-800">฿{(item.qty * item.price).toLocaleString("th-TH")}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50">
                  <tr>
                    <td colSpan={4} className="px-3 py-2 text-right text-xs font-semibold text-slate-600">ยอดรวม</td>
                    <td className="px-3 py-2 text-right font-bold text-slate-900">฿{MOCK_PR.total.toLocaleString("th-TH")}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Action buttons */}
            {actions.length > 0 ? (
              <div>
                <p className="text-xs text-slate-500 mb-2">การดำเนินการที่ทำได้ในสถานะนี้:</p>
                <div className="flex flex-wrap gap-2">
                  {actions.map((action) => (
                    <button
                      key={action.id}
                      onClick={() => handleAction(action.id)}
                      className={`h-9 px-4 text-sm font-medium rounded-lg border transition-colors flex items-center gap-1.5 ${ACTION_STYLE[action.variant]}`}
                    >
                      <span>{action.icon}</span>
                      {action.labelTH}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className={`px-4 py-3 rounded-xl text-sm font-medium border ${
                STATUS_CONFIG[status].bg} ${STATUS_CONFIG[status].color} ${STATUS_CONFIG[status].border
              }`}>
                {STATUS_CONFIG[status].icon} เอกสารอยู่ในสถานะ &ldquo;{STATUS_CONFIG[status].labelTH}&rdquo; — ไม่มีการดำเนินการเพิ่มเติม
              </div>
            )}
          </div>
        </div>

        {/* Comment dialog (inline) */}
        {activeAction && (() => {
          const action = actions.find((a) => a.id === activeAction);
          if (!action) return null;
          return (
            <div className="bg-white rounded-xl border-2 border-blue-200 shadow-lg p-6 space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">{action.icon}</span>
                <h3 className="text-base font-semibold text-slate-900">
                  {action.labelTH} — {action.requiresReason ? "ระบุเหตุผล" : "เพิ่มความคิดเห็น"}
                </h3>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  {action.requiresReason ? "เหตุผล" : "ความคิดเห็น (ถ้ามี)"}
                  {action.requiresReason && <span className="text-red-500 ml-0.5">*</span>}
                </label>
                <textarea
                  value={comment}
                  onChange={(e) => { setComment(e.target.value); setCommentError(""); }}
                  rows={3}
                  placeholder={action.requiresReason ? "กรุณาระบุเหตุผล..." : "ความคิดเห็นเพิ่มเติม..."}
                  className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 resize-none ${
                    commentError ? "border-red-300 focus:ring-red-400" : "border-slate-200 focus:ring-blue-400"
                  }`}
                />
                {commentError && <p className="text-xs text-red-600 mt-1">⚠ {commentError}</p>}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleDialogConfirm}
                  className={`h-9 px-5 text-sm font-medium rounded-lg border transition-colors ${ACTION_STYLE[action.variant]}`}
                >
                  {action.icon} ยืนยัน{action.labelTH}
                </button>
                <button
                  onClick={() => setActiveAction(null)}
                  className="h-9 px-5 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          );
        })()}

        {/* Activity log */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-900">📋 Audit Log — ประวัติการดำเนินการ</h2>
            <p className="text-xs text-slate-500 mt-0.5">ทุกการเปลี่ยนสถานะถูกบันทึกอัตโนมัติ</p>
          </div>
          <div className="px-6 py-5">
            <ActivityTimeline entries={activity} />
          </div>
        </div>

        {/* Feature checklist */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Feature Checklist</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {[
              { done: true,  label: "Status transitions (6 สถานะ)" },
              { done: true,  label: "Available actions by status" },
              { done: true,  label: "Comment / Reason dialog" },
              { done: true,  label: "Audit log / Activity feed" },
              { done: true,  label: "Workflow diagram" },
              { done: true,  label: "Terminal state detection" },
              { done: false, label: "ต่อ Supabase จริง" },
              { done: false, label: "Multi-step approval" },
              { done: false, label: "Approval by amount" },
              { done: false, label: "Email / Line notification" },
              { done: false, label: "Approval delegate" },
              { done: false, label: "Workflow builder UI" },
            ].map((item) => (
              <div key={item.label} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                item.done ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-400"
              }`}>
                <span>{item.done ? "✅" : "⬜"}</span>
                {item.label}
              </div>
            ))}
          </div>
        </div>

      </div>
    </PlaygroundShell>
  );
}
