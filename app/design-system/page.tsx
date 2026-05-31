import { PlaygroundShell } from "@/components/playground-shell";

const brandColors = [
  { shade: "50",  hex: "#fff7ed", text: "text-slate-800" },
  { shade: "100", hex: "#ffedd5", text: "text-slate-800" },
  { shade: "200", hex: "#fed7aa", text: "text-slate-800" },
  { shade: "300", hex: "#fdba74", text: "text-slate-800" },
  { shade: "400", hex: "#fb923c", text: "text-white" },
  { shade: "500", hex: "#f97316", text: "text-white" },
  { shade: "600", hex: "#ea580c", text: "text-white" },
  { shade: "700", hex: "#c2410c", text: "text-white" },
  { shade: "800", hex: "#9a3412", text: "text-white" },
  { shade: "900", hex: "#7c2d12", text: "text-white" },
];

const neutralColors = [
  { shade: "50", hex: "#f8fafc" },
  { shade: "100", hex: "#f1f5f9" },
  { shade: "200", hex: "#e2e8f0" },
  { shade: "300", hex: "#cbd5e1" },
  { shade: "400", hex: "#94a3b8" },
  { shade: "500", hex: "#64748b" },
  { shade: "600", hex: "#475569" },
  { shade: "700", hex: "#334155" },
  { shade: "800", hex: "#1e293b" },
  { shade: "900", hex: "#0f172a" },
];

const semanticColors = [
  {
    name: "Success",
    nameTH: "สำเร็จ",
    shades: [
      { hex: "#f0fdf4", label: "50" },
      { hex: "#22c55e", label: "500" },
      { hex: "#15803d", label: "700" },
    ],
  },
  {
    name: "Warning",
    nameTH: "แจ้งเตือน",
    shades: [
      { hex: "#fffbeb", label: "50" },
      { hex: "#f59e0b", label: "500" },
      { hex: "#b45309", label: "700" },
    ],
  },
  {
    name: "Danger",
    nameTH: "อันตราย",
    shades: [
      { hex: "#fef2f2", label: "50" },
      { hex: "#ef4444", label: "500" },
      { hex: "#b91c1c", label: "700" },
    ],
  },
  {
    name: "Purple",
    nameTH: "ม่วง",
    shades: [
      { hex: "#faf5ff", label: "50" },
      { hex: "#a855f7", label: "500" },
      { hex: "#7e22ce", label: "700" },
    ],
  },
];

const statusItems = [
  { labelTH: "ร่าง", label: "Draft", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  { labelTH: "ส่งแล้ว", label: "Submitted", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  { labelTH: "รออนุมัติ", label: "Waiting Approval", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  { labelTH: "อนุมัติแล้ว", label: "Approved", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  { labelTH: "ปฏิเสธ", label: "Rejected", bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  { labelTH: "ยกเลิก", label: "Cancelled", bg: "bg-red-50", text: "text-red-600", border: "border-red-200" },
  { labelTH: "บันทึกแล้ว", label: "Posted", bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  { labelTH: "เก็บถาวร", label: "Archived", bg: "bg-slate-50", text: "text-slate-500", border: "border-slate-200" },
];

const typographyScale = [
  { name: "Display / H1", size: "36px", weight: "700", class: "text-4xl font-bold", sample: "ชื่อหน้า / รายการสินค้า" },
  { name: "H2", size: "30px", weight: "700", class: "text-3xl font-bold", sample: "หัวข้อหลัก" },
  { name: "H3", size: "24px", weight: "600", class: "text-2xl font-semibold", sample: "Section Header" },
  { name: "H4", size: "20px", weight: "600", class: "text-xl font-semibold", sample: "Card Title" },
  { name: "Body Large", size: "18px", weight: "400", class: "text-lg", sample: "ข้อความอธิบายทั่วไป" },
  { name: "Body", size: "16px", weight: "400", class: "text-base", sample: "ข้อความในฟอร์ม, table rows" },
  { name: "Body Small", size: "14px", weight: "400", class: "text-sm", sample: "Label, helper text, button text" },
  { name: "Caption", size: "12px", weight: "400", class: "text-xs", sample: "Timestamp, metadata, badge text" },
];

const spacingScale = [
  { value: "4px", tailwind: "p-1", pixels: 4 },
  { value: "8px", tailwind: "p-2", pixels: 8 },
  { value: "12px", tailwind: "p-3", pixels: 12 },
  { value: "16px", tailwind: "p-4", pixels: 16 },
  { value: "20px", tailwind: "p-5", pixels: 20 },
  { value: "24px", tailwind: "p-6", pixels: 24 },
  { value: "32px", tailwind: "p-8", pixels: 32 },
  { value: "40px", tailwind: "p-10", pixels: 40 },
  { value: "48px", tailwind: "p-12", pixels: 48 },
];

const radiusScale = [
  { name: "sm", value: "4px", class: "rounded", label: "Button Small, Tag" },
  { name: "md", value: "8px", class: "rounded-lg", label: "Button, Input, Card" },
  { name: "lg", value: "12px", class: "rounded-xl", label: "Card, Modal" },
  { name: "xl", value: "16px", class: "rounded-2xl", label: "Dialog, Panel" },
  { name: "full", value: "9999px", class: "rounded-full", label: "Badge, Avatar, Pill" },
];

const shadowScale = [
  { name: "xs", class: "shadow-sm", label: "Button, Input" },
  { name: "sm", class: "shadow", label: "Dropdown, Tooltip" },
  { name: "md", class: "shadow-md", label: "Card, Popover" },
  { name: "lg", class: "shadow-lg", label: "Modal, Drawer" },
  { name: "xl", class: "shadow-xl", label: "Full-page overlay" },
];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
      <span className="flex-1 border-t border-slate-200" />
      <span>{children}</span>
      <span className="flex-1 border-t border-slate-200" />
    </h2>
  );
}

export default function DesignSystemPage() {
  return (
    <PlaygroundShell>
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full text-xs font-medium mb-3">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
          Phase 3 — เสร็จแล้ว
        </div>
        <h1 className="text-2xl font-bold text-slate-900">🎨 Design System</h1>
        <p className="text-slate-500 mt-1">
          ระบบดีไซน์ — มาตรฐานหน้าตาทั้งระบบ
        </p>
      </div>

      <div className="px-8 py-8 space-y-12 max-w-5xl">

        {/* Brand Colors */}
        <section>
          <SectionTitle>สี Brand (Brand Colors)</SectionTitle>
          <div className="flex rounded-xl overflow-hidden border border-slate-200 shadow-sm">
            {brandColors.map((c) => (
              <div
                key={c.shade}
                className="flex-1 flex flex-col items-center py-4 gap-1"
                style={{ backgroundColor: c.hex }}
              >
                <span className={`text-xs font-semibold ${c.text}`}>{c.shade}</span>
                <span className={`text-xs font-mono opacity-75 ${c.text}`}>{c.hex}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Blue-600 (#2563eb) = Primary action — ใช้กับ Primary Button, Link, Focus ring
          </p>
        </section>

        {/* Neutral Colors */}
        <section>
          <SectionTitle>สี Neutral (Neutral Colors)</SectionTitle>
          <div className="flex rounded-xl overflow-hidden border border-slate-200 shadow-sm">
            {neutralColors.map((c, i) => (
              <div
                key={c.shade}
                className="flex-1 flex flex-col items-center py-4 gap-1"
                style={{ backgroundColor: c.hex }}
              >
                <span className={`text-xs font-semibold ${i >= 5 ? "text-white" : "text-slate-700"}`}>
                  {c.shade}
                </span>
                <span className={`text-xs font-mono opacity-70 ${i >= 5 ? "text-white" : "text-slate-600"}`}>
                  {c.hex}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Slate-900 = Primary text · Slate-500 = Secondary text · Slate-200 = Border · Slate-50 = Background
          </p>
        </section>

        {/* Semantic Colors */}
        <section>
          <SectionTitle>สี Semantic (Success / Warning / Danger / Purple)</SectionTitle>
          <div className="grid grid-cols-4 gap-4">
            {semanticColors.map((color) => (
              <div key={color.name} className="space-y-1">
                <p className="text-xs font-medium text-slate-600">{color.nameTH} ({color.name})</p>
                <div className="flex rounded-lg overflow-hidden border border-slate-200">
                  {color.shades.map((s) => (
                    <div
                      key={s.label}
                      className="flex-1 h-16 flex items-end justify-center pb-1"
                      style={{ backgroundColor: s.hex }}
                    >
                      <span className="text-xs font-mono" style={{ color: s.label === "50" ? "#64748b" : "rgba(255,255,255,0.8)" }}>
                        {s.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Status Colors */}
        <section>
          <SectionTitle>สีสถานะเอกสาร (Document Status Colors)</SectionTitle>
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex flex-wrap gap-3">
              {statusItems.map((s) => (
                <div key={s.label} className="flex flex-col items-center gap-2">
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${s.bg} ${s.text} ${s.border}`}
                  >
                    {s.labelTH}
                  </span>
                  <span className="text-xs text-slate-400">{s.label}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-slate-500">
              <div>🔵 <strong>Draft/New</strong> = Blue</div>
              <div>🟡 <strong>Waiting Approval</strong> = Amber</div>
              <div>🟢 <strong>Approved/Completed</strong> = Green</div>
              <div>🔴 <strong>Rejected/Cancelled</strong> = Red</div>
              <div>🟣 <strong>Posted/Finalized</strong> = Purple</div>
              <div>⚫ <strong>Archived</strong> = Gray</div>
            </div>
          </div>
        </section>

        {/* Typography */}
        <section>
          <SectionTitle>ตัวอักษร (Typography)</SectionTitle>
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {typographyScale.map((t) => (
              <div key={t.name} className="px-6 py-4 flex items-baseline gap-6">
                <div className="w-32 flex-shrink-0">
                  <p className="text-xs font-medium text-slate-500">{t.name}</p>
                  <p className="text-xs text-slate-400">{t.size} / w{t.weight}</p>
                </div>
                <p className={`${t.class} text-slate-900 flex-1`}>{t.sample}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-2">Font: Inter (Latin) + Noto Sans Thai</p>
        </section>

        {/* Spacing */}
        <section>
          <SectionTitle>ระยะห่าง (Spacing — Base 4px grid)</SectionTitle>
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-end gap-3">
              {spacingScale.map((s) => (
                <div key={s.value} className="flex flex-col items-center gap-2">
                  <div
                    className="bg-blue-200 border border-blue-300 rounded"
                    style={{ width: `${s.pixels}px`, height: `${s.pixels}px` }}
                  />
                  <span className="text-xs text-slate-500 font-mono">{s.value}</span>
                  <span className="text-xs text-slate-400">{s.tailwind}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Border Radius */}
        <section>
          <SectionTitle>รูปทรงมุม (Border Radius)</SectionTitle>
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center gap-6 flex-wrap">
              {radiusScale.map((r) => (
                <div key={r.name} className="flex flex-col items-center gap-2">
                  <div
                    className={`w-16 h-16 bg-blue-100 border-2 border-blue-300 ${r.class}`}
                  />
                  <span className="text-xs font-medium text-slate-700">{r.name}</span>
                  <span className="text-xs text-slate-400">{r.value}</span>
                  <span className="text-xs text-slate-400 text-center max-w-20">{r.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Shadows */}
        <section>
          <SectionTitle>เงา (Shadows)</SectionTitle>
          <div className="bg-slate-100 rounded-xl border border-slate-200 p-8">
            <div className="flex items-center gap-8 flex-wrap">
              {shadowScale.map((s) => (
                <div key={s.name} className="flex flex-col items-center gap-3">
                  <div className={`w-20 h-20 bg-white rounded-xl ${s.class}`} />
                  <span className="text-xs font-medium text-slate-700">{s.name}</span>
                  <span className="text-xs text-slate-500 text-center max-w-24">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Z-Index */}
        <section>
          <SectionTitle>ลำดับชั้น (Z-Index)</SectionTitle>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">ชื่อ</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">ค่า</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">ใช้กับ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[
                  ["base", "0", "Content ปกติ"],
                  ["raised", "10", "Sticky element"],
                  ["dropdown", "100", "Dropdown menu"],
                  ["sticky", "200", "Sticky header/sidebar"],
                  ["overlay", "300", "Modal backdrop"],
                  ["modal", "400", "Modal, Drawer"],
                  ["toast", "500", "Toast notification"],
                  ["tooltip", "600", "Tooltip"],
                ].map(([name, val, use]) => (
                  <tr key={name} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-sm text-slate-700">{name}</td>
                    <td className="px-4 py-3 font-mono text-slate-500">{val}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{use}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

      </div>
    </PlaygroundShell>
  );
}
