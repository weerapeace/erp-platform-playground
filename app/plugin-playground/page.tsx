"use client";

import { useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";

// ---- Plugin Registry Data ----

type PluginStatus = "ready" | "in-progress" | "planned";

type Plugin = {
  id: string;
  name: string;
  nameTH: string;
  icon: string;
  description: string;
  usedBy: string[];
  features: string[];
  status: PluginStatus;
  requiresPermission?: string;
};

const PLUGINS: Plugin[] = [
  {
    id: "table-layout",
    name: "Table Layout Builder",
    nameTH: "ตัวจัดการตาราง",
    icon: "📊",
    description: "ตั้งค่า column, filter, saved view ผ่าน UI โดยไม่ต้องเขียน code — ผลจะมีผลทันทีทุกหน้าที่ใช้ตารางกลาง",
    usedBy: ["Products", "Purchase Request", "Inventory", "Sales"],
    features: ["Column show/hide", "Column reorder", "Saved Views", "Default sort", "Filter presets"],
    status: "in-progress",
    requiresPermission: "settings.table.manage",
  },
  {
    id: "form-layout",
    name: "Form Layout Builder",
    nameTH: "ตัวจัดการฟอร์ม",
    icon: "📝",
    description: "จัด Section, Column, Field order ของฟอร์มผ่าน drag-and-drop — ไม่ต้องแก้ code ทุกครั้งที่ต้องการปรับฟอร์ม",
    usedBy: ["Purchase Request", "Sales Order", "Employee", "Product"],
    features: ["Drag & drop sections", "Field ordering", "Conditional fields", "Required fields", "Help text"],
    status: "planned",
    requiresPermission: "settings.form.manage",
  },
  {
    id: "file-upload",
    name: "File Upload Plugin",
    nameTH: "ระบบแนบไฟล์",
    icon: "📁",
    description: "อัปโหลดไฟล์แบบ drag & drop — กำหนดประเภทไฟล์และขนาดสูงสุด ผูกกับ record โดยอัตโนมัติ",
    usedBy: ["Purchase Request", "Supplier", "Employee", "QC"],
    features: ["Drag & drop upload", "Preview", "Download", "File type validation", "Audit log"],
    status: "planned",
    requiresPermission: "files.upload",
  },
  {
    id: "image-manager",
    name: "Image Manager",
    nameTH: "ตัวจัดการรูปภาพ",
    icon: "🖼️",
    description: "จัดการรูปภาพสินค้า — crop, resize, กำหนดรูปหลัก, จัดลำดับ, และ preview thumbnail",
    usedBy: ["Product", "QC", "Employee"],
    features: ["Crop & resize", "Set primary image", "Reorder images", "Thumbnail preview", "Compress on upload"],
    status: "planned",
    requiresPermission: "files.upload",
  },
  {
    id: "report-builder",
    name: "Report Builder",
    nameTH: "ตัวสร้างรายงาน",
    icon: "🖨️",
    description: "สร้าง PDF template — กำหนด Header, Column, Footer, Logo บริษัท และตัวอย่าง print preview",
    usedBy: ["Purchase Order", "Sales Order", "Invoice", "QC Report"],
    features: ["Template designer", "PDF export", "Print preview", "Company logo", "Thai/EN support"],
    status: "planned",
    requiresPermission: "reports.manage",
  },
  {
    id: "filter-builder",
    name: "Filter Builder",
    nameTH: "ตัวสร้าง Filter",
    icon: "🔎",
    description: "สร้าง filter ที่ซับซ้อน — AND/OR conditions, nested groups, บันทึกเป็น Saved View ได้",
    usedBy: ["Products", "Purchase Request", "Inventory", "Sales", "HR"],
    features: ["AND / OR conditions", "Nested groups", "Date ranges", "Relation filters", "Save as view"],
    status: "in-progress",
    requiresPermission: "tables.view",
  },
  {
    id: "workflow-builder",
    name: "Workflow Builder",
    nameTH: "ตัวสร้าง Workflow",
    icon: "⚙️",
    description: "กำหนด status transition และ approval rule ผ่าน UI — ไม่ต้องเขียน code ทุกครั้งที่ต้องปรับ workflow",
    usedBy: ["Purchase Request", "Sales Order", "Leave Request", "Expense"],
    features: ["Status transitions", "Approval rules", "Notification triggers", "Auto actions", "Multi-level approval"],
    status: "planned",
    requiresPermission: "settings.workflow.manage",
  },
  {
    id: "dashboard-widget",
    name: "Dashboard Widget Builder",
    nameTH: "ตัวสร้าง Dashboard",
    icon: "📈",
    description: "สร้าง widget แสดงข้อมูล KPI, chart, และ summary — แต่ละ Role เห็น dashboard ต่างกันตาม permission",
    usedBy: ["Home Dashboard", "Management View", "Operations View"],
    features: ["KPI cards", "Charts", "Tables", "Role-based widgets", "Drag to arrange"],
    status: "planned",
    requiresPermission: "dashboard.manage",
  },
];

const STATUS_CONFIG: Record<PluginStatus, { label: string; bg: string; color: string; border: string }> = {
  ready:       { label: "พร้อมใช้",     bg: "bg-emerald-50", color: "text-emerald-700", border: "border-emerald-200" },
  "in-progress": { label: "กำลังสร้าง", bg: "bg-blue-50",    color: "text-blue-700",    border: "border-blue-200" },
  planned:     { label: "วางแผนแล้ว",   bg: "bg-slate-50",   color: "text-slate-500",   border: "border-slate-200" },
};

export default function PluginPlaygroundPage() {
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null);
  const [filter, setFilter] = useState<PluginStatus | "all">("all");

  const filtered = filter === "all" ? PLUGINS : PLUGINS.filter((p) => p.status === filter);

  return (
    <PlaygroundShell>
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full text-xs font-medium mb-3">
          ✅ Phase 7 — Plugin System
        </div>
        <h1 className="text-2xl font-bold text-slate-900">🔌 Plugin Playground</h1>
        <p className="text-slate-500 mt-1">ทะเบียน Plugin กลาง — ตัวเสริมที่ใช้ร่วมกันทุก Module</p>
      </div>

      <div className="px-8 py-6 space-y-8">

        {/* Concept */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-blue-900 mb-2">💡 Plugin System คืออะไร?</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
            <div className="bg-red-50 border border-red-100 rounded-lg p-3">
              <p className="text-xs font-semibold text-red-700 mb-1">❌ แบบเก่า</p>
              <ul className="text-xs text-red-600 space-y-1">
                <li>• Products มี image upload ของตัวเอง</li>
                <li>• QC มี image upload ของตัวเอง</li>
                <li>• แก้ที่นึง ที่อื่นไม่เปลี่ยนตาม</li>
                <li>• code ซ้ำ แก้ยาก</li>
              </ul>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
              <p className="text-xs font-semibold text-emerald-700 mb-1">✅ แบบใหม่ (Plugin)</p>
              <ul className="text-xs text-emerald-600 space-y-1">
                <li>• Image Manager plugin ตัวเดียว</li>
                <li>• Products, QC, Employee ใช้ร่วมกัน</li>
                <li>• แก้ที่เดียว ทุก Module ได้รับผล</li>
                <li>• มี permission และ audit log ในตัว</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 flex-wrap">
          {(["all", "ready", "in-progress", "planned"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`h-8 px-3 text-xs font-medium rounded-lg border transition-colors ${
                filter === f
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
              }`}
            >
              {f === "all" ? `ทั้งหมด (${PLUGINS.length})` :
               f === "ready" ? `✅ พร้อมใช้` :
               f === "in-progress" ? `🔄 กำลังสร้าง` : `⏳ วางแผนแล้ว`}
            </button>
          ))}
        </div>

        {/* Plugin grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((plugin) => {
            const sc = STATUS_CONFIG[plugin.status];
            const isSelected = selectedPlugin?.id === plugin.id;
            return (
              <button
                key={plugin.id}
                onClick={() => setSelectedPlugin(isSelected ? null : plugin)}
                className={`text-left p-5 rounded-xl border-2 transition-all ${
                  isSelected
                    ? "border-blue-400 bg-blue-50 shadow-md"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">{plugin.icon}</span>
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">{plugin.nameTH}</p>
                      <p className="text-xs text-slate-400">{plugin.name}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium border flex-shrink-0 ${sc.bg} ${sc.color} ${sc.border}`}>
                    {sc.label}
                  </span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed mb-3">{plugin.description}</p>

                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-xs text-slate-400">ใช้กับ:</span>
                  {plugin.usedBy.map((m) => (
                    <span key={m} className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                      {m}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        {/* Plugin detail panel */}
        {selectedPlugin && (
          <div className="bg-white rounded-xl border-2 border-blue-200 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">{selectedPlugin.icon}</span>
              <div>
                <h3 className="font-bold text-slate-900">{selectedPlugin.nameTH}</h3>
                <p className="text-xs text-slate-400">{selectedPlugin.name}</p>
              </div>
              <span className={`ml-auto px-2.5 py-1 rounded-full text-xs font-semibold border ${
                STATUS_CONFIG[selectedPlugin.status].bg} ${STATUS_CONFIG[selectedPlugin.status].color} ${STATUS_CONFIG[selectedPlugin.status].border
              }`}>
                {STATUS_CONFIG[selectedPlugin.status].label}
              </span>
            </div>

            <p className="text-sm text-slate-600 mb-5">{selectedPlugin.description}</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Features</p>
                <ul className="space-y-1">
                  {selectedPlugin.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-slate-700">
                      <span className="text-emerald-500">✓</span> {f}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">ใช้กับ Module</p>
                <div className="flex flex-wrap gap-2">
                  {selectedPlugin.usedBy.map((m) => (
                    <span key={m} className="bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1 rounded-lg text-xs font-medium">
                      {m}
                    </span>
                  ))}
                </div>
                {selectedPlugin.requiresPermission && (
                  <div className="mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs text-amber-700">
                      🔒 ต้องการสิทธิ์:{" "}
                      <code className="font-mono bg-amber-100 px-1 rounded">{selectedPlugin.requiresPermission}</code>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-4">
          {(["ready", "in-progress", "planned"] as PluginStatus[]).map((s) => {
            const count = PLUGINS.filter((p) => p.status === s).length;
            const sc = STATUS_CONFIG[s];
            return (
              <div key={s} className={`rounded-xl border p-4 text-center ${sc.bg} ${sc.border}`}>
                <p className={`text-2xl font-bold ${sc.color}`}>{count}</p>
                <p className={`text-xs mt-1 ${sc.color}`}>{sc.label}</p>
              </div>
            );
          })}
        </div>

      </div>
    </PlaygroundShell>
  );
}
