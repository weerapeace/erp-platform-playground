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
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import { getStatusStyle } from "@/lib/status-config";

const MasterRecordDrawer = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterRecordDrawer),
  { ssr: false },
);

type Book = {
  id: string;
  title: string;
  author: string;
  series: string;
  volume: string;
  category: string;
  status: string;
  rating: number | null;
  cover_r2_key: string | null;
};

const STATUSES = ["owned", "wishlist", "upcoming", "skipped"] as const;
const NO_SERIES = "__no_series__";   // ชั้น "ไม่ได้จัดชุด" — เรียงไว้ท้ายสุดเสมอ

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

  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

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
      return [b.title, b.author, b.series, b.volume, b.category].some((v) => String(v ?? "").toLowerCase().includes(kw));
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
            <button onClick={() => setCreating(true)}
              className="h-9 px-4 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700">+ เพิ่มเล่ม</button>
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
          <div className="space-y-8">
            {shelves.map((sh) => (
              <div key={sh.key}>
                <div className="flex items-baseline gap-2 mb-2">
                  <h2 className="text-sm font-semibold text-slate-700">{sh.label}</h2>
                  <span className="text-xs text-slate-400">{sh.books.length} เล่ม</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-3 items-end pb-3">
                  {sh.books.map((b) => (
                    <div key={b.id} onClick={() => setOpenId(b.id)}>
                      <Cover book={b} />
                    </div>
                  ))}
                </div>
                {/* แผ่นชั้นวาง */}
                <div className="h-2.5 rounded-sm bg-gradient-to-b from-amber-700/80 to-amber-900/80 shadow-[0_6px_10px_-6px_rgba(0,0,0,0.55)]" />
              </div>
            ))}
          </div>
        )}
      </div>

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
