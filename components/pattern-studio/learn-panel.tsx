"use client";
/**
 * 🎓 เรียนไปทำไป (Bag CAD รอบ C · 2026-11-12) — การ์ดบทเรียนลอยมุมล่างซ้าย + สารบัญบทเรียน
 *   LearnCard: เป้าหมาย · ขั้นตอน (ติ๊กเองจากรูปทรงจริงทุกครั้งที่งานเปลี่ยน — lib/pattern-lessons) · พาไปที่เครื่องมือ (ไฮไลต์ปุ่มจริง)
 *     · ใบ้ 3 ระดับ (ระดับ 3 = ทำให้ดู ผ่านคำสั่งปกติของกระดาน ย้อนได้) · ทำไมต้องทำแบบนี้ · ย้อน/ถัดไป · เริ่มบทใหม่ (แบบฝึก) · ข้าม
 *     ไม่ล็อกหน้าจอ — ทำงานอื่นบนกระดานได้ตามปกติ · ย่อเหลือแถบเล็กได้
 *   LessonCatalog: 12 บท สถานะ (ผ่าน / กำลังทำ / ข้าม / มาในรอบไหน) → เริ่มบน "แบบฝึก" (สร้างแพทเทิร์นใหม่จากชิ้นตั้งต้น) หรือ "สำเนางานนี้"
 *     — บทเรียนไม่แตะงานจริงเลย · ความคืบหน้าเก็บต่อคน (useUserPref "pattern_lessons") แยกจากข้อมูลแพทเทิร์น ทำต่อได้ทุกเครื่อง
 * ใช้ที่: components/pattern-studio (การ์ด + ปุ่ม เรียน) · app/pattern-studio/view (ปุ่ม เรียนทำแพทเทิร์น)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { apiFetch } from "@/lib/api";
import { useUserPref } from "@/lib/use-user-pref";
import { EMPTY_PROGRESS, LESSONS, LESSON_VERSION, cleanProgress, closestPiece, evalLesson, lessonById, missingBefore, type Guide, type Lesson, type LessonCtx, type LessonDemo, type LessonProgress } from "@/lib/pattern-lessons";
import { PATTERN_SCHEMA, type ProjectPiece } from "@/lib/pattern-project";
import type { Seam } from "@/lib/pattern-seams";

export const LESSON_PREF_KEY = "pattern_lessons";
export const useLessonProgress = () => useUserPref<LessonProgress>(LESSON_PREF_KEY, EMPTY_PROGRESS, cleanProgress);
/** บทเรียนที่ผูกกับแพทเทิร์นใบนี้ (template.lesson) */
export type LessonRef = { id: number; mode: "practice" | "copy" };
export function cleanLessonRef(raw: unknown): LessonRef | null {
  const r = raw && typeof raw === "object" ? raw as Record<string, unknown> : null;
  const l = r ? lessonById(Number(r.id)) : null;
  return l && l.ready ? { id: l.id, mode: r!.mode === "copy" ? "copy" : "practice" } : null;
}
export type CopySource = { name: string; pieces: ProjectPiece[]; seams: Seam[]; template: Record<string, unknown> | null };

/** ชิ้นที่ควรเลือกให้ตอน "พาไปที่เครื่องมือ" */
function guideTarget(l: Lesson, c: LessonCtx): string | null {
  if (c.selPid && c.pieces.some((p) => p.pid === c.selPid)) return c.selPid;
  if (l.id === 2) return closestPiece(c.pieces, 20, 15)?.pid ?? null;
  if (l.id === 3) return closestPiece(c.pieces, 25, 15)?.pid ?? null;
  return c.pieces[0]?.pid ?? null;
}

export function LearnCard({ lesson: ref, projectName, ctx, L, readonly, onGuide, onDemo, onReset, onCatalog, onClose }: {
  lesson: LessonRef; projectName: string; ctx: LessonCtx; L: (cm: number) => string; readonly: boolean;
  /** พาไปที่เครื่องมือ (ไฮไลต์ของจริงบนจอ) */ onGuide: (g: Guide, targetPid: string | null) => void;
  /** ทำให้ดู (ผ่านคำสั่งของกระดาน · ย้อนได้) */ onDemo: (d: LessonDemo) => void;
  /** เริ่มบทใหม่ = คืนชิ้นตั้งต้น (เฉพาะแบบฝึก) */ onReset?: () => void;
  onCatalog: () => void; onClose: () => void;
}) {
  const t = useT();
  const lesson = lessonById(ref.id)!;
  const [prog, setProg] = useLessonProgress();
  const r = useMemo(() => evalLesson(lesson, ctx, L), [lesson, ctx, L]);
  const [view, setView] = useState<number | null>(null);   // ขั้นที่กำลังดู (null = ขั้นแรกที่ยังไม่ผ่าน)
  const [hint, setHint] = useState<Record<number, number>>({});
  const [why, setWhy] = useState(false);
  const [mini, setMini] = useState(false);
  const [nextErr, setNextErr] = useState<string | null>(null);
  const [askReset, setAskReset] = useState(false);
  const rec = prog.lessons[String(lesson.id)];
  // เปิดบท = จด "กำลังทำ" (ผ่านแล้วไม่ทับ)
  useEffect(() => {
    if (rec?.st === "done" || rec?.st === "doing") return;
    setProg({ ...prog, lessons: { ...prog.lessons, [lesson.id]: { st: "doing", at: new Date().toISOString(), ver: LESSON_VERSION } } });
  }, [lesson.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setNextErr(null); }, [r.done, r.current]);   // ขั้นที่เตือนไว้ผ่านแล้ว = เลิกเตือน
  // ขั้นที่กำลังดูเพิ่งผ่าน → ไปขั้นถัดไปที่ยังไม่ผ่านเอง (กดกลับไปอ่านขั้นที่ผ่านแล้วได้ ไม่ดีดออก)
  const prevOk = useRef<boolean[]>([]);
  useEffect(() => {
    const was = prevOk.current;
    if (view != null && !was[view] && r.steps[view]?.ok) setView(null);
    prevOk.current = r.steps.map((s) => s.ok);
  }, [r.steps, view]);
  const cur = Math.min(view ?? r.current, lesson.steps.length - 1);
  const step = lesson.steps[cur], st = r.steps[cur], lv = hint[cur] ?? 0;
  const demo = lv >= 3 && step.demo && !readonly ? step.demo(ctx) : null;
  const finish = () => {
    if (!r.done) {
      const i = r.steps.findIndex((s) => !s.ok), m = r.steps[i]?.msg;
      setNextErr(t(`ยังไม่ผ่าน — ขั้น ${i + 1}: ${m ? m.th : lesson.steps[i].text.th}`, `Not passed yet — step ${i + 1}: ${m ? m.en : lesson.steps[i].text.en}`));
      setView(i); return;
    }
    setProg({ ...prog, lessons: { ...prog.lessons, [lesson.id]: { ...(rec ?? {}), st: "done", at: new Date().toISOString(), ver: LESSON_VERSION } } });
    onCatalog();
  };
  const skip = () => { setProg({ ...prog, lessons: { ...prog.lessons, [lesson.id]: { ...(rec ?? {}), st: rec?.st === "done" ? "done" : "skip", at: new Date().toISOString(), ver: LESSON_VERSION } } }); onCatalog(); };
  const okCount = r.steps.filter((s) => s.ok).length;

  if (mini) return (
    <button type="button" data-learn-mini onClick={() => setMini(false)} className="fixed bottom-24 left-4 z-40 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-3 py-2 text-xs text-blue-800 shadow-lg hover:bg-blue-50">
      <Icon value="i:book" />{t(`บท ${lesson.id} · ${okCount}/${lesson.steps.length} ขั้น`, `Lesson ${lesson.id} · ${okCount}/${lesson.steps.length} steps`)}{r.done && <Icon value="i:circle-check" className="text-emerald-600" />}
    </button>
  );
  return (
    <section data-learn-card aria-label={t("บทเรียน", "Lesson")} className="fixed bottom-24 left-4 z-40 flex max-h-[72vh] w-[380px] max-w-[calc(100vw-2rem)] flex-col rounded-xl border border-blue-200 bg-white text-xs shadow-xl">
      <header className="flex items-start gap-2 border-b border-slate-100 px-3 py-2">
        <Icon value="i:book" className="mt-0.5 text-blue-600" />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-slate-500">{t("เรียนไปทำไป", "Learn by doing")} · {t(`บท ${lesson.id}`, `Lesson ${lesson.id}`)} · {t(`ราว ${lesson.minutes} นาที`, `about ${lesson.minutes} min`)}</div>
          <div className="text-sm font-semibold text-slate-800">{t(lesson.title.th, lesson.title.en)}</div>
        </div>
        <button type="button" onClick={onCatalog} title={t("สารบัญบทเรียน", "All lessons")} aria-label={t("สารบัญบทเรียน", "All lessons")} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Icon value="i:books" /></button>
        <button type="button" onClick={() => setMini(true)} title={t("ย่อ (ทำงานต่อได้)", "Minimise (keep working)")} aria-label={t("ย่อ", "Minimise")} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Icon value="i:minus" /></button>
        <button type="button" onClick={onClose} title={t("ปิดการ์ด (เปิดใหม่ที่ปุ่ม เรียน)", "Close (reopen with Learn)")} aria-label={t("ปิด", "Close")} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Icon value="i:x" /></button>
      </header>
      <div className="min-h-0 flex-1 space-y-2 overflow-auto px-3 py-2">
        <p className="flex items-center gap-1 text-[11px] text-slate-500"><Icon value="i:copy" />{ref.mode === "copy" ? t(`เรียนบนสำเนา: ${projectName} — งานจริงไม่ถูกแตะ`, `On a copy: ${projectName} — your real work is untouched`) : t(`เรียนบนแบบฝึก: ${projectName}`, `On a practice file: ${projectName}`)}</p>
        <p className="text-slate-700"><b>{t("เป้าหมาย", "Goal")}:</b> {t(lesson.goal.th, lesson.goal.en)}</p>
        <ol className="space-y-0.5" data-learn-steps>
          {lesson.steps.map((s, i) => (
            <li key={i}>
              <button type="button" onClick={() => { setView(i); setNextErr(null); }} className={`flex w-full items-start gap-1.5 rounded px-1 py-0.5 text-left ${i === cur ? "bg-blue-50" : "hover:bg-slate-50"}`} data-step-ok={r.steps[i].ok ? "1" : "0"}>
                <Icon value={r.steps[i].ok ? "i:circle-check" : "i:circle-dashed"} className={`mt-0.5 shrink-0 ${r.steps[i].ok ? "text-emerald-600" : "text-slate-300"}`} />
                <span className="sr-only">{r.steps[i].ok ? t("ผ่านแล้ว", "done") : t("ยังไม่ผ่าน", "not yet")}</span>
                <span className={r.steps[i].ok ? "text-slate-500" : "text-slate-800"}>{i + 1}. {t(s.text.th, s.text.en)}</span>
              </button>
            </li>
          ))}
        </ol>
        <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2" data-learn-current>
          <div className="font-medium text-slate-700">{t(`ขั้น ${cur + 1}`, `Step ${cur + 1}`)}: {t(step.text.th, step.text.en)}</div>
          {st.ok ? <p className="text-emerald-700"><Icon value="i:circle-check" className="mr-1 inline" />{t("ขั้นนี้ผ่านแล้ว (ตรวจจากงานจริง)", "This step is done (checked from your work)")}</p>
            : st.msg ? <p className="text-amber-800" data-learn-msg>{t(st.msg.th, st.msg.en)}</p> : null}
          <div className="flex flex-wrap gap-1.5">
            {step.guide && <button type="button" data-learn-guide onClick={() => onGuide(step.guide!, guideTarget(lesson, ctx))} className="inline-flex h-7 items-center gap-1 rounded-md border border-blue-200 bg-white px-2 text-blue-700 hover:bg-blue-50"><Icon value="i:pointer" />{t("พาไปที่เครื่องมือ", "Show me the tool")}</button>}
            <button type="button" data-learn-hint onClick={() => setHint({ ...hint, [cur]: Math.min(3, lv + 1) })} disabled={lv >= 3} className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-slate-700 hover:bg-slate-100 disabled:opacity-50"><Icon value="i:bulb" />{t(`ใบ้ (${lv}/3)`, `Hint (${lv}/3)`)}</button>
            <button type="button" onClick={() => setWhy(!why)} aria-pressed={why} className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-slate-700 hover:bg-slate-100"><Icon value="i:help-circle" />{t("ทำไมต้องทำแบบนี้", "Why this way")}</button>
          </div>
          {lv > 0 && (
            <ol className="space-y-1 text-slate-600" data-learn-hints>
              {step.hints.slice(0, lv).map((h, i) => <li key={i} className="flex gap-1"><span className="shrink-0 text-slate-400">{i + 1}.</span>{t(h.th, h.en)}</li>)}
            </ol>
          )}
          {lv >= 3 && (demo
            ? <button type="button" data-learn-demo onClick={() => onDemo(demo)} className="inline-flex h-7 items-center gap-1 rounded-md bg-blue-600 px-2.5 text-white hover:bg-blue-700"><Icon value="i:wand" />{t("ทำให้ดู (ย้อนได้ด้วย Ctrl+Z)", "Show me (Ctrl+Z to undo)")}</button>
            : step.demo ? <p className="text-[11px] text-slate-400">{readonly ? t("ดูอย่างเดียว — ทำให้ดูไม่ได้", "View only — can't demonstrate") : t("ทำให้ดูไม่ได้กับชิ้นชุดนี้ — ทำตามใบ้ข้อ 2", "Can't demonstrate on these pieces — follow hint 2")}</p> : null)}
          {why && <p className="rounded-md bg-white p-2 text-slate-600" data-learn-why>{t(lesson.why.th, lesson.why.en)}</p>}
        </div>
        {r.done && <p className="rounded-lg bg-emerald-50 p-2 text-emerald-800" data-learn-done><Icon value="i:circle-check" className="mr-1 inline" />{t(`ผ่านบทนี้แล้ว — ${lesson.pass.th}`, `Lesson passed — ${lesson.pass.en}`)}</p>}
        {nextErr && <p className="rounded-lg bg-red-50 p-2 text-red-700" data-learn-next-err>{nextErr}</p>}
        {askReset && onReset && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-900">
            {t("เริ่มบทใหม่ = ชิ้นในแบบฝึกนี้กลับเป็นตอนเริ่มบท (สิ่งที่ทำไว้หาย)", "Restart = this practice file goes back to the start of the lesson (your changes are lost)")}
            <div className="mt-1.5 flex gap-1.5"><button type="button" onClick={() => { setAskReset(false); setView(null); setHint({}); onReset(); }} className="h-7 rounded-md bg-amber-600 px-2.5 text-white hover:bg-amber-700">{t("เริ่มใหม่", "Restart")}</button><button type="button" onClick={() => setAskReset(false)} className="h-7 rounded-md px-2 hover:bg-amber-100">{t("ยกเลิก", "Cancel")}</button></div>
          </div>
        )}
        <p className="text-[11px] text-slate-400">{t("ตรวจจากรูปชิ้นและตะเข็บจริง ไม่ใช้ AI ตัดสิน · กด Ctrl+Z แล้วสถานะกลับเอง · ทำงานอื่นบนกระดานได้ตามปกติ", "Checked from your real pieces and seams, not by AI · Ctrl+Z updates the status · you can keep working normally")}</p>
      </div>
      <footer className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 px-3 py-2">
        <button type="button" onClick={() => setView(Math.max(0, cur - 1))} disabled={cur === 0} className="h-7 rounded-md border border-slate-200 px-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40" aria-label={t("ย้อนขั้น", "Previous step")}><Icon value="i:arrow-left" /></button>
        <button type="button" onClick={() => setView(Math.min(lesson.steps.length - 1, cur + 1))} disabled={cur >= lesson.steps.length - 1} className="h-7 rounded-md border border-slate-200 px-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40" aria-label={t("ขั้นถัดไป", "Next step")}><Icon value="i:arrow-left" className="rotate-180" /></button>
        {onReset && !readonly && <button type="button" onClick={() => setAskReset(true)} className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-slate-600 hover:bg-slate-100"><Icon value="i:refresh" />{t("เริ่มบทใหม่", "Restart")}</button>}
        <button type="button" onClick={skip} className="h-7 rounded-md px-2 text-slate-500 hover:bg-slate-100">{t("ข้าม", "Skip")}</button>
        <button type="button" data-learn-finish onClick={finish} className={`ml-auto h-7 rounded-md px-3 font-medium ${r.done ? "bg-emerald-600 text-white hover:bg-emerald-700" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{r.done ? t("เสร็จบทนี้ → บทถัดไป", "Done → next lesson") : t("บทถัดไป", "Next lesson")}</button>
      </footer>
    </section>
  );
}

export function LessonCatalog({ open, onClose, canStart, copySource, currentId }: {
  open: boolean; onClose: () => void;
  /** สร้างแพทเทิร์นได้ (สิทธิ์แก้) — ไม่ได้ = ดูสารบัญอย่างเดียว */ canStart: boolean;
  /** งานที่เปิดอยู่ — ส่ง = มีปุ่ม "เรียนบนสำเนางานนี้" */ copySource?: () => CopySource | null;
  /** บทที่เปิดอยู่ในแพทเทิร์นนี้ */ currentId?: number | null;
}) {
  const t = useT();
  const router = useRouter();
  const [prog, setProg] = useLessonProgress();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const start = async (l: Lesson, mode: "practice" | "copy") => {
    const src = mode === "copy" ? copySource?.() ?? null : null;
    if (mode === "copy" && !src) return;
    const seed = src ? { pieces: src.pieces, seams: src.seams } : l.seed!();
    const name = src ? `(เรียน บท ${l.id}) ${src.name}`.slice(0, 120) : `แบบฝึก · บท ${l.id} ${l.title.th}`;
    const { lesson: _old, rev: _r, ...keep } = (src?.template ?? {}) as Record<string, unknown>; void _old; void _r;
    setBusy(`${l.id}:${mode}`); setErr(null);
    try {
      const res = await apiFetch("/api/pattern-projects", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, pieces: seed.pieces, seams: seed.seams, template: { ...keep, schema: PATTERN_SCHEMA, lesson: { id: l.id, v: LESSON_VERSION, mode } } }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error || !j.data?.id) throw new Error(j.error || `HTTP ${res.status}`);
      setProg({ ...prog, lessons: { ...prog.lessons, [l.id]: { st: prog.lessons[String(l.id)]?.st === "done" ? "done" : "doing", at: new Date().toISOString(), pid: j.data.id, ver: LESSON_VERSION } } });
      onClose();
      router.push(`/pattern-studio/${j.data.id}`);
    } catch (e) { setErr((e as Error).message || t("สร้างแบบฝึกไม่สำเร็จ", "Couldn't create the practice file")); }
    finally { setBusy(null); }
  };
  const done = LESSONS.filter((l) => prog.lessons[String(l.id)]?.st === "done").length, ready = LESSONS.filter((l) => l.ready).length;
  return (
    <ERPModal open={open} onClose={onClose} size="lg" title={t("เรียนไปทำไป — บทเรียนทำแพทเทิร์นกระเป๋า", "Learn by doing — bag pattern lessons")}
      description={t(`ผ่านแล้ว ${done} จาก ${ready} บทที่เปิด · ทุกบทเรียนบนแบบฝึกหรือสำเนา ไม่แตะงานจริง · เริ่มบทไหนก่อนก็ได้`, `${done} of ${ready} open lessons passed · every lesson runs on a practice file or a copy, never your real work · start anywhere`)}>
      <ul className="space-y-1.5" data-lesson-catalog>
        {LESSONS.map((l) => {
          const rec = prog.lessons[String(l.id)], miss = l.ready ? missingBefore(l.id, prog) : [];
          const badge = !l.ready ? { th: `มาในรอบ ${l.round}`, en: `Coming in round ${l.round}`, c: "bg-slate-100 text-slate-500" }
            : rec?.st === "done" ? { th: "ผ่านแล้ว", en: "Passed", c: "bg-emerald-50 text-emerald-700" }
            : rec?.st === "doing" ? { th: "กำลังทำ", en: "In progress", c: "bg-blue-50 text-blue-700" }
            : rec?.st === "skip" ? { th: "ข้ามไว้", en: "Skipped", c: "bg-amber-50 text-amber-800" } : null;
          return (
            <li key={l.id} data-lesson={l.id} className={`rounded-lg border px-3 py-2 ${currentId === l.id ? "border-blue-300 bg-blue-50/40" : "border-slate-200"} ${l.ready ? "" : "opacity-70"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-slate-800">{l.id}. {t(l.title.th, l.title.en)}</span>
                {badge && <span className={`rounded-full px-2 py-0.5 text-[11px] ${badge.c}`}>{t(badge.th, badge.en)}</span>}
                {l.ready && <span className="text-[11px] text-slate-400">{t(`ราว ${l.minutes} นาที`, `about ${l.minutes} min`)}</span>}
              </div>
              {l.ready && <p className="mt-0.5 text-xs text-slate-600">{t(l.goal.th, l.goal.en)}</p>}
              {l.ready && <p className="text-[11px] text-slate-400">{t(`ผ่านเมื่อ: ${l.pass.th}`, `Passes when: ${l.pass.en}`)}</p>}
              {l.ready && miss.length > 0 && <p className="text-[11px] text-amber-700">{t(`แนะนำให้ทำบท ${miss.join(", ")} ก่อน (ไม่บังคับ)`, `Lesson ${miss.join(", ")} first is recommended (optional)`)}</p>}
              {!l.ready && <p className="mt-0.5 text-[11px] text-slate-500">{t("ยังเปิดไม่ได้ — ต้องมีเครื่องมือของรอบนั้นก่อน", "Not open yet — it needs that round's tools first")}</p>}
              {l.ready && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {rec?.pid && rec.st !== "done" && <button type="button" onClick={() => { onClose(); router.push(`/pattern-studio/${rec.pid}`); }} className="inline-flex h-8 items-center gap-1 rounded-lg border border-blue-200 bg-white px-3 text-xs text-blue-700 hover:bg-blue-50"><Icon value="i:player-play" />{t("ทำต่อ", "Continue")}</button>}
                  <button type="button" data-start-practice disabled={!canStart || !!busy} title={canStart ? undefined : t("ต้องมีสิทธิ์แก้แพทเทิร์นถึงสร้างแบบฝึกได้", "Needs permission to edit patterns")} onClick={() => void start(l, "practice")} className="inline-flex h-8 items-center gap-1 rounded-lg bg-blue-600 px-3 text-xs text-white hover:bg-blue-700 disabled:opacity-50"><Icon value="i:book" />{busy === `${l.id}:practice` ? t("กำลังสร้าง…", "Creating…") : t("เริ่มบนแบบฝึก", "Start on a practice file")}</button>
                  {copySource && <button type="button" data-start-copy disabled={!canStart || !!busy} onClick={() => void start(l, "copy")} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Icon value="i:copy" />{busy === `${l.id}:copy` ? t("กำลังสร้าง…", "Creating…") : t("เรียนบนสำเนางานนี้", "Learn on a copy of this work")}</button>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {err && <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>}
    </ERPModal>
  );
}
