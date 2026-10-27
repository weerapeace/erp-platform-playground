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
 *     expandedKeys={open} renderExpanded={(r) => <Detail r={r} />}   // กางแถว (ผู้เรียกคุมว่ากางแถวไหน)
 *   />
 *
 * แบบแอป (opt-in): fill = สูงเต็มกล่องแม่ เลื่อนในตัว + หัวตารางติดบนสุด · stickyCols = ล็อกคอลัมน์ซ้าย n คอลัมน์ตอนเลื่อนขวา
 *   (ช่องว่าง/ขอบหลังช่องที่ล็อกถูกถมด้วยเงาสีพื้น · แถวทุกแถวกว้างเท่ากัน กันหัวตาราง/พื้นขาดตอนเลื่อนไกล)
 */
import { ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useT } from "@/components/i18n";

export type MiniColumn<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  width?: string;                       // grid track เช่น "6rem" | "1fr" | "1.5fr"
  sortValue?: (row: T) => string | number | null | undefined;   // ใส่เพื่อให้คอลัมน์นี้ "เรียงได้"
  sortLabel?: string;                   // ป้ายในเมนูเรียงลำดับ (ไม่ใส่ = ใช้ header ถ้าเป็น string)
  // ใช้กับตัวเลือกคอลัมน์ (useColumnPrefs / ColumnChooser) — ไม่ใช้ก็ไม่ต้องใส่
  label?: string;                       // ชื่อในเมนูเลือกคอลัมน์ (ไม่ใส่ = header ถ้าเป็นข้อความ)
  group?: string;                       // หมวดในเมนู
  locked?: boolean;                     // ซ่อนไม่ได้
  defaultHidden?: boolean;              // ซ่อนไว้ก่อน (ผู้ใช้เปิดเองได้)
  isNew?: boolean;                      // ป้าย "ใหม่" ในเมนู
};

export type MiniTableProps<T> = {
  rows: T[];
  columns: MiniColumn<T>[];
  rowKey: (row: T) => string;

  // ค้นหา — ใส่ฟังก์ชันคืน text ที่ค้นได้ จึงจะมีช่องค้นหา
  searchText?: (row: T) => string;
  searchPlaceholder?: string;
  /** คุมคำค้นจากภายนอก (ใส่คู่กับ onSearchChange) — ใช้เมื่ออยากให้หลายตารางในหน้าเดียวกันค้นด้วยคำเดียวกัน
   *  เช่นบอร์ดจ่ายงาน: พิมพ์ครั้งเดียว กรองทั้งตาราง "รอจ่าย" และ "จ่ายแล้ว" */
  searchValue?: string;
  onSearchChange?: (v: string) => void;
  /** ซ่อนช่องค้นหาของตาราง (ยังกรองตาม searchValue อยู่) — ใช้เมื่อหน้ามีช่องค้นหาร่วมอันเดียวอยู่ด้านบนแล้ว */
  hideSearch?: boolean;
  /** คุมการเรียงจากภายนอก (ใส่คู่ onSortChange) — ใช้เมื่อลำดับต้องตรงกับที่อื่น เช่น ใบพิมพ์ หรือจำค่ารายคน
   *  sortKey "" = ลำดับเดิม · ไม่ส่ง = ตารางเก็บการเรียงเอง เหมือนเดิม */
  sortKey?: string;
  sortDir?: "asc" | "desc";
  onSortChange?: (key: string, dir: "asc" | "desc") => void;

  // จัดกลุ่ม — ใส่ฟังก์ชันคืนชื่อกลุ่ม จึงจะมีปุ่มจัดกลุ่ม
  groupBy?: (row: T) => string;
  groupLabel?: string;
  defaultGrouped?: boolean;
  /** ลำดับกลุ่ม (ไม่ใส่ = เรียงตามชื่อ) — คืนเลขน้อยขึ้นก่อน เช่น ตามลำดับป้าย, "ไม่มีป้าย" ไว้ท้าย */
  groupOrder?: (groupName: string) => number;
  /** คุมเปิด/ปิดจัดกลุ่มจากข้างนอก (ใส่คู่ onGroupedChange) — ปุ่มจัดกลุ่มในตารางกับปุ่มข้างนอกจะตรงกันเสมอ */
  grouped?: boolean;
  onGroupedChange?: (v: boolean) => void;
  /** ข้อความท้ายหัวกลุ่ม เช่น ยอดรวมของกลุ่ม */
  groupExtra?: (rows: T[]) => ReactNode;

  // เลือกหลายแถว (controlled)
  selectable?: boolean;
  selected?: Set<string>;
  onSelectedChange?: (next: Set<string>) => void;

  // คลิกแถว (เช่น เปิดรายละเอียด)
  onRowClick?: (row: T) => void;

  // กางแถว — แถวที่ key อยู่ใน expandedKeys จะโชว์ renderExpanded(row) เต็มความกว้างใต้แถว
  //   ผู้เรียกคุมเองว่ากางแถวไหน (เช่น onRowClick สลับ key เข้า/ออก) · ไม่ใส่ = ตารางเหมือนเดิมทุกอย่าง
  expandedKeys?: Set<string>;
  renderExpanded?: (row: T) => ReactNode;
  /** กดทีละช่อง — ใส่แล้วแต่ละช่องกดได้เอง (ไม่ไหลไปเป็นการกดแถว) เช่น กดช่องซื้อของ = กางรายละเอียดวัตถุดิบ */
  onCellClick?: (row: T, colKey: string) => void;
  /** ช่องที่กำลังเปิดรายละเอียดอยู่ของแถวนั้น (ไฮไลต์ให้รู้ว่ากดช่องไหน) */
  activeCell?: (row: T) => string | null | undefined;

  // ส่วนหัว
  title?: ReactNode;
  actions?: ReactNode;                  // มุมขวาบน เช่น ปุ่มสร้าง
  countUnit?: string;                   // หน่วยนับ เช่น "รายการ"

  // สถานะว่าง
  emptyText?: ReactNode;
  noMatchText?: (q: string) => ReactNode;

  // หน้าตา
  dense?: boolean;
  /** แถวสลับสี (ค่าเริ่มต้น เปิด) */
  zebra?: boolean;
  /** ซ่อนแถบเครื่องมือเหนือตาราง (เรียง / จัดกลุ่ม) — ยังเรียง/จัดกลุ่มตามค่าที่ส่งมาได้ */
  hideToolbar?: boolean;
  /** แถวสูง + ช่องติ๊กใหญ่ สำหรับจอสัมผัส (iPad) */
  touch?: boolean;
  /** "cards" = 1 แถว = 1 การ์ด (ใช้ renderCard) ยังค้นหา/เรียง/จัดกลุ่ม/เลือก/กางได้เหมือนตาราง — เช่น iPad แนวตั้ง */
  layout?: "table" | "cards";
  renderCard?: (row: T) => ReactNode;
  maxHeightClass?: string;              // เช่น "max-h-[calc(100vh-210px)]"
  className?: string;
  footnote?: ReactNode;

  // ปรับความกว้างคอลัมน์ได้ (ลากขอบหัวคอลัมน์) — opt-in · ใส่ storageKey เพื่อจำค่าไว้ในเครื่อง
  resizable?: boolean;
  storageKey?: string;

  /** เต็มที่ว่างที่เหลือในกล่องแม่ (กล่องแม่ต้อง flex-col + สูงตายตัว — ตารางเป็น flex-1) — เลื่อนในตัวเอง + หัวตารางติดอยู่บนสุด */
  fill?: boolean;
  /** ล็อกคอลัมน์ซ้าย n คอลัมน์ (นับเฉพาะคอลัมน์ข้อมูล — ช่องติ๊กล็อกให้เองถ้ามี) ตอนเลื่อนซ้าย-ขวา */
  stickyCols?: number;
  /** วาด actions ต่อท้ายแถวเครื่องมือ (เรียง/จัดกลุ่ม) ในแถวเดียวกัน — ประหยัดที่ */
  inlineActions?: boolean;
  /** เลื่อนในตาราง (เฉพาะ fill) — ส่ง scrollTop ไว้ซ่อน/โชว์ของเหนือตาราง */
  onScrollTop?: (top: number, el: HTMLDivElement) => void;
  /** โหมดการ์ด: วางเป็นตารางหลายคอลัมน์ (ค่า CSS grid-template-columns เช่น "repeat(auto-fill,minmax(240px,1fr))") · การ์ดที่กางเต็มแถว */
  cardGrid?: string;
  /** คุมความกว้างคอลัมน์จากข้างนอก (เช่น เก็บในมุมมองด่วน) — ใส่คู่ onWidthsChange · ไม่ใส่ = จำใน localStorage ตาม storageKey แบบเดิม */
  widths?: Record<string, number>;
  onWidthsChange?: (w: Record<string, number>) => void;
  /** พอดีเนื้อหา — คอลัมน์ที่ตั้งยืด (fr) ใช้ความกว้างขั้นต่ำแทน ไม่ยืดกินที่ว่างทั้งจอ */
  fitContent?: boolean;
};

type Dir = "asc" | "desc";

export function MiniTable<T>(props: MiniTableProps<T>) {
  const {
    rows, columns, rowKey, searchText, searchPlaceholder: searchPlaceholderProp, searchValue, onSearchChange, hideSearch,
    sortKey: sortKeyProp, sortDir: sortDirProp, onSortChange,
    groupBy, groupLabel: groupLabelProp, defaultGrouped = true, groupOrder, grouped: groupedProp, onGroupedChange, groupExtra,
    selectable, selected, onSelectedChange, onRowClick, expandedKeys, renderExpanded, onCellClick, activeCell,
    title, actions, countUnit: countUnitProp,
    emptyText: emptyTextProp, noMatchText,
    dense, zebra = true, hideToolbar, touch, layout = "table", renderCard, maxHeightClass = "", className = "", footnote,
    resizable, storageKey, fill, stickyCols = 0, inlineActions, onScrollTop, cardGrid, widths: widthsCtl, onWidthsChange, fitContent,
  } = props;
  // ข้อความระบบ 2 ภาษา (ของกลาง i18n) — ผู้เรียกส่งคำของตัวเองมาแทนได้
  const t = useT();
  const searchPlaceholder = searchPlaceholderProp ?? t("ค้นหา…", "Search…");
  const groupLabel = groupLabelProp ?? t("จัดกลุ่ม", "Group");
  const countUnit = countUnitProp ?? t("รายการ", "items");
  const emptyText = emptyTextProp ?? t("ไม่มีข้อมูล", "No data");

  const sortable = columns.filter((c) => c.sortValue);
  const [qInner, setQInner] = useState("");
  // คุมจากภายนอกถ้าส่ง searchValue มา (ไม่ส่ง = ตารางเก็บคำค้นเอง เหมือนเดิม)
  const q = searchValue ?? qInner;
  const setQ = (v: string) => { if (onSearchChange) onSearchChange(v); else setQInner(v); };
  const [sortKeyInner, setSortKeyInner] = useState<string>("");   // "" = ลำดับเดิม
  const [dirInner, setDirInner] = useState<Dir>("asc");
  // คุมจากภายนอกถ้าส่ง sortKey มา (แบบเดียวกับ searchValue / grouped)
  const sortKey = sortKeyProp ?? sortKeyInner;
  const dir = sortDirProp ?? dirInner;
  const setSort = (k: string, d: Dir) => { if (onSortChange) onSortChange(k, d); else { setSortKeyInner(k); setDirInner(d); } };
  const [groupedInner, setGroupedInner] = useState(defaultGrouped);
  const grouped = groupedProp ?? groupedInner;
  const setGrouped = (v: boolean) => { if (onGroupedChange) onGroupedChange(v); else setGroupedInner(v); };

  // ความกว้างที่ผู้ใช้ลากปรับ (px ต่อ key) — โหลด/บันทึกจาก localStorage ถ้ามี storageKey
  const [widthsInner, setWidthsInner] = useState<Record<string, number>>({});
  // ระหว่างลาก = ร่างในตารางเอง (ไม่ส่งออกทุกการขยับเมาส์ — หน้าใหญ่จะได้ไม่กระตุก) · ปล่อยเมาส์แล้วค่อยส่งออก
  const [dragW, setDragW] = useState<{ key: string; w: number } | null>(null);
  const widthsBase = widthsCtl ?? widthsInner;
  const widths = dragW ? { ...widthsBase, [dragW.key]: dragW.w } : widthsBase;
  const widthsRef = useRef(widthsBase); widthsRef.current = widthsBase;
  // ตั้งค่าแบบเดียวกับ setState (รับฟังก์ชันได้) — คุมจากข้างนอก = ส่งค่าใหม่ออกไป
  const setWidths = (next: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => {
    const v = typeof next === "function" ? next(widthsRef.current) : next;
    widthsRef.current = v;
    if (onWidthsChange) onWidthsChange(v); else setWidthsInner(v);
  };
  const lsKey = storageKey && !onWidthsChange ? `minitable:w:${storageKey}` : "";
  useEffect(() => {
    if (!resizable || !lsKey) return;
    try { const s = localStorage.getItem(lsKey); if (s) setWidths(JSON.parse(s)); } catch { /* ignore */ }
  }, [resizable, lsKey]);
  useEffect(() => {
    if (!resizable || !lsKey) return;
    try { localStorage.setItem(lsKey, JSON.stringify(widthsBase)); } catch { /* ignore */ }
  }, [widthsBase, resizable, lsKey]);

  // ลากขอบหัวคอลัมน์เพื่อปรับความกว้าง
  const dragRef = useRef<{ key: string; startX: number; startW: number } | null>(null);
  const startResize = (key: string) => (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const headerCell = (e.currentTarget as HTMLElement).parentElement as HTMLElement;
    // เผื่อหน้าใช้ CSS zoom (ขนาดตัวอักษรของบอร์ด): ความกว้างจริง = offsetWidth · ระยะเมาส์ต้องหารด้วยอัตรา zoom
    const zoom = headerCell.offsetWidth ? headerCell.getBoundingClientRect().width / headerCell.offsetWidth || 1 : 1;
    dragRef.current = { key, startX: e.clientX, startW: headerCell.offsetWidth || headerCell.getBoundingClientRect().width };
    let last: number | null = null;
    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current; if (!d) return;
      last = Math.max(48, Math.round(d.startW + (ev.clientX - d.startX) / zoom));
      setDragW({ key: d.key, w: last });
    };
    const onUp = () => {
      const d = dragRef.current; dragRef.current = null;
      document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); document.body.style.cursor = "";
      if (d && last != null) { const w = last; setWidths((prev) => ({ ...prev, [d.key]: w })); }
      setDragW(null);
    };
    document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp); document.body.style.cursor = "col-resize";
  };
  const resetWidths = () => setWidths({});

  // ---- ล็อกหัว/คอลัมน์ซ้าย: วัดตำแหน่งจริงของหัวคอลัมน์ (ความกว้างแบบ fr ต้องวัดหลังวาง) ----
  const scrollerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const lockN = stickyCols > 0 ? stickyCols + (selectable ? 1 : 0) : 0;   // จำนวนช่อง (รวมช่องติ๊ก) ที่ล็อก
  const [lockLefts, setLockLefts] = useState<number[]>([]);
  const [rowMinW, setRowMinW] = useState(0);   // กว้างจริงที่ต้องใช้ → แถวทุกแถวกว้างเท่ากัน (หัว/พื้นไม่ขาดตอนเลื่อนขวา)
  const [viewW, setViewW] = useState(0);       // ความกว้างที่มองเห็น → แผงกางแถวกว้างเท่าจอ ไม่เลื่อนหายตอนเลื่อนขวา
  const measureOn = !!fill || lockN > 0;
  const colSig = columns.map((c) => `${c.key}:${c.width ?? ""}`).join("|") + JSON.stringify(widths) + (selectable ? "s" : "") + (fitContent ? "f" : "");
  useLayoutEffect(() => {
    if (!measureOn) return;
    const measure = () => {
      const h = headerRef.current, sc = scrollerRef.current;
      if (!h || !sc) return;
      const prev = h.style.minWidth; h.style.minWidth = "0px";
      const need = h.scrollWidth;
      // offsetLeft (หน่วย CSS จริงของแถวหัว) ไม่ใช่ getBoundingClientRect — หน้าที่ใช้ CSS zoom จะได้ไม่เพี้ยน
      const lefts = (Array.from(h.children) as HTMLElement[]).slice(0, lockN).map((k) => k.offsetLeft);
      h.style.minWidth = prev;
      setRowMinW(need > sc.clientWidth + 1 ? need : 0);
      setLockLefts((old) => (old.join() === lefts.join() ? old : lefts));
      setViewW(sc.clientWidth);
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (ro && scrollerRef.current) ro.observe(scrollerRef.current);
    return () => ro?.disconnect();
  }, [measureOn, colSig, lockN, rows.length]);
  // ช่องที่ล็อก: sticky + พื้นทึบ + เงาสีพื้นถมขอบซ้าย/ช่องว่างขวา (ไม่งั้นเห็นเนื้อหาลอดใต้) + เส้นแบ่งหลังช่องสุดท้าย
  //   kind "cell"/"check" = ช่องในแถว → ยืดเต็มความสูงแถว (เดิมทึบแค่ตรงกลาง → ของคอลัมน์อื่นลอดบน/ล่าง ดูเป็นการ์ดลอย) + มุมเหลี่ยม
  const lockStyle = (i: number, bg: string, kind?: "cell" | "check"): CSSProperties | undefined => {
    if (i >= lockN || lockLefts[i] == null) return undefined;
    const sh = [`8px 0 0 0 ${bg}`];
    if (i === 0) sh.unshift(`-12px 0 0 0 ${bg}`);
    if (i === lockN - 1) { sh[sh.length - 1] = `7px 0 0 0 ${bg}`; sh.push("8px 0 0 0 #e2e8f0"); }   // เส้นแบ่งอยู่ในช่องว่าง gap-2 (8px) พอดี ไม่ล้นเข้าคอลัมน์ถัดไป
    const base: CSSProperties = { position: "sticky", left: lockLefts[i], zIndex: 5, backgroundColor: bg, boxShadow: sh.join(", ") };
    if (kind === "check") return { ...base, alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "center" };
    // ตัดระยะยื่น -mx-1/px-1 (ไว้ไฮไลต์ตอนกดช่อง) ออก → กล่องเท่าช่องตารางพอดี เงาถมแค่ช่องว่าง ไม่ทับต้นคอลัมน์ถัดไป
    if (kind === "cell") return { ...base, alignSelf: "stretch", display: "flex", flexDirection: "column", justifyContent: "center", borderRadius: 0, marginLeft: 0, marginRight: 0, paddingLeft: 0, paddingRight: 0 };
    return base;
  };
  const rowW: CSSProperties | undefined = rowMinW ? { minWidth: rowMinW } : undefined;

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
    const none = t("ไม่ระบุ", "Unspecified");
    for (const r of sorted) { const g = groupBy(r) || none; (map.get(g) ?? map.set(g, []).get(g)!).push(r); }
    return [...map.entries()].map(([name, rs]) => ({ name, rows: rs }))
      .sort((a, b) => (groupOrder ? groupOrder(a.name) - groupOrder(b.name) : 0) || a.name.localeCompare(b.name, "th"));
  }, [sorted, groupBy, grouped, groupOrder, t]);

  // คลิกหัวคอลัมน์เพื่อเรียง (เฉพาะคอลัมน์ที่มี sortValue) — สลับ asc/desc
  const toggleSort = (key: string) => {
    if (sortKey === key) setSort(key, dir === "asc" ? "desc" : "asc");
    else setSort(key, "asc");
  };

  const allKeys = sorted.map(rowKey);
  const allSel = allKeys.length > 0 && allKeys.every((k) => sel.has(k));
  const toggleKey = (k: string) => { const n = new Set(sel); n.has(k) ? n.delete(k) : n.add(k); setSel(n); };
  const setKeys = (keys: string[], on: boolean) => { const n = new Set(sel); keys.forEach((k) => (on ? n.add(k) : n.delete(k))); setSel(n); };

  // grid template — เพิ่มช่อง checkbox นำหน้าถ้าเลือกได้ · คอลัมน์ที่ลากปรับแล้วใช้ px
  // พอดีเนื้อหา: minmax(ขั้นต่ำ, …fr) → ขั้นต่ำ · fr ล้วน → 10rem (แถวแต่ละแถวเป็น grid แยก ต้องเป็นค่าตายตัว ไม่งั้นคอลัมน์ไม่ตรงกัน)
  const fitTrack = (w: string) => {
    if (!/fr\b/.test(w)) return w;
    const m = w.match(/^minmax\(\s*([^,]+?)\s*,/);
    return m && !/fr\b/.test(m[1]) ? m[1] : "10rem";
  };
  const colTrack = (c: MiniColumn<T>) => (resizable && widths[c.key] != null ? `${widths[c.key]}px` : fitContent ? fitTrack(c.width ?? "1fr") : (c.width ?? "1fr"));
  const tmpl = (selectable ? "2.25rem " : "") + columns.map(colTrack).join(" ");
  const padY = touch ? "py-3" : dense ? "py-1.5" : "py-2";
  const boxCls = touch ? "w-5 h-5 accent-rose-600" : "w-4 h-4 accent-rose-600";
  const cards = layout === "cards" && !!renderCard;
  const alignCls = (a?: string) => (a === "right" ? "text-right justify-end" : a === "center" ? "text-center justify-center" : "");

  const HeaderCell = (
    <div ref={headerRef} className={`grid gap-2 px-3 py-2 bg-slate-100 text-[11px] font-semibold text-slate-600 ${fill ? "sticky top-0 z-20" : measureOn ? "relative" : ""}`} style={{ gridTemplateColumns: tmpl, ...rowW }}>
      {selectable && (
        <span className="flex justify-center" style={lockStyle(0, HEAD_BG)}>
          <input type="checkbox" checked={allSel} onChange={() => setSel(allSel ? new Set() : new Set(allKeys))} className={boxCls} />
        </span>
      )}
      {columns.map((c, ci) => {
        const ls = lockStyle(ci + (selectable ? 1 : 0), HEAD_BG);
        const canSort = !!c.sortValue;
        const active = sortKey === c.key;
        const handle = resizable ? <span onMouseDown={startResize(c.key)} title={t("ลากเพื่อปรับความกว้าง", "Drag to resize")} className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-rose-300/70" /> : null;
        const wrapCls = `flex items-center gap-1 ${resizable ? "relative overflow-hidden pr-2" : ""} ${alignCls(c.align)}`;
        const head = resizable ? <span className="truncate">{c.header}</span> : c.header;   // truncate เฉพาะตอน resizable (กันกระทบตารางเดิม)
        if (!canSort) return <span key={c.key} className={wrapCls} style={ls}>{head}{handle}</span>;
        return (
          <span key={c.key} className={wrapCls} style={ls}>
            <button type="button" onClick={() => toggleSort(c.key)} title={t("คลิกเพื่อเรียง", "Click to sort")} className={`inline-flex items-center gap-1 min-w-0 hover:text-slate-900 ${active ? "text-rose-600" : ""}`}>
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
    const open = !!renderExpanded && !!expandedKeys?.has(k);
    // พื้นทึบของช่องที่ล็อก = สีที่ตาเห็นจริงของแถว (พื้นแถวโปร่ง 30–40% บนขาว) → ต่อกับขอบบน/ล่างของแถวเนียน ไม่เห็นเป็นกล่อง
    const lockBg = on ? "#fff9fa" : open ? "#fafcff" : zebra && idx % 2 ? "#fdfeff" : "#ffffff";
    const line = (
      <div key={open ? undefined : k} onClick={onRowClick ? () => onRowClick(r) : undefined}
        className={`grid gap-2 px-3 ${padY} items-center ${on ? "bg-rose-50/40" : open ? "bg-blue-50/30" : zebra && idx % 2 ? "bg-slate-50/30" : "bg-white"} ${onRowClick ? "cursor-pointer hover:bg-blue-50/40" : ""}`}
        style={{ gridTemplateColumns: tmpl, ...rowW }}>
        {selectable && (
          <span className="flex justify-center" onClick={(e) => e.stopPropagation()} style={lockStyle(0, lockBg, "check")}>
            <input type="checkbox" checked={on} onChange={() => toggleKey(k)} className={boxCls} />
          </span>
        )}
        {columns.map((c, ci) => {
          const act = !!activeCell && activeCell(r) === c.key;
          return (
            <div key={c.key} style={lockStyle(ci + (selectable ? 1 : 0), act ? "#dbeafe" : lockBg, "cell")} onClick={onCellClick ? (e) => { e.stopPropagation(); onCellClick(r, c.key); } : undefined}
              className={`min-w-0 text-sm text-slate-800 ${resizable ? "overflow-hidden" : ""} ${alignCls(c.align)} ${onCellClick ? `-mx-1 -my-1 rounded-md px-1 py-1 cursor-pointer ${act ? "bg-blue-100/70 ring-1 ring-blue-300" : "hover:bg-blue-50 hover:ring-1 hover:ring-blue-200"}` : ""}`}>
              {c.cell(r)}
            </div>
          );
        })}
      </div>
    );
    if (!open) return line;
    return (
      <div key={k} style={rowW}>
        {line}
        {/* แผงกาง: โหมดล็อก = กว้างเท่าจอที่เห็น + ติดซ้าย (เลื่อนตารางไปขวาแผงไม่หาย) */}
        <div className="px-3 pb-3 pt-1 bg-blue-50/30"
          style={{ paddingLeft: selectable ? "3.25rem" : undefined, ...(measureOn && viewW ? { position: "sticky", left: 0, width: viewW } : {}) }}>{renderExpanded!(r)}</div>
      </div>
    );
  };

  // โหมดการ์ด — 1 แถว = 1 การ์ด (เนื้อการ์ดมาจาก renderCard) · แตะการ์ด = onRowClick · ช่องติ๊กมุมซ้ายบน
  const Card = (r: T) => {
    const k = rowKey(r);
    const on = sel.has(k);
    const open = !!renderExpanded && !!expandedKeys?.has(k);
    return (
      <div key={k} onClick={onRowClick ? () => onRowClick(r) : undefined} style={cardGrid && open ? { gridColumn: "1 / -1" } : undefined}
        className={`relative rounded-xl border p-3 ${on ? "border-rose-300 bg-rose-50/40" : open ? "border-blue-300 bg-white" : "border-slate-200 bg-white"} ${onRowClick ? "cursor-pointer active:bg-blue-50/40" : ""}`}>
        {selectable && (
          <span className="absolute top-3 left-3 z-10" onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={on} onChange={() => toggleKey(k)} className={boxCls} />
          </span>
        )}
        <div className={selectable ? "pl-8" : ""}>{renderCard!(r)}</div>
        {open && <div className="mt-3 pt-3 border-t border-slate-100 cursor-default" onClick={(e) => e.stopPropagation()}>{renderExpanded!(r)}</div>}
      </div>
    );
  };
  const GroupHead = ({ g, gSel, gKeys }: { g: { name: string; rows: T[] }; gSel: boolean; gKeys: string[] }) => (
    <div className={`flex items-center gap-2 px-3 ${touch ? "py-2" : "py-1.5"} bg-slate-50 border-y border-slate-100 ${cards ? "rounded-lg border-x" : ""}`}
      style={!cards && measureOn && viewW ? { position: "sticky", left: 0, width: viewW } : undefined}>
      {selectable && <input type="checkbox" checked={gSel} onChange={() => setKeys(gKeys, !gSel)} className={touch ? boxCls : "w-3.5 h-3.5 accent-rose-600"} />}
      <span className="text-xs font-semibold text-slate-600">{g.name}</span>
      <span className="text-[10px] text-slate-400">({g.rows.length})</span>
      {groupExtra && <span className="ml-auto text-[11px] text-slate-500">{groupExtra(g.rows)}</span>}
    </div>
  );

  const total = rows.length, shown = sorted.length;
  const toolbarOn = !hideToolbar && !!((searchText && !hideSearch) || sortable.length > 0 || groupBy) && total > 0;
  const actionsInToolbar = !!inlineActions && toolbarOn;   // แถวเดียว: เรียง/จัดกลุ่ม … ปุ่มของผู้เรียกชิดขวา
  const onScroll = onScrollTop ? (e: React.UIEvent<HTMLDivElement>) => onScrollTop(e.currentTarget.scrollTop, e.currentTarget) : undefined;

  return (
    <div className={`${maxHeightClass} ${maxHeightClass ? "overflow-y-auto pr-1" : ""} ${fill ? "flex flex-col min-h-0 flex-1" : ""} ${className}`}>
      {(title || (actions && !actionsInToolbar)) && (
        <div className="flex shrink-0 items-center justify-between gap-3 mb-2 flex-wrap">
          {title ? <h3 className="text-sm font-semibold text-slate-700">{title} <span className="text-slate-400">({shown !== total ? `${shown}/${total}` : total} {countUnit})</span></h3> : <span />}
          {!actionsInToolbar && actions}
        </div>
      )}

      {toolbarOn && (
        <div className="flex shrink-0 items-center gap-2 mb-2 flex-wrap">
          {searchText && !hideSearch && (
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder}
                className="h-8 w-56 pl-7 pr-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-rose-300" />
            </div>
          )}
          {sortable.length > 0 && (
            <>
              <select value={sortKey} onChange={(e) => setSort(e.target.value, dir)} className="h-8 px-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-600">
                <option value="">{t("เรียง: ลำดับเดิม", "Sort: original order")}</option>
                {sortable.map((c) => <option key={c.key} value={c.key}>{t("เรียง:", "Sort:")} {c.sortLabel ?? (typeof c.header === "string" ? c.header : c.key)}</option>)}
              </select>
              {sortKey && (
                <button onClick={() => setSort(sortKey, dir === "asc" ? "desc" : "asc")} title={t("สลับทิศ", "Reverse")} className="h-8 px-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-500">{dir === "asc" ? t("▲ น้อย→มาก", "▲ Low→High") : t("▼ มาก→น้อย", "▼ High→Low")}</button>
              )}
            </>
          )}
          {groupBy && (
            <button onClick={() => setGrouped(!grouped)} className={`h-8 px-3 text-sm rounded-lg border ${grouped ? "bg-rose-50 border-rose-200 text-rose-600" : "bg-white border-slate-200 text-slate-500"}`}>
              {grouped ? `▦ ${groupLabel}` : t("▤ ไม่จัดกลุ่ม", "▤ No grouping")}
            </button>
          )}
          {resizable && Object.keys(widths).length > 0 && (
            <button onClick={resetWidths} title={t("คืนความกว้างคอลัมน์เป็นค่าเริ่มต้น", "Reset column widths to default")} className="h-8 px-2 text-xs text-slate-400 hover:text-slate-600 underline">{t("รีเซ็ตความกว้าง", "Reset widths")}</button>
          )}
          {actionsInToolbar && <div className="ml-auto">{actions}</div>}
        </div>
      )}

      {total === 0 ? (
        <div className="text-center py-16 text-slate-300">{emptyText}</div>
      ) : shown === 0 ? (
        <div className="text-center py-16 text-slate-300">{noMatchText ? noMatchText(q) : t(`ไม่พบรายการที่ตรงกับ “${q}”`, `Nothing matches “${q}”`)}</div>
      ) : cards ? (
        <div ref={scrollerRef} onScroll={onScroll} className={`space-y-2 ${fill ? "flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1" : ""}`}>
          {selectable && (
            <label className="inline-flex items-center gap-2 px-1 text-xs text-slate-500">
              <input type="checkbox" checked={allSel} onChange={() => setSel(allSel ? new Set() : new Set(allKeys))} className={boxCls} /> {t("เลือกทั้งหมด", "Select all")}
            </label>
          )}
          {groups.map((g) => {
            const gKeys = g.rows.map(rowKey);
            const gSel = !!selectable && gKeys.length > 0 && gKeys.every((k) => sel.has(k));
            return (
              <div key={g.name || "_all"} className="space-y-2">
                {groupBy && grouped && GroupHead({ g, gSel, gKeys })}
                {cardGrid
                  ? <div className="grid gap-2" style={{ gridTemplateColumns: cardGrid }}>{g.rows.map((r) => Card(r))}</div>
                  : g.rows.map((r) => Card(r))}
              </div>
            );
          })}
        </div>
      ) : (
        // overflow-x-auto (ไม่ใช่ hidden) — คอลัมน์เยอะเกินจอ = เลื่อนซ้าย-ขวาได้ แทนที่จะโดนตัดหายเงียบ ๆ
        // fill = เลื่อนทั้งสองแกนในกล่องนี้ → หัวตาราง sticky ติดบนได้ (ถ้าเลื่อนที่กล่องแม่ หัวจะไม่ติด)
        <div ref={scrollerRef} onScroll={onScroll} className={`border border-slate-200 rounded-xl ${fill ? "flex-1 min-h-0 overflow-auto overscroll-contain" : "overflow-x-auto"}`}>
          {HeaderCell}
          {groups.map((g, gi) => {
            const gKeys = g.rows.map(rowKey);
            const gSel = !!selectable && gKeys.length > 0 && gKeys.every((k) => sel.has(k));
            let offset = 0; for (let i = 0; i < gi; i++) offset += groups[i].rows.length;
            return (
              <div key={g.name || "_all"} style={rowW}>
                {groupBy && grouped && GroupHead({ g, gSel, gKeys })}
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
const HEAD_BG = "#f1f5f9";   // = bg-slate-100 ของหัวตาราง (ช่องหัวที่ล็อกต้องทึบสีเดียวกัน)

export { useColumnPrefs, ColumnChooser, type ColumnPrefsState } from "./column-chooser";
