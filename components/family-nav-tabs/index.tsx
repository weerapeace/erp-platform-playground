"use client";

/**
 * FamilyNavTabs — แถบแท็บสลับระหว่าง "ใส่แท็กให้สินค้า" กับ "เทมเพลตประเภทสินค้า"
 * (ของกลาง) ใช้บนหัวหน้า /master/tags-manager และ /admin/family-template
 */
import Link from "next/link";

const TABS = [
  { key: "tags", label: "🏷️ ใส่แท็กให้สินค้า", href: "/master/tags-manager" },
  { key: "template", label: "🧩 เทมเพลตประเภทสินค้า", href: "/admin/family-template" },
] as const;

export function FamilyNavTabs({ active }: { active: "tags" | "template" }) {
  return (
    <div className="bg-white border-b border-slate-200 px-4 pt-2 flex gap-1.5">
      {TABS.map((t) => (
        <Link key={t.key} href={t.href}
          className={`h-10 px-5 inline-flex items-center text-sm font-semibold rounded-t-lg border-b-2 transition-colors ${
            active === t.key
              ? "border-blue-600 text-blue-700 bg-blue-50/60"
              : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
          }`}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}
