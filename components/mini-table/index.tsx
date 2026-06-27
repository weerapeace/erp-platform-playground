"use client";

/**
 * MiniTable — ตารางเล็กกลาง (ของกลาง ERP)
 * --------------------------------------------------------------------------
 * ใช้กับตารางย่อย ๆ ในป๊อปอัป/แผงข้าง/แท็บ ที่ไม่ต้องหนักเท่า Universal DataTable
 * แต่ยังได้ ค้นหา + เรียงลำดับ + จัดกลุ่ม + เลือกหลายแถว มาให้ในตัวเสมอ
 *
 * กฎ CLAUDE.md: ห้ามทำตารางเล็กแยกเองทุกหน้า — หยิบตัวนี้ไปใช้
 *
 * วิธีใช้ (ย่อ):
 *   <MiniTable
 *     rows={data}
 *     rowKey={(r) => r.id}
 *     columns={[
 *       { key:"name", header:"ชื่อ", cell:(r)=>r.name, sortValue:(r)=>r.name, sortLabel:"ชื่อ" },
 *       { key:"qty",  header:"จำนวน", align:"right", width:"6rem",
 *         cell:(r)=>r.qty, sortValue:(r)=>r.qty, sortLabel:"จำนวน" },
 *     ]}
 *     searchText={(r) => `${r.code} ${r.name}`}      // เปิดช่องค้นหา
 *     groupBy={(r) => r.type}                         // เปิดปุ่มจัดกลุ่ม
 *     selectable selected={sel} onSelectedChange={setSel}
 *     actions={<button>...</button>}
 *   />
 */
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";

export type MiniColumn<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  width?: string;                       // grid track เช่น "6rem" | "1fr" | "1.5fr"
  sortValue?: (row: T) => string | number | null | undefined;   // ใส่เพื่อให้คอลัมน์นี้ "เรียงได้"
  sortLabel?: string;                   // ป้ายในเมนูเรียงลำดับ (ไม่ใส่ = ใช้ header ถ้าเป็น string)
};

export type MiniTableProps<T> = {
  rows: T[];
  columns: MiniColumn<T>[];
  rowKey: (row: T) => string;

  // ค้นหา — ใส่ฟังก์ชันคืน text ที่ค้นได้ จึงจะมีช่องค้นหา
  searchText?: (row: T) => string;
  searchPlaceholder?: string;

  // จัดกลุ่ม — ใส่ฟังก์ชันคืนชื่อกลุ่ม จึงจะมีปุ่มจัดกลุ่ม
  groupBy?: (row: T) => string;
  groupLabel?: string;
  defaultGrouped?: boolean;

  // เลือกหลายแถว (controlled)
  selectable?: boolean;
  selected?: Set<string>;
  onSelectedChange?: (next: Set<string>) => void;

  // คลิกแถว (เช่น เปิดรายละเอียด)
  onRowClick?: (row: T) => void;

  // ส่วนหัว
  title?: ReactNode;
  actions?: ReactNode;                  // มุมขวาบน เช่น ปุ่มสร้าง
  countUnit?: string;                   // หน่วยนับ เช่น "รายการ"

  // สถานะว่าง
  emptyText?: ReactNode;
  noMatchText?: (q: string) => ReactNode;

  // หน้าตา
  dense?: boolean;
  maxHeightClass?: string;              // เช่น "max-h-[calc(100vh-210px)]"
  className?: string;
  footnote?: ReactNode;

  // ปรับความกว้างคอลัมน์ได้ (ลากขอบหัวคอลัมน์) — opt-in · ใส่ storageKey เพื่อจำค่าไว้ในเครื่อง
  resizable?: boolean;
  storageKey?: string;
};

type Dir = "asc" | "desc";

export function MiniTable<T>(props: MiniTableProps<T>) {
  const {
    rows, columns, rowKey, searchText, searchPlaceholder = "ค้นหา…",
    groupBy, groupLabel = "จัดกลุ่ม", defaultGrouped = true,
    selectable, selected, onSelectedChange, onRowClick,
    title, actions, countUnit = "รายการ",
    emptyText = "ไม่มีข้อมูล", noMatchText,
    dense, maxHeightClass = "", className = "", footnote,
    resizable, storageKey,
  } = props;

  const sortable = columns.filter((c) => c.sortValue);
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<string>("");   // "" = ลำดับเดิม
  const [dir, setDir] = useState<Dir>("asc");
  const [grouped, setGrouped] = useState(defaultGrouped);

  // ความกว้างที่ผู้ใช้ลากปรับ (px ต่อ key) — โหลด/บันทึกจาก localStorage ถ้ามี storageKey
  const [widths, setWidths] = useState<Record<string, number>>({});
  const lsKey = storageKey ? `minitable:w:${storageKey}` : "";
  useEffect(() => {
    if (!resizable || !lsKey) return;
    try { const s = localStorage.getItem(lsKey); if (s) setWidths(JSON.parse(s)); } catch { /* ignore */ }
  }, [resizable, lsKey]);
  useEffect(() => {
    if (!resizable || !lsKey) return;
    try { localStorage.setItem(lsKey, JSON.stringify(widths)); } catch { /* ignore */ }
  }, [widths, resizable, lsKey]);

  // ลากขอบหัวคอลัมน์เพื่อปรับความกว้าง
  const dragRef = useRef<{ key: string; startX: number; startW: number } | null>(null);
  const startResize = (key: string) => (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const headerCell = (e.currentTarget as HTMLElement).parentElement as HTMLElement;
    dragRef.current = { key, startX: e.clientX, startW: headerCell.getBoundingClientRect().width };
    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current; if (!d) return;
      setWidths((prev) => ({ ...prev, [d.key]: Math.max(48, Math.round(d.startW + (ev.clientX - d.startX))) }));
    };
    const onUp = () => { dragRef.current = null; document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); document.body.style.cursor = ""; };
    document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp); document.body.style.cursor = "col-resize";
  };
  const resetWidths = () => setWidths({});

  const sel = selected ?? EMPTY;
  const setSel = (next: Set<string>) => onSelectedChange?.(next);

  // กรองด้วยคำค้น
  const qq = q.trim().toLowerCase();
  const filtered = useMemo(
    () => (qq && searchText ? rows.filter((r) => searchText(r).toLowerCase().includes(qq)) : rows),
    [rows, qq, searchText],
  );

  // เรียงลำดับ
  const sorted = useMemo(() => {
    const col = sortable.find((c) => c.key === sortKey);
    if (!col?.sortValue) return filtered;
    const sv = col.sortValue;
    const mul = dir === "desc" ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const va = sv(a), vb = sv(b);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * mul;
      return String(va ?? "").localeCompare(String(vb ?? ""), "th") * mul;
    });
  }, [filtered, sortKey, dir, sortable]);

  // จัดกลุ่ม
  const groups = useMemo<{ name: string; rows: T[] }[]>(() => {
    if (!groupBy || !grouped) return [{ name: "", rows: sorted }];
    const map = new Map<string, T[]>();
    for (const r of sorted) { const g = groupBy(r) || "ไม่ระบุ"; (map.get(g) ?? map.set(g, []).get(g)!).push(r); }
    return [...map.entries()].map(([name, rs]) => ({ name, rows: rs })).sort((a, b) => a.name.localeCompare(b.name, "th"));
  }, [sorted, groupBy, grouped]);

  // คลิกหัวคอลัมน์เพื่อเรียง (เฉพาะคอลัมน์ที่มี sortValue) — สลับ asc/desc
  const toggleSort = (key: string) => {
    if (sortKey === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setDir("asc"); }
  };

  const allKeys = sorted.map(rowKey);
  const allSel = allKeys.length > 0 && allKeys.every((k) => sel.has(k));
  const toggleKey = (k: string) => { const n = new Set(sel); n.has(k) ? n.delete(k) : n.add(k); setSel(n); };
  const setKeys = (keys: string[], on: boolean) => { const n = new Set(sel); keys.forEach((k) => (on ? n.add(k) : n.delete(k))); setSel(n); };

  // grid template — เพิ่มช่อง checkbox นำหน้าถ้าเลือกได้ · คอลัมน์ที่ลากปรับแล้วใช้ px
  const colTrack = (c: MiniColumn<T>) => (resizable && widths[c.key] != null ? `${widths[c.key]}px` : (c.width ?? "1fr"));
  const tmpl = (selectable ? "2.25rem " : "") + columns.map(colTrack).join(" ");
  const padY = dense ? "py-1.5" : "py-2";
  const alignCls = (a?: string) => (a === "right" ? "text-right justify-end" : a === "center" ? "text-center justify-center" : "");

  const HeaderCell = (
    <div className="grid gap-2 px-3 py-2 bg-slate-100 text-[11px] font-semibold text-slate-600" style={{ gridTemplateColumns: tmpl }}>
      {selectable && (
        <span className="flex justify-center">
          <input type="checkbox" checked={allSel} onChange={() => setSel(allSel ? new Set() : new Set(allKeys))} className="w-4 h-4 accent-rose-600" />
        </span>
      )}
      {columns.map((c) => {
        const canSort = !!c.sortValue;
        const active = sortKey === c.key;
        const handle = resizable ? <span onMouseDown={startResize(c.key)} title="ลากเพื่อปรับความกว้าง" className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-rose-300/70" /> : null;
        const wrapCls = `flex items-center gap-1 ${resizable ? "relative overflow-hidden pr-2" : ""} ${alignCls(c.align)}`;
        const head = resizable ? <span className="truncate">{c.header}</span> : c.header;   // truncate เฉพาะตอน resizable (กันกระทบตารางเดิม)
        if (!canSort) return <span key={c.key} className={wrapCls}>{head}{handle}</span>;
        return (
          <span key={c.key} className={wrapCls}>
            <button type="button" onClick={() => toggleSort(c.key)} title="คลิกเพื่อเรียง" className={`inline-flex items-center gap-1 min-w-0 hover:text-slate-900 ${active ? "text-rose-600" : ""}`}>
              {head}
              <span className="text-[9px] leading-none shrink-0">{active ? (dir === "asc" ? "▲" : "▼") : "↕"}</span>
            </button>
            {handle}
          </span>
        );
      })}
    </div>
  );

  const Row = (r: T, idx: number) => {
    const k = rowKey(r);
    const on = sel.has(k);
    return (
      <div key={k} onClick={onRowClick ? () => onRowClick(r) : undefined}
        className={`grid gap-2 px-3 ${padY} items-center ${on ? "bg-rose-50/40" : idx % 2 ? "bg-slate-50/30" : "bg-white"} ${onRowClick ? "cursor-pointer hover:bg-blue-50/40" : ""}`}
        style={{ gridTemplateColumns: tmpl }}>
        {selectable && (
          <span className="flex justify-center" onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={on} onChange={() => toggleKey(k)} className="w-4 h-4 accent-rose-600" />
          </span>
        )}
        {columns.map((c) => <div key={c.key} className={`min-w-0 text-sm text-slate-800 ${resizable ? "overflow-hidden" : ""} ${alignCls(c.align)}`}>{c.cell(r)}</div>)}
      </div>
    );
  };

  const total = rows.length, shown = sorted.length;

  return (
    <div className={`${maxHeightClass} ${maxHeightClass ? "overflow-y-auto pr-1" : ""} ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
          {title ? <h3 className="text-sm font-semibold text-slate-700">{title} <span className="text-slate-400">({shown !== total ? `${shown}/${total}` : total} {countUnit})</span></h3> : <span />}
          {actions}
        </div>
      )}

      {(searchText || sortable.length > 0 || groupBy) && total > 0 && (
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          {searchText && (
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder}
                className="h-8 w-56 pl-7 pr-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-rose-300" />
            </div>
          )}
          {sortable.length > 0 && (
            <>
              <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="h-8 px-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-600">
                <option value="">เรียง: ลำดับเดิม</option>
                {sortable.map((c) => <option key={c.key} value={c.key}>เรียง: {c.sortLabel ?? (typeof c.header === "string" ? c.header : c.key)}</option>)}
              </select>
              {sortKey && (
                <button onClick={() => setDir((d) => (d === "asc" ? "desc" : "asc"))} title="สลับทิศ" className="h-8 px-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-500">{dir === "asc" ? "▲ น้อย→มาก" : "▼ มาก→น้อย"}</button>
              )}
            </>
          )}
          {groupBy && (
            <button onClick={() => setGrouped((g) => !g)} className={`h-8 px-3 text-sm rounded-lg border ${grouped ? "bg-rose-50 border-rose-200 text-rose-600" : "bg-white border-slate-200 text-slate-500"}`}>
              {grouped ? `▦ ${groupLabel}` : "▤ ไม่จัดกลุ่ม"}
            </button>
          )}
          {resizable && Object.keys(widths).length > 0 && (
            <button onClick={resetWidths} title="คืนความกว้างคอลัมน์เป็นค่าเริ่มต้น" className="h-8 px-2 text-xs text-slate-400 hover:text-slate-600 underline">รีเซ็ตความกว้าง</button>
          )}
        </div>
      )}

      {total === 0 ? (
        <div className="text-center py-16 text-slate-300">{emptyText}</div>
      ) : shown === 0 ? (
        <div className="text-center py-16 text-slate-300">{noMatchText ? noMatchText(q) : `ไม่พบรายการที่ตรงกับ “${q}”`}</div>
      ) : (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          {HeaderCell}
          {groups.map((g, gi) => {
            const gKeys = g.rows.map(rowKey);
            const gSel = selectable && gKeys.length > 0 && gKeys.every((k) => sel.has(k));
            let offset = 0; for (let i = 0; i < gi; i++) offset += groups[i].rows.length;
            return (
              <div key={g.name || "_all"}>
                {groupBy && grouped && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border-y border-slate-100">
                    {selectable && <input type="checkbox" checked={!!gSel} onChange={() => setKeys(gKeys, !gSel)} className="w-3.5 h-3.5 accent-rose-600" />}
                    <span className="text-xs font-semibold text-slate-600">{g.name}</span>
                    <span className="text-[10px] text-slate-400">({g.rows.length})</span>
                  </div>
                )}
                <div className="divide-y divide-slate-50">{g.rows.map((r, i) => Row(r, offset + i))}</div>
              </div>
            );
          })}
        </div>
      )}
      {footnote && <p className="text-[11px] text-slate-400 mt-2">{footnote}</p>}
    </div>
  );
}

const EMPTY: Set<string> = new Set();
