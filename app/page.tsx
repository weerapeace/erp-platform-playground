import Link from "next/link";

const phases = [
  { number: 1, title: "ERP Platform Skeleton", titleTH: "โครงสร้างโปรเจกต์", status: "done" },
  { number: 2, title: "Playground App", titleTH: "เว็บ preview ของกลาง", status: "done" },
  { number: 3, title: "Design System", titleTH: "ระบบดีไซน์", status: "done" },
  { number: 4, title: "Component Library", titleTH: "คลังชิ้นส่วนกลาง", status: "done" },
  { number: 5, title: "Universal DataTable", titleTH: "ตารางกลาง", status: "done" },
  { number: 6, title: "Form / Modal / Picker", titleTH: "ฟอร์ม, Popup, ตัวเลือก", status: "done" },
  { number: 7, title: "ERP Core Logic", titleTH: "Permission, Audit, Workflow", status: "done" },
  { number: 8, title: "Example Modules", titleTH: "Products + Purchase Request", status: "done" },
];

const sections = [
  {
    id: "design-system",
    icon: "🎨",
    title: "Design System",
    titleTH: "ระบบดีไซน์",
    description: "สี, ตัวอักษร, ระยะห่าง, สถานะ — มาตรฐานหน้าตาทั้งระบบ",
    features: ["Colors & Status Colors", "Typography Scale", "Spacing & Radius", "Shadow & Z-index"],
    phase: 3,
    status: "ready",
    href: "/design-system",
  },
  {
    id: "components-preview",
    icon: "🧩",
    title: "UI Components",
    titleTH: "ชิ้นส่วน UI",
    description: "Button, Input, Badge, Tabs, Toast — ชิ้นส่วนพื้นฐานที่ทุกหน้าใช้ร่วมกัน",
    features: ["Button (ทุก variant)", "Input & Select", "Badge & Tabs", "Toast & Loading"],
    phase: 4,
    status: "ready",
    href: "/components-preview",
  },
  {
    id: "table-playground",
    icon: "📊",
    title: "Universal DataTable",
    titleTH: "ตารางกลาง",
    description: "ตารางเดียวสำหรับทุกโมดูล — ค้นหา, กรอง, จัดเรียง, จัดคอลัมน์ได้",
    features: ["Search + Filter + Sort", "Column Manager", "Saved Views", "Bulk Edit + Export"],
    phase: 5,
    status: "ready",
    href: "/table-playground",
  },
  {
    id: "form-playground",
    icon: "📝",
    title: "Form System",
    titleTH: "ฟอร์มกลาง",
    description: "ฟอร์มเดียวสำหรับทุกโมดูล — Validation, Sections, Line Items",
    features: ["Validation + Required", "Sections + Columns", "Line Items", "Unsaved Changes Warning"],
    phase: 6,
    status: "ready",
    href: "/form-playground",
  },
  {
    id: "popup-playground",
    icon: "🪟",
    title: "Modals & Popups",
    titleTH: "Popup กลาง",
    description: "Modal, Drawer, ConfirmDialog — Popup มาตรฐานที่ใช้แทนการสร้างใหม่ทุกครั้ง",
    features: ["ERPModal + Drawer", "ConfirmDialog", "Unsaved Changes", "Danger Action"],
    phase: 6,
    status: "ready",
    href: "/popup-playground",
  },
  {
    id: "picker-playground",
    icon: "🔍",
    title: "Pickers",
    titleTH: "ตัวเลือกข้อมูล",
    description: "ProductPicker, SupplierPicker, EmployeePicker — ค้นหาและเลือกข้อมูลจากระบบ",
    features: ["ProductPicker", "SupplierPicker", "EmployeePicker", "Form Integration"],
    phase: 6,
    status: "ready",
    href: "/picker-playground",
  },
  {
    id: "plugin-playground",
    icon: "🔌",
    title: "Plugins",
    titleTH: "ระบบ Plugin",
    description: "Table Builder, Form Builder, Report Builder — ตัวเสริมที่เสียบกับระบบกลาง",
    features: ["Plugin Registry", "Table Layout Builder", "Filter Builder", "Workflow Builder"],
    phase: 7,
    status: "ready",
    href: "/plugin-playground",
  },
  {
    id: "permission-preview",
    icon: "🔒",
    title: "Permissions",
    titleTH: "ระบบสิทธิ์",
    description: "ควบคุมว่าใครทำอะไรได้บ้าง — เลือก Role แล้วดูว่าเห็นอะไรได้บ้าง",
    features: ["Role-based permissions", "Field-level permissions", "Live table demo", "Utility functions"],
    phase: 7,
    status: "ready",
    href: "/permission-preview",
  },
  {
    id: "workflow-playground",
    icon: "⚙️",
    title: "Workflow & Approval",
    titleTH: "ระบบอนุมัติ",
    description: "จำลอง PR ไหลผ่าน Draft → Submit → Approve/Reject — พร้อม Audit Log",
    features: ["Status Transitions", "Approval Dialog", "Audit Log", "Activity Timeline"],
    phase: 7,
    status: "ready",
    href: "/workflow-playground",
  },
  {
    id: "file-upload-preview",
    icon: "📁",
    title: "Files & Images",
    titleTH: "ไฟล์และรูปภาพ",
    description: "อัปโหลด, Preview, Image Manager — ใช้แนบไฟล์กับทุกโมดูล",
    features: ["Drag & Drop Upload", "Image Manager", "Upload Progress", "File Preview"],
    phase: 8,
    status: "ready",
    href: "/file-upload-preview",
  },
  {
    id: "report-preview",
    icon: "🖨️",
    title: "Reports & Print",
    titleTH: "รายงานและพิมพ์",
    description: "PDF Template, Print Preview — ใช้กับ PO, Invoice, QC Report",
    features: ["PDF Export", "Print Preview", "Template selector", "VAT calculation"],
    phase: 8,
    status: "ready",
    href: "/report-preview",
  },
  {
    id: "products-demo",
    icon: "📦",
    title: "Products Module",
    titleTH: "โมดูลสินค้า",
    description: "ตัวอย่างโมดูลสินค้าจริง — ใช้ DataTable กลาง พร้อม Saved Views, Bulk Actions, Row Actions",
    features: ["Universal DataTable", "Saved Views (4 views)", "Bulk Actions", "Row Actions"],
    phase: 8,
    status: "ready",
    href: "/products-demo",
  },
  {
    id: "purchase-request-demo",
    icon: "📋",
    title: "Purchase Request Module",
    titleTH: "โมดูลใบขอซื้อ",
    description: "ตัวอย่างโมดูล PR จริง — สร้าง → Submit → Approve/Reject พร้อม Audit Log",
    features: ["Create Form + Pickers", "Workflow transitions", "Audit Log", "Multi-view (List/Create/Detail)"],
    phase: 8,
    status: "ready",
    href: "/purchase-request-demo",
  },
];

const phaseStatusStyle = {
  done: "bg-emerald-100 text-emerald-700 border-emerald-200",
  active: "bg-blue-100 text-blue-700 border-blue-200",
  upcoming: "bg-slate-100 text-slate-500 border-slate-200",
};

const phaseIcon = {
  done: "✅",
  active: "🔄",
  upcoming: "⏳",
};

export default function PlaygroundPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Topbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-sm font-bold">
              E
            </div>
            <span className="font-semibold text-slate-900">ERP Platform</span>
            <span className="text-slate-300">|</span>
            <span className="text-sm text-slate-500">Playground</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full text-xs font-medium">
              🎉 ERP Foundation พร้อมใช้งาน!
            </span>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-bold text-slate-900 leading-tight">
              ERP Platform — Preview ของกลาง
            </h1>
            <p className="mt-3 text-lg text-slate-600">
              หน้านี้ใช้สำหรับดูและทดสอบ &ldquo;ของกลาง&rdquo; ทั้งหมดก่อนนำไปใช้จริงใน ERP
            </p>
          </div>

          {/* What is "ของกลาง" */}
          <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-6 max-w-3xl">
            <h2 className="font-semibold text-blue-900 mb-3">💡 &ldquo;ของกลาง&rdquo; คืออะไร?</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm font-medium text-red-700 mb-2">❌ แบบเก่า (มีปัญหา)</p>
                <ul className="text-sm text-red-600 space-y-1">
                  <li>• Product page มี table ของตัวเอง</li>
                  <li>• Purchase page มี table ของตัวเอง</li>
                  <li>• แก้ที่นึง ที่อื่นไม่เปลี่ยนตาม</li>
                  <li>• งานซ้ำ แก้ยาก ไม่สม่ำเสมอ</li>
                </ul>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <p className="text-sm font-medium text-emerald-700 mb-2">✅ แบบใหม่ (ของกลาง)</p>
                <ul className="text-sm text-emerald-600 space-y-1">
                  <li>• มี table กลางตัวเดียว</li>
                  <li>• ทุกโมดูลใช้ table เดียวกัน</li>
                  <li>• แก้ที่เดียว ทุกหน้าเปลี่ยนตาม</li>
                  <li>• มีมาตรฐาน แก้ง่าย scale ได้</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Phase Progress */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
            ความคืบหน้าโปรเจกต์
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {phases.map((phase) => (
              <div
                key={phase.number}
                className={`border rounded-lg p-3 text-center ${phaseStatusStyle[phase.status as keyof typeof phaseStatusStyle]}`}
              >
                <div className="text-lg mb-1">{phaseIcon[phase.status as keyof typeof phaseIcon]}</div>
                <div className="text-xs font-semibold">Phase {phase.number}</div>
                <div className="text-xs mt-0.5 leading-tight">{phase.titleTH}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Playground Sections */}
      <main className="max-w-7xl mx-auto px-6 py-10">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-6">
          Playground Sections — คลิกเพื่อดู Preview
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {sections.map((section) => (
            <Link
              key={section.id}
              href={section.href}
              className="group bg-white rounded-xl border border-slate-200 p-6 hover:border-blue-300 hover:shadow-md transition-all duration-200"
            >
              <div className="flex items-start justify-between mb-4">
                <span className="text-3xl">{section.icon}</span>
                <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full text-xs">
                  Phase {section.phase}
                </span>
              </div>

              <h3 className="font-semibold text-slate-900 group-hover:text-blue-700 transition-colors">
                {section.titleTH}
              </h3>
              <p className="text-xs text-slate-500 mb-3">{section.title}</p>
              <p className="text-sm text-slate-600 mb-4 leading-relaxed">{section.description}</p>

              <ul className="space-y-1">
                {section.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="w-1 h-1 bg-slate-300 rounded-full flex-shrink-0"></span>
                    {feature}
                  </li>
                ))}
              </ul>

              <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                {section.status === "ready" ? (
                  <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full text-xs font-medium">
                    ✅ พร้อมแล้ว
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full text-xs">
                    ⏳ Coming Soon
                  </span>
                )}
                <span className="text-xs text-slate-400 group-hover:text-blue-500 transition-colors">
                  {section.status === "ready" ? "เปิดดู →" : "ดูรายละเอียด →"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white mt-10">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="text-sm text-slate-400">
            ERP Platform — สร้างด้วย Next.js + Tailwind CSS + Supabase
          </div>
          <div className="text-sm text-slate-400">
            🎉 Phase 1–8 of 8 เสร็จสมบูรณ์ — ERP Foundation พร้อมแล้ว!
          </div>
        </div>
      </footer>
    </div>
  );
}
