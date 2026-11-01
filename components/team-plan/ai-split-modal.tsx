"use client";
/**
 * ✨ AI แตกงาน — วางข้อความยาว (แชทลูกค้า / โน้ตประชุม) → AI แยกเป็นงานทีละข้อ → ตรวจ/แก้ แล้วกดเพิ่มเฉพาะข้อที่ติ๊ก
 * API: POST /api/team-plan/ai-split (ยังไม่บันทึก) → เพิ่มจริงผ่าน createPlanItem ทีละข้อ
 * ต้องมีสิทธิ์ ai.caption (มีค่าใช้จ่ายต่อครั้ง)
 */
import { useState } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { useAuth } from "@/components/auth";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import { PRIORITIES, PRIORITY_META, type PlanItem, type Priority } from "@/lib/team-plan";
import { createPlanItem } from "@/lib/team-plan-client";

type Row = { on: boolean; title: string; priority: Priority; due_date: string | null; due_time: string | null; who_id: string | null; who_name: string | null; note: string | null };

export function AiSplitModal({ me, onClose, onAdded }: { me: string; onClose: () => void; onAdded: (list: PlanItem[]) => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<"" | "ai" | "save">("");
  const [err, setErr] = useState<string | null>(null);
  const canAi = can("ai.caption");

  const split = async () => {
    if (text.trim().length < 5) { setErr("วางข้อความที่จะให้แตกเป็นงานก่อน"); return; }
    setBusy("ai"); setErr(null);
    try {
      const r = await apiFetch("/api/team-plan/ai-split", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || "AI แตกงานไม่สำเร็จ");
      const list = ((j.tasks ?? []) as Omit<Row, "on">[]).map((t) => ({ ...t, on: true }));
      if (!list.length) setErr("AI ไม่พบงานที่ต้องทำในข้อความนี้ — ลองใส่รายละเอียดเพิ่ม");
      setRows(list);
    } catch (e) { setErr(e instanceof Error ? e.message : "AI แตกงานไม่สำเร็จ"); }
    finally { setBusy(""); }
  };

  const save = async () => {
    const pick = (rows ?? []).filter((r) => r.on && r.title.trim());
    if (!pick.length) { setErr("ติ๊กเลือกงานที่จะเพิ่มอย่างน้อย 1 ข้อ"); return; }
    setBusy("save"); setErr(null);
    const added: PlanItem[] = [];
    let failed = 0;
    for (const r of pick) {
      try {
        const due = r.due_date ? new Date(`${r.due_date}T${r.due_time ?? "18:00"}:00+07:00`).toISOString() : null;
        added.push(await createPlanItem({ title: r.title.trim(), priority: r.priority, due_at: due, assigned_to: r.who_id ?? (me || null), remind: due ? "before_1h" : "none", note: r.note }));
      } catch { failed++; }
    }
    setBusy("");
    onAdded(added);
    if (failed) toast.error(`เพิ่มไม่สำเร็จ ${failed} งาน — ลองเพิ่มเองอีกครั้ง`);
    if (added.length) { toast.success(`เพิ่มแล้ว ${added.length} งาน`); onClose(); }
  };
  const upd = (i: number, p: Partial<Row>) => setRows((cur) => (cur ?? []).map((r, k) => (k === i ? { ...r, ...p } : r)));
  const onCount = (rows ?? []).filter((r) => r.on).length;

  return (
    <ERPModal open onClose={onClose} title="AI แตกงานจากข้อความ" size="lg" hasUnsavedChanges={!!text.trim()}
      footer={<>
        <button type="button" onClick={onClose} disabled={!!busy} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">ปิด</button>
        {rows && rows.length > 0
          ? <button type="button" onClick={() => void save()} disabled={!!busy || !onCount} className="h-9 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">{busy === "save" ? "กำลังเพิ่ม…" : `เพิ่ม ${onCount} งาน`}</button>
          : <button type="button" onClick={() => void split()} disabled={!!busy || !canAi} className="h-9 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">{busy === "ai" ? "AI กำลังอ่าน…" : <><Icon name="ai" /> ให้ AI แตกงาน</>}</button>}
      </>}>
      <div className="space-y-3">
        {!canAi && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">ยังไม่มีสิทธิ์ใช้ AI (ai.caption) — ขอสิทธิ์จากผู้ดูแลระบบ</p>}
        {!rows ? (
          <>
            <p className="text-sm text-slate-500">วางแชทลูกค้า โน้ตประชุม หรือรายการที่พิมพ์ไว้ยาว ๆ — AI จะแยกเป็นงานทีละข้อ เดาความด่วน วันกำหนด และคนรับผิดชอบให้ แล้วคุณตรวจก่อนกดเพิ่ม</p>
            <textarea value={text} onChange={(e) => { setText(e.target.value); setErr(null); }} rows={10} maxLength={6000} autoFocus
              placeholder={"เช่น\nลูกค้า CPN ขอเปลี่ยนสายเป็นเทปก้างปลาสีขาว ขอแบบใหม่พรุ่งนี้\nMint ช่วยสั่งผ้าเพิ่ม 5 หลา ภายในศุกร์นี้\nToey ถ่ายรูปกระเป๋า Tote ใหม่"}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span>AI แยกได้ {rows.length} งาน — แก้ได้ก่อนเพิ่ม · เอาติ๊กออก = ไม่เพิ่มข้อนั้น</span>
              <button type="button" onClick={() => setRows(null)} className="ml-auto text-xs text-violet-700 hover:underline">← แก้ข้อความแล้วแตกใหม่</button>
            </div>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {rows.map((r, i) => (
                <div key={i} className={`flex flex-wrap items-center gap-2 px-2.5 py-2 ${r.on ? "" : "opacity-50"}`}>
                  <input type="checkbox" checked={r.on} onChange={(e) => upd(i, { on: e.target.checked })} className="h-4 w-4 accent-violet-600" aria-label="เพิ่มข้อนี้" />
                  <input value={r.title} onChange={(e) => upd(i, { title: e.target.value })} maxLength={300} className="h-8 min-w-[12rem] flex-1 rounded-md border border-slate-200 px-2 text-sm" aria-label="ชื่องาน" />
                  <select value={r.priority} onChange={(e) => upd(i, { priority: e.target.value as Priority })} className="h-8 rounded-md border border-slate-200 px-1.5 text-xs" aria-label="ความด่วน"
                    style={{ color: PRIORITY_META[r.priority].color }}>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
                  </select>
                  <input type="date" value={r.due_date ?? ""} onChange={(e) => upd(i, { due_date: e.target.value || null })} className="h-8 rounded-md border border-slate-200 px-1.5 text-xs" aria-label="กำหนด" />
                  <span className="text-xs text-slate-500">{r.who_name ? `ให้ ${r.who_name}` : "ให้ฉัน"}</span>
                  {r.note && <p className="w-full pl-6 text-xs text-slate-400">{r.note}</p>}
                </div>
              ))}
            </div>
          </>
        )}
        {err && <p className="text-sm text-rose-600">{err}</p>}
      </div>
    </ERPModal>
  );
}
