"use client";

// ============================================================
// WorkflowStatusManager — ป๊อปอัปจัดการ "สถานะงาน" ของกลาง
// ใช้กับ entity ไหนก็ได้ (ส่ง entityType) — อ่าน/แก้ erp_workflow_states ผ่าน /api/admin/workflows
// เพิ่ม / แก้ชื่อ / เปลี่ยนสี / สลับลำดับ / ตั้งเป็นสถานะปิดงาน / ลบ — แล้วกดบันทึกทีเดียว
// ใช้: <WorkflowStatusManager open={x} onClose={..} entityType="design_sheet" actor={email} onChanged={reload} />
// ============================================================

import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import type { WorkflowFull, WorkflowState } from "@/app/api/admin/workflows/route";

type Color = WorkflowState["color"];
const COLORS: { key: Color; label: string; hex: string }[] = [
  { key: "slate",   label: "เทา",    hex: "#94a3b8" },
  { key: "blue",    label: "น้ำเงิน", hex: "#3b82f6" },
  { key: "amber",   label: "ส้ม",    hex: "#f59e0b" },
  { key: "emerald", label: "เขียว",  hex: "#10b981" },
  { key: "red",     label: "แดง",    hex: "#f43f5e" },
  { key: "purple",  label: "ม่วง",   hex: "#a855f7" },
];

type Row = { id: string | null; state_key: string; label: string; color: Color; is_terminal: boolean };

export function WorkflowStatusManager({
  open, onClose, entityType, actor, onChanged,
}: {
  open: boolean;
  onClose: () => void;
  entityType: string;
  /** ชื่อ/อีเมลคนแก้ (audit) */
  actor?: string | null;
  /** เรียกหลังบันทึกสำเร็จ เพื่อให้หน้าหลักโหลดสถานะใหม่ */
  onChanged?: () => void;
}) {
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true); setDeleted([]);
    apiFetch(`/api/admin/workflows?entity_type=${encodeURIComponent(entityType)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        const full = j.data as WorkflowFull | null;
        const states = (full?.states ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
        setRows(states.map((s) => ({ id: s.id, state_key: s.state_key, label: s.label, color: s.color, is_terminal: s.is_terminal })));
      })
      .catch(() => { if (alive) toast.error("โหลดสถานะไม่สำเร็จ"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, entityType, toast]);

  const setRow = (i: number, p: Partial<Row>) => setRows((list) => list.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  const move = (i: number, dir: -1 | 1) => setRows((list) => {
    const j = i + dir; if (j < 0 || j >= list.length) return list;
    const next = list.slice(); [next[i], next[j]] = [next[j], next[i]]; return next;
  });
  const removeRow = (i: number) => setRows((list) => {
    const r = list[i]; if (r.id) setDeleted((d) => [...d, r.id!]);
    return list.filter((_, idx) => idx !== i);
  });
  const addRow = () => {
    // รหัสอังกฤษสร้างให้อัตโนมัติ (ผู้ใช้ไม่ต้องรู้) — กันชนกับที่มีอยู่
    const used = new Set(rows.map((r) => r.state_key));
    let key = ""; let n = rows.length + 1;
    do { key = `state_${n}`; n++; } while (used.has(key));
    setRows((list) => [...list, { id: null, state_key: key, label: "", color: "slate", is_terminal: false }]);
  };

  const save = async () => {
    if (rows.some((r) => !r.label.trim())) { toast.error("กรอกชื่อสถานะให้ครบทุกช่อง"); return; }
    setSaving(true);
    try {
      // ลบก่อน แล้วค่อย upsert ตามลำดับใหม่ (sort_order = ตำแหน่ง×10)
      for (const id of deleted) {
        const res = await apiFetch(`/api/admin/workflows?kind=state&id=${id}${actor ? `&actor=${encodeURIComponent(actor)}` : ""}`, { method: "DELETE" });
        const j = await res.json(); if (j.error) throw new Error(j.error);
      }
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const res = await apiFetch("/api/admin/workflows", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "state", actor: actor ?? null, state: {
            id: r.id, entity_type: entityType, state_key: r.state_key, label: r.label.trim(),
            color: r.color, is_terminal: r.is_terminal, sort_order: (i + 1) * 10,
          } }),
        });
        const j = await res.json(); if (j.error) throw new Error(j.error);
      }
      toast.success("บันทึกสถานะงานแล้ว");
      onChanged?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally { setSaving(false); }
  };

  return (
    <ERPModal open={open} onClose={onClose} size="lg" title="จัดการสถานะงาน"
      description="เพิ่ม/แก้ชื่อ/เปลี่ยนสี/เรียงลำดับสถานะ — โซนบนกระดานจะเปลี่ยนตาม (สถานะปิดงาน = งานเสร็จ/ยกเลิก เลิกเตือนกำหนดส่ง)"
      footer={
        <div className="flex justify-between items-center w-full">
          <button onClick={addRow} disabled={saving} className="h-9 px-3 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">＋ เพิ่มสถานะ</button>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={saving} className="h-9 px-4 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button>
            <button onClick={() => void save()} disabled={saving || loading} className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? "กำลังบันทึก..." : "บันทึก"}</button>
          </div>
        </div>
      }>
      {loading ? (
        <div className="py-12 text-center text-slate-400">กำลังโหลด...</div>
      ) : rows.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400">— ยังไม่มีสถานะ กด “เพิ่มสถานะ” ด้านล่าง —</div>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={r.id ?? `new-${i}`} className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg bg-white">
              <div className="flex flex-col">
                <button onClick={() => move(i, -1)} disabled={i === 0} title="เลื่อนขึ้น" className="h-4 leading-none text-slate-400 hover:text-slate-700 disabled:opacity-30">▲</button>
                <button onClick={() => move(i, 1)} disabled={i === rows.length - 1} title="เลื่อนลง" className="h-4 leading-none text-slate-400 hover:text-slate-700 disabled:opacity-30">▼</button>
              </div>
              <input value={r.label} onChange={(e) => setRow(i, { label: e.target.value })} placeholder="ชื่อสถานะ เช่น ออกแบบ"
                className="flex-1 h-9 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <div className="inline-flex items-center gap-1">
                {COLORS.map((c) => (
                  <button key={c.key} onClick={() => setRow(i, { color: c.key })} title={c.label}
                    className={`w-6 h-6 rounded-full border-2 ${r.color === c.key ? "border-slate-700" : "border-transparent"}`}
                    style={{ backgroundColor: c.hex }} />
                ))}
              </div>
              <label className="inline-flex items-center gap-1 text-xs text-slate-500 cursor-pointer select-none whitespace-nowrap">
                <input type="checkbox" checked={r.is_terminal} onChange={(e) => setRow(i, { is_terminal: e.target.checked })} className="rounded border-slate-300" />
                ปิดงาน
              </label>
              <button onClick={() => removeRow(i)} title="ลบสถานะ" className="h-8 w-8 text-rose-500 hover:bg-rose-50 rounded-lg">🗑</button>
            </div>
          ))}
        </div>
      )}
    </ERPModal>
  );
}
