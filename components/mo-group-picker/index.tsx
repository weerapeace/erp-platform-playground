"use client";

/**
 * ของกลาง — ตัวเลือก "ชุด" (= กลุ่มใบสั่งงาน mo_groups)
 *   • useMoGroups()     : โหลดรายการชุดที่ใช้งานอยู่ (/api/mo/groups) — แหล่งเดียวของทุกหน้า
 *   • MoGroupOptions    : รายการชุดแบบติ๊กเลือก (ชุดที่ใช้ล่าสุดขึ้นก่อน · จำนวนใบ · ป้ายเสริม) — ใช้ในป๊อปจัดกลุ่ม MO และใน dropdown ด้านล่าง
 *   • MoGroupPicker     : ช่องเลือกชุดแบบ dropdown ลอย (ค้นหา · ชุดล่าสุด · พิมพ์ชื่อแล้ว "สร้างชุดใหม่")
 *                         ชุดใหม่ยังไม่สร้างทันที → คืน { id: null, name } ให้หน้าที่เรียกส่งไปสร้างตอนบันทึก
 * ใช้ที่: ใบสั่งขาย (ลงออเดอร์ทีละหลายรายการ / ฟอร์มใบ) · ป๊อป "จัดกลุ่มใบสั่งงาน" (หน้าใบสั่งผลิต · บอร์ดจ่ายงาน · ช้อปจ่ายงาน)
 * ของกลางที่ใช้: FloatingDropdown (+PICKER_PANEL) · lib/recent-picks (RECENT_KEYS.moGroups)
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { FloatingDropdown, PICKER_PANEL, PICKER_NAME_CLASS } from "@/components/floating-dropdown";
import { useRecentPicks, pushRecent, RECENT_KEYS } from "@/lib/recent-picks";
import { Icon } from "@/components/icon";
import type { MoGroup } from "@/app/api/mo/groups/route";

export type { MoGroup } from "@/app/api/mo/groups/route";
/** ค่าที่เลือก — id = null คือ "ชุดใหม่" ที่ยังไม่ได้สร้าง (สร้างตอนบันทึกเอกสาร) */
export type MoGroupPick = { id: string | null; name: string };

type Recent = { id: string; name: string };

export function useMoGroups(enabled = true) {
  const [groups, setGroups] = useState<MoGroup[] | null>(null);
  const load = useCallback(async () => {
    try { const r = await apiFetch("/api/mo/groups"); const j = await r.json(); setGroups((j.data ?? []) as MoGroup[]); }
    catch { setGroups([]); }
  }, []);
  useEffect(() => { if (enabled) void load(); }, [enabled, load]);
  return { groups, reload: load };
}

/** จดว่าเพิ่งใช้ชุดนี้ (ให้ขึ้น "ใช้ล่าสุด" ทุกหน้าที่ใช้ตัวเลือกชุด) */
export const rememberMoGroup = (g: { id: string; name: string }) => { pushRecent<Recent>(RECENT_KEYS.moGroups, { id: g.id, name: g.name }); };

/** รายการชุดแบบติ๊กเลือก — ชุดที่ใช้ล่าสุดขึ้นก่อน */
export function MoGroupOptions({ groups, value, onSelect, badge, query = "", className = "max-h-56" }: {
  groups: MoGroup[];
  value: string | null;
  onSelect: (g: MoGroup) => void;
  /** ป้ายเสริมท้ายแถว เช่น "อยู่แล้ว 3" */
  badge?: (g: MoGroup) => ReactNode;
  query?: string;
  className?: string;
}) {
  const { recent } = useRecentPicks<Recent>(RECENT_KEYS.moGroups, true);
  const recentRank = useMemo(() => new Map(recent.map((r, i) => [r.id, i])), [recent]);
  const q = query.trim().toLowerCase();
  const list = useMemo(() => groups
    .filter((g) => !q || g.name.toLowerCase().includes(q))
    .sort((a, b) => (recentRank.get(a.id) ?? 99) - (recentRank.get(b.id) ?? 99)), [groups, q, recentRank]);

  if (list.length === 0) return <div className="px-2 py-3 text-center text-xs text-slate-400">{q ? "ไม่พบชุดที่ค้นหา" : "ยังไม่มีชุด"}</div>;
  return (
    <div className={`overflow-y-auto divide-y divide-slate-50 rounded-lg border border-slate-200 ${className}`}>
      {list.map((g) => (
        <label key={g.id} className="flex cursor-pointer items-center gap-2 px-2 py-1.5 hover:bg-slate-50">
          <input type="radio" checked={value === g.id} onChange={() => onSelect(g)} className="accent-blue-600" />
          <span className={`flex-1 ${PICKER_NAME_CLASS}`}>{g.name}</span>
          {recentRank.has(g.id) && <span className="text-[10px] text-slate-400" title="ใช้ล่าสุด">ล่าสุด</span>}
          {badge?.(g)}
          <span className="shrink-0 text-[11px] text-slate-400">{g.mo_nos.length} ใบ</span>
        </label>
      ))}
    </div>
  );
}

/** ช่องเลือกชุด (dropdown) — เลือกชุดเดิม หรือพิมพ์ชื่อแล้วสร้างชุดใหม่ */
export function MoGroupPicker({ value, onChange, placeholder = "เลือกชุด…", disabled, allowCreate = true, allowClear = true, size = "md" }: {
  value: MoGroupPick | null;
  onChange: (v: MoGroupPick | null) => void;
  placeholder?: string;
  disabled?: boolean;
  allowCreate?: boolean;
  allowClear?: boolean;
  size?: "sm" | "md";
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { groups } = useMoGroups(open);              // โหลดเมื่อเปิดเท่านั้น (ตารางหลายแถว = ไม่ยิงซ้ำทุกแถว)
  const typed = q.trim();
  const exact = (groups ?? []).find((g) => g.name.trim() === typed);

  const pick = (v: MoGroupPick | null) => {
    if (v?.id) rememberMoGroup({ id: v.id, name: v.name });
    onChange(v); setOpen(false); setQ("");
  };
  const h = size === "sm" ? "h-8 text-xs" : "h-9 text-sm";

  return (
    <div ref={anchorRef} className="relative min-w-0">
      <button type="button" disabled={disabled} onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 text-left ${h} hover:border-slate-300 disabled:bg-slate-50`}>
        <Icon name="folders" className="shrink-0 text-slate-400" />
        <span className={`min-w-0 flex-1 truncate ${value ? "text-slate-700" : "text-slate-400"}`}>
          {value ? (value.id ? value.name : `ชุดใหม่: ${value.name}`) : placeholder}
        </span>
        <span className="shrink-0 text-[10px] text-slate-400">▾</span>
      </button>
      <FloatingDropdown anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} {...PICKER_PANEL}>
        <div className="space-y-2 p-2">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && allowCreate && typed && !exact) { e.preventDefault(); pick({ id: null, name: typed }); } }}
            placeholder={allowCreate ? "ค้นหา หรือพิมพ์ชื่อชุดใหม่…" : "ค้นหาชุด…"}
            className="h-9 w-full rounded-lg border border-slate-200 px-2 text-sm outline-none focus:border-blue-400" />
          {groups === null ? <div className="py-3 text-center text-xs text-slate-400">กำลังโหลดชุด…</div>
            : <MoGroupOptions groups={groups} value={value?.id ?? null} query={q} className="max-h-[min(16rem,var(--fd-max-h))]"
                onSelect={(g) => pick({ id: g.id, name: g.name })} />}
          {allowCreate && typed && !exact && (
            <button type="button" onClick={() => pick({ id: null, name: typed })}
              className="w-full rounded-lg border border-dashed border-blue-300 bg-blue-50/60 px-2 py-1.5 text-left text-sm text-blue-700 hover:bg-blue-50">
              ＋ สร้างชุดใหม่ “{typed}” <span className="text-[11px] text-blue-500">(สร้างจริงตอนบันทึก)</span>
            </button>
          )}
          {allowClear && value && (
            <button type="button" onClick={() => pick(null)} className="w-full px-2 py-1 text-left text-xs text-slate-500 hover:text-rose-600">— ไม่จัดชุด —</button>
          )}
        </div>
      </FloatingDropdown>
    </div>
  );
}
