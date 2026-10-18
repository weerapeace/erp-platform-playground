"use client";

/**
 * 🔤 เช็กรหัสสด ๆ ใต้ช่อง Code (ของกลาง · กฎใน lib/code-rules)
 *   ซ้ำ (ไม่สนตัวเล็ก/ใหญ่) = แดง "ห้ามบันทึก" + ปุ่มดูตัวที่ซ้ำ  ·  พิมพ์เล็ก/ช่องว่าง = เหลือง "บันทึกได้" + ปุ่มแก้ 1 คลิก
 * ใช้: ตัวแก้สินค้ากลาง (MasterCRUD ช่อง code ของ Parent/SKU) + แถวเพิ่ม SKU ในตารางลูก (relation-multi)
 * DB กันซ้ำจริงอยู่แล้ว — ตัวนี้แค่บอกล่วงหน้าตอนพิมพ์ (หน่วง 400ms กันยิงทุกตัวอักษร)
 */
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { codeWarnings, type CodeWarning } from "@/lib/code-rules";

export type CodeCheck = { duplicate: { id: string; code: string } | null; warnings: CodeWarning[]; checking: boolean };

/** checkUrl = /api/master-v2/<entity>/check-code · enabled=false → ไม่เช็ก (คืนค่าว่าง) */
export function useCodeCheck(checkUrl: string | null, value: string, excludeId?: string | null, enabled = true): CodeCheck {
  const warnings = useMemo(() => (enabled ? codeWarnings(value) : []), [value, enabled]);
  const [duplicate, setDuplicate] = useState<CodeCheck["duplicate"]>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    if (!enabled || !checkUrl || !value.trim()) { setDuplicate(null); setChecking(false); return; }
    let live = true;
    setChecking(true);
    const tm = setTimeout(() => {
      apiFetch(`${checkUrl}?code=${encodeURIComponent(value)}${excludeId ? `&exclude_id=${excludeId}` : ""}`)
        .then((r) => r.json())
        .then((j) => { if (live) setDuplicate((j?.duplicate as CodeCheck["duplicate"]) ?? null); })
        .catch(() => { if (live) setDuplicate(null); })
        .finally(() => { if (live) setChecking(false); });
    }, 400);
    return () => { live = false; clearTimeout(tm); };
  }, [checkUrl, value, excludeId, enabled]);
  return { duplicate, warnings, checking };
}

export function CodeCheckMessages({ check, onFix, onViewDup, compact = false }: {
  check: CodeCheck; onFix?: (v: string) => void; onViewDup?: (id: string) => void; compact?: boolean;
}) {
  const { duplicate, warnings } = check;
  if (!duplicate && warnings.length === 0) return null;
  const txt = compact ? "text-[10px]" : "text-[11px]";
  const fix = warnings.length ? warnings[warnings.length - 1].fix : null;   // ตัวสุดท้าย = แก้ครบทุกข้อ (ตัดช่องว่าง + พิมพ์ใหญ่)
  return (
    <div className={`mt-1 space-y-0.5 ${txt}`}>
      {duplicate && (
        <div className="flex items-center gap-1.5 flex-wrap text-red-600">
          <span>⛔ ซ้ำกับ <b className="font-mono">{duplicate.code}</b> ที่มีอยู่แล้ว (ตัวเล็ก/ใหญ่ถือว่าซ้ำ) — บันทึกไม่ได้</span>
          {onViewDup && <button type="button" onClick={(e) => { e.preventDefault(); onViewDup(duplicate.id); }} className="underline hover:text-red-700">ดูตัวที่ซ้ำ</button>}
        </div>
      )}
      {warnings.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap text-amber-700">
          <span>⚠ {warnings.map((w) => w.message).join(" · ")} (บันทึกได้)</span>
          {onFix && fix && (
            <button type="button" onClick={(e) => { e.preventDefault(); onFix(fix); }}
              className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 font-medium hover:bg-amber-100">เปลี่ยนเป็น <span className="font-mono">{fix}</span></button>
          )}
        </div>
      )}
    </div>
  );
}
