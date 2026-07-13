"use client";

/**
 * คู่มือ Flow งาน (/master/work-flows)
 * เฟส 1: ดู flow (เลือกงาน → การ์ดขั้นตอน + เก็บที่ไหน + กดลิงก์)
 * เฟส 2: โหมดแก้ไข (เพิ่ม/ลบ/แก้ งาน + ขั้นตอน + ที่เก็บ + ลิงก์) — เฉพาะผู้มีสิทธิ์ products.edit
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import type { WorkFlow, WorkFlowStep } from "@/app/api/work-flows/route";
import { WorkFlowSteps } from "@/components/work-flow-widget";

const KIND_OPTIONS = [
  { v: "module", label: "📋 โมดูลในแอป" },
  { v: "drive", label: "📁 Google Drive" },
  { v: "r2", label: "🗄️ คลังไฟล์กลาง" },
  { v: "attach", label: "📎 แนบในเอกสาร" },
  { v: "other", label: "📍 อื่นๆ" },
];

type StepDraft = Partial<WorkFlowStep> & { flow_id?: string };
type FlowDraft = Partial<WorkFlow>;
const post = (body: unknown) => apiFetch("/api/work-flows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const patch = (body: unknown) => apiFetch("/api/work-flows", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// ---------- ป๊อปอัปแก้ขั้นตอน ----------
function StepFormModal({ initial, onSave, onClose }: { initial: StepDraft; onSave: (d: StepDraft) => void; onClose: () => void }) {
  const [d, setD] = useState<StepDraft>({ storage_kind: "module", ...initial });
  const set = (k: keyof StepDraft, v: string) => setD((p) => ({ ...p, [k]: v }));
  const inCls = "w-full h-9 px-2 text-sm border border-slate-200 rounded-lg";
  return (
    <ERPModal open onClose={onClose} title={initial.id ? "แก้ไขขั้นตอน" : "＋ เพิ่มขั้นตอน"} size="md"
      footer={<div className="flex justify-end gap-2 w-full">
        <button onClick={onClose} className="h-9 px-4 text-sm rounded-lg border border-slate-200 text-slate-600">ยกเลิก</button>
        <button onClick={() => onSave(d)} className="h-9 px-4 text-sm rounded-lg bg-indigo-600 text-white font-medium">บันทึก</button>
      </div>}>
      <div className="space-y-3">
        <div className="flex gap-2">
          <label className="w-16"><span className="text-xs text-slate-500">ไอคอน</span>
            <input value={d.icon ?? ""} onChange={(e) => set("icon", e.target.value)} placeholder="📥" className={inCls + " text-center"} /></label>
          <label className="flex-1"><span className="text-xs text-slate-500">ชื่อขั้นตอน *</span>
            <input value={d.title ?? ""} onChange={(e) => set("title", e.target.value)} className={inCls} /></label>
        </div>
        <label className="block"><span className="text-xs text-slate-500">ไฟล์/ข้อมูลที่เกิด</span>
          <input value={d.files_note ?? ""} onChange={(e) => set("files_note", e.target.value)} placeholder="เช่น รูป preview" className={inCls} /></label>
        <div className="flex gap-2">
          <label className="w-40"><span className="text-xs text-slate-500">เก็บแบบ</span>
            <select value={d.storage_kind ?? "module"} onChange={(e) => set("storage_kind", e.target.value)} className={inCls + " bg-white"}>
              {KIND_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select></label>
          <label className="flex-1"><span className="text-xs text-slate-500">เก็บที่ไหน (ข้อความ)</span>
            <input value={d.storage_label ?? ""} onChange={(e) => set("storage_label", e.target.value)} placeholder="เช่น คลังไฟล์กลาง" className={inCls} /></label>
        </div>
        <label className="block"><span className="text-xs text-slate-500">ลิงก์ไปที่เก็บ (ไม่บังคับ)</span>
          <input value={d.link_url ?? ""} onChange={(e) => set("link_url", e.target.value)} placeholder="/master/assets หรือ https://..." className={inCls + " font-mono text-xs"} /></label>
        <p className="text-[11px] text-slate-400">ลิงก์ขึ้นต้น / = ไปหน้าในแอป · ขึ้นต้น http = เปิดแท็บใหม่ (เช่นโฟลเดอร์ Google Drive)</p>
      </div>
    </ERPModal>
  );
}

// ---------- ป๊อปอัปแก้งาน ----------
function FlowFormModal({ initial, onSave, onClose }: { initial: FlowDraft; onSave: (d: FlowDraft) => void; onClose: () => void }) {
  const [d, setD] = useState<FlowDraft>({ ...initial });
  const inCls = "w-full h-9 px-2 text-sm border border-slate-200 rounded-lg";
  return (
    <ERPModal open onClose={onClose} title={initial.id ? "แก้ไขงาน" : "＋ เพิ่มงาน"} size="sm"
      footer={<div className="flex justify-end gap-2 w-full">
        <button onClick={onClose} className="h-9 px-4 text-sm rounded-lg border border-slate-200 text-slate-600">ยกเลิก</button>
        <button onClick={() => onSave(d)} className="h-9 px-4 text-sm rounded-lg bg-indigo-600 text-white font-medium">บันทึก</button>
      </div>}>
      <div className="space-y-3">
        <div className="flex gap-2">
          <label className="w-16"><span className="text-xs text-slate-500">ไอคอน</span>
            <input value={d.icon ?? ""} onChange={(e) => setD((p) => ({ ...p, icon: e.target.value }))} placeholder="🎨" className={inCls + " text-center"} /></label>
          <label className="flex-1"><span className="text-xs text-slate-500">ชื่องาน *</span>
            <input value={d.name ?? ""} onChange={(e) => setD((p) => ({ ...p, name: e.target.value }))} className={inCls} /></label>
        </div>
        <label className="block"><span className="text-xs text-slate-500">คำอธิบายสั้น</span>
          <input value={d.description ?? ""} onChange={(e) => setD((p) => ({ ...p, description: e.target.value }))} className={inCls} /></label>
      </div>
    </ERPModal>
  );
}

export default function WorkFlowsGuidePage() {
  const { can } = useAuth();
  const toast = useToast();
  const canEdit = can("products.edit");
  const [flows, setFlows] = useState<WorkFlow[]>([]);
  const [sel, setSel] = useState("");
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState(false);
  const [stepModal, setStepModal] = useState<StepDraft | null>(null);
  const [flowModal, setFlowModal] = useState<FlowDraft | null>(null);

  const load = useCallback(async () => {
    const j = await apiFetch("/api/work-flows").then((r) => r.json()).catch(() => ({ data: [] }));
    const list = (j.data ?? []) as WorkFlow[];
    setFlows(list);
    setSel((prev) => (list.some((f) => f.flow_key === prev) ? prev : list[0]?.flow_key ?? ""));
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const cur = flows.find((f) => f.flow_key === sel);

  const saveStep = async (d: StepDraft) => {
    if (!d.title?.trim()) { toast.error("ใส่ชื่อขั้นตอน"); return; }
    try {
      if (d.id) await patch({ target: "step", id: d.id, patch: d });
      else { const n = (cur?.steps.length ?? 0) + 1; await post({ target: "step", ...d, flow_id: cur!.id, step_no: n, sort_order: n }); }
      setStepModal(null); toast.success("บันทึกแล้ว"); await load();
    } catch { toast.error("บันทึกไม่สำเร็จ"); }
  };
  const delStep = async (id: string) => { if (!window.confirm("ลบขั้นตอนนี้?")) return; await apiFetch(`/api/work-flows?target=step&id=${id}`, { method: "DELETE" }); await load(); };
  const moveStep = async (idx: number, dir: -1 | 1) => {
    if (!cur) return; const a = cur.steps[idx], b = cur.steps[idx + dir]; if (!a || !b) return;
    const aNo = a.step_no, bNo = b.step_no;
    await Promise.all([
      patch({ target: "step", id: a.id, patch: { sort_order: bNo, step_no: bNo } }),
      patch({ target: "step", id: b.id, patch: { sort_order: aNo, step_no: aNo } }),
    ]);
    await load();
  };
  const saveFlow = async (d: FlowDraft) => {
    if (!d.name?.trim()) { toast.error("ใส่ชื่องาน"); return; }
    try {
      if (d.id) await patch({ target: "flow", id: d.id, patch: d });
      else { const r = await post({ target: "flow", ...d, sort_order: flows.length + 1 }).then((x) => x.json()); if (r.data?.flow_key) setSel(r.data.flow_key); }
      setFlowModal(null); toast.success("บันทึกแล้ว"); await load();
    } catch { toast.error("บันทึกไม่สำเร็จ"); }
  };
  const delFlow = async (f: WorkFlow) => { if (!window.confirm(`ลบงาน "${f.name}" และทุกขั้นตอน?`)) return; await apiFetch(`/api/work-flows?target=flow&id=${f.id}`, { method: "DELETE" }); setSel(""); await load(); };

  return (
    <div className="max-w-[1200px] mx-auto px-5 py-5">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-lg font-semibold text-slate-800">🗺️ คู่มือ Flow งาน</h1>
          <p className="text-sm text-slate-500">เลือกงาน → ดูว่าแต่ละขั้นตอนเก็บไฟล์/ข้อมูลอะไร ไว้ที่ไหน · กดป้าย “เก็บที่” เพื่อเปิดที่นั่น</p>
        </div>
        {canEdit && (
          <button onClick={() => setEdit((e) => !e)}
            className={`h-9 px-4 text-sm rounded-lg border ${edit ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
            {edit ? "✓ เสร็จแล้ว" : "✏️ แก้ไขคู่มือ"}
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 py-10 text-center">กำลังโหลด…</div>
      ) : (
        <div className="mt-4">
          {/* แท็บงาน */}
          <div className="flex gap-2 flex-wrap mb-5 items-center">
            {flows.map((f) => (
              <button key={f.flow_key} onClick={() => setSel(f.flow_key)}
                className={`px-3.5 py-1.5 rounded-full text-sm border transition-colors ${sel === f.flow_key
                  ? "bg-indigo-50 text-indigo-700 border-indigo-200 font-medium" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"}`}>
                {f.icon} {f.name}
              </button>
            ))}
            {edit && <button onClick={() => setFlowModal({})} className="px-3 py-1.5 rounded-full text-sm border border-dashed border-indigo-300 text-indigo-600 hover:bg-indigo-50">＋ เพิ่มงาน</button>}
          </div>

          {flows.length === 0 && <div className="text-sm text-slate-400 py-10 text-center">ยังไม่มีงาน — กด “＋ เพิ่มงาน”</div>}

          {cur && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                {cur.description && <p className="text-sm text-slate-500">{cur.description}</p>}
                {edit && (
                  <div className="flex gap-1 ml-auto">
                    <button onClick={() => setFlowModal(cur)} className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50">✏️ แก้งาน</button>
                    <button onClick={() => delFlow(cur)} className="text-xs px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50">🗑 ลบงาน</button>
                  </div>
                )}
              </div>

              {!edit ? (
                <WorkFlowSteps steps={cur.steps} />
              ) : (
                <div className="space-y-2">
                  {cur.steps.map((s, i) => (
                    <div key={s.id} className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
                      <div className="flex flex-col">
                        <button onClick={() => moveStep(i, -1)} disabled={i === 0} className="text-slate-400 hover:text-indigo-600 disabled:opacity-30 leading-none">▲</button>
                        <button onClick={() => moveStep(i, 1)} disabled={i === cur.steps.length - 1} className="text-slate-400 hover:text-indigo-600 disabled:opacity-30 leading-none">▼</button>
                      </div>
                      <span className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 text-xs flex items-center justify-center shrink-0">{s.step_no}</span>
                      <span className="text-lg">{s.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">{s.title}</div>
                        <div className="text-xs text-slate-400 truncate">{s.storage_label} {s.link_url ? `· ${s.link_url}` : ""}</div>
                      </div>
                      <button onClick={() => setStepModal(s)} className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50">✏️</button>
                      <button onClick={() => delStep(s.id)} className="text-xs px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50">🗑</button>
                    </div>
                  ))}
                  <button onClick={() => setStepModal({ flow_id: cur.id, storage_kind: "module" })}
                    className="w-full py-2 text-sm rounded-lg border border-dashed border-indigo-300 text-indigo-600 hover:bg-indigo-50">＋ เพิ่มขั้นตอน</button>
                </div>
              )}

              {!edit && (
                <div className="flex gap-4 flex-wrap mt-5 text-xs text-slate-400">
                  <span>📋 โมดูลในแอป</span><span>📁 Google Drive</span><span>🗄️ คลังไฟล์กลาง</span><span>📎 แนบในเอกสาร</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {stepModal && <StepFormModal initial={stepModal} onSave={saveStep} onClose={() => setStepModal(null)} />}
      {flowModal && <FlowFormModal initial={flowModal} onSave={saveFlow} onClose={() => setFlowModal(null)} />}
    </div>
  );
}
