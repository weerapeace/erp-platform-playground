"use client";

/**
 * ชั้นหนังสือ (Bookshelf view) — มุมมองรูปปกของ /book-library
 *
 * จัดเล่มเป็น "ชั้น" ตามชุด/ซีรีส์ เรียงตามเล่มที่ · กดที่ปกเพื่อเปิดรายละเอียด/แก้ไข
 * ข้อมูลมาจาก API กลาง /api/master-v2/book_library (ไม่ยิง Supabase ตรง)
 * รายละเอียด/ฟอร์มใช้ของกลาง MasterRecordDrawer ตัวเดียวกับหน้าตาราง — แก้ที่เดียวเหมือนกันทั้งสองมุมมอง
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { PlaygroundShell } from "@/components/playground-shell";
import { usePermission, AccessDenied } from "@/components/auth";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import { getStatusStyle } from "@/lib/status-config";
import { useViewPref } from "@/lib/use-view-pref";
import { ImportMailModal } from "./import-mail-modal";
import { SeriesWizardModal } from "./series-wizard-modal";
import { SeriesEditModal } from "./series-edit-modal";

const MasterRecordDrawer = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterRecordDrawer),
  { ssr: false },
);

type Book = {
  id: string;
  title: string;
  title_en: string;
  author: string;
  series: string;
  volume: string;
  category: string;
  status: string;
  series_status: string;   // "" | ongoing | ended — ชุดจบหรือยัง (ทั้งชุดค่าเดียวกัน)
  store_id: string | null;
  rating: number | null;
  cover_r2_key: string | null;
};

const STATUSES = ["owned", "wishlist", "upcoming", "skipped"] as const;
const NO_SERIES = "__no_series__";   // ชั้น "ไม่ได้จัดชุด" — เรียงไว้ท้ายสุดเสมอ

/** ป้าย "จบแล้ว / ยังไม่จบ" บนหัวชั้น — บอกว่ายังต้องตามเก็บเล่มใหม่อีกไหม */
const SERIES_BADGE: Record<string, { label: string; cls: string }> = {
  ended:   { label: "จบแล้ว",   cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  ongoing: { label: "ยังไม่จบ", cls: "bg-amber-50 text-amber-700 border-amber-200" },
};

/** เลขเล่มเรียงแล้ว → ช่วงสั้น ๆ: [1,2,3,5,6,9] → "1-3, 5-6, 9" */
function toRangeText(nums: number[]): string {
  if (nums.length === 0) return "";
  const out: string[] = [];
  let start = nums[0], prev = nums[0];
  for (let i = 1; i <= nums.length; i++) {
    const cur = nums[i];
    if (cur !== prev + 1) { out.push(start === prev ? String(start) : `${start}-${prev}`); start = cur; }
    prev = cur;
  }
  return out.join(", ");
}

/** เลขเล่มจากช่อง "เล่มที่" (ไม่ใช่ตัวเลข = null) */
const volumeNum = (v: string) => {
  const n = parseFloat(String(v ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
};

/**
 * สรุปชุดหนึ่งชั้น — "มีเล่มอะไรบ้าง ถึงเล่มไหน ขาดเล่มไหน"
 * ขาด = เลขที่อยู่ระหว่างเล่มแรกถึงเล่มสุดท้ายแต่ไม่มีในคลังเลย (เช่น มี 1-33 แต่ไม่มี 20)
 */
function seriesSummary(list: Book[]) {
  const nums: number[] = [];
  let specials = 0;     // เล่มพิเศษที่เป็นข้อความ เช่น "Official Book"
  let unnumbered = 0;   // ไม่ได้กรอกเล่มที่เลย
  for (const b of list) {
    const raw = String(b.volume ?? "").trim();
    const n = volumeNum(raw);
    if (n !== null) nums.push(n);
    else if (raw) specials++;
    else unnumbered++;
  }
  const sorted = [...new Set(nums)].sort((a, b) => a - b);
  if (sorted.length === 0) return { sorted, min: null, max: null, missing: [] as number[], specials, unnumbered };
  const min = sorted[0], max = sorted[sorted.length - 1];
  const have = new Set(sorted);
  const missing: number[] = [];
  // เล่ม .5 (เช่น 25.5) ไม่นับเป็นช่องว่าง — ไล่เฉพาะจำนวนเต็มในช่วง
  for (let i = Math.ceil(min); i <= Math.floor(max); i++) if (!have.has(i)) missing.push(i);
  return { sorted, min, max, missing, specials, unnumbered };
}

/** ข้อความสรุปหน้าชั้น เช่น "เล่ม 1-33 · ขาด 20" หรือ "เล่ม 1-23 · ครบ" */
function summaryText(s: ReturnType<typeof seriesSummary>): string {
  if (s.min === null) {
    const bits = [s.specials > 0 ? `พิเศษ ${s.specials}` : "", s.unnumbered > 0 ? `ไม่ระบุเล่มที่ ${s.unnumbered}` : ""].filter(Boolean);
    return bits.join(" · ");
  }
  const range = s.min === s.max ? `เล่ม ${s.min}` : `เล่ม ${s.min}-${s.max}`;
  const tail = s.missing.length > 0 ? `ขาด ${toRangeText(s.missing)}` : "ครบ";
  return `${range} · ${tail}`;
}

const DISPLAYS = ["covers", "list"] as const;
type Display = (typeof DISPLAYS)[number];

/** เรียงเล่มที่แบบเข้าใจตัวเลข (เล่ม 2 มาก่อนเล่ม 10) */
const volumeOrder = (v: string) => {
  const n = parseFloat(String(v).replace(/[^\d.]/g, ""));
  return isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
};

function Cover({ book }: { book: Book }) {
  const src = r2ImageUrl(book.cover_r2_key, 220);
  const st = getStatusStyle(book.status, "book_library");
  return (
    <div className="w-[104px] shrink-0 group cursor-pointer">
      <div className="relative w-[104px] h-[150px] rounded-md overflow-hidden shadow-md ring-1 ring-black/10
                      transition-transform duration-150 group-hover:-translate-y-1 group-hover:shadow-xl bg-slate-100">
        {src ? (
          <img src={src} alt="" loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-gradient-to-br from-slate-200 to-slate-300 px-1.5">
            <span className="text-2xl">📕</span>
            <span className="text-[10px] text-slate-600 text-center leading-tight line-clamp-3">{book.title}</span>
          </div>
        )}
        {/* สันหนังสือจาง ๆ ให้ดูเป็นเล่มจริง */}
        <div className="absolute inset-y-0 left-0 w-1.5 bg-black/15" />
        <span className={`absolute top-1 left-2.5 w-2 h-2 rounded-full ${st.dot} ring-1 ring-white`} title={st.label} />
        {book.volume && (
          <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px] font-medium tabular-nums">
            เล่ม {book.volume}
          </span>
        )}
      </div>
      <div className="mt-1.5 px-0.5">
        <div className="text-[11px] leading-tight text-slate-700 line-clamp-2" title={book.title}>{book.title}</div>
        {book.author && <div className="text-[10px] text-slate-400 truncate">{book.author}</div>}
      </div>
    </div>
  );
}

export function BookShelfView({ onSwitchToTable }: { onSwitchToTable: () => void }) {
  const canView = usePermission("books.view");
  const canEdit = usePermission("books.edit");
  const toast = useToast();

  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);
  const [seriesOpen, setSeriesOpen] = useState(false);
  const [coverJob, setCoverJob] = useState<{ done: number; total: number } | null>(null);
  const [editSeries, setEditSeries] = useState<string | null>(null);   // ชื่อชุดที่กำลังกด "จัดการชุด"
  // โชว์เป็นรูปปก หรือเป็นรายชื่อ/เลขเล่มแบบย่อ (จำไว้ต่อคน)
  const { view: display, setView: setDisplay, saveDefault: saveDisplay } = useViewPref<Display>("book_library_shelf_display", DISPLAYS, "covers");
  const goDisplay = useCallback((d: Display) => { setDisplay(d); void saveDisplay(d); }, [setDisplay, saveDisplay]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch("/api/master-v2/book_library?limit=2000");
      const j = await res.json();
      if (j.error) { setError(String(j.error)); setBooks([]); }
      else setBooks((j.data ?? []) as Book[]);
    } catch (e) {
      setError((e as Error).message ?? "โหลดข้อมูลไม่สำเร็จ");
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  /**
   * หารูปปกให้เล่มที่ยังไม่มีปก — ยิงทีละเล่ม (ไม่ยิงรัวพร้อมกัน กันโดนจำกัดจาก Google
   * และไม่ให้เซิร์ฟเวอร์ทำงานเกินเวลา) · โชว์ความคืบหน้า · หยุดทันทีถ้าติดปัญหาการตั้งค่า
   */
  const findCovers = useCallback(async (all = false) => {
    const targets = all ? books : books.filter((b) => !b.cover_r2_key);
    if (targets.length === 0) { toast.info("ทุกเล่มมีรูปปกแล้ว"); return; }
    if (all && !confirm(`หาปกใหม่ทั้งหมด ${targets.length} เล่ม — ปกเดิมที่ผิดจะถูกทับ (เล่มที่หาไม่เจอจะคงปกเดิมไว้)\n\nยืนยัน?`)) return;
    setCoverJob({ done: 0, total: targets.length });
    let found = 0;
    for (let i = 0; i < targets.length; i++) {
      try {
        const res = await apiFetch("/api/book-library/find-cover", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: targets[i].id }),
        });
        const j = await res.json();
        if (j.error) { toast.error(String(j.error)); break; }   // ตั้งค่าไม่ครบ/โควตาหมด → หยุด ไม่ต้องยิงต่อให้เสียเวลา
        if (j.found) found++;
      } catch { /* เล่มนี้พลาด ข้ามไปเล่มต่อไป */ }
      setCoverJob({ done: i + 1, total: targets.length });
    }
    setCoverJob(null);
    await load();
    toast.success(`หารูปปกเสร็จ — เจอ ${found} เล่ม จาก ${targets.length} เล่มที่ยังไม่มีปก`);
  }, [books, toast, load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const b of books) c[b.status] = (c[b.status] ?? 0) + 1;
    return c;
  }, [books]);

  /** กรอง → จัดกลุ่มตามชุด → เรียงเล่ม */
  const shelves = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const rows = books.filter((b) => {
      if (status && b.status !== status) return false;
      if (!kw) return true;
      return [b.title, b.title_en, b.author, b.series, b.volume, b.category].some((v) => String(v ?? "").toLowerCase().includes(kw));
    });
    const groups = new Map<string, Book[]>();
    for (const b of rows) {
      const key = (b.series ?? "").trim() || NO_SERIES;
      const g = groups.get(key); if (g) g.push(b); else groups.set(key, [b]);
    }
    return [...groups.entries()]
      .sort((a, b) =>
        (a[0] === NO_SERIES ? 1 : 0) - (b[0] === NO_SERIES ? 1 : 0) ||   // ชั้น "ไม่ได้จัดชุด" อยู่ท้ายสุด
        a[0].localeCompare(b[0], "th"))
      .map(([key, list]) => ({
        key,
        label: key === NO_SERIES ? "ไม่ได้จัดชุด" : key,
        // ทั้งชุดค่าเดียวกันอยู่แล้ว (ฐานข้อมูลคุมให้) — หยิบตัวแรกที่ระบุไว้มาโชว์
        seriesStatus: key === NO_SERIES ? "" : (list.find((b) => b.series_status)?.series_status ?? ""),
        // "มีเล่มอะไร ถึงเล่มไหน ขาดเล่มไหน" — ชั้น "ไม่ได้จัดชุด" ไม่ต้องสรุป (คนละเรื่องกันทั้งชั้น)
        summary: key === NO_SERIES ? null : seriesSummary(list),
        // ชื่อชุดภาษาอังกฤษ — ถอดจากชื่อเล่ม (ตัด " Vol. 23" ท้ายออก)
        labelEn: key === NO_SERIES ? "" : (list.find((b) => (b.title_en ?? "").trim())?.title_en ?? "").replace(/\s*Vol\.?\s*[\d.]+\s*$/i, "").trim(),
        books: list.sort((x, y) => volumeOrder(x.volume) - volumeOrder(y.volume) || x.title.localeCompare(y.title, "th")),
      }));
  }, [books, q, status]);

  const shown = shelves.reduce((n, s) => n + s.books.length, 0);

  if (!canView) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
        {/* หัวหน้า + สลับมุมมอง */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex-1 min-w-[220px]">
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">📚 คลังหนังสือ</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              ชั้นหนังสือ — จัดเรียงตามชุด/ซีรีส์ · กดที่ปกเพื่อดูหรือแก้ไข
            </p>
          </div>
          <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5">
            <button onClick={onSwitchToTable}
              className="h-8 px-3 text-sm rounded-md text-slate-500 hover:bg-slate-50">📋 ตาราง</button>
            <button className="h-8 px-3 text-sm rounded-md bg-slate-800 text-white font-medium">📚 ชั้นหนังสือ</button>
          </div>
          {canEdit && (
            <>
              {books.some((b) => !b.cover_r2_key) && (
                <button onClick={() => findCovers(false)} disabled={!!coverJob}
                  title="ค้นรูปปกจาก Google Books ให้เล่มที่ยังไม่มีปก"
                  className="h-9 px-4 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                  {coverJob ? `🖼 กำลังหา ${coverJob.done}/${coverJob.total}…` : "🖼 หารูปปกให้"}
                </button>
              )}
              {books.some((b) => b.cover_r2_key) && (
                <button onClick={() => findCovers(true)} disabled={!!coverJob}
                  title="ค้นใหม่ทุกเล่ม ทับปกเดิม (ใช้เมื่อปกที่ได้มาผิด)"
                  className="h-9 px-4 text-sm font-medium rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50">
                  {coverJob ? `🔄 ${coverJob.done}/${coverJob.total}…` : "🔄 หาปกใหม่ทั้งหมด"}
                </button>
              )}
              <button onClick={() => setSeriesOpen(true)}
                className="h-9 px-4 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">📚 เพิ่มทั้งชุด</button>
              <button onClick={() => setMailOpen(true)}
                className="h-9 px-4 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">📧 จากอีเมล</button>
              <button onClick={() => setCreating(true)}
                className="h-9 px-4 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700">+ เพิ่มเล่ม</button>
            </>
          )}
        </div>

        {/* ค้นหา + กรองสถานะ */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา ชื่อเรื่อง / ผู้แต่ง / ชุด…"
            className="h-9 w-full sm:w-72 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200" />
          <button onClick={() => setStatus(null)}
            className={`h-8 px-3 text-xs rounded-full border ${status === null ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
            ทั้งหมด ({books.length})
          </button>
          {STATUSES.map((s) => {
            const st = getStatusStyle(s, "book_library");
            const on = status === s;
            return (
              <button key={s} onClick={() => setStatus(on ? null : s)}
                className={`h-8 px-3 text-xs rounded-full border inline-flex items-center gap-1.5
                  ${on ? `${st.bg} ${st.text} ${st.border} ring-2 ${st.ring}` : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                <span className={`w-2 h-2 rounded-full ${st.dot}`} />{st.label} ({counts[s] ?? 0})
              </button>
            );
          })}

          {/* โชว์เป็นปก หรือเป็นรายชื่อ/เลขเล่มย่อ (เห็นทั้งชุดจบในบรรทัดเดียว) */}
          <div className="ml-auto flex items-center rounded-lg border border-slate-200 bg-white p-0.5">
            <button onClick={() => goDisplay("covers")} title="โชว์รูปปก"
              className={`h-7 px-2.5 text-xs rounded-md ${display === "covers" ? "bg-slate-800 text-white font-medium" : "text-slate-500 hover:bg-slate-50"}`}>🖼 ปก</button>
            <button onClick={() => goDisplay("list")} title="โชว์เป็นรายชื่อ + เลขเล่ม (เห็นว่าขาดเล่มไหน)"
              className={`h-7 px-2.5 text-xs rounded-md ${display === "list" ? "bg-slate-800 text-white font-medium" : "text-slate-500 hover:bg-slate-50"}`}>📇 รายชื่อ</button>
          </div>
        </div>

        {/* ชั้นหนังสือ */}
        {loading ? (
          <div className="py-20 text-center text-slate-400">กำลังโหลด…</div>
        ) : error ? (
          <div className="py-16 text-center">
            <div className="text-4xl mb-2">⚠️</div>
            <div className="text-slate-700 font-medium">โหลดข้อมูลไม่สำเร็จ</div>
            <div className="text-sm text-slate-400 mt-1">{error}</div>
            <button onClick={load} className="mt-4 h-9 px-4 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">ลองใหม่</button>
          </div>
        ) : shown === 0 ? (
          <div className="py-16 text-center">
            <div className="text-5xl mb-3">📚</div>
            <div className="text-slate-700 font-medium">
              {books.length === 0 ? "ชั้นหนังสือยังว่างอยู่" : "ไม่พบเล่มที่ตรงกับที่ค้นหา"}
            </div>
            <div className="text-sm text-slate-400 mt-1">
              {books.length === 0 ? "กด \"+ เพิ่มเล่ม\" เพื่อเริ่มบันทึกเล่มแรก" : "ลองเปลี่ยนคำค้นหรือล้างตัวกรองสถานะ"}
            </div>
          </div>
        ) : (
          <div className={display === "list" ? "space-y-1.5" : "space-y-8"}>
            {shelves.map((sh) => (
              <div key={sh.key} className={display === "list" ? "rounded-lg border border-slate-200 bg-white px-2.5 py-2" : undefined}>
                <div className={`flex flex-wrap items-baseline gap-x-2 ${display === "list" ? "gap-y-0.5 mb-1.5" : "gap-y-1 mb-2"}`}>
                  {/* กดชื่อชุด = จัดการทั้งชุด (เปลี่ยนชื่อ / จบหรือยัง / เพิ่ม-ลดจำนวนเล่ม / เล่มพิเศษ) */}
                  {canEdit && sh.key !== NO_SERIES ? (
                    <button onClick={() => setEditSeries(sh.key)} title="จัดการทั้งชุด — เปลี่ยนชื่อ / จบหรือยัง / เพิ่ม-ลดจำนวนเล่ม"
                      className="group text-sm font-semibold text-slate-700 hover:text-blue-700 inline-flex items-center gap-1">
                      {sh.label}
                      <span className="text-[10px] text-slate-300 group-hover:text-blue-500">⚙</span>
                    </button>
                  ) : (
                    <h2 className="text-sm font-semibold text-slate-700">{sh.label}</h2>
                  )}
                  {sh.labelEn && <span className="text-xs text-slate-400 italic">({sh.labelEn})</span>}
                  <span className="text-xs text-slate-400">{sh.books.length} เล่ม</span>
                  {SERIES_BADGE[sh.seriesStatus] && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${SERIES_BADGE[sh.seriesStatus].cls}`}>
                      {SERIES_BADGE[sh.seriesStatus].label}
                    </span>
                  )}
                  {/* "เล่ม 1-33 · ขาด 20" — เห็นทั้งชุดจบในบรรทัดเดียว ไม่ต้องไล่นับปก */}
                  {sh.summary && summaryText(sh.summary) && (
                    <span className="text-xs text-slate-500">
                      {sh.summary.min === null ? summaryText(sh.summary) : (
                        <>
                          เล่ม {sh.summary.min === sh.summary.max ? sh.summary.min : `${sh.summary.min}-${sh.summary.max}`}
                          {" · "}
                          {sh.summary.missing.length > 0
                            ? <span className="text-rose-600 font-medium">ขาด {toRangeText(sh.summary.missing)}</span>
                            : <span className="text-emerald-600">ครบ</span>}
                          {sh.summary.specials > 0 && <span className="text-violet-600"> · พิเศษ {sh.summary.specials}</span>}
                          {sh.summary.unnumbered > 0 && <span className="text-slate-400"> · ไม่ระบุเล่มที่ {sh.summary.unnumbered}</span>}
                        </>
                      )}
                    </span>
                  )}
                </div>

                {display === "list" ? (
                  /* รายชื่อแบบย่อ — เลขเล่มที่มี (สีตามสถานะ) + เล่มที่ขาด (กรอบประ) กดที่เลขเพื่อเปิด/แก้เล่มนั้น */
                  <div className="flex flex-wrap gap-[3px]">
                    {sh.books.map((b) => {
                      const st = getStatusStyle(b.status, "book_library");
                      const num = volumeNum(b.volume);
                      const text = num ?? (b.volume.trim() || b.title);
                      return (
                        <button key={b.id} onClick={() => setOpenId(b.id)}
                          title={`${b.title} — ${st.label} (กดเพื่อแก้)`}
                          className={`h-6 min-w-[24px] px-1 text-[11px] leading-none rounded border tabular-nums max-w-[150px] truncate
                            ${st.bg} ${st.text} ${st.border} hover:brightness-95`}>
                          {text}
                        </button>
                      );
                    })}
                    {sh.summary?.missing.map((n) => (
                      <span key={`miss-${n}`} title={`เล่ม ${n} — ยังไม่มีในคลัง`}
                        className="h-6 min-w-[24px] px-1 text-[11px] leading-none rounded border border-dashed border-rose-300 text-rose-500 bg-rose-50/40 tabular-nums inline-flex items-center justify-center">
                        {n}
                      </span>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-x-4 gap-y-3 items-end pb-3">
                      {sh.books.map((b) => (
                        <div key={b.id} onClick={() => setOpenId(b.id)}>
                          <Cover book={b} />
                        </div>
                      ))}
                    </div>
                    {/* แผ่นชั้นวาง */}
                    <div className="h-2.5 rounded-sm bg-gradient-to-b from-amber-700/80 to-amber-900/80 shadow-[0_6px_10px_-6px_rgba(0,0,0,0.55)]" />
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <ImportMailModal open={mailOpen} onClose={() => setMailOpen(false)} onImported={load} />
      <SeriesWizardModal open={seriesOpen} onClose={() => setSeriesOpen(false)} onCreated={load} />

      {/* จัดการทั้งชุด — ใช้เล่มทั้งหมดของชุดนั้น (ไม่ใช่เฉพาะที่ผ่านตัวกรองบนหน้าจอ) */}
      {editSeries && (
        <SeriesEditModal
          open
          seriesName={editSeries}
          books={books.filter((b) => (b.series ?? "").trim() === editSeries)}
          onClose={() => setEditSeries(null)}
          onSaved={load}
          onOpenBook={(id) => { setEditSeries(null); setOpenId(id); }}
        />
      )}

      {(openId || creating) && (
        <MasterRecordDrawer
          moduleKey="book_library"
          apiPath="book_library"
          title="คลังหนังสือ"
          icon="📚"
          recordId={creating ? null : openId}
          createTitle="เพิ่มหนังสือ"
          permissions={{ view: "books.view", create: "books.edit", edit: "books.edit" }}
          onClose={() => { setOpenId(null); setCreating(false); }}
          onChanged={load}
        />
      )}
    </PlaygroundShell>
  );
}
