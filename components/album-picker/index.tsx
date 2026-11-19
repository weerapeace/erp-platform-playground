"use client";
/**
 * AlbumPicker — ของกลาง: เลือกอัลบั้มในคลังไฟล์ (หลายอัน / อันเดียว) + ต้นไม้อัลบั้มสำหรับแถบข้าง
 *
 * ทำไมมี (2026-11-19): ช่องอัลบั้มเดิมโชว์ "ทุกอัลบั้ม" เป็นชิป/ดรอปดาวน์ยาว ~290 อัน (อัลบั้มย่อยของหน้า SAMPLE Images)
 *   ชื่อ "Version 1" ซ้ำกันหลายสิบอันแยกไม่ออก → ตัวนี้โชว์แค่อัลบั้มที่เลือก + ปุ่ม "+ เพิ่มอัลบั้ม" เปิดตัวค้น
 *   แต่ละอันมีเส้นทางแม่ ("SAMPLE … › Product 012") · ใช้ล่าสุดขึ้นบน · กลุ่ม SAMPLE ยุบตามแบรนด์ · ต้นไม้กางทีละชั้น
 * กติกาย่อ (เจ้าของสั่ง): รายการอัลบั้มที่ไหนเกิน 6 อัน → โชว์ 6 แล้วมีปุ่ม "ดูอีก N" (lib/album-options ALBUM_COLLAPSE_AT)
 *
 * ใช้:
 *   <AlbumMultiPicker albums={collections} value={ids} onChange={setIds} onCreate={async (name) => newId} />
 *   <AlbumSelect albums={collections} value={id} onChange={setId} noneLabel="— ไม่ระบุ —" />
 *   <AlbumTree options={buildAlbumOptions(collections)} renderRow={(o, x) => …} />   ← แถบข้าง/รายการที่เขียนแถวเอง
 * ห้ามใช้เมื่อ: อัลบั้มของหน้า SAMPLE Images ที่ต้องเห็นรูปปก → SampleAlbumPickerModal · อัลบั้ม Contents → แถบ Contents ของมันเอง
 * ข้อมูล: /api/assets/collections (ช่อง parent_id + group) · ตรรกะล้วน + เทสต์: lib/album-options.ts
 * คู่มือ: docs/album-picker.md
 */
import { useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/components/i18n";
import { useAuthOptional } from "@/components/auth";
import { ChipOverflow } from "@/components/chip-overflow";
import { useFloatPos } from "@/components/searchable-select";
import { useEscLayer } from "@/components/modal/esc-layer";
import { rankOptions } from "@/lib/fuzzy-rank";
import { RECENT_KEYS, useRecentPicks } from "@/lib/recent-picks";
import { ALBUM_COLLAPSE_AT, albumFullName, ancestorIds, buildAlbumOptions, collapseList, type AlbumLike, type AlbumOption } from "@/lib/album-options";

export type { AlbumLike, AlbumOption };
export { buildAlbumOptions, albumFullName };

// ── ปุ่ม "ดูอีก N" / "ย่อ" (หน้าตาเดียวทุกจุด) ──
function MoreButton({ hidden, open, onToggle, indent = 0 }: { hidden: number; open: boolean; onToggle: () => void; indent?: number }) {
  const t = useT();
  return (
    <button type="button" onClick={onToggle} style={{ paddingLeft: 8 + indent * 14 }}
      className="w-full text-left py-1 pr-2 text-[11px] text-indigo-600 hover:underline">
      {open ? t("ย่อ", "Show less") : `${t("ดูอีก", "Show")} ${hidden} ${t("อัน", "more")}`}
    </button>
  );
}

/** รายการที่ย่อได้ (เกิน 6 = โชว์ 6 + "ดูอีก N") — ใช้ซ้ำทุกรายการอัลบั้ม */
function Collapsible<T>({ items, render, indent = 0, limit = ALBUM_COLLAPSE_AT }: { items: T[]; render: (item: T) => ReactNode; indent?: number; limit?: number }) {
  const [open, setOpen] = useState(false);
  const { shown, hidden } = collapseList(items, open, limit);
  const canToggle = items.length > limit + 1;
  return (
    <>
      {shown.map(render)}
      {canToggle && <MoreButton hidden={hidden} open={open} onToggle={() => setOpen((v) => !v)} indent={indent} />}
    </>
  );
}

export type AlbumRowCtx = { depth: number; hasKids: boolean; expanded: boolean; toggle: () => void };

/**
 * ต้นไม้อัลบั้ม: อัลบั้มปกติ (ย่อ >6) → กลุ่ม SAMPLE ทีละแบรนด์ (ยุบไว้ กดกาง) → ในกลุ่มกางทีละชั้น (ย่อ >6 ทุกชั้น)
 * renderRow = หน้าตาแถว (ผู้เรียกวาดเอง) · activeId = กางทางไปหาอัลบั้มที่เลือกอยู่ให้เห็น
 */
export function AlbumTree({ options, renderRow, activeId, groupLabel }: {
  options: AlbumOption[];
  renderRow: (o: AlbumOption, ctx: AlbumRowCtx) => ReactNode;
  activeId?: string | null;
  groupLabel?: (group: string, albumCount: number, expanded: boolean, toggle: () => void) => ReactNode;
}) {
  const t = useT();
  const startOpen = useMemo(() => {
    const a = activeId ? ancestorIds(options, activeId) : [];
    const g = activeId ? options.find((o) => o.value === activeId)?.group : null;
    return { nodes: new Set(a), groups: new Set(g ? [g] : []) };
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps -- กางตามที่เลือกตอนเปิดเท่านั้น
  const [openNodes, setOpenNodes] = useState<Set<string>>(startOpen.nodes);
  const [openGroups, setOpenGroups] = useState<Set<string>>(startOpen.groups);
  const flip = (set: Set<string>, id: string) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n; };

  const kids = useMemo(() => {
    const m = new Map<string, AlbumOption[]>();
    for (const o of options) {
      const k = `${o.group ?? ""}|${o.parent ?? ""}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(o);
    }
    return m;
  }, [options]);
  const groups = useMemo(() => {
    const out: { name: string; count: number }[] = [];
    for (const o of options) {
      if (!o.group) continue;
      const g = out.find((x) => x.name === o.group);
      if (g) g.count++; else out.push({ name: o.group, count: 1 });
    }
    return out;
  }, [options]);

  const level = (group: string | null, parent: string | null, depth: number): ReactNode => {
    const items = kids.get(`${group ?? ""}|${parent ?? ""}`) ?? [];
    if (!items.length) return null;
    return (
      <Collapsible items={items} indent={depth} render={(o) => {
        const expanded = openNodes.has(o.value);
        return (
          <div key={o.value}>
            {renderRow(o, { depth, hasKids: o.children > 0, expanded, toggle: () => setOpenNodes((s) => flip(s, o.value)) })}
            {expanded && level(group, o.value, depth + 1)}
          </div>
        );
      }} />
    );
  };

  return (
    <>
      {level(null, null, 0)}
      {groups.map((g) => {
        const expanded = openGroups.has(g.name);
        const toggle = () => setOpenGroups((s) => flip(s, g.name));
        return (
          <div key={g.name}>
            {groupLabel ? groupLabel(g.name, g.count, expanded, toggle) : (
              <button type="button" onClick={toggle}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-slate-500 hover:bg-slate-50 rounded">
                <span className="w-3 text-slate-400">{expanded ? "▾" : "▸"}</span>
                <span className="flex-1 text-left truncate">{g.name}</span>
                <span className="text-slate-400 font-normal">{g.count} {t("อัลบั้ม", "albums")}</span>
              </button>
            )}
            {expanded && level(g.name, null, 1)}
          </div>
        );
      })}
    </>
  );
}

// ── แถวในตัวเลือก ──
function PickRow({ o, on, multi, depth = 0, showPath, ctx, onPick }: {
  o: AlbumOption; on: boolean; multi: boolean; depth?: number; showPath?: boolean; ctx?: AlbumRowCtx; onPick: () => void;
}) {
  return (
    <div className={`flex items-stretch ${on ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
      <span style={{ width: 4 + depth * 14 }} className="shrink-0" />
      {ctx?.hasKids
        ? <button type="button" onClick={ctx.toggle} className="w-5 shrink-0 text-[11px] text-slate-400 hover:text-slate-700" aria-label={ctx.expanded ? "ยุบ" : "กาง"}>{ctx.expanded ? "▾" : "▸"}</button>
        : <span className="w-5 shrink-0" />}
      <button type="button" onClick={onPick} className="flex-1 min-w-0 flex items-start gap-2 py-1.5 pr-2 text-left">
        {multi && <span className={`mt-0.5 shrink-0 w-3.5 h-3.5 rounded border text-[10px] leading-[12px] text-center ${on ? "bg-indigo-600 border-indigo-600 text-white" : "border-slate-300 bg-white"}`}>{on ? "✓" : ""}</span>}
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[13px] ${on ? "text-indigo-700 font-medium" : "text-slate-700"}`}>{o.label}</span>
          {showPath && o.sub && <span className="block truncate text-[11px] text-slate-400">{o.sub}</span>}
        </span>
        {o.count > 0 && <span className="shrink-0 text-[11px] text-slate-400">{o.count}</span>}
      </button>
    </div>
  );
}

function useCanCreate(perm?: string): boolean {
  const auth = useAuthOptional();
  if (!perm) return true;
  return !!auth?.can(perm as Parameters<NonNullable<typeof auth>["can"]>[0]);
}

// ── แผงลอย (ค้น + ใช้ล่าสุด + ต้นไม้) ──
function AlbumMenu({ anchor, options, selected, multi, onPick, onClose, none, onCreate }: {
  anchor: React.RefObject<HTMLElement | null>;
  options: AlbumOption[]; selected: string[]; multi: boolean;
  onPick: (id: string) => void; onClose: () => void;
  none?: { label: string; onPick: () => void };
  onCreate?: (name: string) => void;
}) {
  const t = useT();
  const [q, setQ] = useState("");
  const pos = useFloatPos(true, anchor, 420);
  useEscLayer(true, onClose);
  const { recent, remember } = useRecentPicks<{ id: string }>(RECENT_KEYS.albums, true);
  const byId = useMemo(() => new Map(options.map((o) => [o.value, o])), [options]);
  const ranked = useMemo(() => (q.trim() ? rankOptions(options, q) : []), [q, options]);
  const recentOpts = recent.map((r) => byId.get(r.id)).filter((o): o is AlbumOption => !!o).slice(0, ALBUM_COLLAPSE_AT);
  const pick = (id: string) => { remember({ id }); onPick(id); if (!multi) onClose(); };
  const isOn = (id: string) => selected.includes(id);
  const exact = q.trim() && options.some((o) => o.label.trim().toLowerCase() === q.trim().toLowerCase());
  if (!pos) return null;
  return createPortal(
    <>
      <div className="fixed inset-0 z-[1000]" onClick={onClose} />
      <div className="fixed z-[1001] bg-white border border-slate-200 rounded-lg shadow-xl flex flex-col"
        style={{ left: Math.max(8, Math.min(pos.left, window.innerWidth - Math.min(360, window.innerWidth - 16) - 8)), top: pos.top, width: Math.min(360, window.innerWidth - 16), maxHeight: 420, transform: pos.openUp ? "translateY(calc(-100% - 4px))" : "translateY(4px)" }}>
        <div className="p-2 border-b border-slate-100">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (ranked[0]) pick(ranked[0].value); else if (onCreate && q.trim()) { onCreate(q.trim()); setQ(""); } } }}
            placeholder={t("ค้นชื่ออัลบั้ม หรือชื่อแม่ เช่น Product 012", "Search album or parent, e.g. Product 012")}
            className="w-full h-8 px-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto py-1">
          {q.trim() ? (
            <>
              {ranked.length === 0 && <div className="px-3 py-2 text-xs text-slate-400">{t("ไม่เจออัลบั้มนี้", "No album found")}</div>}
              <Collapsible key={q} items={ranked} render={(o) => <PickRow key={o.value} o={o} on={isOn(o.value)} multi={multi} showPath onPick={() => pick(o.value)} />} />
            </>
          ) : (
            <>
              {none && (
                <button type="button" onClick={() => { none.onPick(); onClose(); }}
                  className={`w-full text-left px-3 py-1.5 text-[13px] hover:bg-slate-50 ${selected.length === 0 ? "text-indigo-700 font-medium bg-indigo-50" : "text-slate-500"}`}>{none.label}</button>
              )}
              {recentOpts.length > 0 && (
                <>
                  <p className="px-3 pt-2 pb-1 text-[11px] text-slate-400">{t("ใช้ล่าสุด", "Recent")}</p>
                  {recentOpts.map((o) => <PickRow key={`r-${o.value}`} o={o} on={isOn(o.value)} multi={multi} showPath onPick={() => pick(o.value)} />)}
                  <p className="px-3 pt-2 pb-1 text-[11px] text-slate-400 border-t border-slate-100 mt-1">{t("ทั้งหมด", "All albums")}</p>
                </>
              )}
              <AlbumTree options={options} activeId={selected[0] ?? null}
                renderRow={(o, ctx) => <PickRow o={o} on={isOn(o.value)} multi={multi} depth={ctx.depth} ctx={ctx} onPick={() => pick(o.value)} />} />
            </>
          )}
          {onCreate && q.trim() && !exact && (
            <button type="button" onClick={() => { onCreate(q.trim()); setQ(""); }}
              className="w-full text-left px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50 border-t border-slate-100">
              ＋ {t("สร้างอัลบั้มใหม่", "New album")}: <strong>&ldquo;{q.trim()}&rdquo;</strong>
            </button>
          )}
        </div>
        {multi && (
          <div className="p-2 border-t border-slate-100 flex justify-end">
            <button type="button" onClick={onClose} className="h-7 px-3 text-[12px] rounded-md bg-indigo-600 text-white hover:bg-indigo-700">{t("เสร็จ", "Done")}</button>
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}

/**
 * เลือกหลายอัลบั้ม: ชิปเฉพาะอัลบั้มที่เลือก (เกิน 6 = ย่อ) + ปุ่ม "+ เพิ่มอัลบั้ม"
 * onCreate (ไม่ใส่ = ไม่มีปุ่มสร้าง) = สร้างอัลบั้มใหม่จากคำค้น → คืน id ใหม่ (ตัวนี้ติ๊กให้เลย) หรือ null
 */
export function AlbumMultiPicker({ albums, value, onChange, disabled, onCreate, createPermission = "assets.manage", emptyLabel }: {
  albums: readonly AlbumLike[]; value: string[]; onChange: (ids: string[]) => void; disabled?: boolean;
  onCreate?: (name: string) => Promise<string | null>; createPermission?: string; emptyLabel?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const options = useMemo(() => buildAlbumOptions(albums), [albums]);
  const byId = useMemo(() => new Map(options.map((o) => [o.value, o])), [options]);
  const canCreate = useCanCreate(createPermission) && !!onCreate;
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const create = async (name: string) => { const id = await onCreate?.(name); if (id && !value.includes(id)) onChange([...value, id]); };
  return (
    <div className="min-w-0">
      {value.length === 0
        ? <span className="text-[11px] text-slate-400">{emptyLabel ?? t("ยังไม่อยู่อัลบั้มไหน", "Not in any album")}</span>
        : (
          <ChipOverflow items={value} getKey={(id) => id} max={ALBUM_COLLAPSE_AT} renderChip={(id) => {
            const o = byId.get(id);
            return (
              <span title={o ? albumFullName(o) : id}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 pl-2.5 pr-1 py-0.5 text-[11px] text-indigo-700">
                <span className="min-w-0 truncate">{o?.label ?? t("(อัลบั้มถูกลบ)", "(deleted album)")}{o?.sub ? <span className="text-indigo-400"> · {o.sub}</span> : null}</span>
                {!disabled && <button type="button" onClick={() => toggle(id)} aria-label={t("เอาออกจากอัลบั้ม", "Remove from album")} className="shrink-0 px-1 text-indigo-300 hover:text-rose-500">✕</button>}
              </span>
            );
          }} />
        )}
      {!disabled && (
        <button ref={btnRef} type="button" onClick={() => setOpen((v) => !v)}
          className="mt-1.5 inline-flex items-center gap-1 h-7 px-2.5 text-[11px] rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
          ＋ {t("เพิ่มอัลบั้ม", "Add album")}
        </button>
      )}
      {open && !disabled && (
        <AlbumMenu anchor={btnRef} options={options} selected={value} multi onPick={toggle} onClose={() => setOpen(false)}
          onCreate={canCreate ? (n) => void create(n) : undefined} />
      )}
    </div>
  );
}

/** เลือกอัลบั้มอันเดียว (แทน select ยาว) · value "" = ไม่เลือก (noneLabel) · compact = ปุ่มสูง 32px สำหรับแถบตัวกรอง */
export function AlbumSelect({ albums, value, onChange, noneLabel, compact, className = "", showCount }: {
  albums: readonly AlbumLike[]; value: string; onChange: (id: string) => void; noneLabel: string; compact?: boolean; className?: string; showCount?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const options = useMemo(() => buildAlbumOptions(albums), [albums]);
  const cur = options.find((o) => o.value === value);
  return (
    <div className={`relative min-w-0 ${className}`}>
      <button ref={btnRef} type="button" onClick={() => setOpen((v) => !v)} title={cur ? albumFullName(cur) : noneLabel}
        className={`w-full ${compact ? "h-8 text-[12px]" : "h-9 text-sm"} px-2 text-left border border-slate-200 rounded-lg bg-white flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-indigo-500`}>
        <span className="flex-1 min-w-0 truncate">
          {cur ? <>{cur.label}{showCount && cur.count ? ` (${cur.count})` : ""}{cur.sub ? <span className="text-[11px] text-slate-400"> · {cur.sub}</span> : null}</> : <span className="text-slate-500">{noneLabel}</span>}
        </span>
        <span className="text-slate-400 text-xs">▾</span>
      </button>
      {open && (
        <AlbumMenu anchor={btnRef} options={options} selected={value ? [value] : []} multi={false}
          onPick={(id) => onChange(id)} onClose={() => setOpen(false)} none={{ label: noneLabel, onPick: () => onChange("") }} />
      )}
    </div>
  );
}
