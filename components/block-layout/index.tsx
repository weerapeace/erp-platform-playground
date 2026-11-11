"use client";
/**
 * 🧱 จัดกล่องในหน้า (ของกลาง) — ลากสลับลำดับ · เปิด/ปิด · ขนาดเต็ม/ครึ่ง · 2 ชั้น "ทั้งทีม" (แอดมิน) / "ของฉัน"
 * กติกา/รวมค่า = lib/block-layout (ล้วน ๆ มีเทสต์) · คู่มือ docs/block-layout.md
 *
 * ใช้:
 *   const DEFS = useMemo(() => [{ key: "gallery", label: "รูปงาน", icon: "image" }, …], []);   // ต้อง memo
 *   const layout = useBlockLayout("design_sheet_mobile", DEFS);
 *   <BlockLayoutRows blocks={layout.blocks} render={(key) => key === "gallery" ? <Gallery/> : …} />   // คืน null = กล่องนี้ไม่มีในใบนี้ (ข้าม)
 *   <BottomSheet …><BlockLayoutEditor layout={layout} /></BottomSheet>                           // หน้าจัด
 *
 * ใช้เมื่อ: หน้าที่เขียนเอง (ไม่ใช่ MasterCRUD) แบ่งเป็นกล่อง และอยากให้ทีม/แต่ละคนจัดเองได้ เช่น หน้ามือถือ หน้าภาพรวม
 * ห้ามใช้เมื่อ: ฟอร์ม/หน้าข้อมูลของ MasterCRUD (ใช้ตัวออกแบบฟอร์ม StudioPanel) · คอลัมน์ตาราง (Column Manager ของตารางกลาง)
 */
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { useUserPref } from "@/lib/use-user-pref";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { ToggleSwitch } from "@/components/toggle-switch";
import { DragHandle, moveItem, useDragReorder } from "@/components/sortable-list";
import {
  blockMineKey, blockTeamKey, packRows, parseBlockLayout, resolveBlocks, withBlockChange,
  type BlockDef, type BlockLayoutPref, type BlockSize, type ResolvedBlock,
} from "@/lib/block-layout";

export type { BlockDef, BlockSize, ResolvedBlock } from "@/lib/block-layout";

// ค่าทีมต่อหน้า — โหลดครั้งเดียวต่อแท็บเบราว์เซอร์ (เปิดใบงานใบถัดไปไม่ต้องถามใหม่)
const teamCache = new Map<string, BlockLayoutPref | null>();

export type BlockLayoutState = {
  pageKey: string;
  defs: BlockDef[];
  /** หน้าตาที่ใช้อยู่ (ของฉัน > ทีม > ค่าเริ่มต้น) */
  blocks: ResolvedBlock[];
  team: BlockLayoutPref | null;
  mine: BlockLayoutPref | null;
  setMine: (p: BlockLayoutPref | null) => void;
  /** บันทึกแบบของทีม (แอดมิน) — คืนข้อความผิดพลาด หรือ null */
  saveTeam: (p: BlockLayoutPref | null) => Promise<string | null>;
  canTeam: boolean;
};

export function useBlockLayout(pageKey: string, defs: BlockDef[]): BlockLayoutState {
  const { can, permsReady } = useAuth();
  const canTeam = permsReady && can("admin.users");
  const [mine, setMine] = useUserPref<BlockLayoutPref | null>(blockMineKey(pageKey), null, parseBlockLayout);
  const [team, setTeam] = useState<BlockLayoutPref | null>(() => teamCache.get(pageKey) ?? null);
  useEffect(() => {
    if (teamCache.has(pageKey)) { setTeam(teamCache.get(pageKey) ?? null); return; }
    let alive = true;
    apiFetch(`/api/ui-config?key=${encodeURIComponent(blockTeamKey(pageKey))}`)
      .then((r) => (r.ok ? r.json() as Promise<{ value?: unknown }> : null))
      .then((j) => { const v = parseBlockLayout(j?.value); teamCache.set(pageKey, v); if (alive) setTeam(v); })
      .catch(() => { /* อ่านไม่ได้ = ใช้ค่าเริ่มต้นของหน้า */ });
    return () => { alive = false; };
  }, [pageKey]);
  const saveTeam = async (p: BlockLayoutPref | null): Promise<string | null> => {
    try {
      const r = await apiFetch("/api/ui-config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: blockTeamKey(pageKey), value: p ?? {} }) });
      const j = await r.json().catch(() => ({})) as { error?: string | null };
      if (!r.ok || j.error) return j.error || "บันทึกแบบของทีมไม่สำเร็จ";
      teamCache.set(pageKey, p);
      setTeam(p);
      return null;
    } catch { return "บันทึกแบบของทีมไม่สำเร็จ ลองใหม่อีกครั้ง"; }
  };
  const blocks = useMemo(() => resolveBlocks(defs, team, mine), [defs, team, mine]);
  return { pageKey, defs, blocks, team, mine, setMine, saveTeam, canTeam };
}

/** วางกล่องตามที่จัด — render คืน null/false = กล่องนี้ไม่มีในหน้านี้ (ข้ามไป ไม่เว้นช่อง)
 *  sizeOverride = บังคับขนาดชั่วคราว (เช่น กล่องที่กางดูอยู่ = เต็มแถว) */
export function BlockLayoutRows({ blocks, render, sizeOverride, className = "space-y-3", pairClassName = "grid grid-cols-2 gap-3" }: {
  blocks: ResolvedBlock[];
  render: (key: string, block: ResolvedBlock) => ReactNode;
  sizeOverride?: Partial<Record<string, BlockSize>>;
  className?: string;
  pairClassName?: string;
}) {
  const shown = blocks
    .filter((b) => b.on)
    .map((b) => ({ ...b, sizeNow: sizeOverride?.[b.key] ?? b.sizeNow, node: render(b.key, b) }))
    .filter((b) => b.node != null && b.node !== false);
  return (
    <div className={className}>
      {packRows(shown).map((row) => row.length === 2
        ? <div key={`${row[0].key}+${row[1].key}`} className={pairClassName}>{row[0].node}{row[1].node}</div>
        : <Fragment key={row[0].key}>{row[0].node}</Fragment>)}
    </div>
  );
}

const SEG = (on: boolean) => `h-7 whitespace-nowrap rounded-md px-2.5 text-xs ${on ? "bg-white font-medium text-slate-800 shadow-sm ring-1 ring-slate-200" : "text-slate-500"}`;

/** หน้าจัดกล่อง — วางใน BottomSheet/ป๊อปอัปของหน้านั้น
 *  ของฉัน = จัดแล้วจำทันที (ทุกเครื่อง) · ทั้งทีม (เฉพาะ admin.users) = แก้แล้วกด "บันทึกให้ทั้งทีม" (มีประวัติ)
 *  missing = กล่องที่ใบ/หน้านี้ไม่มีข้อมูล (บอกในรายการ ยังจัดได้) */
export function BlockLayoutEditor({ layout, missing }: { layout: BlockLayoutState; missing?: Set<string> }) {
  const toast = useToast();
  const [scope, setScope] = useState<"mine" | "team">("mine");
  const [draft, setDraft] = useState<BlockLayoutPref | null | undefined>(undefined);   // undefined = ยังไม่ได้แก้แบบทีม
  const [saving, setSaving] = useState(false);
  const team = scope === "team";
  const teamPref = draft === undefined ? layout.team : draft;
  const base = team ? resolveBlocks(layout.defs) : resolveBlocks(layout.defs, layout.team);
  const pref = team ? teamPref : layout.mine;
  const list = team ? resolveBlocks(layout.defs, teamPref) : resolveBlocks(layout.defs, layout.team, layout.mine);
  const apply = (change: Parameters<typeof withBlockChange>[2]) => {
    const next = withBlockChange(base, pref, change);
    if (team) setDraft(next); else layout.setMine(next);
  };
  const { rowProps, handleProps, rowCls } = useDragReorder(
    (from, to) => apply({ order: moveItem(list.map((b) => b.key), from, to) }),
    { group: `block-layout:${layout.pageKey}` },
  );
  const saveTeam = async () => {
    setSaving(true);
    const err = await layout.saveTeam(teamPref ?? null);
    setSaving(false);
    if (err) { toast.error(err); return; }
    setDraft(undefined);
    toast.success("บันทึกแบบของทีมแล้ว");
  };
  return (
    <div className="space-y-3">
      {layout.canTeam && (
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
          <button type="button" onClick={() => setScope("mine")} className={SEG(!team)}>ของฉัน</button>
          <button type="button" onClick={() => setScope("team")} className={SEG(team)}>ทั้งทีม</button>
        </div>
      )}
      <p className="text-[11px] leading-snug text-slate-500">
        {team
          ? "แบบมาตรฐานของทุกคน · คนที่จัด \"ของฉัน\" ไว้เอง จะเห็นของตัวเองก่อน"
          : "ลากหูจับเพื่อสลับที่ · สวิตช์ = โชว์/ซ่อน · ครึ่ง = วางคู่กัน 2 กล่อง · จัดแล้วจำเอง (ทุกเครื่องของคุณ)"}
      </p>
      <div className="space-y-1.5">
        {list.map((b, i) => (
          <div key={b.key} {...rowProps(i)} className={`flex items-center gap-2 rounded-xl border border-slate-200 bg-white py-1.5 pl-1 pr-2 ${rowCls(i)}`}>
            <DragHandle {...handleProps(i)} title="ลากเพื่อสลับที่" />
            <span className={b.on ? "text-slate-600" : "text-slate-300"}><Icon name={b.icon} /></span>
            <div className="min-w-0 flex-1">
              <div className={`truncate text-sm ${b.on ? "text-slate-800" : "text-slate-400"}`}>{b.label}</div>
              {(missing?.has(b.key) || b.hint) && <div className="truncate text-[11px] text-slate-400">{missing?.has(b.key) ? "ใบนี้ไม่มีข้อมูลส่วนนี้" : b.hint}</div>}
            </div>
            {b.sizesOk.length > 1 && (
              <div className="inline-flex shrink-0 rounded-lg bg-slate-100 p-0.5">
                {b.sizesOk.map((s) => (
                  <button key={s} type="button" onClick={() => apply({ size: [b.key, s] })} className={SEG(b.sizeNow === s)}>{s === "full" ? "เต็ม" : "ครึ่ง"}</button>
                ))}
              </div>
            )}
            <ToggleSwitch size="sm" on={b.on} onChange={(v) => apply({ vis: [b.key, v] })} title={b.on ? `ซ่อน ${b.label}` : `โชว์ ${b.label}`} />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {team ? (<>
          <button type="button" onClick={() => setDraft(null)} className="h-9 rounded-lg px-3 text-xs text-slate-500 hover:bg-slate-100">ล้างเป็นค่าเริ่มต้น</button>
          <div className="flex gap-1.5">
            {draft !== undefined && <button type="button" onClick={() => setDraft(undefined)} className="h-9 rounded-lg border border-slate-200 px-3 text-xs text-slate-600">ยกเลิก</button>}
            <button type="button" onClick={() => void saveTeam()} disabled={saving || draft === undefined}
              className="h-9 rounded-lg bg-blue-600 px-4 text-xs font-medium text-white disabled:opacity-40">{saving ? "กำลังบันทึก…" : "บันทึกให้ทั้งทีม"}</button>
          </div>
        </>) : (
          <button type="button" onClick={() => layout.setMine(null)} disabled={!layout.mine}
            className="h-9 rounded-lg px-3 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-40">{layout.team ? "ใช้แบบของทีม" : "คืนค่าเริ่มต้น"}</button>
        )}
      </div>
    </div>
  );
}
