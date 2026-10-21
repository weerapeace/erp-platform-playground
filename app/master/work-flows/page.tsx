"use client";

/**
 * คู่มือ Flow งาน (/master/work-flows)
 * เฟส 1: ดู flow (เลือกงาน → การ์ดขั้นตอน + เก็บที่ไหน + กดลิงก์)
 * เฟส 2: โหมดแก้ไข (เพิ่ม/ลบ/แก้ งาน + ขั้นตอน + ที่เก็บ + ลิงก์) — เฉพาะผู้มีสิทธิ์ products.edit
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { tr } from "@/lib/lang";
import { useT } from "@/components/i18n";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import type { WorkFlow, WorkFlowStep } from "@/app/api/work-flows/route";
import { WorkFlowSteps } from "@/components/work-flow-widget";

const KIND_OPTIONS = [
  { v: "module", get label() { return tr("📋 โมดูลในแอป", "📋 App module"); } },
  { v: "drive", label: "📁 Google Drive" },
  { v: "r2", get label() { return tr("🗄️ คลังไฟล์กลาง", "🗄️ Central file library"); } },
  { v: "attach", get label() { return tr("📎 แนบในเอกสาร", "📎 Attached to document"); } },
  { v: "other", get label() { return tr("📍 อื่นๆ", "📍 Other"); } },
];

type StepDraft = Partial<WorkFlowStep> & { flow_id?: string };
type FlowDraft = Partial<WorkFlow>;
const post = (body: unknown) => apiFetch("/api/work-flows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const patch = (body: unknown) => apiFetch("/api/work-flows", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// ---------- ป๊อปอัปแก้ขั้นตอน ----------
function StepFormModal({ initial, onSave, onClose }: { initial: StepDraft; onSave: (d: StepDraft) => void; onClose: () => void }) {
  const t = useT();
  const [d, setD] = useState<StepDraft>({ storage_kind: "module", ...initial });
  const set = (k: keyof StepDraft, v: string) => setD((p) => ({ ...p, [k]: v }));
  const inCls = "w-full h-9 px-2 text-sm border border-slate-200 rounded-lg";
  return (
    <ERPModal open onClose={onClose} title={initial.id ? t("แก้ไขขั้นตอน", "Edit step") : t("＋ เพิ่มขั้นตอน", "＋ Add step")} size="md"
      footer={<div className="flex justify-end gap-2 w-full">
        <button onClick={onClose} className="h-9 px-4 text-sm rounded-lg border border-slate-200 text-slate-600">{t("ยกเลิก", "Cancel")}</button>
        <button onClick={() => onSave(d)} className="h-9 px-4 text-sm rounded-lg bg-indigo-600 text-white font-medium">{t("บันทึก", "Save")}</button>
      </div>}>
      <div className="space-y-3">
        <div className="flex gap-2">
          <label className="w-16"><span className="text-xs text-slate-500">{t("ไอคอน", "Icon")}</span>
            <input value={d.icon ?? ""} onChange={(e) => set("icon", e.target.value)} placeholder="📥" className={inCls + " text-center"} /></label>
          <label className="flex-1"><span className="text-xs text-slate-500">{t("ชื่อขั้นตอน", "Step name")} *</span>
            <input value={d.title ?? ""} onChange={(e) => set("title", e.target.value)} className={inCls} /></label>
        </div>
        <label className="block"><span className="text-xs text-slate-500">{t("ไฟล์/ข้อมูลที่เกิด", "Files/data produced")}</span>
          <input value={d.files_note ?? ""} onChange={(e) => set("files_note", e.target.value)} placeholder={t("เช่น รูป preview", "e.g. preview image")} className={inCls} /></label>
        <div className="flex gap-2">
          <label className="w-40"><span className="text-xs text-slate-500">{t("เก็บแบบ", "Stored as")}</span>
            <select value={d.storage_kind ?? "module"} onChange={(e) => set("storage_kind", e.target.value)} className={inCls + " bg-white"}>
              {KIND_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select></label>
          <label className="flex-1"><span className="text-xs text-slate-500">{t("เก็บที่ไหน (ข้อความ)", "Stored where (text)")}</span>
            <input value={d.storage_label ?? ""} onChange={(e) => set("storage_label", e.target.value)} placeholder={t("เช่น คลังไฟล์กลาง", "e.g. Central file library")} className={inCls} /></label>
        </div>
        <label className="block"><span className="text-xs text-slate-500">{t("ลิงก์ไปที่เก็บ (ไม่บังคับ)", "Link to storage (optional)")}</span>
          <input value={d.link_url ?? ""} onChange={(e) => set("link_url", e.target.value)} placeholder={t("/master/assets หรือ https://...", "/master/assets or https://...")} className={inCls + " font-mono text-xs"} /></label>
        <p className="text-[11px] text-slate-400">{t("ลิงก์ขึ้นต้น / = ไปหน้าในแอป · ขึ้นต้น http = เปิดแท็บใหม่ (เช่นโฟลเดอร์ Google Drive)", "Links starting with / open an app page · starting with http open a new tab (e.g. a Google Drive folder)")}</p>
      </div>
    </ERPModal>
  );
}

// ---------- ป๊อปอัปแก้งาน ----------
function FlowFormModal({ initial, onSave, onClose }: { initial: FlowDraft; onSave: (d: FlowDraft) => void; onClose: () => void }) {
  const t = useT();
  const [d, setD] = useState<FlowDraft>({ ...initial });
  const inCls = "w-full h-9 px-2 text-sm border border-slate-200 rounded-lg";
  return (
    <ERPModal open onClose={onClose} title={initial.id ? t("แก้ไขงาน", "Edit job") : t("＋ เพิ่มงาน", "＋ Add job")} size="sm"
      footer={<div className="flex justify-end gap-2 w-full">
        <button onClick={onClose} className="h-9 px-4 text-sm rounded-lg border border-slate-200 text-slate-600">{t("ยกเลิก", "Cancel")}</button>
        <button onClick={() => onSave(d)} className="h-9 px-4 text-sm rounded-lg bg-indigo-600 text-white font-medium">{t("บันทึก", "Save")}</button>
      </div>}>
      <div className="space-y-3">
        <div className="flex gap-2">
          <label className="w-16"><span className="text-xs text-slate-500">{t("ไอคอน", "Icon")}</span>
            <input value={d.icon ?? ""} onChange={(e) => setD((p) => ({ ...p, icon: e.target.value }))} placeholder="🎨" className={inCls + " text-center"} /></label>
          <label className="flex-1"><span className="text-xs text-slate-500">{t("ชื่องาน", "Job name")} *</span>
            <input value={d.name ?? ""} onChange={(e) => setD((p) => ({ ...p, name: e.target.value }))} className={inCls} /></label>
        </div>
        <label className="block"><span className="text-xs text-slate-500">{t("คำอธิบายสั้น", "Short description")}</span>
          <input value={d.description ?? ""} onChange={(e) => setD((p) => ({ ...p, description: e.target.value }))} className={inCls} /></label>
      </div>
    </ERPModal>
  );
}

export default function WorkFlowsGuidePage() {
  const t = useT();
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
    if (!d.title?.trim()) { toast.error(t("ใส่ชื่อขั้นตอน", "Enter a step name")); return; }
    try {
      if (d.id) await patch({ target: "step", id: d.id, patch: d });
      else { const n = (cur?.steps.length ?? 0) + 1; await post({ target: "step", ...d, flow_id: cur!.id, step_no: n, sort_order: n }); }
      setStepModal(null); toast.success(t("บันทึกแล้ว", "Saved")); await load();
    } catch { toast.error(t("บันทึกไม่สำเร็จ", "Couldn't save")); }
  };
  const delStep = async (id: string) => { if (!window.confirm(t("ลบขั้นตอนนี้?", "Delete this step?"))) return; await apiFetch(`/api/work-flows?target=step&id=${id}`, { method: "DELETE" }); await load(); };
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
    if (!d.name?.trim()) { toast.error(t("ใส่ชื่องาน", "Enter a job name")); return; }
    try {
      if (d.id) await patch({ target: "flow", id: d.id, patch: d });
      else { const r = await post({ target: "flow", ...d, sort_order: flows.length + 1 }).then((x) => x.json()); if (r.data?.flow_key) setSel(r.data.flow_key); }
      setFlowModal(null); toast.success(t("บันทึกแล้ว", "Saved")); await load();
    } catch { toast.error(t("บันทึกไม่สำเร็จ", "Couldn't save")); }
  };
  const delFlow = async (f: WorkFlow) => { if (!window.confirm(t(`ลบงาน "${f.name}" และทุกขั้นตอน?`, `Delete job "${f.name}" and all its steps?`))) return; await apiFetch(`/api/work-flows?target=flow&id=${f.id}`, { method: "DELETE" }); setSel(""); await load(); };

  return (
    <div className="max-w-[1200px] mx-auto px-5 py-5">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-lg font-semibold text-slate-800">🗺️ {t("คู่มือ Flow งาน", "Work flow guide")}</h1>
          <p className="text-sm text-slate-500">{t("เลือกงาน → ดูว่าแต่ละขั้นตอนเก็บไฟล์/ข้อมูลอะไร ไว้ที่ไหน · กดป้าย “เก็บที่” เพื่อเปิดที่นั่น", "Pick a job → see which files/data each step keeps and where · click a “Stored at” tag to open it")}</p>
        </div>
        {canEdit && (
          <button onClick={() => setEdit((e) => !e)}
            className={`h-9 px-4 text-sm rounded-lg border ${edit ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
            {edit ? t("✓ เสร็จแล้ว", "✓ Done") : t("✏️ แก้ไขคู่มือ", "✏️ Edit guide")}
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 py-10 text-center">{t("กำลังโหลด…", "Loading…")}</div>
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
            {edit && <button onClick={() => setFlowModal({})} className="px-3 py-1.5 rounded-full text-sm border border-dashed border-indigo-300 text-indigo-600 hover:bg-indigo-50">＋ {t("เพิ่มงาน", "Add job")}</button>}
          </div>

          {flows.length === 0 && <div className="text-sm text-slate-400 py-10 text-center">{t("ยังไม่มีงาน — กด “＋ เพิ่มงาน”", "No jobs yet — press “＋ Add job”")}</div>}

          {cur && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                {cur.description && <p className="text-sm text-slate-500">{cur.description}</p>}
                {edit && (
                  <div className="flex gap-1 ml-auto">
                    <button onClick={() => setFlowModal(cur)} className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50">✏️ {t("แก้งาน", "Edit job")}</button>
                    <button onClick={() => delFlow(cur)} className="text-xs px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50">🗑 {t("ลบงาน", "Delete job")}</button>
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
                    className="w-full py-2 text-sm rounded-lg border border-dashed border-indigo-300 text-indigo-600 hover:bg-indigo-50">＋ {t("เพิ่มขั้นตอน", "Add step")}</button>
                </div>
              )}

              {!edit && (
                <div className="flex gap-4 flex-wrap mt-5 text-xs text-slate-400">
                  <span>📋 {t("โมดูลในแอป", "App module")}</span><span>📁 Google Drive</span><span>🗄️ {t("คลังไฟล์กลาง", "Central file library")}</span><span>📎 {t("แนบในเอกสาร", "Attached to document")}</span>
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
