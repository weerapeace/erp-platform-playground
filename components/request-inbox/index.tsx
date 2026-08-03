"use client";

/**
 * ของกลาง — "กล่องคำขอ" ปุ่มเดียวที่รวมคำขอค้างจากหน้างานไว้ที่เดียว
 *
 *   <RequestInboxButton />        ปุ่ม 📋 คำขอ + ตัวเลขแดงรวมทุกชนิด → กดแล้วเลือกว่าจะดูคิวไหน
 *
 * ตอนนี้รวม 2 ชนิด:
 *   🙋 ขอเพิ่มวัตถุดิบ  → /api/master/material-requests   (คิว MaterialRequestQueue)
 *   📐 ขอแก้สูตร (BOM) → /api/bom/change-requests        (คิว BomChangeRequestQueue)
 *
 * จะเพิ่มชนิดใหม่: ใส่รายการใน SOURCES แล้วต่อ modal ในตาราง QUEUES ด้านล่าง — ไม่ต้องแก้หน้าที่เรียกใช้
 * ⚠️ ตัวคิวโหลดแบบ dynamic (เปิดถึงค่อยดาวน์โหลด) เพราะข้างในลาก SkuWizard/ตัวแก้สูตรมาด้วย = หนัก
 */
import { useCallback, useEffect, useRef, useState } from "react";
import dynamicImport from "next/dynamic";
import { apiFetch } from "@/lib/api";

const MaterialRequestQueue = dynamicImport(
  () => import("@/components/material-request").then((m) => m.MaterialRequestQueue), { ssr: false });
const BomChangeRequestQueue = dynamicImport(
  () => import("@/components/bom-change-request").then((m) => m.BomChangeRequestQueue), { ssr: false });

type SourceKey = "material" | "bom";
const SOURCES: { key: SourceKey; icon: string; label: string; hint: string; url: string }[] = [
  { key: "material", icon: "🙋", label: "ขอเพิ่มวัตถุดิบ", hint: "อนุมัติแล้วจะเปิดตัวสร้างสินค้าให้เติมต่อ", url: "/api/master/material-requests?status=pending" },
  { key: "bom", icon: "📐", label: "ขอแก้สูตร (BOM)", hint: "อนุมัติแล้วเขียนลงสูตรจริงทันที", url: "/api/bom/change-requests?status=pending" },
];

export function RequestInboxButton({ className = "" }: { className?: string }) {
  const [counts, setCounts] = useState<Record<SourceKey, number>>({ material: 0, bom: 0 });
  const [menuOpen, setMenuOpen] = useState(false);
  const [queue, setQueue] = useState<SourceKey | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    SOURCES.forEach((s) => {
      apiFetch(s.url).then((r) => r.json())
        .then((j) => setCounts((c) => ({ ...c, [s.key]: Number(j?.pending ?? 0) })))
        .catch(() => { /* นับไม่ได้ก็ปล่อย — ไม่ให้ปุ่มพัง */ });
    });
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  // คลิกนอกเมนู = ปิด
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const total = counts.material + counts.bom;

  return (
    <div ref={wrapRef} className={`relative inline-block ${className}`}>
      <button onClick={() => { setMenuOpen((v) => !v); refresh(); }}
        title="คำขอจากหน้างานที่รออนุมัติ (ขอเพิ่มวัตถุดิบ / ขอแก้สูตร)"
        className={`h-9 px-3 text-sm font-medium border rounded-lg whitespace-nowrap ${total > 0 ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
        📋 คำขอ
        {total > 0 && <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-rose-500 text-white">{total}</span>}
      </button>

      {menuOpen && (
        <div className="absolute right-0 top-full mt-1 z-40 w-72 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          {SOURCES.map((s) => (
            <button key={s.key} onClick={() => { setMenuOpen(false); setQueue(s.key); }}
              className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100 last:border-0">
              <span className="text-lg leading-none mt-0.5">{s.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-700">{s.label}</span>
                <span className="block text-[11px] text-slate-400">{s.hint}</span>
              </span>
              <span className={`shrink-0 px-1.5 py-0.5 text-[11px] font-bold rounded-full ${counts[s.key] > 0 ? "bg-rose-100 text-rose-600" : "bg-slate-100 text-slate-400"}`}>
                {counts[s.key]}
              </span>
            </button>
          ))}
          {total === 0 && <div className="px-3 py-2 text-[11px] text-slate-400 bg-slate-50">ไม่มีคำขอค้าง 🎉</div>}
        </div>
      )}

      {queue === "material" && <MaterialRequestQueue open onClose={() => { setQueue(null); refresh(); }} onChanged={refresh} />}
      {queue === "bom" && <BomChangeRequestQueue open onClose={() => { setQueue(null); refresh(); }} onChanged={refresh} />}
    </div>
  );
}
