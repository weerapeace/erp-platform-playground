"use client";

/**
 * 🧵 ตั้งค่า "กดชื่อวัสดุในรายละเอียดสินค้า → เปิดแบบไหน" (ธีม → แท็บหน้าสินค้า)
 * ค่าเก็บที่ theme.product.materialView · เว็บร้าน components/materials/MaterialViewer อ่านไปใช้
 * การ์ด 3 แบบมีภาพร่างเล็ก ๆ ให้เห็นหน้าตาก่อนเลือก · ข้อมูลวัสดุ/รูป แก้ที่ /m/product_materials
 */
import Link from "next/link";
import { MATERIAL_VIEWS, type ProductMaterialView } from "@/lib/website-theme";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";

/** ป้ายตัวเลือกจาก lib/website-theme (MATERIAL_VIEWS — คงไทย) → แปลตอนแสดงในหน้าแอดมิน */
const MAT_EN: Record<string, string> = {
  "แผงเลื่อนจากขวา": "Slide-in panel from right",
  "แนะนำ · ลูกค้าอยู่หน้าสินค้าต่อ · มือถือเลื่อนขึ้นจากล่าง": "Recommended · customer stays on the product page · slides up from the bottom on mobile",
  "ป๊อปกลางจอ แบบนิตยสาร": "Center popup, magazine style",
  "รูปผิววัสดุซ้าย ข้อความขวา · เด่นสุดเมื่อมีรูปวัสดุ": "Material texture image left, text right · best when there is a material image",
  "ไปหน้าวัสดุเต็ม": "Go to full material page",
  "เปิดหน้าใหม่ /materials/… รูปเต็มจอ + เรื่องราว (ค่าเดิม)": "Opens /materials/… with full-screen image + story (original)",
  "ปิด — ไม่ทำเป็นลิงก์": "Off — not a link",
  "ชื่อวัสดุเป็นข้อความธรรมดา กดไม่ได้ · ไม่มีปุ่มวัสดุในแถบงานคราฟต์": "Material names are plain text, not clickable · no material button in the craft strip",
};
const matEn = (th: string) => tr(th, MAT_EN[th] ?? th);

export function MaterialViewSetting({ value, onChange, brand }: { value: ProductMaterialView; onChange: (v: ProductMaterialView) => void; brand: string }) {
  const t = useT();
  return (
    <div className="mt-4 pt-3 border-t border-slate-100">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-800">{t("🧵 กดชื่อวัสดุในรายละเอียดสินค้า → เปิดแบบ", "🧵 Clicking a material name in product details opens as")}</h4>
        <Link href="/m/product_materials" target="_blank" className="text-xs text-blue-600 hover:underline">
          {t("จัดการวัสดุ + รูปผิววัสดุ ↗", "Manage materials + texture images ↗")}
        </Link>
      </div>
      <p className="text-xs text-slate-500 mt-0.5 mb-2">{t("ทุกแบบมี: รูปผิววัสดุ · เรื่องราว · วิธีดูแล (ไอคอน) · สินค้าที่ใช้วัสดุนี้ · ลิงก์หน้าเต็ม — ยังไม่มีรูปวัสดุ = หัวแบบลายทอ + ชื่อตัวใหญ่", "Every style has: texture image · story · care (icons) · products using this material · full page link — no material image = woven pattern header + large name")}</p>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {MATERIAL_VIEWS.map((o) => {
          const on = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              aria-pressed={on}
              className={`text-left rounded-xl border p-2.5 transition ${on ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500" : "border-slate-200 hover:border-slate-400"}`}
            >
              <Sketch kind={o.value} brand={brand} />
              <p className={`mt-2 text-sm font-medium ${on ? "text-blue-700" : "text-slate-800"}`}>
                {matEn(o.label)}
                {on && " ✓"}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{matEn(o.hint)}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** ภาพร่างเล็กของแต่ละแบบ (หน้าสินค้าจาง ๆ + กล่องวัสดุ) */
function Sketch({ kind, brand }: { kind: ProductMaterialView; brand: string }) {
  const t = useT();
  const texture = { background: `repeating-linear-gradient(45deg, ${brand}22 0 1px, transparent 1px 5px), ${brand}14` };
  const lines = (
    <div className="flex flex-col gap-1">
      <div className="h-1.5 w-2/3 rounded bg-slate-500" />
      <div className="h-1 w-full rounded bg-slate-200" />
      <div className="h-1 w-5/6 rounded bg-slate-200" />
      <div className="mt-0.5 flex gap-0.5">{[0, 1, 2].map((i) => <span key={i} className="w-2 h-2 rounded-full border border-slate-300" />)}</div>
    </div>
  );
  if (kind === "off") {
    // ปิด: ข้อความรายละเอียดธรรมดา คำว่าวัสดุไม่มีขีดเส้นใต้/กดไม่ได้
    return (
      <div className="relative h-20 rounded-lg border border-slate-200 bg-white overflow-hidden p-2 flex flex-col gap-1.5">
        <div className="h-1.5 w-1/2 rounded bg-slate-500" />
        <p className="text-[9px] leading-tight text-slate-500">ผลิตจาก <span className="text-slate-700">หนังวัวแท้</span> ซับในผ้า · ตะเข็บคู่</p>
        <span className="mt-auto self-start rounded bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500">{t("ไม่มีลิงก์", "No link")}</span>
      </div>
    );
  }
  if (kind === "page") {
    return (
      <div className="relative h-20 rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="h-9" style={texture} />
        <div className="p-1.5 grid grid-cols-[3fr_2fr] gap-1.5">
          {lines}
          <div className="rounded border border-slate-200 h-6" />
        </div>
      </div>
    );
  }
  return (
    <div className="relative h-20 rounded-lg border border-slate-200 bg-white overflow-hidden">
      <div className="p-1.5 flex gap-1.5 opacity-60">
        <div className="w-1/2 h-14 rounded bg-slate-100" />
        <div className="flex-1 flex flex-col gap-1">
          <div className="h-1.5 w-3/4 rounded bg-slate-300" />
          <div className="h-1 w-full rounded bg-slate-200" />
        </div>
      </div>
      <div className="absolute inset-0 bg-slate-900/25" />
      {kind === "drawer" ? (
        <div className="absolute right-0 top-0 bottom-0 w-[44%] bg-white shadow-lg">
          <div className="h-7" style={texture} />
          <div className="p-1">{lines}</div>
        </div>
      ) : (
        <div className="absolute left-[12%] right-[12%] top-2.5 bottom-2.5 bg-white rounded shadow-lg grid grid-cols-2 overflow-hidden">
          <div style={texture} />
          <div className="p-1">{lines}</div>
        </div>
      )}
    </div>
  );
}
