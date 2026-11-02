"use client";

/**
 * SortTh + sortRows (ของกลาง) — หัวคอลัมน์ตารางที่กดเรียงได้ (asc/desc/ปิด)
 * ใช้กับตารางเล็ก ๆ ที่เรียงฝั่ง client
 *
 *   const [sort, setSort] = useState<SortState>(null);
 *   const rows = sortRows(raw, sort, (r, k) => r[k]);
 *   <SortTh label="ราคา" k="price" sort={sort} onSort={setSort} align="right" />
 *   หัวตารางแบบ div/flex (ไม่ใช่ <table>) → <SortButton … /> ตัวเดียวกันแต่เป็นปุ่ม
 */
import type { ReactNode } from "react";

export type SortState = { key: string; dir: "asc" | "desc" } | null;

/** กดหัวคอลัมน์: คอลัมน์เดิม → สลับ asc↔desc · คอลัมน์ใหม่ → เริ่ม asc */
export function nextSort(cur: SortState, key: string): SortState {
  if (cur?.key === key) return cur.dir === "asc" ? { key, dir: "desc" } : null;
  return { key, dir: "asc" };
}

/** เรียงแถวตาม sort (getVal คืนค่าที่ใช้เทียบ) — คงลำดับเดิมถ้า sort=null */
export function sortRows<T>(rows: T[], sort: SortState, getVal: (r: T, key: string) => string | number | null | undefined): T[] {
  if (!sort) return rows;
  const { key, dir } = sort;
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = getVal(a, key), vb = getVal(b, key);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * mul;
    return String(va).localeCompare(String(vb), "th") * mul;
  });
}

function SortArrow({ k, sort }: { k: string; sort: SortState }) {
  const active = sort?.key === k;
  const arrow = !active ? "↕" : sort!.dir === "asc" ? "↑" : "↓";
  return <span className={`text-[9px] ${active ? "text-blue-500" : "text-slate-300"}`}>{arrow}</span>;
}

export function SortTh({ label, k, sort, onSort, align = "left", className = "" }: {
  label: ReactNode; k: string; sort: SortState; onSort: (s: SortState) => void;
  align?: "left" | "right"; className?: string;
}) {
  return (
    <th onClick={() => onSort(nextSort(sort, k))}
      className={`py-1.5 pr-2 font-medium cursor-pointer select-none hover:text-slate-600 ${align === "right" ? "text-right" : "text-left"} ${className}`}>
      {label} <SortArrow k={k} sort={sort} />
    </th>
  );
}

/** แบบปุ่ม — หัวตารางที่ไม่ใช่ <table> (แถว div/flex) · กดวน asc → desc → ปิด เหมือน SortTh */
export function SortButton({ label, k, sort, onSort, title, className = "" }: {
  label: ReactNode; k: string; sort: SortState; onSort: (s: SortState) => void;
  title?: string; className?: string;
}) {
  return (
    <button type="button" onClick={() => onSort(nextSort(sort, k))} title={title}
      className={`inline-flex items-center gap-1 select-none hover:text-slate-700 ${sort?.key === k ? "text-slate-800 font-medium" : ""} ${className}`}>
      {label} <SortArrow k={k} sort={sort} />
    </button>
  );
}
