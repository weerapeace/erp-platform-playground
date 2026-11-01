"use client";
/**
 * ➕ "ใส่แผนงาน" (ของกลาง) — เพิ่มงานเข้าแผนงานทีมจากโมดูลอื่น พร้อมลิงก์กลับเรื่องเดิม
 *   <AddToPlanButton title="DS-2026-0069 กระเป๋า CPN" source={{ label: "DS-2026-0069", href: "/master/design-dashboard?open=<id>" }} />
 *   หรือคุมเอง: <AddToPlanModal open defaultTitle source onClose />  (เช่น ปุ่มรายแถวของตาราง)
 * ใช้แล้วที่: ป๊อปใบงานออกแบบ (หัว + ราย Comment ลูกค้า) · ตาราง SKU / Parent SKU (ปุ่มรายแถว) · ป๊อปโพสต์คอนเทนต์ (เมนู ⋯)
 * สิทธิ์ tasks.create (ไม่มี = ไม่โชว์ปุ่ม)
 */
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { useAuth } from "@/components/auth";
import { Icon } from "@/components/icon";
import { createPlanItem } from "@/lib/team-plan-client";
import { PlanDraftFields, usePlanDraft } from "./draft-fields";

export type PlanSource = { label: string; href: string };

export function AddToPlanModal({ open, defaultTitle, source, onClose }: { open: boolean; defaultTitle: string; source?: PlanSource | null; onClose: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const draft = usePlanDraft();
  const [title, setTitle] = useState(defaultTitle);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setTitle(defaultTitle); setNote(""); setErr(null); } }, [open, defaultTitle]);

  const submit = async () => {
    if (!title.trim()) { setErr("พิมพ์ชื่องานก่อน"); return; }
    if (draft.problem) { setErr(draft.problem); return; }
    setBusy(true); setErr(null);
    try {
      await createPlanItem(draft.toDraft(title.trim(), user?.id ?? null, { note: note.trim() || null, source: source ?? null }));
      toast.success(draft.s.who && draft.s.who.id !== user?.id ? `ใส่แผนงานแล้ว — ${draft.s.who.name} จะได้แจ้งเตือน` : "ใส่แผนงานแล้ว (ดูที่เมนู แผนงาน)");
      onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : "ใส่แผนงานไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  return (
    <ERPModal open={open} onClose={onClose} title="ใส่แผนงาน" size="md" hasUnsavedChanges={!!note.trim() || title.trim() !== defaultTitle.trim()}
      footer={<>
        <button type="button" onClick={onClose} disabled={busy} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">ยกเลิก</button>
        <button type="button" onClick={() => void submit()} disabled={busy} className="h-9 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">
          {busy ? "กำลังบันทึก…" : <><Icon name="add" /> ใส่แผนงาน</>}
        </button>
      </>}>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">ชื่องาน</label>
          <input value={title} onChange={(e) => { setTitle(e.target.value); setErr(null); }} maxLength={300} autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void submit(); } }}
            className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
        </div>
        <PlanDraftFields draft={draft} meName={user?.name ?? ""} />
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">โน้ต (ไม่บังคับ)</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={4000}
            className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
        </div>
        {source && <p className="text-xs text-slate-500"><Icon name="link" /> ลิงก์กลับ: {source.label}</p>}
        {err && <p className="text-sm text-rose-600">{err}</p>}
      </div>
    </ERPModal>
  );
}

export function AddToPlanButton({ title, source, className, label = "ใส่แผนงาน" }: { title: string; source?: PlanSource | null; className?: string; label?: string }) {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  if (!can("tasks.create")) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="เพิ่มเป็นงานในแผนงานทีม (มอบคน ตั้งกำหนด ตั้งเตือนได้)"
        className={className ?? "h-9 px-3 inline-flex items-center gap-1 text-sm border border-violet-200 rounded-lg text-violet-700 bg-violet-50 hover:bg-violet-100"}>
        <Icon name="add" /> {label}
      </button>
      {open && <AddToPlanModal open defaultTitle={title} source={source} onClose={() => setOpen(false)} />}
    </>
  );
}
