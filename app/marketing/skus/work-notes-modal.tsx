"use client";

/**
 * 📝 จดหมายเหตุ ของโหมดทำงาน (หน้า SKU การตลาด) — รายรุ่น หรือ ทั้งงาน
 *   ข้อความใคร/เมื่อไหร่/แก้-ลบของตัวเอง/@แท็กคน = ระบบความคิดเห็นกลาง (CommentThread · erp_comments · มี audit)
 *   รายรุ่นมีสวิตช์ ⚠️ ติดปัญหา → ป้ายแดงบนการ์ด/แถว + ตัวกรอง "เฉพาะที่ติดปัญหา" + นับในหัวงาน
 * เจ้าของขอ 2026-10-20 "อยากให้มีจดหมายเหตุด้วย บางทีงานมีปัญหาระหว่างทำ"
 * ของกลางที่ใช้: ERPModal · CommentThread · HoverImage · Toast
 */
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { CommentThread } from "@/components/comment-thread";
import { HoverImage } from "@/components/hover-image";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n";
import { apiFetch } from "@/lib/api";
import { getLang } from "@/lib/lang";
import { r2ImageUrl } from "@/lib/r2-image";
import { WORK_NOTE_ENTITY, type WorkJob, type WorkJobItem } from "@/lib/marketing/work-jobs";

export type WorkNotesTarget = { kind: "item"; item: WorkJobItem } | { kind: "job"; job: WorkJob };
type IssuePatch = Pick<WorkJobItem, "issue_open" | "issue_at" | "issue_by">;

const fmtWhen = (iso: string | null) => (iso ? new Date(iso).toLocaleString(getLang() === "en" ? "en-GB" : "th-TH", { dateStyle: "short", timeStyle: "short" }) : "");

export function WorkNotesModal({ target, jobId, canManage, onClose, onIssueChanged }: {
  target: WorkNotesTarget | null;
  jobId: string;
  /** ตั้ง/ปลด ⚠️ ติดปัญหา ได้ไหม (สิทธิ์ marketing.sku.manage) — เขียนจดหมายเหตุใช้สิทธิ์ความคิดเห็นกลาง */
  canManage: boolean;
  onClose: () => void;
  onIssueChanged: (itemId: string, patch: IssuePatch) => void;
}) {
  const toast = useToast();
  const t = useT();
  const item = target?.kind === "item" ? target.item : null;
  const [issue, setIssue] = useState<IssuePatch | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setIssue(item ? { issue_open: item.issue_open, issue_at: item.issue_at, issue_by: item.issue_by } : null); }, [item?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const toggleIssue = async (open: boolean) => {
    if (!item || busy) return;
    setBusy(true);
    try {
      const r = await apiFetch(`/api/marketing/work-jobs/${jobId}/items`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item_id: item.id, issue: open }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || t("บันทึกไม่สำเร็จ", "Couldn't save"));
      const patch: IssuePatch = open
        ? { issue_open: true, issue_at: (j.data?.issue_at as string) ?? new Date().toISOString(), issue_by: (j.data?.issue_by as string | null) ?? null }
        : { issue_open: false, issue_at: null, issue_by: null };
      setIssue(patch);
      onIssueChanged(item.id, patch);
      toast.success(open
        ? t(`${item.code}: ตั้งว่าติดปัญหาแล้ว — เขียนรายละเอียดไว้ในจดหมายเหตุด้านล่าง`, `${item.code}: marked as a problem — write the details in the notes below`)
        : t(`${item.code}: แก้ปัญหาแล้ว (ปลดป้าย ⚠️)`, `${item.code}: problem solved (⚠️ removed)`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("บันทึกไม่สำเร็จ กรุณาลองใหม่", "Couldn't save. Please try again."));
    } finally { setBusy(false); }
  };

  const title = !target ? "" : target.kind === "item" ? `📝 ${t("จดหมายเหตุ", "Notes")} — ${target.item.code}` : `📝 ${t("จดหมายเหตุงาน", "Job notes")} — ${target.job.name}`;

  return (
    <ERPModal open={!!target} onClose={onClose} title={title} size="md"
      description={target?.kind === "job"
        ? t("เรื่องของทั้งงาน เช่น ติดรอรูป/ติดรอราคา · พิมพ์ @ชื่อ เพื่อแจ้งคนนั้น", "About the whole job, e.g. waiting for photos/prices · type @name to notify that person")
        : t("เขียนว่าติดอะไร แก้ยังไง ใครทำ · พิมพ์ @ชื่อ เพื่อแจ้งคนนั้น", "Write what's blocking, how to fix it, who's on it · type @name to notify that person")}>
      {target && (
        <div className="space-y-3">
          {item && (
            <>
              <div className="flex items-center gap-3">
                <HoverImage url={r2ImageUrl(item.image_key, 96)} size={48} previewSize={320} rounded="rounded-lg" />
                <div className="min-w-0">
                  <div className="font-mono text-sm font-semibold text-slate-800">{item.code || t("(ไม่มีรหัส)", "(no code)")}</div>
                  <div className="truncate text-xs text-slate-500" title={item.name}>{item.name}</div>
                </div>
              </div>
              {issue?.issue_open ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                  <span className="text-sm font-medium text-red-700">⚠️ {t("รุ่นนี้ติดปัญหาอยู่", "This model has a problem")}</span>
                  <span className="text-xs text-red-600/80">{issue.issue_by ? `${t("ตั้งโดย", "set by")} ${issue.issue_by} · ` : ""}{fmtWhen(issue.issue_at)}</span>
                  {canManage && (
                    <button type="button" onClick={() => void toggleIssue(false)} disabled={busy}
                      className="ml-auto h-8 rounded-lg border border-emerald-300 bg-white px-3 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
                      {busy ? t("กำลังบันทึก…", "Saving…") : t("✓ แก้แล้ว (ปลดป้าย)", "✓ Solved (remove flag)")}
                    </button>
                  )}
                </div>
              ) : canManage ? (
                <button type="button" onClick={() => void toggleIssue(true)} disabled={busy}
                  className="h-8 rounded-lg border border-slate-200 px-3 text-xs text-slate-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-50">
                  {busy ? t("กำลังบันทึก…", "Saving…") : t("⚠️ ตั้งว่ารุ่นนี้ติดปัญหา", "⚠️ Mark this model as a problem")}
                </button>
              ) : null}
            </>
          )}
          <CommentThread
            key={target.kind === "item" ? `i:${target.item.id}` : `j:${target.job.id}`}
            entityType={target.kind === "item" ? WORK_NOTE_ENTITY.item : WORK_NOTE_ENTITY.job}
            entityId={target.kind === "item" ? target.item.id : target.job.id}
            title={`📝 ${t("จดหมายเหตุ", "Notes")}`} maxHeight={360} />
        </div>
      )}
    </ERPModal>
  );
}
