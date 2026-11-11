"use client";

/**
 * ข้อมูลตั้งต้น (Master Lookups) — /master/lookups
 *
 * หน้าเดียว รวม "ตารางอ้างอิง" ที่ยังไม่มีหน้าของตัวเอง — เมนูหมวดด้านซ้าย กดแล้วโชว์ตารางด้านขวา
 *   (เจ้าของขอ 2026-11-11: เดิมแท็บเรียงแถวบน 8 อัน · ตารางเล็ก ๆ อีกหลายตัวกระจายอยู่ในแถบเมนูหรือไม่มีหน้าเลย)
 * ใช้ของกลาง: SettingsNavLayout (เมนูซ้ายจัดหมวด + ค้นหา · มือถือเป็นช่องเลือก) · MasterPage/DataTable ผ่าน API กลาง master-v2
 * คอลัมน์ = ตามทะเบียน field (is_visible) ไม่โชว์ทุกช่องดิบ (ID ยาว ๆ / วันที่สร้าง) — ปรับได้ที่ ⚙️ ตั้งค่าฟิลด์ของแต่ละตาราง
 *
 * เพิ่มตารางใหม่: ใส่ใน GROUPS (key = module_key ใน erp_modules) · ตารางที่มีหน้าของตัวเองแล้ว (คลัง Hashtag/ประเภทงาน = ตั้งค่างาน) ไม่ต้องใส่
 * ⚠️ ห้ามเปลี่ยน key เดิม — ลิงก์ ?tab=<key> เก่ายังใช้อยู่
 */

import { useEffect, useMemo, useState } from "react";
import { ShellPresentContext } from "@/components/playground-shell";
import { MasterPage } from "@/components/master-page";
import { CreateModuleWizard } from "@/components/create-module-wizard";
import { SettingsNavLayout, type SettingsNavGroup } from "@/components/settings-nav";
import { usePermission } from "@/components/auth";

type Item = { key: string; title: string; desc: string; keywords?: string };

const GROUPS: { label: string; items: Item[] }[] = [
  { label: "สินค้า", items: [
    { key: "brands",              title: "แบรนด์",              desc: "ชื่อแบรนด์ที่ใช้กับสินค้า", keywords: "brand" },
    { key: "product_categories",  title: "หมวดหมู่สินค้า",       desc: "หมวดกลางของสินค้า", keywords: "category" },
    { key: "collections",         title: "คอลเลกชัน",           desc: "ชุด/คอลเลกชันของแต่ละแบรนด์", keywords: "collection" },
    { key: "platform_categories", title: "หมวดแพลตฟอร์ม",       desc: "หมวดสำหรับลงขาย", keywords: "platform" },
    { key: "product_families",    title: "ประเภทสินค้า (แท็ก)", desc: "ตั้งกลุ่ม + แท็ก + เทมเพลตได้ที่หน้าประเภทสินค้า", keywords: "family tag" },
  ] },
  { label: "รายละเอียดสินค้า (หน้าเว็บ)", items: [
    { key: "size_descriptions",       title: "คำอธิบายขนาด",       desc: "ข้อความขนาดที่ใช้ซ้ำ", keywords: "size" },
    { key: "special_descriptions",    title: "คำอธิบายพิเศษ",      desc: "ข้อความพิเศษที่ใช้ซ้ำ" },
    { key: "product_fit_items",       title: "ใส่อะไรได้บ้าง",      desc: "ของที่ใส่ในกระเป๋าได้ (โชว์บนหน้าเว็บ)", keywords: "fit" },
    { key: "product_highlight_items", title: "รายละเอียดเพิ่ม (ติ๊ก)", desc: "ตัวเลือกติ๊กจุดเด่นสินค้า", keywords: "highlight" },
    { key: "product_materials",       title: "วัสดุ (หน้าเว็บ)",     desc: "ชื่อวัสดุ + รูปที่โชว์บนหน้าเว็บ", keywords: "material" },
  ] },
  { label: "เข็มขัด", items: [
    { key: "belt_template",   title: "รูปแบบเข็มขัด",  desc: "ชุดตัวเลือกของเข็มขัดแต่ละแบบ", keywords: "belt" },
    { key: "belt_tails",      title: "รูปทรงปลายหาง",  desc: "", keywords: "belt tail" },
    { key: "belt_width_size", title: "ไซส์ (กว้าง)",    desc: "", keywords: "belt width" },
    { key: "belt_size_cal",   title: "ไซส์วัดจาก",      desc: "", keywords: "belt size" },
    { key: "belt_loops",      title: "ห่วงเข็มขัด",     desc: "", keywords: "belt loop" },
    { key: "belt_hole",       title: "รูเข็มขัด",       desc: "", keywords: "belt hole" },
    { key: "belt_logo",       title: "โลโก้เข็มขัด",    desc: "", keywords: "belt logo" },
  ] },
  { label: "ขนส่งและแพ็ก", items: [
    { key: "parcel_sizes",              title: "ขนาดพัสดุ",            desc: "กล่อง/ซองที่ใช้ส่งของ", keywords: "parcel box" },
    { key: "freight-carriers",          title: "ร้านขนส่ง / เรทค่าส่ง", desc: "เรทค่าส่งของแต่ละร้านขนส่ง", keywords: "freight carrier" },
    { key: "freight-description-rules", title: "กฎคิดค่าส่ง",           desc: "คำในรายละเอียด → วิธีคิดค่าส่ง", keywords: "freight rule" },
  ] },
  { label: "การเงิน", items: [
    { key: "banks",       title: "ธนาคาร",       desc: "รายชื่อธนาคาร (ใช้กับบัญชีพนักงาน/คู่ค้า)", keywords: "bank" },
    { key: "daily-rates", title: "เรทเงินต่อวัน", desc: "เรทแลกเงินรายวัน", keywords: "rate" },
  ] },
];
const ALL = GROUPS.flatMap((g) => g.items);

export default function MasterLookupsPage() {
  // จำตารางที่เลือกผ่าน URL (?tab=) → กดตั้งค่าฟิลด์แล้วย้อนกลับ ไม่เด้งกลับตารางแรก (ลิงก์เก่า ?tab=<key> ใช้ได้เหมือนเดิม)
  //   อ่าน URL หลังเปิดหน้า (ไม่อ่านตอนสร้าง state) — กันหน้าฝั่ง server กับเบราว์เซอร์วาดไม่ตรงกัน (hydration mismatch)
  //   null = ยังไม่รู้ว่าจะเปิดตารางไหน → ยังไม่โหลดตาราง (กันโหลดตารางแรกทิ้งเปล่า ๆ)
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    setActive(t && ALL.some((x) => x.key === t) ? t : ALL[0].key);
  }, []);
  const selectTab = (k: string) => {
    setActive(k);
    if (typeof window !== "undefined") {
      const u = new URL(window.location.href);
      u.searchParams.set("tab", k);
      window.history.replaceState(null, "", u.toString());
    }
  };
  const [showWizard, setShowWizard] = useState(false);
  const canCreate = usePermission("products.create");
  const cur = active ? ALL.find((t) => t.key === active) ?? ALL[0] : null;
  const groups = useMemo<SettingsNavGroup[]>(() => GROUPS.map((g) => ({
    label: g.label,
    items: g.items.map((i) => ({ key: i.key, label: i.title, desc: i.desc || undefined, keywords: i.keywords })),
  })), []);

  // หมายเหตุ: app/master/layout.tsx ครอบ PlaygroundShell ให้แล้ว → ห้ามครอบซ้ำ (กัน shell ซ้อน)
  return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        {showWizard && <CreateModuleWizard onClose={() => setShowWizard(false)} />}
        <div className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-slate-900">🧱 ข้อมูลตั้งต้น</h1>
              <p className="text-sm text-slate-500 mt-0.5">ตารางอ้างอิงที่ใช้ร่วมกันหลายหน้า — เลือกหมวดด้านซ้าย ({ALL.length} ตาราง)</p>
            </div>
            {canCreate && (
              <button onClick={() => setShowWizard(true)}
                className="shrink-0 h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                ➕ เพิ่มโมดูลใหม่
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 px-4 lg:px-6 py-4">
          {!cur ? <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> : (
          <SettingsNavLayout groups={groups} active={cur.key} onSelect={selectTab} searchPlaceholder="ค้นหาตาราง เช่น ธนาคาร">
            {(cur.key === "product_families" || cur.key === "brands") && (
              <a href={cur.key === "brands" ? "/master/brands" : "/admin/product-families"}
                className="mb-3 inline-flex items-center gap-1.5 text-sm px-3 h-8 rounded-md bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100">
                {cur.key === "brands" ? "เปิดหน้าแบรนด์ (โลโก้ · สี · ลูกค้าประจำแบรนด์)" : "ตั้งค่าประเภทสินค้า (กลุ่ม + แท็ก + เทมเพลต)"}
              </a>
            )}
            {/* MasterPage ไม่เรนเดอร์ shell ซ้อน (อยู่ใต้ shell นี้แล้ว) · คอลัมน์ตามทะเบียน field ไม่โชว์ทุกช่องดิบ */}
            <ShellPresentContext.Provider value={true}>
              <MasterPage key={cur.key} apiPath={cur.key} moduleKey={cur.key} title={cur.title} showAllColumns={false} />
            </ShellPresentContext.Provider>
          </SettingsNavLayout>
          )}
        </div>
      </div>
  );
}
