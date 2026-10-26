"use client";

/**
 * พรีวิว ◎ วงแอป (components/app-orbit) ด้วยข้อมูลตัวอย่าง — ไม่ต้องล็อกอิน/ไม่ต่อ DB
 * สลับ "ดูในฐานะ" เพื่อดูว่าวงจัดตัวเองใหม่เมื่อเห็นแอปน้อยลง (ของจริงกรองด้วยสิทธิ์ใน lib/app-orbit)
 */
import { useMemo, useState } from "react";
import { AppOrbit } from "@/components/app-orbit";
import { AppOrbitTuner } from "@/components/app-orbit/tuner";
import type { OrbitApp } from "@/lib/app-orbit";
import { orbitOverrideCount, resolveOrbitStyle, type OrbitStyle } from "@/lib/app-orbit-style";

const m = (href: string, label: string, icon = "📄") => ({ href, label, icon, iconUrl: null, keywords: [] });
const SAMPLE: OrbitApp[] = [
  { key: "home", label: "หน้าหลัก", icon: "🏠", iconUrl: null, color: null, homeHref: "/dashboard", menus: [m("/dashboard", "Dashboard", "📊"), m("/calendar", "ปฏิทินรวม", "📅"), m("/notify", "แจ้งเตือน (มือถือ)", "🔔")] },
  { key: "tasks", label: "จัดการงาน", icon: "✅", iconUrl: null, color: "#4d4d4d", homeHref: "/tasks", menus: [m("/tasks", "งานทั้งหมด", "✅"), m("/campaigns", "แคมเปญ", "📣"), m("/content-calendar", "ปฏิทินคอนเทนต์", "🗓️"), m("/content-plan", "วางแผนคอนเทนต์", "📝"), m("/print-arrange", "จัดเรียงงานพิมพ์", "✂️"), m("/design-dashboard", "Design Dashboard", "📋")] },
  { key: "master", label: "Master Data", icon: "📦", iconUrl: null, color: null, homeHref: "/master/skus", menus: [m("/master/skus", "SKUs", "🏷️"), m("/master/parent-skus", "Parent SKUs", "🧬"), m("/master/partners", "Partners (ลูกค้า/ซัพ)", "🤝")] },
  { key: "purchasing", label: "จัดซื้อ", icon: "🛒", iconUrl: null, color: "#eb4224", homeHref: "/purchasing", menus: [m("/purchasing", "แดชบอร์ด", "📊"), m("/shopping", "ขอซื้อ (ช้อปปิ้ง)", "🛍️"), m("/po-new", "สั่งซื้อ (ออก PO)", "🛒"), m("/purchase-orders", "รายการใบสั่งซื้อ (PO)", "🧾"), m("/line-orders", "คำสั่งซื้อจากไลน์", "💬"), m("/receive", "รับสินค้าเข้า", "📥")] },
  { key: "inventory", label: "คลังสินค้า", icon: "🗄️", iconUrl: null, color: null, homeHref: "/inventory", menus: [m("/inventory", "คลังสินค้า/Stock", "🗄️"), m("/warehouse-map", "ผังคลัง", "🗺️"), m("/stock-count", "นับสต๊อก", "🔢")] },
  { key: "production", label: "ผลิต", icon: "🏭", iconUrl: null, color: null, homeHref: "/master/production-dashboard", menus: [m("/master/production-dashboard", "Dashboard ผลิต", "📊"), m("/master/manufacturing-orders", "Manufacturing Orders", "🏭"), m("/bom", "BOM (สูตรผลิต)", "📐")] },
  { key: "dispatch", label: "จ่ายงาน", icon: "📋", iconUrl: null, color: null, homeHref: "/master/work-board", menus: [m("/master/work-board", "บอร์ดจ่ายงาน", "📋"), m("/material-readiness", "ความพร้อมวัตถุดิบ", "📦")] },
  { key: "design", label: "ออกแบบ", icon: "🎨", iconUrl: null, color: "#ffa629", homeHref: "/design-sheets", menus: [m("/design-sheets", "Design Sheets", "🎨"), m("/material-pricing", "วัสดุตีราคา", "🧮")] },
  { key: "marketplace", label: "ช่องทางขาย", icon: "🏬", iconUrl: null, color: "#7c3aed", homeHref: "/master/platform-dashboard", menus: [m("/master/platform-dashboard", "แดชบอร์ดแพลตฟอร์ม", "📊"), m("/platform-listing", "ลงสินค้าบนแพลตฟอร์ม", "📤")] },
  { key: "marketing", label: "การตลาด", icon: "📊", iconUrl: null, color: "#0ea5e9", homeHref: "/marketing/dashboard", menus: [m("/marketing/dashboard", "Dashboard การตลาด", "📊"), m("/marketing/skus", "SKU การตลาด", "🏷️")] },
  { key: "china-pay", label: "โอนเงินจีน", icon: "💸", iconUrl: null, color: null, homeHref: "/app/china-pay", menus: [m("/app/china-pay", "แอปโอนเงินจีน (มือถือ)", "💸")] },
  { key: "sales", label: "ขาย", icon: "🧾", iconUrl: null, color: null, homeHref: "/sales-dashboard", menus: [m("/sales-dashboard", "แดชบอร์ดขาย", "📊"), m("/quotations", "ใบเสนอราคา (QT)", "📄"), m("/sales-orders", "ใบขาย (SO)", "🧾"), m("/billing-notes", "ใบวางบิล", "📑"), m("/receipts", "รับชำระเงิน", "💵"), m("/delivery-notes", "ใบส่งสินค้า", "📦"), m("/credit-notes", "ใบลดหนี้ (CN)", "🧾")] },
  { key: "cashflow", label: "กระแสเงินสด", icon: "💧", iconUrl: null, color: null, homeHref: "/cashflow", menus: [m("/cashflow", "กระแสเงินสด", "💧"), m("/cash-board", "กระดานเงินสด", "🧲")] },
  { key: "payroll", label: "Payroll", icon: "💰", iconUrl: null, color: "#ffa70f", homeHref: "/payroll/dashboard", menus: [m("/payroll/dashboard", "ภาพรวมเงินเดือน", "📊"), m("/payroll/periods", "งวดเงินเดือน", "🗓️"), m("/payroll/employees", "พนักงาน", "🪪")] },
  { key: "misc", label: "งานอื่นๆ", icon: "🗂️", iconUrl: null, color: null, homeHref: "/misc", menus: [m("/misc", "รวมแอป", "🗂️")] },
  { key: "subscriptions", label: "App Subscription", icon: "📝", iconUrl: null, color: "#4f46e5", homeHref: "/subscriptions", menus: [m("/subscriptions", "App Subscription", "📝")] },
  { key: "loan-od", label: "การเงิน (เงินกู้/OD)", icon: "💵", iconUrl: null, color: null, homeHref: "/loans", menus: [m("/loans", "Dashboard เงินกู้", "📊")] },
  { key: "qc", label: "QC", icon: "📦", iconUrl: null, color: null, homeHref: "/qc", menus: [m("/qc", "โกดัง QC", "🏭")] },
  { key: "settings", label: "ตั้งค่า", icon: "⚙️", iconUrl: null, color: null, homeHref: "/admin/menu", menus: [m("/admin/menu", "จัดการเมนู", "🧭"), m("/admin/companies", "ทะเบียนบริษัท (หัวบิล)", "🏢")] },
];
const PROD = ["home", "tasks", "inventory", "production", "dispatch", "qc"];

export default function AppOrbitPreviewPage() {
  const [query, setQuery] = useState("");
  const [as, setAs] = useState<"admin" | "prod">("admin");
  const apps = useMemo(() => (as === "admin" ? SAMPLE : SAMPLE.filter((a) => PROD.includes(a.key))), [as]);
  // แผงปรับ (พรีวิวไม่บันทึกที่ไหน — ของจริงดู app/apps/page.tsx)
  const [mine, setMine] = useState<Partial<OrbitStyle>>({});
  const [open, setOpen] = useState(false);
  const [replay, setReplay] = useState(0);
  const style = resolveOrbitStyle(null, mine);
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>◎ พรีวิววงแอป (ข้อมูลตัวอย่าง) · ดูในฐานะ</span>
          <select value={as} onChange={(e) => setAs(e.target.value as "admin" | "prod")} className="h-7 rounded border border-slate-200 bg-white px-2">
            <option value="admin">แอดมิน · 19 แอป</option>
            <option value="prod">ฝ่ายผลิต · 6 แอป</option>
          </select>
          <button type="button" onClick={() => setOpen((o) => !o)} className="ml-auto h-7 px-2.5 rounded border border-slate-200 bg-white">◎ ปรับวงแอป</button>
        </div>
        <div className="mt-4">
          <AppOrbit apps={apps} query={query} onQueryChange={setQuery} greeting="สวัสดีตอนบ่าย, ตัวอย่าง 👋" initialKey="tasks" style={style} replayKey={replay} />
        </div>
      </div>
      <AppOrbitTuner open={open} onClose={() => setOpen(false)} value={style}
        onPatch={(p) => setMine((m) => ({ ...m, ...p }))} onPreset={(s) => { setMine({ ...s }); setReplay((k) => k + 1); }} onReplay={() => setReplay((k) => k + 1)}
        scope="mine" onScope={() => {}} canTeam={false} mineCount={orbitOverrideCount(null, mine)} onResetMine={() => setMine({})}
        teamDirty={false} savingTeam={false} onSaveTeam={() => {}} onCancelTeam={() => {}} />
    </div>
  );
}
