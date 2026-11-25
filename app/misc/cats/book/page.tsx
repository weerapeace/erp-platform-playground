"use client";

/**
 * /misc/cats/book?cat=<id|all> — 🐾 สมุดสุขภาพแมว (หน้าพิมพ์ · เจ้าของเลือก 2026-11-25 ข้อ 5)
 *   เปิดจากปุ่ม "สมุดสุขภาพ" ในหน้าแมว (แท็บใหม่) · เลือกแมว (ตัวเดียว / ทุกตัว = ตัวละหน้า) + หัวข้อที่จะใส่
 *   พรีวิว = PrintFrame กลาง · พิมพ์/PDF = printReportHtmlInNewWindow · บันทึก JPG = SaveImageButton (ส่ง LINE ให้หมอ)
 *   ตัวสร้างหน้า = lib/cats-book (เทสต์ได้) · หน้าดูอย่างเดียว ไม่เปลี่ยนข้อมูล · ข้อมูลผ่าน /api/cats (สิทธิ์ cats.view)
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PlaygroundShell } from "@/components/playground-shell";
import { PrintFrame, printReportHtmlInNewWindow } from "@/components/report";
import { SaveImageButton } from "@/components/report/save-image-button";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { Icon } from "@/components/icon";
import { useAuth } from "@/components/auth";
import { todayBangkok } from "@/lib/date";
import { CATS_VIEW } from "@/lib/cats";
import { BOOK_SECTIONS, buildCatBook, type BookSection } from "@/lib/cats-book";
import { catPhotoUrl, useCatsData } from "../use-cats";

const SEC_KEY = "cats.book.sections";

function BookView() {
  const q = useSearchParams();
  const { can, permsReady, user } = useAuth();
  const { data, loading, error, reload } = useCatsData();
  const [pick, setPick] = useState<string>(q.get("cat") || "all");
  const [sections, setSections] = useState<Set<BookSection>>(() => new Set(BOOK_SECTIONS.filter((s) => s.default).map((s) => s.key)));
  useEffect(() => {
    try { const raw = localStorage.getItem(SEC_KEY); if (raw) setSections(new Set(JSON.parse(raw) as BookSection[])); } catch { /* ใช้ค่าเริ่ม */ }
  }, []);
  const toggle = (k: BookSection) => setSections((s) => {
    const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k);
    try { localStorage.setItem(SEC_KEY, JSON.stringify([...n])); } catch { /* ไม่มีที่เก็บ */ }
    return n;
  });

  const today = todayBangkok();
  const cats = useMemo(() => data.cats.filter((c) => c.is_active).sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)), [data.cats]);
  const chosen = useMemo(() => (pick === "all" ? cats : cats.filter((c) => c.id === pick)), [cats, pick]);
  const html = useMemo(() => {
    if (!chosen.length) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return buildCatBook(chosen, data, sections, today, (c) => { const u = catPhotoUrl(c.photo_r2_key, 600); return u ? `${origin}${u}` : null; });
  }, [chosen, data, sections, today]);
  const fileName = chosen.length === 1 ? `สมุดสุขภาพ ${chosen[0].name} ${today}` : `สมุดสุขภาพแมว ${today}`;

  if (!user || !permsReady) return <LoadingState variant="cards" rows={3} />;
  if (!can(CATS_VIEW)) return <EmptyState icon={<Icon name="paw" />} title="ยังไม่มีสิทธิ์ดูทะเบียนแมว" hint="ขอให้แอดมินเปิดสิทธิ์ “ดูทะเบียนแมว” ให้" />;

  return (
    <div className="min-h-full bg-slate-100">
      <div className="sticky top-0 z-10 space-y-2 border-b border-slate-200 bg-slate-100 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <a href={pick !== "all" ? `/misc/cats?cat=${pick}` : "/misc/cats"} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50"><Icon name="arrow-left" /> กลับแอปแมว</a>
          <span className="mr-auto text-sm font-medium text-slate-700"><Icon name="printer" className="mr-1" />สมุดสุขภาพแมว</span>
          <SaveImageButton html={html} fileName={fileName} pageWidthPx={794} />
          <button type="button" onClick={() => html && printReportHtmlInNewWindow(html)} disabled={!html} className="h-9 rounded-lg bg-sky-600 px-4 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">พิมพ์ / PDF</button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="mr-1 text-xs text-slate-500">แมว</span>
          {[{ id: "all", name: `ทุกตัว (${cats.length})` }, ...cats].map((c) => (
            <button key={c.id} type="button" onClick={() => setPick(c.id)} className={`rounded-full border px-3 py-1 ${pick === c.id ? "border-sky-500 bg-sky-50 font-medium text-sky-700" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}>{c.name}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="mr-1 text-xs text-slate-500">ใส่หัวข้อ</span>
          {BOOK_SECTIONS.map((s) => (
            <label key={s.key} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 ${sections.has(s.key) ? "border-sky-500 bg-sky-50 text-sky-700" : "border-slate-300 bg-white text-slate-500"}`}>
              <input type="checkbox" checked={sections.has(s.key)} onChange={() => toggle(s.key)} className="h-3.5 w-3.5 accent-sky-600" /> {s.label}
            </label>
          ))}
        </div>
      </div>
      <div className="px-2 py-4 sm:px-6">
        {loading ? <LoadingState variant="cards" rows={2} />
          : error ? <ErrorState title="โหลดข้อมูลแมวไม่ได้" hint={error} onRetry={() => void reload()} />
          : !chosen.length ? <EmptyState icon={<Icon name="cat" />} title="ยังไม่มีแมวในทะเบียน" hint="เพิ่มแมวในแอปก่อน แล้วค่อยมาพิมพ์สมุด" />
          : <PrintFrame html={html} maxWidth={840} fit onPrint={() => printReportHtmlInNewWindow(html)} fileName={fileName} />}
      </div>
    </div>
  );
}

export default function CatBookPage() {
  return (
    <PlaygroundShell>
      <Suspense fallback={<LoadingState />}><BookView /></Suspense>
    </PlaygroundShell>
  );
}
