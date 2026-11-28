"use client";
/**
 * ✂️ วางแบบบนผ้าลาย — หน้ารวม (/master/fabric-lay) 3 แท็บ: แผนวาง · อัลบั้มผ้า · แบบตัด (ต่อสินค้า)
 *   แท็บจำใน URL (?tab=) · แต่ละแท็บมีถังขยะของตัวเอง (กู้คืน / ลบถาวรพิมพ์รหัสยืนยัน)
 */
import { useSearchParams, useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { FabricAlbum } from "./fabric-album";
import { PatternList } from "./pattern-list";
import { PlanList } from "./plan-list";

const TABS = [
  { key: "plans", label: "แผนวางบนผ้า", icon: "i:layout-board" },
  { key: "fabrics", label: "อัลบั้มผ้า", icon: "i:photo" },
  { key: "patterns", label: "แบบตัด (ต่อสินค้า)", icon: "i:scissors" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export function FabricLayHome() {
  const sp = useSearchParams();
  const router = useRouter();
  const tab: Tab = (TABS.find((t) => t.key === sp.get("tab"))?.key ?? "plans");
  const go = (t: Tab) => router.replace(`?tab=${t}`, { scroll: false });

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900"><Icon value="i:scissors" /> วางแบบบนผ้าลาย</h1>
        <p className="mt-1 text-sm text-slate-500">ใส่รูปผ้าลายผืนจริง + ขนาดจริง → วางชิ้นแบบตัดกระเป๋าลงบนผ้า (หลายใบต่อผืนได้) → โหลด JPEG สรุปพร้อมคำอธิบาย ไปให้ ChatGPT สร้างรูปกระเป๋า</p>
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => go(t.key)}
            className={`-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${tab === t.key ? "border-indigo-600 font-medium text-indigo-700" : "border-transparent text-slate-600 hover:text-slate-900"}`}>
            <Icon value={t.icon} /> {t.label}
          </button>
        ))}
      </div>
      {tab === "plans" && <PlanList />}
      {tab === "fabrics" && <FabricAlbum />}
      {tab === "patterns" && <PatternList />}
    </div>
  );
}
