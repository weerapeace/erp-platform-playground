"use client";

/**
 * /fabric-calc — คำนวณผ้า (App "งานอื่นๆ") · ไม่บันทึก
 *   แท็บ 1 "คิดผ้าก่อนซื้อ" (เพิ่ม 2026-11-13) — วางชิ้นบนผ้าจริง + หักริม/เผื่อ/ปัดม้วน/ราคา/สต็อก/เทียบหน้ากว้าง → ตะกร้าขอซื้อ (buy-calc.tsx)
 *   แท็บ 2 "สูตร BOM (แบบเดิม)" — เครื่องคิดเลขเดิม ใช้สูตรเดียวกับ BOM (พื้นที่ ÷ หน้ากว้าง ฯลฯ) ใช้กับวัตถุดิบทุกชนิด (classic-calc.tsx)
 * ต่างจาก /master/fabric-plan: หน้านั้นวางแผนตัดจากใบสั่งผลิตที่มีอยู่แล้ว · หน้านี้คิดก่อนมีใบสั่งผลิต/ก่อนซื้อผ้า
 */
import { useEffect, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { ScrollTabs } from "@/components/scroll-tabs";
import { Icon } from "@/components/icon";
import { FabricBuyCalc } from "./buy-calc";
import { ClassicFabricCalc } from "./classic-calc";

type Tab = "buy" | "classic";
const TAB_KEY = "fabric-calc.tab";
const TABS: { key: Tab; label: string; hint: string }[] = [
  { key: "buy", label: "คิดผ้าก่อนซื้อ", hint: "วางชิ้นบนผ้าจริง · ต้องซื้อกี่หลา/ม้วน · งบ · เทียบสต็อก" },
  { key: "classic", label: "สูตร BOM (แบบเดิม)", hint: "คิดเร็วด้วยสูตรเดียวกับ BOM · ใช้กับวัตถุดิบทุกชนิด" },
];

export default function FabricCalcPage() {
  const [tab, setTab] = useState<Tab>("buy");
  useEffect(() => {
    try { const t = localStorage.getItem(TAB_KEY); if (t === "classic" || t === "buy") setTab(t); } catch { /* ignore */ }
  }, []);
  const choose = (t: Tab) => { setTab(t); try { localStorage.setItem(TAB_KEY, t); } catch { /* ignore */ } };
  const cur = TABS.find((t) => t.key === tab)!;

  return (
    <PlaygroundShell>
      <div className="min-h-full bg-gradient-to-b from-indigo-50 to-slate-50">
        <div className="mx-auto max-w-6xl p-4 sm:p-6">
          <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold text-indigo-700"><Icon name="calc" /> คำนวณผ้า</h1>
          <p className="mb-3 text-sm text-indigo-400">{cur.hint} — ไม่บันทึก</p>
          <ScrollTabs activeKey={tab} className="mb-4 border-b border-indigo-100">
            {TABS.map((t) => (
              <button key={t.key} type="button" data-tab-key={t.key} onClick={() => choose(t.key)}
                className={`-mb-px shrink-0 border-b-2 px-4 py-2 text-sm font-medium ${tab === t.key ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
                {t.label}
              </button>
            ))}
          </ScrollTabs>
          {tab === "buy" ? <FabricBuyCalc /> : <div className="max-w-5xl"><ClassicFabricCalc /></div>}
        </div>
      </div>
    </PlaygroundShell>
  );
}
