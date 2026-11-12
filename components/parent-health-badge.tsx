"use client";
/**
 * ParentHealthBadge — ป้าย "⚠ ต้องแก้ N อย่าง" ที่แถบเครื่องมือของลิ้นชัก Parent SKU (เจ้าของขอ 2026-11-11)
 *   กดป้าย = รายการที่ขาด (แดง = จำเป็น · เหลือง = ควรเติม) · กดแต่ละข้อ = พาไปแท็บนั้น (gotoFormTab ของกลาง)
 *   ครบแล้ว = ป้ายเขียวเล็ก "✓ ข้อมูลครบ"
 * ข้อมูล: GET /api/parent-skus/[id]/health · กฎ lib/parent-health · โหลดใหม่เมื่อบันทึก (version เปลี่ยน)
 * ของกลางที่ใช้: Popover · gotoFormTab (components/master-crud)
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/icon";
import { Popover } from "@/components/popover";
import type { HealthItem, HealthLevel } from "@/lib/parent-health";

export function ParentHealthBadge({ parentId, version, goto }: {
  parentId: string;
  /** เปลี่ยนเมื่อบันทึกสินค้า (เช่น updated_at) → โหลดใหม่ */
  version?: string;
  /** พาไปแท็บ: ส่ง key แท็บพิเศษ หรือคีย์ช่อง (หาแท็บของช่องเอง) · คืน false = ไปไม่ได้ (ช่องอยู่คอลัมน์ซ้าย ฯลฯ) */
  goto: (target: { tab?: string; field?: string }) => boolean;
}) {
  const [items, setItems] = useState<HealthItem[] | null>(null);
  const [level, setLevel] = useState<HealthLevel | null>(null);

  useEffect(() => {
    let alive = true;
    apiFetch(`/api/parent-skus/${encodeURIComponent(parentId)}/health`).then((r) => r.json())
      .then((j) => { if (alive && !j.error) { setItems((j.items ?? []) as HealthItem[]); setLevel((j.summary?.level ?? null) as HealthLevel | null); } })
      .catch(() => { /* ป้ายเสริม — โหลดไม่ได้ก็ไม่โชว์ */ });
    return () => { alive = false; };
  }, [parentId, version]);

  if (!items) return null;
  if (items.length === 0) return <span className="h-7 inline-flex items-center px-2 rounded-md text-[11.5px] text-emerald-700 bg-emerald-50" title="ข้อมูลหลักของสินค้านี้ครบแล้ว">✓ ข้อมูลครบ</span>;

  const red = level === "required";
  return (
    <Popover align="right" panelClassName="w-80 p-2"
      trigger={(toggle) => (
        <button type="button" onClick={toggle} title="สิ่งที่ยังขาดของสินค้านี้ — กดดูแล้วพาไปแก้"
          className={`h-7 px-2.5 rounded-md text-[12.5px] font-medium inline-flex items-center gap-1 border ${red ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100" : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"}`}>
          <Icon value="⚠️" size={15} /> ต้องแก้ {items.length} อย่าง
        </button>
      )}>
      {(close) => (
        <div className="text-sm">
          <div className="px-1 pb-1.5 mb-1 border-b border-slate-100 text-[11.5px] text-slate-500">สิ่งที่ยังขาด — กดเพื่อไปแก้</div>
          {items.map((it) => {
            const canGo = !!(it.tab || it.field);
            return (
              <button key={it.key} type="button" disabled={!canGo}
                onClick={() => { if (goto({ tab: it.tab, field: it.field })) close(); }}
                className="w-full flex items-center gap-2 px-1.5 py-1.5 rounded text-left hover:bg-slate-50 disabled:hover:bg-transparent">
                <span className={`w-2 h-2 rounded-full shrink-0 ${it.level === "required" ? "bg-rose-500" : "bg-amber-400"}`} />
                <span className="flex-1 text-slate-700">{it.label}</span>
                {canGo && <span className="text-slate-300">›</span>}
              </button>
            );
          })}
          <div className="px-1 pt-1.5 mt-1 border-t border-slate-100 text-[11px] text-slate-400">แดง = จำเป็น · เหลือง = ควรเติม</div>
        </div>
      )}
    </Popover>
  );
}
