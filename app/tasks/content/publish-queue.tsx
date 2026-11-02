"use client";
// 📤 คิวโพสต์อัตโนมัติ — หน้าจอของคิวกลาง (lib/social-publish/queue)
//  - PublishQueueBox     : กล่องใน drawer คอนเทนต์ — คิวของโพสต์นี้ + ยกเลิก/ลองใหม่/ใช้แคปชั่นล่าสุด + ปุ่ม "ตั้งคิวทุกแพลตฟอร์ม"
//  - QueueAllModal       : ป๊อปตั้งคิวหลายแพลตฟอร์มทีเดียว (เวลาเดียวกัน · แคปชั่น/รูป/รูปแบบตามที่ตั้งในการ์ดแต่ละแพลตฟอร์ม)
//  - PublishQueueModal   : ภาพรวมคิวทั้งหมด (ปุ่มในหน้าปฏิทิน) — รอโพสต์ / ไม่สำเร็จ / โพสต์แล้ว 3 วัน
import { useState } from "react";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { ERPDateTime24 } from "@/components/form";
import { useT } from "@/components/i18n";
import { type ToastVariant } from "@/components/toast";
import { useSWRLite, invalidateSWR } from "@/lib/swr-lite";
import { PlatformChip } from "../platform-chip";
import { postFormatLabel } from "./caption-card";
import { listPublishJobs, updatePublishJob, PUBLISH_JOBS_SWR_KEY, type PublishJob, type PublishJobInput, type PostMediaRef } from "../data";

type T = (th: string, en: string) => string;
const ACTIVE = new Set(["queued", "running", "processing"]);

/** เวลาแบบไทยสั้น ๆ (เวลาเครื่อง) เช่น "5 พ.ย. 14:00" */
export function fmtJobTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("th-TH", { day: "numeric", month: "short" })} ${d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
}

export function jobStatusBadge(status: string, t: T): { cls: string; label: string } {
  switch (status) {
    case "queued": return { cls: "bg-blue-50 text-blue-700 border-blue-200", label: `⏰ ${t("รอเวลา", "Queued")}` };
    case "running": return { cls: "bg-violet-50 text-violet-700 border-violet-200", label: `⏳ ${t("กำลังโพสต์", "Posting")}` };
    case "processing": return { cls: "bg-violet-50 text-violet-700 border-violet-200", label: `⏳ ${t("รอแพลตฟอร์มประมวลผล", "Processing")}` };
    case "posted": return { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", label: `✅ ${t("โพสต์แล้ว", "Posted")}` };
    case "failed": return { cls: "bg-rose-50 text-rose-700 border-rose-300", label: `⚠ ${t("ไม่สำเร็จ", "Failed")}` };
    default: return { cls: "bg-slate-50 text-slate-500 border-slate-200", label: t("ยกเลิกแล้ว", "Cancelled") };
  }
}

// ปุ่ม/การกระทำของคิว 1 แถว (ใช้ทั้งใน drawer และป๊อปภาพรวม)
function useJobActions(onChanged: () => void, pushToast: (type: ToastVariant, m: string) => void, t: T) {
  const [busy, setBusy] = useState<string | null>(null);
  const [askCancel, setAskCancel] = useState<PublishJob | null>(null);
  const run = async (job: PublishJob, body: Parameters<typeof updatePublishJob>[1], ok: string) => {
    setBusy(job.id);
    try { await updatePublishJob(job.id, body); pushToast("success", ok); onChanged(); invalidateSWR(PUBLISH_JOBS_SWR_KEY); }
    catch (e) { pushToast("error", (e as Error).message); }
    finally { setBusy(null); }
  };
  const confirmCancel = askCancel && (
    <ConfirmDialog open title={t("ยกเลิกคิวโพสต์นี้?", "Cancel this queued post?")}
      message={t("ระบบจะไม่โพสต์ให้ตามเวลาแล้ว (โพสต์เองหรือตั้งคิวใหม่ได้ภายหลัง)", "It won't be posted automatically (you can post manually or queue again later)")}
      confirmText={t("ยกเลิกคิว", "Cancel post")} cancelText={t("ไม่ใช่", "Keep")} variant="danger"
      onConfirm={() => { const j = askCancel; setAskCancel(null); void run(j, { action: "cancel" }, t("ยกเลิกคิวแล้ว", "Queue cancelled")); }}
      onClose={() => setAskCancel(null)} />
  );
  return {
    busy, confirmCancel,
    cancel: (j: PublishJob) => setAskCancel(j),
    retry: (j: PublishJob) => run(j, { action: "retry" }, t("ตั้งให้ลองใหม่แล้ว — ระบบจะโพสต์ภายใน ~5 นาที", "Retry queued — posts within ~5 min")),
    useCaption: (j: PublishJob, caption: string) => run(j, { action: "caption", caption_text: caption }, t("อัปเดตแคปชั่นในคิวแล้ว", "Queued caption updated")),
  };
}

function JobRow({ job, t, actions, canEdit, latestCaption, extra }: {
  job: PublishJob; t: T; canEdit: boolean; latestCaption?: string; extra?: React.ReactNode;
  actions: ReturnType<typeof useJobActions>;
}) {
  const bd = jobStatusBadge(job.status, t);
  const fmt = postFormatLabel(job.platform, job.format ?? undefined, t);
  const captionStale = job.status === "queued" && latestCaption != null && latestCaption.trim() !== (job.caption_text ?? "").trim() && job.format !== "story";
  const busy = actions.busy === job.id;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs">
      <div className="flex items-center gap-1.5 flex-wrap">
        <PlatformChip code={job.platform} />
        {fmt && <span className="text-slate-500">{fmt}</span>}
        <span className={`px-1.5 py-px rounded-full border text-[10px] ${bd.cls}`}>{bd.label}</span>
        <span className="text-slate-500">{job.status === "posted" ? fmtJobTime(job.posted_at) : fmtJobTime(job.run_at)}</span>
        {extra}
        <span className="ml-auto flex items-center gap-1.5">
          {job.result_url && <a href={job.result_url} target="_blank" rel="noreferrer" className="text-violet-700 hover:underline">↗ {t("ดูโพสต์", "View")}</a>}
          {canEdit && job.status === "failed" && <button disabled={busy} onClick={() => actions.retry(job)} className="text-blue-700 hover:underline disabled:opacity-50">↻ {t("ลองใหม่", "Retry")}</button>}
          {canEdit && (job.status === "queued" || job.status === "failed") && <button disabled={busy} onClick={() => actions.cancel(job)} className="text-slate-500 hover:text-rose-600 disabled:opacity-50">✕ {t("ยกเลิก", "Cancel")}</button>}
        </span>
      </div>
      {job.status === "failed" && job.last_error && <p className="mt-1 text-[11px] text-rose-600 whitespace-pre-wrap">{job.last_error}</p>}
      {captionStale && canEdit && (
        <p className="mt-1 text-[11px] text-amber-700">
          ⚠ {t("แคปชั่นในการ์ดเปลี่ยนหลังตั้งคิว — คิวยังใช้ข้อความเดิม", "Caption changed after queuing — the queue still uses the old text")}{" "}
          <button disabled={busy} onClick={() => actions.useCaption(job, latestCaption ?? "")} className="font-medium text-amber-800 underline disabled:opacity-50">{t("ใช้แคปชั่นล่าสุด", "Use latest caption")}</button>
        </p>
      )}
    </div>
  );
}

/** กล่องคิวของคอนเทนต์ 1 ชิ้น (ใน drawer) */
export function PublishQueueBox({ jobs, latestCaptions, canEdit, canQueueAll, onChanged, onQueueAll, pushToast }: {
  jobs: PublishJob[];
  latestCaptions: Record<string, string>;   // แคปชั่นที่ประกอบแล้วตอนนี้ (ต่อแพลตฟอร์ม) — ไว้เตือนว่าคิวใช้ข้อความเก่า
  canEdit: boolean;
  canQueueAll: boolean;                     // มีแพลตฟอร์มที่ยิงอัตโนมัติได้อย่างน้อย 1
  onChanged: () => void;
  onQueueAll: () => void;
  pushToast: (type: ToastVariant, m: string) => void;
}) {
  const t = useT();
  const actions = useJobActions(onChanged, pushToast, t);
  const [showOld, setShowOld] = useState(false);
  const live = jobs.filter((j) => j.status !== "cancelled");
  // แถวล่าสุดต่อแพลตฟอร์ม = โชว์เสมอ · ที่เหลือ (ประวัติ) พับไว้
  const latestByPlat = new Map<string, PublishJob>();
  for (const j of live) if (!latestByPlat.has(j.platform)) latestByPlat.set(j.platform, j);
  const main = [...latestByPlat.values()];
  const older = live.filter((j) => !main.includes(j));
  if (!main.length && !canQueueAll) return null;
  return (
    <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50/40 p-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-700">📤 {t("คิวโพสต์อัตโนมัติ", "Auto-post queue")}</span>
        {main.some((j) => ACTIVE.has(j.status)) && <span className="text-[10px] text-slate-500">{t("ระบบโพสต์ให้เองตามเวลา", "posts automatically on time")}</span>}
        {canEdit && canQueueAll && <button onClick={onQueueAll} className="ml-auto h-7 px-2.5 text-[11px] font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">⏰ {t("ตั้งคิวทุกแพลตฟอร์ม", "Queue all platforms")}</button>}
      </div>
      {main.length === 0
        ? <p className="text-[11px] text-slate-400">{t("ยังไม่มีคิว — กด “ตั้งคิวทุกแพลตฟอร์ม” หรือเลือก “ตั้งคิว” ในป๊อปโพสต์ของแต่ละแพลตฟอร์ม", "No queue yet — use “Queue all platforms” or “Queue” in each post popup")}</p>
        : main.map((j) => <JobRow key={j.id} job={j} t={t} actions={actions} canEdit={canEdit} latestCaption={latestCaptions[j.platform]} />)}
      {older.length > 0 && (
        <div>
          <button onClick={() => setShowOld((v) => !v)} className="text-[11px] text-slate-500 hover:underline">{showOld ? "▾" : "▸"} {t(`ประวัติคิว (${older.length})`, `History (${older.length})`)}</button>
          {showOld && <div className="mt-1 space-y-1">{older.map((j) => <JobRow key={j.id} job={j} t={t} actions={actions} canEdit={false} />)}</div>}
        </div>
      )}
      {actions.confirmCancel}
    </div>
  );
}

export type QueuePlatformOption = {
  platform: string;
  captionText: string;
  media: PostMediaRef[];
  format?: string;
  blocked?: string | null;   // เหตุที่ตั้งคิวไม่ได้ (ยังไม่เชื่อม/ไม่มีไฟล์ ฯลฯ)
};

/** ป๊อปตั้งคิวหลายแพลตฟอร์ม (เวลาเดียวกัน) */
export function QueueAllModal({ options, defaultRunAt, busy, onClose, onSubmit }: {
  options: QueuePlatformOption[];
  defaultRunAt: string;                     // YYYY-MM-DDTHH:mm (เวลาโพสต์ของคอนเทนต์)
  busy: boolean;
  onClose: () => void;
  onSubmit: (items: PublishJobInput[]) => void;
}) {
  const t = useT();
  const [runAt, setRunAt] = useState(() => (defaultRunAt && new Date(defaultRunAt).getTime() > Date.now() + 60_000 ? defaultRunAt : ""));
  const [sel, setSel] = useState<string[]>(() => options.filter((o) => !o.blocked).map((o) => o.platform));
  const runAtMs = runAt ? new Date(runAt).getTime() : NaN;
  const runAtOk = Number.isFinite(runAtMs) && runAtMs - Date.now() >= 60_000;
  const toggle = (p: string) => setSel((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]));
  const submit = () => onSubmit(options.filter((o) => sel.includes(o.platform) && !o.blocked).map((o) => ({
    platform: o.platform, format: o.format ?? null, caption_text: o.captionText, media: o.media, run_at: new Date(runAt).toISOString(),
  })));
  return (
    <ERPModal open onClose={onClose} size="lg" title={`⏰ ${t("ตั้งคิวโพสต์ทุกแพลตฟอร์ม", "Queue all platforms")}`}
      footer={<>
        <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button onClick={submit} disabled={busy || !runAtOk || sel.length === 0} className="h-9 px-5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {busy ? t("กำลังตั้งคิว…", "Queuing…") : t(`ตั้งคิว ${sel.length} แพลตฟอร์ม`, `Queue ${sel.length}`)}
        </button>
      </>}>
      <div className="space-y-3">
        <div>
          <p className="text-[11px] text-slate-400 mb-1">{t("โพสต์เวลา", "Post at")}</p>
          <ERPDateTime24 value={runAt} onChange={setRunAt} />
          {runAt && !runAtOk && <p className="text-[11px] text-rose-500 mt-1">{t("ต้องเป็นเวลาข้างหน้า (อย่างน้อย 1 นาที)", "Must be at least 1 minute ahead")}</p>}
        </div>
        <div className="space-y-1.5">
          {options.map((o) => {
            const on = sel.includes(o.platform) && !o.blocked;
            const vids = o.media.filter((m) => m.type === "video").length; const imgs = o.media.length - vids;
            const fmt = postFormatLabel(o.platform, o.format, t);
            return (
              <label key={o.platform} className={`flex gap-2 rounded-lg border px-2.5 py-2 ${o.blocked ? "border-slate-200 bg-slate-50 opacity-70" : on ? "border-blue-300 bg-blue-50/50" : "border-slate-200"} ${o.blocked ? "" : "cursor-pointer"}`}>
                <input type="checkbox" className="mt-0.5" disabled={!!o.blocked} checked={on} onChange={() => toggle(o.platform)} />
                <div className="min-w-0 flex-1 text-xs">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <PlatformChip code={o.platform} />
                    <span className="text-slate-500">{fmt || t("อัตโนมัติจากสื่อ", "auto")}</span>
                    <span className="text-slate-400">· {vids ? t(`วิดีโอ ${vids}`, `${vids} video`) : t(`รูป ${imgs}`, `${imgs} image(s)`)}</span>
                  </div>
                  {o.blocked
                    ? <p className="text-[11px] text-rose-600 mt-0.5">{o.blocked}</p>
                    : <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2 whitespace-pre-wrap">{o.format === "story" ? t("Story — ไม่ใช้แคปชั่น", "Story — no caption") : (o.captionText || t("(ไม่มีแคปชั่น)", "(no caption)"))}</p>}
                </div>
              </label>
            );
          })}
        </div>
        <p className="text-[10px] text-slate-400">💡 {t("แคปชั่น/รูป/รูปแบบ ใช้ตามที่ตั้งในการ์ดของแต่ละแพลตฟอร์มตอนนี้ · แพลตฟอร์มที่ไม่มีในรายการ (TikTok/YouTube/Pinterest/X) ยังต้องโพสต์เอง", "Uses each platform card's current caption/media/format · platforms not listed still need manual posting")}</p>
      </div>
    </ERPModal>
  );
}

/** ภาพรวมคิวทั้งหมด (ปุ่มในหน้าปฏิทิน) */
export function PublishQueueModal({ brandName, canEdit, onClose, onOpenContent, pushToast }: {
  brandName: (id: string | null | undefined) => string;
  canEdit: boolean;
  onClose: () => void;
  onOpenContent: (contentId: string) => void;
  pushToast: (type: ToastVariant, m: string) => void;
}) {
  const t = useT();
  const swr = useSWRLite(PUBLISH_JOBS_SWR_KEY, () => listPublishJobs());
  const jobs = swr.data ?? [];
  const actions = useJobActions(() => void swr.revalidate(true), pushToast, t);
  const groups: { key: string; title: string; rows: PublishJob[] }[] = [
    { key: "active", title: t("รอโพสต์", "Upcoming"), rows: jobs.filter((j) => ACTIVE.has(j.status)) },
    { key: "failed", title: t("ไม่สำเร็จ (14 วัน)", "Failed (14 days)"), rows: jobs.filter((j) => j.status === "failed") },
    { key: "posted", title: t("โพสต์แล้ว (3 วัน)", "Posted (3 days)"), rows: jobs.filter((j) => j.status === "posted") },
  ];
  return (
    <ERPModal open onClose={onClose} size="lg" title={`📤 ${t("คิวโพสต์อัตโนมัติ", "Auto-post queue")}`}>
      {swr.error && !jobs.length ? <p className="text-sm text-rose-600">{t("โหลดคิวไม่สำเร็จ กรุณาลองใหม่", "Couldn't load the queue — try again")}</p>
        : !swr.data ? <p className="text-sm text-slate-400">{t("กำลังโหลด…", "Loading…")}</p>
        : jobs.length === 0 ? <p className="text-sm text-slate-500">{t("ยังไม่มีคิว — ตั้งคิวได้จากป๊อป “โพสต์” ในคอนเทนต์แต่ละชิ้น", "No queued posts yet — queue from a content's post popup")}</p>
        : (
          <div className="space-y-4">
            {groups.filter((g) => g.rows.length).map((g) => (
              <div key={g.key}>
                <p className="text-xs font-semibold text-slate-600 mb-1.5">{g.title} <span className="font-normal text-slate-400">{g.rows.length}</span></p>
                <div className="space-y-1.5">
                  {g.rows.map((j) => (
                    <JobRow key={j.id} job={j} t={t} actions={actions} canEdit={canEdit}
                      extra={<button onClick={() => onOpenContent(j.content_id)} className="min-w-0 max-w-[16rem] truncate text-left font-medium text-slate-700 hover:text-violet-700 hover:underline" title={j.content?.title ?? ""}>
                        {j.content?.title || j.content?.content_no || t("คอนเทนต์", "Content")}{j.content?.brand_id ? <span className="font-normal text-slate-400"> · {brandName(j.content.brand_id)}</span> : null}
                      </button>} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      {actions.confirmCancel}
    </ERPModal>
  );
}
