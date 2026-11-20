"use client";
/**
 * 🏷️ TagColumns — เลือกแท็กแบบ "หมวดซ้าย · แท็กขวา" เหมือนเมนูหน้าเว็บ (เจ้าของสั่ง 2026-11-20) — ของกลาง
 *
 * ใช้ทำอะไร: แสดงแท็ก (product_families) แบ่งตามกลุ่ม — คอลัมน์ซ้าย = หมวด (กลุ่มชั้นบนสุด) · คอลัมน์ขวา = แท็กในหมวดนั้น
 *   (หมวดย่อย ↳ แสดงเป็นหัวข้อคั่นในคอลัมน์ขวา) · มีช่องค้นหาข้ามทุกหมวด · จำหมวดที่เปิดล่าสุด (ต่อ storageKey)
 * มือถือ (จอแคบกว่า sm): เห็นรายการหมวดก่อน → แตะหมวด = เข้าไปดูแท็ก → ปุ่ม "‹ หมวดทั้งหมด" กลับ
 * ใช้ที่: ป๊อปเลือกแท็กในฟอร์มสินค้า (components/relation-multi) · ช่อง "ประเภท (Tag)" ในป๊อปเพิ่ม SKU (app/master/skus/sku-wizard)
 * ใช้เมื่อ: ต้องให้ผู้ใช้เลือกแท็กจากหลายกลุ่ม · ห้ามใช้: เลือก SKU/Parent (ใช้ SkuPicker) · กรองตารางด้วยแท็ก (ใช้ TagFilter ของตาราง)
 * ตัวนี้ "แสดงผลอย่างเดียว" — การเลือก/ติ๊ก/ลากวาง ผู้เรียกส่ง renderTag มาเอง (เลือกหลายตัว/ตัวเดียวได้ทั้งคู่)
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useT } from "@/components/i18n";

export type TagColGroup = { id: string; name: string; parent_group_id: string | null; single_select?: boolean; sort_order?: number | null };
export type TagColTag = { id: string; label: string; group_id?: string | null; sort_order?: number | null };

const UNGROUPED = "__none__";
const SEARCH = "__search__";

export function TagColumns({ groups, tags, query, renderTag, selectedIds, storageKey, emptyText, after }: {
  groups: TagColGroup[];
  tags: TagColTag[];
  /** คำค้น (ผู้เรียกถือช่องค้นหาเอง) — มีคำค้น = คอลัมน์ขวาโชว์แท็กที่ตรงจากทุกหมวด */
  query?: string;
  renderTag: (t: TagColTag) => ReactNode;
  /** แท็กที่เลือกอยู่ — ใช้นับจุดบอกจำนวนที่เลือกในแต่ละหมวด */
  selectedIds?: string[];
  /** จำหมวดที่เปิดล่าสุด (localStorage) — เช่น "sku-wizard" · ไม่ใส่ = ไม่จำ */
  storageKey?: string;
  emptyText?: string;
  /** ของต่อท้ายคอลัมน์ขวา (เช่น ปุ่ม "สร้างแท็กใหม่") */
  after?: ReactNode;
}) {
  const t = useT();
  const lsKey = storageKey ? `tag-columns:last:${storageKey}` : null;
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const ord = (a: { sort_order?: number | null }, b: { sort_order?: number | null }) => (a.sort_order ?? 100) - (b.sort_order ?? 100);
  const topGroups = useMemo(() => groups.filter((g) => !g.parent_group_id).sort((a, b) => ord(a, b) || a.name.localeCompare(b.name, "th")), [groups]);
  const subsOf = (gid: string) => groups.filter((g) => g.parent_group_id === gid).sort((a, b) => ord(a, b) || a.name.localeCompare(b.name, "th"));
  const byTag = (a: TagColTag, b: TagColTag) => ord(a, b) || a.label.localeCompare(b.label, "th");
  // หมวดบนสุดของแท็ก (ไล่ขึ้นตาม parent_group_id)
  const topOf = (gid: string | null | undefined): string => {
    let cur = gid ?? null; const seen = new Set<string>();
    while (cur && !seen.has(cur)) { seen.add(cur); const g = groupById.get(cur); if (!g) return UNGROUPED; if (!g.parent_group_id) return g.id; cur = g.parent_group_id; }
    return UNGROUPED;
  };
  const ql = (query ?? "").trim().toLowerCase();
  const matches = useMemo(() => tags.filter((x) => !ql || x.label.toLowerCase().includes(ql)), [tags, ql]);
  const countIn = (top: string, list: TagColTag[]) => list.filter((x) => topOf(x.group_id) === top).length;
  const selSet = useMemo(() => new Set(selectedIds ?? []), [selectedIds]);
  const hasUngrouped = tags.some((x) => topOf(x.group_id) === UNGROUPED);

  const [active, setActive] = useState<string | null>(null);
  const [mobileTags, setMobileTags] = useState(false);   // มือถือ: false = เห็นรายการหมวด · true = เห็นแท็กในหมวด
  // เลือกหมวดตั้งต้น: ที่จำไว้ → หมวดแรกที่มีแท็ก
  useEffect(() => {
    if (active && (active === UNGROUPED || groupById.has(active))) return;
    let saved: string | null = null;
    try { saved = lsKey ? localStorage.getItem(lsKey) : null; } catch { /* ไม่มี storage */ }
    const firstWithTags = topGroups.find((g) => countIn(g.id, tags) > 0)?.id ?? (hasUngrouped ? UNGROUPED : topGroups[0]?.id ?? null);
    setActive(saved && (saved === UNGROUPED || groupById.has(saved)) ? saved : firstWithTags);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, tags]);
  const pick = (id: string) => { setActive(id); setMobileTags(true); try { if (lsKey) localStorage.setItem(lsKey, id); } catch { /* ไม่มี storage */ } };

  const view = ql ? SEARCH : active;
  const groupName = (id: string | null) => id === UNGROUPED ? t("ไม่มีกลุ่ม", "No group") : (id ? groupById.get(id)?.name ?? "" : "");
  const pickOne = (g: TagColGroup) => g.single_select ? <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-100 rounded px-1">{t("เลือกได้ 1", "Pick 1")}</span> : null;

  const leftItem = (id: string, name: string, single?: boolean) => {
    const n = countIn(id, ql ? matches : tags);
    const sel = tags.filter((x) => selSet.has(x.id) && topOf(x.group_id) === id).length;
    const on = !ql && active === id;
    return (
      <button key={id} type="button" onClick={() => pick(id)}
        className={`w-full flex items-center gap-1.5 px-2.5 py-2 text-sm text-left rounded-md ${on ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-700 hover:bg-white"} ${ql && n === 0 ? "opacity-40" : ""}`}>
        <span className="flex-1 truncate">{name}</span>
        {single && <span className="text-[10px] text-amber-600">1</span>}
        {sel > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[10px] inline-flex items-center justify-center">{sel}</span>}
        <span className="text-[11px] text-slate-400 tabular-nums">{n}</span>
        <span className="sm:hidden text-slate-300">›</span>
      </button>
    );
  };

  let right: ReactNode;
  if (view === SEARCH) {
    right = matches.length === 0
      ? <div className="text-xs text-slate-400 py-6 text-center">{t("ไม่พบแท็กที่ตรงคำค้น", "No tags match")}</div>
      : <div className="space-y-0.5">{[...matches].sort(byTag).map((x) => (
          <div key={x.id}>
            {renderTag(x)}
            <div className="-mt-1 mb-1 pl-8 text-[10px] text-slate-400 truncate">{groupName(topOf(x.group_id))}{x.group_id && groupById.get(x.group_id)?.parent_group_id ? ` › ${groupById.get(x.group_id)?.name}` : ""}</div>
          </div>
        ))}</div>;
  } else if (view === UNGROUPED) {
    right = <div className="space-y-0.5">{tags.filter((x) => topOf(x.group_id) === UNGROUPED).sort(byTag).map((x) => <div key={x.id}>{renderTag(x)}</div>)}</div>;
  } else if (view) {
    const g = groupById.get(view);
    const direct = tags.filter((x) => x.group_id === view).sort(byTag);
    const subs = subsOf(view).map((s) => ({ s, list: tags.filter((x) => x.group_id === s.id).sort(byTag) })).filter((x) => x.list.length > 0);
    right = (
      <div className="space-y-2">
        {g && pickOne(g) && <div className="flex items-center gap-1.5">{pickOne(g)}</div>}
        {direct.length > 0 && <div className="space-y-0.5">{direct.map((x) => <div key={x.id}>{renderTag(x)}</div>)}</div>}
        {subs.map(({ s, list }) => (
          <div key={s.id}>
            <div className="px-2 py-1 flex items-center gap-2 border-t border-slate-100 pt-2">
              <span className="text-xs font-medium text-slate-500">↳ {s.name}</span>{pickOne(s)}
            </div>
            <div className="space-y-0.5">{list.map((x) => <div key={x.id}>{renderTag(x)}</div>)}</div>
          </div>
        ))}
        {direct.length === 0 && subs.length === 0 && <div className="text-xs text-slate-400 py-6 text-center">{t("หมวดนี้ยังไม่มีแท็ก", "No tags in this group yet")}</div>}
      </div>
    );
  } else {
    right = <div className="text-xs text-slate-400 py-6 text-center">{emptyText ?? t("— ยังไม่มีแท็ก —", "— No tags yet —")}</div>;
  }

  const showTagsOnPhone = mobileTags || !!ql;
  return (
    <div className="sm:grid sm:grid-cols-[170px_minmax(0,1fr)] border border-slate-200 rounded-lg overflow-hidden min-h-[240px]">
      <div className={`${showTagsOnPhone ? "hidden" : "block"} sm:block bg-slate-50 sm:border-r border-slate-200 p-1.5 space-y-0.5 overflow-y-auto sm:max-h-[52vh]`}>
        {topGroups.filter((g) => countIn(g.id, tags) > 0 || subsOf(g.id).length > 0).map((g) => leftItem(g.id, g.name, g.single_select))}
        {hasUngrouped && leftItem(UNGROUPED, t("ไม่มีกลุ่ม", "No group"))}
      </div>
      <div className={`${showTagsOnPhone ? "block" : "hidden"} sm:block p-2 overflow-y-auto sm:max-h-[52vh]`}>
        <div className="flex items-center gap-2 mb-1.5 text-xs text-slate-500">
          {!ql && <button type="button" onClick={() => setMobileTags(false)} className="sm:hidden text-blue-600">‹ {t("หมวดทั้งหมด", "All groups")}</button>}
          <span className="font-medium text-slate-600">{ql ? t(`ผลค้นหา (${matches.length})`, `Results (${matches.length})`) : groupName(view)}</span>
        </div>
        {right}
        {after}
      </div>
    </div>
  );
}
