"use client";

/**
 * 🎓 ศูนย์เรียนรู้ (แอป "งานอื่นๆ") — ตัวแอปทั้งหน้า (แบบ A: หมวด → บทเรียน → ขั้นตอน)
 *   PC: ซ้าย = ค้น + หมวด + รายชื่อบท · ขวา = อ่านบท · มือถือ: รายชื่อ → แตะแล้วเปิดบทเต็มจอ (ปุ่มย้อนกลับ)
 *   learn.manage: สร้าง/แก้/เผยแพร่/ลบ (ถังขยะ กู้คืนได้) + เห็นร่างรอตรวจ · learn.view: อ่านเฉพาะที่เผยแพร่
 *   เปิดบทตรงด้วย ?lesson=<id> (มาจากค้นหาทั้งระบบ / ลิงก์ที่ส่งกัน)
 *   ข้อมูล/เขียน ผ่าน use-learn (API /api/learn) · กติกา lib/learn · คู่มือ docs/learning-center.md
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { ConfirmDialog } from "@/components/modal";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { formatDateTime } from "@/lib/date";
import { groupLessons, lessonMatches, UNCATEGORIZED, type Lesson } from "@/lib/learn";
import { LessonReader } from "./lesson-reader";
import { LessonEditor } from "./lesson-editor";
import { useLessons, useLessonWrite, type LessonDraft } from "./use-learn";
import { ShotsTab } from "./shots/shots-tab";

type Tab = "all" | "shots" | "draft" | "trash";
const ALL = "__all__";

function readLessonParam(): string | null {
  try { return new URLSearchParams(window.location.search).get("lesson"); } catch { return null; }
}
function readTabParam(): Tab | null {
  try { return new URLSearchParams(window.location.search).get("tab") === "shots" ? "shots" : null; } catch { return null; }
}
function writeTabParam(t: Tab) {
  try {
    const u = new URL(window.location.href);
    if (t === "shots") u.searchParams.set("tab", "shots"); else u.searchParams.delete("tab");
    window.history.replaceState(window.history.state, "", u.toString());
  } catch { /* ไม่เป็นไร */ }
}
function writeLessonParam(id: string | null) {
  try {
    const u = new URL(window.location.href);
    if (id) u.searchParams.set("lesson", id); else u.searchParams.delete("lesson");
    window.history.replaceState(window.history.state, "", u.toString());
  } catch { /* ไม่เป็นไร */ }
}

function TrashList({ onChanged }: { onChanged: () => void | Promise<void> }) {
  const { lessons, loading, error, reload } = useLessons(true);
  const w = useLessonWrite(async () => { await reload(); await onChanged(); });
  const [confirm, setConfirm] = useState<Lesson | null>(null);
  if (loading) return <LoadingState rows={3} />;
  if (error) return <ErrorState title="โหลดถังขยะไม่ได้" hint={error} onRetry={() => void reload()} />;
  if (!lessons.length) return <EmptyState icon={<Icon name="trash" />} title="ถังขยะว่าง" hint="บทเรียนที่ลบจะมาอยู่ที่นี่ก่อน กู้คืนได้ทุกเมื่อ" />;
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-500">บทเรียนที่ลบไว้ {lessons.length} บท · กด “กู้คืน” เพื่อเอากลับ</p>
      <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {lessons.map((l) => (
          <div key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-800">{l.title}</div>
              <div className="text-xs text-slate-400">{l.category || UNCATEGORIZED} · {l.steps.length} ขั้นตอน · ลบเมื่อ {formatDateTime(l.deleted_at)}</div>
            </div>
            <button type="button" onClick={() => void w.restore(l)} className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"><Icon name="arrow-back-up" /> กู้คืน</button>
            <button type="button" onClick={() => setConfirm(l)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Icon name="trash-x" /> ลบถาวร</button>
          </div>
        ))}
      </div>
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} variant="danger" confirmText="ลบถาวร"
        title={`ลบ "${confirm?.title ?? ""}" ถาวร?`} requireTyped={confirm?.title}
        message="ขั้นตอนทั้งหมดของบทนี้จะหายไปด้วย ลบแล้วกู้คืนไม่ได้ (ไฟล์ใน Google Drive ยังอยู่) — พิมพ์ชื่อบทเพื่อยืนยัน"
        onConfirm={async () => { const c = confirm; setConfirm(null); if (c) await w.purge(c); }} />
    </div>
  );
}

export function LearnApp() {
  const { lessons, canManage, loading, error, reload } = useLessons(false);
  const w = useLessonWrite(reload);
  const [tab, setTab] = useState<Tab>("all");
  const [cat, setCat] = useState<string>(ALL);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Lesson | "new" | null>(null);
  const [delTarget, setDelTarget] = useState<Lesson | null>(null);

  useEffect(() => { const id = readLessonParam(); if (id) setOpenId(id); const t = readTabParam(); if (t) setTab(t); }, []);
  const open = useCallback((id: string | null) => { setOpenId(id); writeLessonParam(id); }, []);

  const drafts = useMemo(() => lessons.filter((l) => l.status === "draft"), [lessons]);
  const pool = tab === "draft" ? drafts : lessons;
  const groups = useMemo(() => groupLessons(pool), [pool]);
  const categories = useMemo(() => groupLessons(lessons).map((g) => g.category).filter((c) => c !== UNCATEGORIZED), [lessons]);
  const shown = useMemo(() => pool
    .filter((l) => cat === ALL || ((l.category ?? "").trim() || UNCATEGORIZED) === cat)
    .filter((l) => lessonMatches(l, q)), [pool, cat, q]);
  const shownGroups = useMemo(() => groupLessons(shown), [shown]);
  const current = lessons.find((l) => l.id === openId) ?? null;

  // PC: ยังไม่เลือกบท → เปิดบทแรกของรายการให้เลย
  useEffect(() => {
    if (loading || openId || !shown.length) return;
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) setOpenId(shown[0].id);
  }, [loading, openId, shown]);

  const save = async (d: LessonDraft): Promise<boolean> => {
    if (editing === "new") { const l = await w.create(d); if (l) open(l.id); return !!l; }
    if (editing) return !!(await w.update(editing, d));
    return false;
  };

  if (loading) return <div className="p-5"><LoadingState rows={5} /></div>;
  if (error) return <div className="p-5"><ErrorState title="โหลดศูนย์เรียนรู้ไม่ได้" hint={error} onRetry={() => void reload()} /></div>;

  const list = (
    <div className="space-y-3">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icon name="search" /></span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นบทเรียน เช่น แสง, โฟกัส" className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-[13px]" />
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
        {[{ category: ALL, lessons: pool }, ...groups].map((g) => (
          <button key={g.category} type="button" onClick={() => setCat(g.category)}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] ${cat === g.category ? "bg-indigo-50 font-medium text-indigo-700" : "text-slate-600 hover:bg-slate-50"}`}>
            <span className="truncate">{g.category === ALL ? "ทุกหมวด" : g.category}</span>
            <span className="ml-auto rounded-full bg-white/70 px-1.5 text-[11px] text-slate-400">{g.lessons.length}</span>
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-slate-400">{q ? "ไม่พบบทเรียนที่ตรงกับคำค้น ลองคำอื่น" : "หมวดนี้ยังไม่มีบทเรียน"}</p>
      ) : (
        <div className="space-y-3">
          {shownGroups.map((g) => (
            <div key={g.category}>
              {cat === ALL && <p className="mb-1 px-1 text-[11px] font-medium text-slate-400">{g.category}</p>}
              <div className="space-y-1">
                {g.lessons.map((l) => (
                  <button key={l.id} type="button" onClick={() => open(l.id)}
                    className={`flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left ${l.id === openId ? "border-indigo-300 bg-indigo-50/60" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                    <span className="mt-0.5 text-lg text-indigo-500"><Icon value={l.icon || "i:book"} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-slate-800">{l.title}</span>
                      <span className="block truncate text-[11px] text-slate-400">{l.steps.length} ขั้นตอน{l.source_url ? " · มีคลิป" : ""}</span>
                    </span>
                    {l.status === "draft" && <span className="shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">ร่าง</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const reader = current ? (
    <div>
      <button type="button" onClick={() => open(null)} className="mb-3 inline-flex items-center gap-1 text-[13px] text-slate-500 hover:text-slate-800 lg:hidden"><Icon name="arrow-left" /> กลับไปรายชื่อบทเรียน</button>
      <LessonReader lesson={current} canManage={canManage}
        onEdit={canManage ? () => setEditing(current) : undefined}
        onPublish={canManage ? () => void w.update(current, { status: "published" }, `เผยแพร่ "${current.title}" แล้ว`) : undefined} />
      {canManage && (
        <div className="mx-auto mt-4 flex max-w-3xl justify-end">
          <button type="button" onClick={() => setDelTarget(current)} className="inline-flex items-center gap-1 text-[12px] text-slate-400 hover:text-rose-600"><Icon name="trash" /> ลบบทนี้ (ย้ายเข้าถังขยะ)</button>
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-4 sm:px-5">
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-lg font-bold text-slate-800"><Icon name="school" /> ศูนย์เรียนรู้</h1>
          <p className="text-[13px] text-slate-500">บทเรียนสอนงานทีละขั้น — อ่าน ดูคลิป แล้วติ๊กเช็กลิสต์ตอนทำงานจริง</p>
        </div>
        <Link href="/misc/learn/studio" className="inline-flex h-9 items-center gap-1 rounded-lg border border-indigo-200 bg-white px-3 text-sm font-medium text-indigo-700 hover:bg-indigo-50"><Icon name="bulb" /> สตูดิโอจำลอง</Link>
        {canManage && tab !== "shots" && (
          <button type="button" onClick={() => setEditing("new")} className="inline-flex h-9 items-center gap-1 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700"><Icon name="plus" /> สร้างบทเรียน</button>
        )}
      </div>

      {(
        <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 text-[13px]">
          {([["all", `บทเรียน (${lessons.length})`], ["shots", "Video Shot"], ...(canManage ? [["draft", `ร่างรอตรวจ (${drafts.length})`], ["trash", "ถังขยะ"]] : [])] as [Tab, string][]).map(([k, label]) => (
            <button key={k} type="button" onClick={() => { setTab(k); setCat(ALL); writeTabParam(k); }}
              className={`-mb-px shrink-0 border-b-2 px-3 py-2 ${tab === k ? "border-indigo-600 font-medium text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{label}</button>
          ))}
        </div>
      )}

      {tab === "shots" ? <ShotsTab /> : tab === "trash" ? <TrashList onChanged={reload} /> : lessons.length === 0 ? (
        <EmptyState icon={<Icon name="school" />} title="เริ่มบทเรียนแรก"
          hint={canManage ? "กด “สร้างบทเรียน” แล้วแปะลิงก์คลิปที่สอนดี ๆ หรือส่งลิงก์ให้ Claude ในแชตสรุปเป็นบทเรียน (จะขึ้นเป็นร่างให้ตรวจก่อน)" : "ยังไม่มีบทเรียนที่เผยแพร่ — รอหัวหน้าเพิ่มบทเรียนก่อนนะ"}
          onCreate={canManage ? () => setEditing("new") : undefined} createLabel="สร้างบทเรียน" />
      ) : tab === "draft" && drafts.length === 0 ? (
        <EmptyState icon={<Icon name="checklist" />} title="ไม่มีร่างรอตรวจ" hint="บทที่ Claude สรุปจากลิงก์ หรือบทที่บันทึกเป็นร่าง จะมาอยู่ที่นี่ก่อนเผยแพร่" />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className={`${current ? "hidden lg:block" : ""} lg:sticky lg:top-4 lg:max-h-[calc(100vh-120px)] lg:overflow-y-auto`}>{list}</aside>
          <main className={current ? "" : "hidden lg:block"}>
            {reader ?? <p className="py-16 text-center text-[13px] text-slate-400">เลือกบทเรียนจากรายการด้านซ้าย</p>}
          </main>
        </div>
      )}

      {editing && (
        <LessonEditor lesson={editing === "new" ? null : editing} categories={categories}
          defaultCategory={cat !== ALL && cat !== UNCATEGORIZED ? cat : undefined}
          onClose={() => setEditing(null)} onSave={save} />
      )}
      <ConfirmDialog open={!!delTarget} onClose={() => setDelTarget(null)} variant="danger" confirmText="ย้ายเข้าถังขยะ"
        title={`ลบ "${delTarget?.title ?? ""}"?`} message="บทนี้จะย้ายเข้าถังขยะ พนักงานจะไม่เห็น — กู้คืนได้จากแท็บถังขยะ หรือกด “ย้อนกลับ” ที่แจ้งผล"
        onConfirm={async () => { const d = delTarget; setDelTarget(null); if (d && (await w.remove(d))) open(null); }} />
    </div>
  );
}
