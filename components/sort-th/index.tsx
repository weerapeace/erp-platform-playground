"use client";

/**
 * SortTh + sortRows (ของกลาง) — หัวคอลัมน์ตารางที่กดเรียงได้ (asc/desc/ปิด)
 * ใช้กับตารางเล็ก ๆ ที่เรียงฝั่ง client
 *
 *   const [sort, setSort] = useState<SortState>(null);
 *   const rows = sortRows(raw, sort, (r, k) => r[k]);
 *   <SortTh label="ราคา" k="price" sort={sort} onSort={setSort} align="right" />
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

export function SortTh({ label, k, sort, onSort, align = "left", className = "" }: {
  label: ReactNode; k: string; sort: SortState; onSort: (s: SortState) => void;
  align?: "left" | "right"; className?: string;
}) {
  const active = sort?.key === k;
  const arrow = !active ? "↕" : sort!.dir === "asc" ? "↑" : "↓";
  return (
    <th onClick={() => onSort(nextSort(sort, k))}
      className={`py-1.5 pr-2 font-medium cursor-pointer select-none hover:text-slate-600 ${align === "right" ? "text-right" : "text-left"} ${className}`}>
      {label} <span className={`text-[9px] ${active ? "text-blue-500" : "text-slate-300"}`}>{arrow}</span>
    </th>
  );
}
