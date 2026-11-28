"use client";

/**
 * 🎓 ศูนย์เรียนรู้ — อ่านบทเรียน (PC + มือถือ)
 *   คลิปหลักจากลิงก์ที่มา (YouTube/TikTok/Drive) อยู่บนสุด · ขั้นที่ตั้ง "นาที" = ปุ่มกระโดดไปตรงนั้นในคลิปหลัก
 *   ขั้นที่มีคลิปของตัวเอง = เล่นในขั้นนั้น (กดก่อนถึงโหลด กันหน้าหนัก) · คลิปสั้นอัปเอง = เล่นในหน้า
 *   เช็กลิสต์ติ๊กได้ — จำในเครื่องนี้ต่อบท (ไม่ส่งขึ้นระบบ) · ล้างได้
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { LessonAnim } from "@/components/lesson-anim";
import { DriveFolderFiles } from "@/components/drive-folder-files";
import { VideoSegmentPlayer } from "@/components/video-segment";
import { parseShotLink } from "@/lib/video-shot";
import { formatDateTime } from "@/lib/date";
import { estimateMinutes, formatTimeText, parseVideoLink, type Lesson, type LessonStep, type VideoLink } from "@/lib/learn";

const r2 = (k: string, w?: number) => `/api/r2-image?key=${encodeURIComponent(k)}${w ? `&w=${w}` : ""}`;
const isInternal = (u: string) => u.startsWith("/");

/** ผู้เล่นคลิป: ยังไม่กด = กล่องปุ่มเล่น (ไม่โหลด iframe) · ฝังไม่ได้ = ปุ่มเปิดที่ต้นทาง */
function VideoBox({ link, autoKey, tall }: { link: VideoLink; autoKey?: string | number; tall?: boolean }) {
  const [play, setPlay] = useState(false);
  useEffect(() => { if (autoKey !== undefined) setPlay(true); }, [autoKey]);
  const ratio = link.kind === "tiktok" ? "aspect-[9/16] max-h-[560px] mx-auto" : tall ? "aspect-video" : "aspect-video";
  if (!link.embedUrl) {
    return (
      <a href={link.watchUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-indigo-700 hover:bg-indigo-50">
        <Icon name="video" /> เปิดคลิปที่ {link.label} <Icon name="external-link" className="ml-auto" />
      </a>
    );
  }
  return (
    <div className={`relative w-full overflow-hidden rounded-xl bg-slate-900 ${ratio}`}>
      {play ? (
        <iframe key={`${link.embedUrl}`} src={link.embedUrl + (link.kind === "youtube" ? `${link.embedUrl.includes("?") ? "&" : "?"}autoplay=1` : "")}
          className="absolute inset-0 h-full w-full" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen title={link.label} />
      ) : (
        <button type="button" onClick={() => setPlay(true)} className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/90 hover:text-white">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 text-2xl"><Icon name="player-play" /></span>
          <span className="text-xs">เล่นคลิป ({link.label})</span>
        </button>
      )}
    </div>
  );
}

function useChecks(lessonId: string) {
  const key = `learn-check:${lessonId}`;
  const [checked, setChecked] = useState<Set<string>>(new Set());
  useEffect(() => {
    try { const raw = localStorage.getItem(key); setChecked(new Set(raw ? (JSON.parse(raw) as string[]) : [])); } catch { setChecked(new Set()); }
  }, [key]);
  const save = (s: Set<string>) => { setChecked(s); try { localStorage.setItem(key, JSON.stringify([...s])); } catch { /* ที่เก็บในเครื่องใช้ไม่ได้ — ติ๊กได้แต่ไม่จำ */ } };
  const toggle = (id: string) => { const s = new Set(checked); if (s.has(id)) s.delete(id); else s.add(id); save(s); };
  const clear = () => save(new Set());
  return { checked, toggle, clear };
}

function Checklist({ items, stepIdx, checked, toggle }: { items: string[]; stepIdx: number; checked: Set<string>; toggle: (id: string) => void }) {
  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2">
      <p className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-amber-800"><Icon name="checklist" /> เช็กลิสต์</p>
      <ul className="space-y-1">
        {items.map((it, j) => {
          const id = `${stepIdx}:${j}`;
          const on = checked.has(id);
          return (
            <li key={id}>
              <label className="flex cursor-pointer items-start gap-2 py-0.5 text-[14px] text-amber-900">
                <input type="checkbox" checked={on} onChange={() => toggle(id)} className="mt-1 h-4 w-4 shrink-0 accent-amber-600" />
                <span className={on ? "text-amber-700/60 line-through" : ""}>{it}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StepBody({ text }: { text: string }) {
  return <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-slate-600">{text}</p>;
}

export function LessonReader({ lesson, canManage, onEdit, onPublish }: {
  lesson: Lesson;
  canManage: boolean;
  onEdit?: () => void;
  onPublish?: () => void;
}) {
  const main = useMemo(() => parseVideoLink(lesson.source_url), [lesson.source_url]);
  const [jump, setJump] = useState<{ sec: number; n: number } | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const { checked, toggle, clear } = useChecks(lesson.id);
  useEffect(() => { setJump(null); }, [lesson.id]);

  const mainLink = useMemo(() => (main && jump ? parseVideoLink(lesson.source_url, jump.sec) : main), [main, jump, lesson.source_url]);
  const goTo = useCallback((sec: number) => {
    setJump((j) => ({ sec, n: (j?.n ?? 0) + 1 }));
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const totalChecks = lesson.steps.reduce((n, s) => n + s.checklist.length, 0);
  const doneChecks = [...checked].filter((id) => { const [i, j] = id.split(":").map(Number); return lesson.steps[i]?.checklist[j] !== undefined; }).length;

  return (
    <article className="mx-auto w-full max-w-3xl">
      <div ref={topRef} className="scroll-mt-4" />
      <header className="mb-3 flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">{lesson.title}</h2>
            {lesson.status === "draft" && <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">ร่าง รอตรวจ</span>}
          </div>
          <p className="mt-0.5 text-[12px] text-slate-400">
            {lesson.category || "ทั่วไป"} · {lesson.steps.length} ขั้นตอน · ~{estimateMinutes(lesson)} นาที · แก้ล่าสุด {formatDateTime(lesson.updated_at)}{lesson.updated_by ? ` โดย ${lesson.updated_by}` : ""}
          </p>
        </div>
        {canManage && (
          <div className="flex shrink-0 gap-1.5">
            {lesson.status === "draft" && onPublish && (
              <button type="button" onClick={onPublish} className="inline-flex h-8 items-center gap-1 rounded-lg bg-emerald-600 px-3 text-[13px] font-medium text-white hover:bg-emerald-700"><Icon name="send" /> เผยแพร่</button>
            )}
            {onEdit && <button type="button" onClick={onEdit} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-700 hover:bg-slate-50"><Icon name="edit" /> แก้ไข</button>}
          </div>
        )}
      </header>

      {lesson.status === "draft" && canManage && (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          บทนี้ยังเป็นร่าง พนักงานยังไม่เห็น — อ่านตรวจให้ครบ แก้ส่วนที่ไม่ตรงกับงานเรา แล้วกด “เผยแพร่”
        </div>
      )}

      {lesson.description && <p className="mb-3 whitespace-pre-wrap rounded-xl bg-indigo-50/70 px-3 py-2.5 text-[14px] leading-relaxed text-indigo-950">{lesson.description}</p>}

      {mainLink && <div className="mb-2"><VideoBox link={mainLink} autoKey={jump?.n} /></div>}
      {lesson.source_url && (
        <p className="mb-4 text-[12px] text-slate-400">
          ที่มา: <a href={main?.watchUrl ?? lesson.source_url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">{lesson.source_title || main?.label || lesson.source_url}</a> — เครดิตเจ้าของคลิป
        </p>
      )}

      {lesson.drive_folder_url && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3">
          <DriveFolderFiles folder={lesson.drive_folder_url} title="คลิปยาว / ไฟล์ประกอบ (Google Drive)" />
        </div>
      )}

      {totalChecks > 0 && (
        <div className="mb-3 flex items-center gap-2 text-[12px] text-slate-500">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${Math.round((doneChecks / totalChecks) * 100)}%` }} /></div>
          <span>ติ๊กแล้ว {doneChecks}/{totalChecks}</span>
          {doneChecks > 0 && <button type="button" onClick={clear} className="text-slate-400 hover:text-slate-600 hover:underline">ล้างที่ติ๊ก</button>}
        </div>
      )}

      {lesson.steps.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-slate-400">บทนี้ยังไม่มีขั้นตอน{canManage ? " — กด “แก้ไข” เพื่อเพิ่ม" : ""}</p>
      ) : (
        <ol className="space-y-3">
          {lesson.steps.map((s: LessonStep, i) => {
            const own = s.video_url ? parseVideoLink(s.video_url, s.video_start_sec) : null;
            const seg = s.video_url && parseShotLink(s.video_url) ? s.video_url : null; // YouTube/TikTok/Pinterest/IG = เล่นเฉพาะช่วง
            const jumpable = !own && main && s.video_start_sec !== null && s.video_start_sec !== undefined;
            return (
              <li key={s.id ?? i} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
                <div className="flex gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[14px] font-bold text-white">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[15px] font-semibold leading-snug text-slate-900">{s.title}</p>
                      {jumpable && (
                        <button type="button" onClick={() => goTo(s.video_start_sec as number)} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[12px] font-medium text-indigo-700 hover:bg-indigo-100">
                          <Icon name="player-play" /> ดูนาที {formatTimeText(s.video_start_sec)}
                        </button>
                      )}
                    </div>
                    {s.body && <div className="mt-1.5"><StepBody text={s.body} /></div>}
                    {s.animation && <div className="mt-3"><LessonAnim animation={s.animation} /></div>}
                    {seg ? <div className="mt-3"><VideoSegmentPlayer url={seg} start={s.video_start_sec} end={s.video_end_sec} /></div> : own && <div className="mt-3"><VideoBox link={own} /></div>}
                    {s.video_r2_key && (
                      <video src={r2(s.video_r2_key)} controls playsInline preload="metadata" className="mt-3 w-full max-h-[520px] rounded-xl border border-slate-200 bg-black" />
                    )}
                    {s.image_r2_key && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r2(s.image_r2_key, 1200)} alt="" loading="lazy" className="mt-3 max-w-full rounded-xl border border-slate-200" />
                    )}
                    {s.checklist.length > 0 && <Checklist items={s.checklist} stepIdx={i} checked={checked} toggle={toggle} />}
                    {s.link_url && (
                      <a href={s.link_url} {...(isInternal(s.link_url) ? {} : { target: "_blank", rel: "noreferrer" })}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[13px] font-medium text-indigo-700 hover:bg-indigo-100">
                        {isInternal(s.link_url) ? "ไปหน้านี้" : "เปิดลิงก์"} <Icon name="external-link" />
                      </a>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </article>
  );
}
