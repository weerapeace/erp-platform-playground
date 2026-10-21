"use client";
/**
 * SearchMultiPick — ของกลาง: รายการ "ค้นหา + ติ๊กเลือกหลายตัว + โหลดเพิ่ม" แบบฝังในหน้า/ป๊อป (ไม่ใช่ป๊อปแยก)
 * ใช้แทนโค้ดค้นหา/แบ่งหน้า/checkbox ที่เขียนซ้ำในแต่ละตัวเลือก (เช่น เลือก SKU / Parent SKU / ใบงานออกแบบ หลายตัวบนกระดานแคมเปญ)
 *
 *   <SearchMultiPick selected={sel} onChange={setSel} getId={(s) => s.id} chipLabel={(s) => s.code}
 *     fetchPage={(q, offset) => fetchSkus(q, offset)} renderRow={(s) => <>…</>}
 *     placeholder="🔍 ค้นหา…" emptyText="ไม่พบ" tone="violet" />
 *
 * - fetchPage(q, offset) → { rows, total } · พิมพ์ค้นหาแล้วรอ 250ms ก่อนยิง · ปุ่ม "โหลดเพิ่ม" ต่อท้ายจนครบ total
 * - ตัวที่เลือกโชว์เป็นชิปด้านบน กด ✕ เอาออกได้ (จำไว้แม้เปลี่ยนคำค้น)
 * - โหลดพลาด = ขึ้นข้อความผิดพลาด (ไม่ขึ้นว่า "ไม่พบ" หลอก ๆ)
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "@/components/i18n";

type Tone = "violet" | "teal" | "indigo" | "orange";
const TONE: Record<Tone, { chip: string; on: string; check: string; more: string }> = {
  violet: { chip: "bg-violet-50 text-violet-700", on: "bg-violet-50/40", check: "text-violet-600", more: "text-violet-700 bg-violet-50/60 hover:bg-violet-50" },
  teal:   { chip: "bg-teal-50 text-teal-700",     on: "bg-teal-50/40",   check: "text-teal-600",   more: "text-teal-700 bg-teal-50/60 hover:bg-teal-50" },
  indigo: { chip: "bg-indigo-50 text-indigo-700", on: "bg-indigo-50/40", check: "text-indigo-600", more: "text-indigo-700 bg-indigo-50/60 hover:bg-indigo-50" },
  orange: { chip: "bg-orange-50 text-orange-700", on: "bg-orange-50/40", check: "text-orange-600", more: "text-orange-700 bg-orange-50/60 hover:bg-orange-50" },
};

export type SearchPage<T> = { rows: T[]; total: number };

export function SearchMultiPick<T>({ selected, onChange, getId, chipLabel, fetchPage, renderRow, placeholder, emptyText, tone = "violet", listClassName = "max-h-64" }: {
  selected: T[];
  onChange: (v: T[]) => void;
  getId: (item: T) => string;
  chipLabel: (item: T) => ReactNode;
  fetchPage: (q: string, offset: number) => Promise<SearchPage<T>>;
  /** เนื้อหาแถว (ต่อจาก checkbox) — รูป/รหัส/ชื่อ ฯลฯ */
  renderRow: (item: T) => ReactNode;
  placeholder?: string;
  emptyText?: string;
  tone?: Tone;
  listClassName?: string;
}) {
  const t = useT();
  const c = TONE[tone];
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;   // ใช้ตัวล่าสุดเสมอ โดยไม่ต้องยิงค้นหาใหม่ทุกครั้งที่หน้าวาดใหม่

  useEffect(() => {
    let active = true; setLoading(true); setError(null);
    const tmr = setTimeout(async () => {
      try { const { rows, total: tt } = await fetchRef.current(query, 0); if (active) { setResults(rows); setTotal(tt); } }
      catch (e) { if (active) { setResults([]); setTotal(0); setError(e instanceof Error ? e.message : t("โหลดไม่สำเร็จ", "Couldn't load")); } }
      finally { if (active) setLoading(false); }
    }, 250);
    return () => { active = false; clearTimeout(tmr); };
  }, [query, t]);

  const loadMore = async () => {
    setMore(true);
    try { const { rows } = await fetchRef.current(query, results.length); setResults((p) => [...p, ...rows]); }
    catch { /* กดใหม่ได้ */ } finally { setMore(false); }
  };
  const isOn = (s: T) => selected.some((x) => getId(x) === getId(s));
  const toggle = (s: T) => onChange(isOn(s) ? selected.filter((x) => getId(x) !== getId(s)) : [...selected, s]);

  return (
    <div className="space-y-2">
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder ?? t("🔍 ค้นหา...", "🔍 Search...")} className="w-full h-9 border border-slate-200 rounded-lg px-3 text-sm" />
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((s) => (
            <span key={getId(s)} className={`inline-flex items-center gap-1 text-xs rounded-full pl-2 pr-1 py-0.5 ${c.chip}`}>
              <span className="font-mono">{chipLabel(s)}</span>
              <button type="button" onClick={() => toggle(s)} className="hover:text-red-500" aria-label={t("เอาออก", "Remove")}>✕</button>
            </span>
          ))}
        </div>
      )}
      <div className={`${listClassName} overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-50`}>
        {loading ? <p className="px-3 py-3 text-sm text-slate-400 text-center">{t("กำลังค้นหา...", "Searching...")}</p>
          : error ? <p className="px-3 py-3 text-sm text-rose-600 text-center">⚠️ {error}</p>
          : results.length === 0 ? <p className="px-3 py-3 text-sm text-slate-400 text-center">{emptyText ?? t("ไม่พบรายการ", "Nothing found")}</p>
          : results.map((s) => { const on = isOn(s); return (
            <button key={getId(s)} type="button" onClick={() => toggle(s)} className={`w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-slate-50 ${on ? c.on : ""}`}>
              <input type="checkbox" readOnly checked={on} tabIndex={-1} className={`h-4 w-4 rounded border-slate-300 pointer-events-none ${c.check}`} />
              {renderRow(s)}
            </button>
          ); })}
        {!loading && !error && results.length > 0 && results.length < total && (
          <button type="button" onClick={loadMore} disabled={more} className={`w-full px-3 py-2 text-xs disabled:opacity-50 ${c.more}`}>
            {more ? t("กำลังโหลด…", "Loading…") : `${t("โหลดเพิ่ม", "Load more")} (${t("แสดง", "showing")} ${results.length}/${total})`}
          </button>
        )}
      </div>
      {!loading && !error && total > 0 && <p className="text-[11px] text-slate-400">{t("พบ", "Found")} {total} {t("รายการ", "items")}{results.length < total ? ` · ${t("แสดง", "showing")} ${results.length}` : ""}</p>}
    </div>
  );
}
