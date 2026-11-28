"use client";

/**
 * 🎓 ศูนย์เรียนรู้ — ป๊อปสร้าง/แก้บทเรียน (ERPModal กลาง · เตือนก่อนปิดถ้ายังไม่บันทึก)
 *   ช่องบท: ชื่อ · ไอคอน · หมวด (เลือกจากที่มี หรือพิมพ์ใหม่) · คำอธิบาย · ลิงก์ที่มา (คลิปหลัก) · สถานะ ร่าง/เผยแพร่
 *   ขั้นตอน: หัวข้อ · รายละเอียด · ลิงก์คลิป + นาที · คลิปสั้นอัปเอง (MediaUploadField → คลังกลาง R2 ≤200MB) · รูป · เช็กลิสต์ · ลิงก์
 *   คลิปยาว/ไฟล์ใหญ่ → DriveUploadBox (โฟลเดอร์ Drive ของบท · บันทึกบทก่อนถึงอัปได้)
 */
import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/icon";
import { IconField } from "@/components/icon/icon-field";
import { ERPModal } from "@/components/modal";
import { ImageInput } from "@/components/image-input";
import { MediaUploadField, type MediaValue } from "@/components/media-upload-field";
import { DriveUploadBox } from "@/components/drive-upload-box";
import { formatTimeText, parseTimeText, parseVideoLink, type Lesson, type LessonStatus } from "@/lib/learn";
import type { LessonDraft } from "./use-learn";
import { AnimPicker } from "./anim-picker";
import { ShotPickerModal } from "./shots/shot-picker";
import type { LessonAnimation } from "@/lib/lesson-anim";

type StepForm = {
  title: string; body: string; image_r2_key: string; link_url: string;
  video_url: string; video_start: string; video_end: string; video_r2_key: string; checklist: string;
  animation: LessonAnimation | null;
};

const blankStep = (): StepForm => ({ title: "", body: "", image_r2_key: "", link_url: "", video_url: "", video_start: "", video_end: "", video_r2_key: "", checklist: "", animation: null });

function toForm(l: Lesson | null) {
  return {
    title: l?.title ?? "", icon: l?.icon ?? "", category: l?.category ?? "", description: l?.description ?? "",
    source_url: l?.source_url ?? "", source_title: l?.source_title ?? "", status: (l?.status ?? "draft") as LessonStatus,
    steps: (l?.steps ?? []).map((s) => ({
      title: s.title, body: s.body ?? "", image_r2_key: s.image_r2_key ?? "", link_url: s.link_url ?? "",
      video_url: s.video_url ?? "", video_start: formatTimeText(s.video_start_sec), video_end: formatTimeText(s.video_end_sec), video_r2_key: s.video_r2_key ?? "",
      checklist: s.checklist.join("\n"), animation: s.animation ?? null,
    })) as StepForm[],
  };
}

const inp = "w-full h-9 px-3 text-[13px] border border-slate-200 rounded-lg bg-white";
const area = "w-full px-3 py-2 text-[13px] border border-slate-200 rounded-lg bg-white";
const lbl = "mb-0.5 block text-[11px] text-slate-500";

export function LessonEditor({ lesson, categories, defaultCategory, onClose, onSave }: {
  lesson: Lesson | null;
  categories: string[];
  defaultCategory?: string;
  onClose: () => void;
  /** คืน true = บันทึกสำเร็จ (ปิดป๊อป) */
  onSave: (d: LessonDraft) => Promise<boolean>;
}) {
  const initial = useMemo(() => {
    const f = toForm(lesson);
    if (!lesson) { f.category = defaultCategory ?? ""; f.steps = [blankStep()]; }
    return f;
  }, [lesson, defaultCategory]);
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [driveUrl, setDriveUrl] = useState(lesson?.drive_folder_url ?? null);
  const [pickFor, setPickFor] = useState<number | null>(null);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const patchStep = (i: number, p: Partial<StepForm>) => setF((x) => ({ ...x, steps: x.steps.map((s, j) => (j === i ? { ...s, ...p } : s)) }));
  const move = (i: number, dir: -1 | 1) => setF((x) => {
    const j = i + dir; if (j < 0 || j >= x.steps.length) return x;
    const s = [...x.steps]; [s[i], s[j]] = [s[j], s[i]]; return { ...x, steps: s };
  });
  const sourceVideo = parseVideoLink(f.source_url);

  const save = async () => {
    if (!f.title.trim()) { setErr("ต้องใส่ชื่อบทเรียน"); return; }
    if (f.source_url.trim() && !/^https?:\/\//i.test(f.source_url.trim())) { setErr("ลิงก์ที่มาต้องขึ้นต้นด้วย https://"); return; }
    const badTime = f.steps.findIndex((s) => s.video_start.trim() && parseTimeText(s.video_start) === null);
    if (badTime >= 0) { setErr(`ขั้นที่ ${badTime + 1}: นาทีในคลิปต้องเป็นแบบ 1:20 หรือ 80`); return; }
    const badEnd = f.steps.findIndex((s) => s.video_end.trim() && (parseTimeText(s.video_end) === null || (parseTimeText(s.video_start) ?? -1) >= (parseTimeText(s.video_end) ?? 0)));
    if (badEnd >= 0) { setErr(`ขั้นที่ ${badEnd + 1}: เวลาจบต้องเป็นแบบ 1:20 และมากกว่าเวลาเริ่ม`); return; }
    setErr(null); setBusy(true);
    const ok = await onSave({
      title: f.title.trim(), icon: f.icon.trim() || null, category: f.category.trim() || null, description: f.description.trim() || null,
      source_url: f.source_url.trim() || null, source_title: f.source_title.trim() || null, status: f.status,
      steps: f.steps.map((s) => ({
        title: s.title.trim(), body: s.body.trim() || null, image_r2_key: s.image_r2_key || null, link_url: s.link_url.trim() || null,
        video_url: s.video_url.trim() || null, video_start_sec: parseTimeText(s.video_start), video_end_sec: parseTimeText(s.video_end), video_r2_key: s.video_r2_key || null,
        checklist: s.checklist.split(/\r?\n/).map((x) => x.trim()).filter(Boolean),
        animation: s.animation,
      })),
    });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <ERPModal open onClose={onClose} size="xl" storageKey="learn-lesson-editor" hasUnsavedChanges={dirty && !busy}
      title={lesson ? `แก้บทเรียน: ${lesson.title}` : "สร้างบทเรียนใหม่"}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 p-0.5 text-[12px]">
            {(["draft", "published"] as const).map((s) => (
              <button key={s} type="button" onClick={() => set("status", s)}
                className={`rounded-md px-2.5 py-1 ${f.status === s ? (s === "draft" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800") : "text-slate-500 hover:bg-slate-50"}`}>
                {s === "draft" ? "ร่าง (พนักงานยังไม่เห็น)" : "เผยแพร่"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {err && <span className="text-[12px] text-rose-600">{err}</span>}
            <button type="button" onClick={onClose} disabled={busy} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">ยกเลิก</button>
            <button type="button" onClick={save} disabled={busy} className="inline-flex h-9 items-center gap-1 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
              <Icon name="device-floppy" /> {busy ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          </div>
        </div>
      }>
      <div className="space-y-4">
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="md:col-span-2 flex gap-2">
            <IconField value={f.icon} onChange={(v) => set("icon", v)} suggestFrom={f.title} placeholderIcon="i:book" title="ไอคอน" />
            <div className="flex-1">
              <label className={lbl}>ชื่อบทเรียน *</label>
              <input value={f.title} onChange={(e) => { set("title", e.target.value); setErr(null); }} placeholder="ถ่ายวิดีโอสินค้าด้วยมือถือ" className={inp} />
            </div>
          </div>
          <div>
            <label className={lbl}>หมวด (เลือกที่มี หรือพิมพ์หมวดใหม่)</label>
            <input value={f.category} onChange={(e) => set("category", e.target.value)} list="learn-cats" placeholder="ถ่ายวิดีโอ/รูป" className={inp} />
            <datalist id="learn-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div>
            <label className={lbl}>ลิงก์ที่มา / คลิปหลัก (YouTube · TikTok · Drive)</label>
            <input value={f.source_url} onChange={(e) => set("source_url", e.target.value)} placeholder="https://youtu.be/…" className={inp} />
            {f.source_url.trim() && <p className="mt-0.5 text-[11px] text-slate-400">{sourceVideo?.embedUrl ? `เล่นในบทได้ (${sourceVideo.label}) · ขั้นที่ใส่ "นาที" จะมีปุ่มกระโดดไปตรงนั้น` : "ลิงก์นี้ฝังเล่นไม่ได้ — จะเป็นปุ่มเปิดที่ต้นทาง"}</p>}
          </div>
          <div className="md:col-span-2">
            <label className={lbl}>ชื่อที่มา / เครดิต (ไม่ใส่ก็ได้)</label>
            <input value={f.source_title} onChange={(e) => set("source_title", e.target.value)} placeholder="YouTube · ช่อง ProductPhoto" className={inp} />
          </div>
          <div className="md:col-span-2">
            <label className={lbl}>คำอธิบายสั้น ๆ — บทนี้สอนอะไร ใช้ตอนไหน</label>
            <textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={2} className={area} />
          </div>
        </section>

        <section>
          <p className="mb-1.5 text-[13px] font-medium text-slate-700">ขั้นตอน ({f.steps.length})</p>
          <div className="space-y-2.5">
            {f.steps.map((s, i) => {
              const clip: MediaValue | null = s.video_r2_key ? { kind: "video", key: s.video_r2_key } : null;
              return (
                <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[12px] font-bold text-indigo-700">{i + 1}</span>
                    <input value={s.title} onChange={(e) => patchStep(i, { title: e.target.value })} placeholder="หัวข้อขั้นตอน เช่น จัดฉากและแสง" className={`${inp} flex-1`} />
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="px-1 text-slate-400 hover:text-indigo-600 disabled:opacity-30" title="เลื่อนขึ้น" aria-label="เลื่อนขึ้น"><Icon name="chevron-up" /></button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === f.steps.length - 1} className="px-1 text-slate-400 hover:text-indigo-600 disabled:opacity-30" title="เลื่อนลง" aria-label="เลื่อนลง"><Icon name="chevron-down" /></button>
                    <button type="button" onClick={() => setF((x) => ({ ...x, steps: x.steps.filter((_, j) => j !== i) }))} className="px-1 text-slate-400 hover:text-rose-500" title="ลบขั้นตอนนี้" aria-label="ลบขั้นตอนนี้"><Icon name="trash" /></button>
                  </div>
                  <textarea value={s.body} onChange={(e) => patchStep(i, { body: e.target.value })} rows={3} placeholder="อธิบายวิธีทำ (หลายบรรทัดได้)" className={area} />
                  <div className="mt-2"><AnimPicker value={s.animation} onChange={(a) => patchStep(i, { animation: a })} /></div>
                  <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div>
                      <label className={lbl}>คลิปของขั้นนี้ (ลิงก์ YouTube/TikTok/Pinterest/Drive)</label>
                      <div className="flex gap-1.5">
                        <input value={s.video_url} onChange={(e) => patchStep(i, { video_url: e.target.value })} placeholder="ว่าง = ใช้คลิปหลักของบท" className={`${inp} min-w-0 flex-1`} />
                        <button type="button" onClick={() => setPickFor(i)} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 text-[12px] font-medium text-indigo-700 hover:bg-indigo-100" title="เลือกช็อตจากคลัง Video Shot"><Icon name="movie" /> คลังช็อต</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={lbl}>เริ่มที่ (เช่น 1:20)</label>
                        <input value={s.video_start} onChange={(e) => patchStep(i, { video_start: e.target.value })} placeholder="1:20" className={inp} />
                      </div>
                      <div>
                        <label className={lbl}>จบที่ (คลิปของขั้นนี้)</label>
                        <input value={s.video_end} onChange={(e) => patchStep(i, { video_end: e.target.value })} placeholder="ว่าง = ถึงจบ" className={inp} />
                      </div>
                    </div>
                    <div>
                      <label className={lbl}>เช็กลิสต์ (1 บรรทัด = 1 ข้อ)</label>
                      <textarea value={s.checklist} onChange={(e) => patchStep(i, { checklist: e.target.value })} rows={3} placeholder={"เช็ดฝุ่นสินค้าแล้ว\nถอดป้ายราคา"} className={area} />
                    </div>
                    <div>
                      <label className={lbl}>ลิงก์เพิ่มเติม (หน้าในระบบ หรือเว็บ)</label>
                      <input value={s.link_url} onChange={(e) => patchStep(i, { link_url: e.target.value })} placeholder="https://… หรือ /tasks" className={inp} />
                    </div>
                    <div>
                      <label className={lbl}>รูปประกอบ</label>
                      <ImageInput value={s.image_r2_key} onChange={(k) => patchStep(i, { image_r2_key: k ?? "" })} folder="learn" compact />
                    </div>
                    <div>
                      <MediaUploadField label="คลิปสั้นอัปเอง (≤200MB)" hint="คลิปยาวกว่านี้ อัปขึ้น Drive ด้านล่าง" value={clip} folder="learn"
                        onChange={(m) => patchStep(i, { video_r2_key: m?.kind === "video" ? m.key : "", ...(m?.kind === "image" && !s.image_r2_key ? { image_r2_key: m.key } : {}) })} />
                    </div>
                  </div>
                </div>
              );
            })}
            <button type="button" onClick={() => setF((x) => ({ ...x, steps: [...x.steps, blankStep()] }))}
              className="flex h-10 w-full items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 text-[13px] text-slate-500 hover:bg-slate-50"><Icon name="plus" /> เพิ่มขั้นตอน</button>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 p-3">
          <p className="mb-1 text-[13px] font-medium text-slate-700">คลิปยาว / ไฟล์ประกอบ (Google Drive)</p>
          {lesson ? (
            <DriveUploadBox folderUrl={driveUrl} hint="หรือลากมาวาง · คลิป MP4/MOV ไฟล์ใหญ่ได้ถึง 5GB"
              emptyText="ยังไม่มีไฟล์ — แนบไฟล์แรกแล้วระบบสร้างโฟลเดอร์ให้"
              startUpload={async (file) => {
                const j = await apiFetch(`/api/learn/${lesson.id}/drive`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name, mime: file.type, size: file.size }) }).then((r) => r.json());
                if (j.error) throw new Error(j.error);
                return { upload_url: j.data.upload_url, folder_url: j.data.folder_url };
              }}
              onUploaded={({ folderUrl }) => setDriveUrl(folderUrl)} />
          ) : <p className="text-[12px] text-slate-400">บันทึกบทเรียนก่อน แล้วเปิดแก้อีกครั้งเพื่ออัปคลิปยาวขึ้น Drive</p>}
        </section>
      </div>
      {pickFor !== null && (
        <ShotPickerModal onClose={() => setPickFor(null)}
          onPick={(sh) => {
            const i = pickFor;
            setPickFor(null);
            patchStep(i, {
              video_url: sh.url, video_start: formatTimeText(sh.start_sec), video_end: formatTimeText(sh.end_sec),
              ...(f.steps[i]?.title.trim() ? {} : { title: sh.title }),
            });
          }} />
      )}
    </ERPModal>
  );
}
