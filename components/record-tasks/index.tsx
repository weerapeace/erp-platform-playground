"use client";

/**
 * RecordTasksButton — ปุ่ม "รายการงาน/โน้ต" + Drawer เช็คลิสต์ (ของกลาง)
 * เก็บที่ erp_record_tasks ผ่าน /api/record-tasks · สถานะง่าย ☐ ค้าง / ✅ เสร็จ
 *
 * ใช้: <RecordTasksButton moduleKey="design_sheets" canEdit={canEdit} />
 *   - ไม่ส่ง recordId = เช็คลิสต์ "ส่วนกลางของหน้า/โมดูล" (ทีมเห็นร่วมกัน)
 *   - ส่ง recordId = เช็คลิสต์เฉพาะเรคคอร์ดนั้น
 */
import { useState, useEffect, useCallback } from "react";
import { Drawer } from "@/components/modal";
import { useToast } from "@/components/toast";
import { useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import type { RecordTask } from "@/app/api/record-tasks/route";

const relTime = (iso: string) => {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "เมื่อสักครู่";
  if (d < 3600) return `${Math.floor(d / 60)} นาทีที่แล้ว`;
  if (d < 86400) return `${Math.floor(d / 3600)} ชม.ที่แล้ว`;
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
};

export function RecordTasksButton({ moduleKey, recordId = null, label = "📝 รายการงาน", title = "📝 รายการงาน / โน้ต", canEdit = true }: {
  moduleKey: string; recordId?: string | null; label?: string; title?: string; canEdit?: boolean;
}) {
  const toast = useToast();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<RecordTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ module_key: moduleKey });
      if (recordId) qs.set("record_id", recordId);
      const j = await apiFetch(`/api/record-tasks?${qs}`).then((r) => r.json());
      if (!j.error) setItems((j.data ?? []) as RecordTask[]);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [moduleKey, recordId]);

  useEffect(() => { void load(); }, [load]);              // โหลดครั้งแรกเพื่อโชว์ตัวเลขค้างบนปุ่ม
  useEffect(() => { if (open) void load(); }, [open, load]);

  const add = async () => {
    const t = text.trim(); if (!t) return;
    setBusy(true);
    try {
      const j = await apiFetch("/api/record-tasks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module_key: moduleKey, record_id: recordId, title: t, actor: user?.name }),
      }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setText(""); setItems((p) => [...p, j.data as RecordTask]);
    } catch (e) { toast.error(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ"); } finally { setBusy(false); }
  };

  const toggle = async (it: RecordTask) => {
    const next = it.status === "resolved" ? "open" : "resolved";   // "เสร็จ" = resolved (ตาม check constraint ของตาราง)
    setItems((p) => p.map((x) => x.id === it.id ? { ...x, status: next } : x));   // optimistic
    try {
      const r = await apiFetch(`/api/record-tasks/${it.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next, actor: user?.name }) });
      if (!r.ok) throw new Error();
    } catch { setItems((p) => p.map((x) => x.id === it.id ? { ...x, status: it.status } : x)); toast.error("อัปเดตไม่สำเร็จ"); }
  };

  const del = async (it: RecordTask) => {
    setItems((p) => p.filter((x) => x.id !== it.id));
    try { const r = await apiFetch(`/api/record-tasks/${it.id}`, { method: "DELETE" }); if (!r.ok) throw new Error(); }
    catch { toast.error("ลบไม่สำเร็จ"); void load(); }
  };

  const openItems = items.filter((t) => t.status !== "resolved");
  const doneItems = items.filter((t) => t.status === "resolved");

  const row = (it: RecordTask) => {
    const done = it.status === "resolved";
    return (
      <div key={it.id} className="group flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50">
        <button type="button" onClick={() => canEdit && void toggle(it)} disabled={!canEdit} title={done ? "ทำเครื่องหมายว่ายังค้าง" : "ทำเครื่องหมายว่าเสร็จ"}
          className={`mt-0.5 w-5 h-5 shrink-0 rounded border flex items-center justify-center text-xs ${done ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300 text-transparent hover:border-emerald-400"}`}>✓</button>
        <div className="min-w-0 flex-1">
          <div className={`text-sm break-words ${done ? "line-through text-slate-400" : "text-slate-700"}`}>{it.title}</div>
          <div className="text-[10px] text-slate-400">{it.created_by ?? "—"} · {relTime(it.created_at)}</div>
        </div>
        {canEdit && (
          <button type="button" onClick={() => void del(it)} title="ลบ"
            className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 text-xs shrink-0 mt-0.5">🗑</button>
        )}
      </div>
    );
  };

  return (
    <>
      <button onClick={() => setOpen(true)} title="เช็คลิสต์/โน้ตของหน้านี้"
        className="h-10 px-3 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5 flex-shrink-0">
        {label}
        {openItems.length > 0 && (
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-amber-500 text-white text-[11px] font-semibold tabular-nums">{openItems.length}</span>
        )}
      </button>

      <Drawer open={open} onClose={() => setOpen(false)} size="md" title={title}
        description={recordId ? "เช็คลิสต์ของรายการนี้" : "เช็คลิสต์ส่วนกลางของหน้านี้ (ทีมเห็นร่วมกัน)"}>
        {canEdit && (
          <div className="flex gap-2 mb-3">
            <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void add(); }}
              placeholder="พิมพ์งานที่ต้องทำ แล้วกด Enter" className="flex-1 h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={() => void add()} disabled={busy || !text.trim()}
              className="h-9 px-3 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 shrink-0">＋ เพิ่ม</button>
          </div>
        )}

        {loading && items.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">กำลังโหลด...</div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-300">— ยังไม่มีรายการ — {canEdit ? "พิมพ์เพิ่มด้านบนได้เลย" : ""}</div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-0.5">
              {openItems.length === 0 ? <div className="px-2 py-2 text-xs text-emerald-600">🎉 ทำครบแล้ว</div> : openItems.map(row)}
            </div>
            {doneItems.length > 0 && (
              <div>
                <div className="px-2 py-1 text-[11px] font-medium text-slate-400 border-t border-slate-100">เสร็จแล้ว ({doneItems.length})</div>
                <div className="space-y-0.5 opacity-80">{doneItems.map(row)}</div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}
