"use client";

/**
 * ✅ แพ็คแล้ววันนี้ — ดู / แก้ / ยกเลิกการแพ็ค / แพ็คใหม่ (เจ้าของสั่ง 2026-11-19: "ต้องย้อน แก้ได้ พนักงานจะได้กล้าใช้")
 * ข้อมูล /api/packing?today=1 · แก้ = POST edit (เก็บประวัติทุกครั้ง · แจ้งผลมีปุ่ม "ย้อนกลับ")
 * สิทธิ์: คนแพ็คแก้ของตัวเองภายในวันนี้ · หัวหน้า (packing.manage) แก้ได้ทุกใบ — ตัดสินที่ API (can_edit)
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { ErrorState, LoadingState } from "@/components/state-views";
import { PACK_PROBLEMS, PACK_STATUS_LABEL, type BoxSize, type PackEditStatus } from "@/lib/packing";

export type TodaySession = {
  id: string; order_id: string; order_no: string | null; status: string; packer_id: string | null; packer_name: string | null; station: string | null;
  started_at: string; finished_at: string | null; duration_sec: number; box_used: string | null; box_suggested: string | null;
  problem: string | null; problem_note: string | null; has_clip: boolean; edited_at: string | null; can_edit: boolean;
};

const fmtSec = (s: number): string => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} นาที` : `${s} วิ`);
const hhmm = (iso: string | null): string => (iso ? new Date(iso).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }) : "");
const TONE: Record<string, string> = { done: "bg-emerald-100 text-emerald-800", problem: "bg-red-100 text-red-700", voided: "bg-slate-100 text-slate-500" };
const problemLabel = (k: string | null) => PACK_PROBLEMS.find((p) => p.key === k)?.label ?? null;

type EditForm = { status: PackEditStatus; box_used: string; problem: string; problem_note: string };

export function TodayPacked({ refreshKey, boxes, onRepack, onChanged }: { refreshKey: number; boxes: BoxSize[]; onRepack: (s: TodaySession) => void; onChanged: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<TodaySession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TodaySession | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch("/api/packing?today=1");
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || "โหลดไม่สำเร็จ"); return; }
      setError(null); setRows(j.sessions ?? []); setMeId(j.me?.id ?? null);
    } catch { setError("เน็ตหลุด — โหลดไม่ได้"); }
  }, []);
  useEffect(() => { void load(); }, [load, refreshKey]);

  const openEdit = (s: TodaySession) => {
    setEditing(s);
    setForm({ status: (["done", "problem", "voided"].includes(s.status) ? s.status : "done") as PackEditStatus, box_used: s.box_used ?? "", problem: s.problem ?? "missing", problem_note: s.problem_note ?? "" });
  };

  const post = async (body: Record<string, unknown>): Promise<boolean> => {
    const r = await apiFetch("/api/packing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast.error(j.error || "บันทึกไม่สำเร็จ"); return false; }
    return true;
  };

  const save = async () => {
    if (!editing || !form) return;
    setSaving(true);
    const before = { status: editing.status, box_used: editing.box_used ?? "", problem: editing.problem ?? "", problem_note: editing.problem_note ?? "" };
    const ok = await post({ action: "edit", session_id: editing.id, status: form.status, box_used: form.box_used || null, problem: form.problem, problem_note: form.problem_note });
    setSaving(false);
    if (!ok) return;
    const label = editing.order_no ?? "";
    setEditing(null); setForm(null);
    void load(); onChanged();
    // ย้อนกลับ = ส่งค่าเดิมกลับไป (ลงประวัติอีกรอบ)
    toast.action(`แก้ ${label} แล้ว`, "ย้อนกลับ", () => {
      void post({ action: "edit", session_id: editing.id, status: before.status === "abandoned" ? "voided" : before.status, box_used: before.box_used || null, problem: before.problem || undefined, problem_note: before.problem_note })
        .then((done) => { if (done) { toast.success(`ย้อน ${label} กลับเป็นแบบเดิมแล้ว`); void load(); onChanged(); } });
    }, { ms: 10_000 });
  };

  const shown = (rows ?? []).filter((r) => !mineOnly || r.packer_id === meId);
  const done = shown.filter((r) => r.status === "done");
  const avg = done.length ? Math.round(done.reduce((a, r) => a + r.duration_sec, 0) / done.length) : 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-slate-800">แพ็คแล้ววันนี้ {rows ? `(${shown.length})` : ""}</p>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>เสร็จ {done.length} · มีปัญหา {shown.filter((r) => r.status === "problem").length} · เฉลี่ย {fmtSec(avg)}</span>
          <label className="inline-flex cursor-pointer items-center gap-1"><input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> ของฉัน</label>
        </div>
      </div>
      {error ? <ErrorState title="โหลดไม่ได้" hint={error} onRetry={() => void load()} />
        : !rows ? <LoadingState label="กำลังโหลด…" />
        : shown.length === 0 ? <p className="py-4 text-center text-sm text-slate-400">ยังไม่มีออเดอร์ที่แพ็ควันนี้</p>
        : (
          <ul className="max-h-[45vh] divide-y divide-slate-100 overflow-auto">
            {shown.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1 text-sm font-medium text-slate-900">
                    <span className="truncate">{s.order_no ?? "-"}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${TONE[s.status] ?? "bg-slate-100 text-slate-600"}`}>{PACK_STATUS_LABEL[s.status] ?? s.status}{s.status === "problem" && problemLabel(s.problem) ? `: ${problemLabel(s.problem)}` : ""}</span>
                    {!s.has_clip && s.status !== "voided" && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">ไม่มีคลิป</span>}
                    {s.edited_at && <span className="text-[11px] text-slate-400">แก้แล้ว</span>}
                  </p>
                  <p className="truncate text-xs text-slate-500">{hhmm(s.finished_at ?? s.started_at)} · {s.packer_name ?? "-"}{s.station ? ` · ${s.station}` : ""} · {fmtSec(s.duration_sec)}{s.box_used ? ` · กล่อง ${s.box_used}` : ""}{s.problem_note ? ` · ${s.problem_note}` : ""}</p>
                </div>
                {s.can_edit && (
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => openEdit(s)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs"><Icon name="edit" /> แก้</button>
                    {s.status !== "voided" && <button type="button" onClick={() => onRepack(s)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs">แพ็คใหม่</button>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

      <ERPModal open={!!editing} onClose={() => { setEditing(null); setForm(null); }} title={`แก้บันทึกการแพ็ค ${editing?.order_no ?? ""}`} description="เก็บประวัติการแก้ทุกครั้ง · ย้อนกลับได้จากแจ้งเตือนหลังบันทึก" size="sm"
        hasUnsavedChanges={!!editing && !!form && (form.status !== editing.status || (form.box_used || "") !== (editing.box_used ?? "") || form.problem_note !== (editing.problem_note ?? ""))}
        footer={<div className="flex justify-end gap-2"><button type="button" onClick={() => { setEditing(null); setForm(null); }} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">ยกเลิก</button><button type="button" disabled={saving} onClick={() => void save()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึก"}</button></div>}>
        {form && (
          <div className="grid gap-3 text-sm">
            <div>
              <p className="mb-1 text-xs text-slate-500">ผลการแพ็ค</p>
              <div className="flex flex-wrap gap-1.5">
                {(["done", "problem", "voided"] as PackEditStatus[]).map((st) => (
                  <button key={st} type="button" onClick={() => setForm({ ...form, status: st })} className={`rounded-lg border px-3 py-1.5 ${form.status === st ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200"}`}>{PACK_STATUS_LABEL[st]}</button>
                ))}
              </div>
              {form.status === "voided" && <p className="mt-1 text-xs text-amber-700">ออเดอร์จะกลับไปอยู่ในคิว "รอแพ็ค" (ถ้าไม่มีบันทึกเสร็จใบอื่น) · บันทึกนี้ยังเก็บไว้เป็นประวัติ</p>}
            </div>
            {form.status === "problem" && (
              <div>
                <p className="mb-1 text-xs text-slate-500">ปัญหา</p>
                <div className="flex flex-wrap gap-1.5">
                  {PACK_PROBLEMS.map((p) => (
                    <button key={p.key} type="button" onClick={() => setForm({ ...form, problem: p.key })} className={`rounded-lg border px-3 py-1.5 ${form.problem === p.key ? "border-red-600 bg-red-600 text-white" : "border-slate-200"}`}>{p.label}</button>
                  ))}
                </div>
                <input value={form.problem_note} onChange={(e) => setForm({ ...form, problem_note: e.target.value })} placeholder="หมายเหตุ เช่น สีผิด ส่งชิ้นใหม่พรุ่งนี้" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2" />
              </div>
            )}
            <label className="grid gap-1">
              <span className="text-xs text-slate-500">กล่องที่ใช้</span>
              <select value={form.box_used} onChange={(e) => setForm({ ...form, box_used: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2">
                <option value="">— ไม่ระบุ —</option>
                {boxes.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
                {form.box_used && !boxes.some((b) => b.name === form.box_used) && <option value={form.box_used}>{form.box_used}</option>}
              </select>
            </label>
          </div>
        )}
      </ERPModal>
    </div>
  );
}
