"use client";

// ============================================================
// Creative Campaigns — แคมเปญที่ครอบงาน creative
// ของกลาง: StandaloneShell, ERPModal, ConfirmDialog, ERPForm*, EmployeePicker
// ข้อมูลจาก /api/creative-campaigns (ดู app/tasks/data.ts)
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { StandaloneShell } from "@/components/standalone-shell";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { ERPFormSection, ERPFormField, ERPInput, ERPSelect, ERPTextarea } from "@/components/form";
import { EmployeePicker } from "@/components/pickers";
import type { EmployeePickerValue } from "@/components/pickers";
import {
  STATUS_META,
  listCampaigns, createCampaign, getCampaign, updateCampaign, deleteCampaign, listBrands,
  type Campaign, type CampaignDetail, type BrandOption, type CreativeStatus,
} from "../data";

const CAMPAIGN_STATUS: { value: string; label: string; cls: string }[] = [
  { value: "planning", label: "วางแผน", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  { value: "active",   label: "กำลังทำ", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { value: "done",     label: "จบแล้ว",  cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "cancelled",label: "ยกเลิก",  cls: "bg-slate-100 text-slate-400 border-slate-200" },
];
const CSTATUS = Object.fromEntries(CAMPAIGN_STATUS.map((s) => [s.value, s]));

type Toast = { id: number; type: "success" | "error" | "info"; message: string };

type FormState = { name: string; brand_id: string; objective: string; owner: EmployeePickerValue | null; start_date: string; end_date: string; note: string };
const EMPTY: FormState = { name: "", brand_id: "", objective: "", owner: null, start_date: "", end_date: "", note: "" };

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [delTarget, setDelTarget] = useState<Campaign | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback((type: Toast["type"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((p) => [...p, { id, type, message }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
  }, []);

  const load = useCallback(async () => {
    try { setCampaigns(await listCampaigns()); } catch (e) { pushToast("error", (e as Error).message); }
  }, [pushToast]);

  useEffect(() => { (async () => { setLoading(true); await load(); try { setBrands(await listBrands()); } catch { /* ignore */ } setLoading(false); })(); }, [load]);

  const update = (patch: Partial<FormState>) => { setForm((p) => ({ ...p, ...patch })); setDirty(true); };
  const openCreate = () => { setForm({ ...EMPTY, start_date: new Date().toISOString().slice(0, 10) }); setDirty(false); setFormErr(null); setModalOpen(true); };

  const save = async () => {
    if (!form.name.trim()) { setFormErr("กรุณากรอกชื่อแคมเปญ"); return; }
    setSaving(true); setFormErr(null);
    try {
      await createCampaign({ name: form.name.trim(), brand_id: form.brand_id || null, objective: form.objective.trim() || null, owner_id: form.owner?.id ?? null, start_date: form.start_date || null, end_date: form.end_date || null, note: form.note.trim() || null });
      setModalOpen(false); setDirty(false); pushToast("success", "สร้างแคมเปญแล้ว"); await load();
    } catch (e) { setFormErr((e as Error).message); }
    finally { setSaving(false); }
  };

  const onDelete = async () => { if (!delTarget) return; try { await deleteCampaign(delTarget.id); pushToast("info", "ลบแคมเปญแล้ว"); await load(); } catch (e) { pushToast("error", (e as Error).message); } finally { setDelTarget(null); } };

  return (
    <StandaloneShell title="แคมเปญ Creative" icon="📣" accent="violet">
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">แคมเปญ Creative</h1>
            <p className="text-slate-500 mt-1">ตัวครอบงาน — รวมงานถ่ายรูป/แต่งรูป/Banner/Content ของแต่ละแคมเปญไว้ด้วยกัน</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a href="/tasks" className="h-10 px-4 inline-flex items-center text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">← งานทั้งหมด</a>
            <button onClick={openCreate} className="h-10 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700">＋ สร้างแคมเปญ</button>
          </div>
        </div>
      </div>

      <div className="px-8 py-6">
        {loading ? (
          <div className="py-20 text-center text-slate-400">กำลังโหลด...</div>
        ) : campaigns.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <div className="text-4xl mb-3">📣</div>
            <p className="text-slate-600 font-medium">ยังไม่มีแคมเปญ</p>
            <p className="text-slate-400 text-sm mt-1">สร้างแคมเปญเพื่อจัดกลุ่มงาน creative เช่น "Shopee 7.7" หรือ "เปิดตัวสินค้าใหม่"</p>
            <button onClick={openCreate} className="mt-4 h-9 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700">＋ สร้างแคมเปญ</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {campaigns.map((c) => {
              const st = CSTATUS[c.status] ?? CAMPAIGN_STATUS[1];
              return (
                <div key={c.id} onClick={() => setDetailId(c.id)} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:border-violet-300 hover:shadow cursor-pointer transition-colors">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${st.cls}`}>{st.label}</span>
                    <button onClick={(e) => { e.stopPropagation(); setDelTarget(c); }} className="text-xs text-slate-300 hover:text-red-500">ลบ</button>
                  </div>
                  <p className="text-base font-semibold text-slate-800 leading-snug line-clamp-2">{c.name}</p>
                  {c.objective && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{c.objective}</p>}
                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-3 flex-wrap">
                    {c.brand_label && <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: c.brand_color || "#cbd5e1" }} />{c.brand_label}</span>}
                    {(c.start_date || c.end_date) && <span>· 🗓 {c.start_date ?? "?"} → {c.end_date ?? "?"}</span>}
                    {c.owner_label && <span>· 👤 {c.owner_label}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* create modal */}
      <ERPModal open={modalOpen} onClose={() => setModalOpen(false)} title="สร้างแคมเปญใหม่" size="lg" hasUnsavedChanges={dirty}
        footer={<>
          <button onClick={() => setModalOpen(false)} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
          <button onClick={save} disabled={saving} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{saving ? "กำลังบันทึก..." : "สร้างแคมเปญ"}</button>
        </>}>
        {formErr && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠️ {formErr}</div>}
        <ERPFormSection title="ข้อมูลแคมเปญ" columns={2}>
          <ERPFormField label="ชื่อแคมเปญ" required span={2}><ERPInput value={form.name} onChange={(e) => update({ name: e.target.value })} placeholder="เช่น Shopee 7.7 / เปิดตัว Heart Bag" /></ERPFormField>
          <ERPFormField label="แบรนด์"><ERPSelect value={form.brand_id} options={[{ value: "", label: "— ไม่ระบุ —" }, ...brands.map((b) => ({ value: b.id, label: b.name }))]} onChange={(e) => update({ brand_id: e.target.value })} /></ERPFormField>
          <ERPFormField label="ผู้ดูแลแคมเปญ"><EmployeePicker value={form.owner} onChange={(v) => update({ owner: v })} disableCreate /></ERPFormField>
          <ERPFormField label="เริ่ม"><ERPInput type="date" value={form.start_date} onChange={(e) => update({ start_date: e.target.value })} /></ERPFormField>
          <ERPFormField label="สิ้นสุด"><ERPInput type="date" value={form.end_date} onChange={(e) => update({ end_date: e.target.value })} /></ERPFormField>
          <ERPFormField label="วัตถุประสงค์" span={2}><ERPTextarea value={form.objective} rows={2} onChange={(e) => update({ objective: e.target.value })} placeholder="เป้าหมายของแคมเปญ" /></ERPFormField>
          <ERPFormField label="หมายเหตุ" span={2}><ERPTextarea value={form.note} rows={2} onChange={(e) => update({ note: e.target.value })} /></ERPFormField>
        </ERPFormSection>
      </ERPModal>

      {detailId && <CampaignDrawer campaignId={detailId} onClose={() => setDetailId(null)} onChanged={load} pushToast={pushToast} />}

      <ConfirmDialog open={!!delTarget} onClose={() => setDelTarget(null)} onConfirm={onDelete}
        title="ลบแคมเปญ" message={<span>ต้องการลบ <span className="font-semibold">{delTarget?.name}</span> ใช่ไหม? (งานในแคมเปญจะไม่ถูกลบ แต่จะไม่ผูกกับแคมเปญนี้)</span>}
        confirmText="ลบแคมเปญ" variant="danger" />

      <div className="fixed bottom-6 right-6 z-[70] flex flex-col gap-2">
        {toasts.map((t) => <div key={t.id} className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white ${t.type === "success" ? "bg-emerald-600" : t.type === "error" ? "bg-red-600" : "bg-slate-800"}`}><span>{t.type === "success" ? "✓" : t.type === "error" ? "⚠️" : "ℹ️"}</span>{t.message}</div>)}
      </div>
    </StandaloneShell>
  );
}

// ============================================================
// Campaign detail drawer — ข้อมูลแคมเปญ + งานในแคมเปญ + แก้สถานะ
// ============================================================
function CampaignDrawer({ campaignId, onClose, onChanged, pushToast }: { campaignId: string; onClose: () => void; onChanged: () => void; pushToast: (type: Toast["type"], m: string) => void }) {
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const load = useCallback(async () => { try { setDetail(await getCampaign(campaignId)); } catch (e) { pushToast("error", (e as Error).message); } }, [campaignId, pushToast]);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (status: string) => { try { await updateCampaign(campaignId, { status }); await load(); onChanged(); pushToast("success", "อัปเดตสถานะแล้ว"); } catch (e) { pushToast("error", (e as Error).message); } };

  const summaryItems = useMemo(() => detail ? Object.entries(detail.summary).sort((a, b) => b[1] - a[1]) : [], [detail]);

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[600px] max-w-[95vw] bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200">
        {!detail ? (
          <div className="flex-1 flex items-center justify-center text-slate-400">กำลังโหลด...</div>
        ) : (
          <>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-slate-900 truncate">{detail.campaign.name}</h3>
                <span className="text-xs text-slate-500">{detail.task_count} งานในแคมเปญ</span>
              </div>
              <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div><p className="text-xs text-slate-400 mb-0.5">แบรนด์</p><p className="font-medium text-slate-800">{detail.campaign.brand_label || "—"}</p></div>
                <div><p className="text-xs text-slate-400 mb-0.5">ผู้ดูแล</p><p className="font-medium text-slate-800">{detail.campaign.owner_label || "—"}</p></div>
                <div><p className="text-xs text-slate-400 mb-0.5">ช่วงเวลา</p><p className="font-medium text-slate-800">{detail.campaign.start_date ?? "?"} → {detail.campaign.end_date ?? "?"}</p></div>
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">สถานะ</p>
                  <select value={detail.campaign.status} onChange={(e) => setStatus(e.target.value)} className="text-sm border border-slate-200 rounded-md px-2 py-1">
                    {CAMPAIGN_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              {detail.campaign.objective && <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600"><p className="text-xs text-slate-400 mb-1">วัตถุประสงค์</p>{detail.campaign.objective}</div>}

              {/* status summary */}
              {summaryItems.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">สรุปสถานะงาน</p>
                  <div className="flex flex-wrap gap-1.5">
                    {summaryItems.map(([st, n]) => { const m = STATUS_META[st as CreativeStatus] ?? STATUS_META.backlog; return <span key={st} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${m.cls}`}><span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />{m.label} {n}</span>; })}
                  </div>
                </div>
              )}

              {/* task list */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">งานในแคมเปญ ({detail.tasks.length})</p>
                {detail.tasks.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">ยังไม่มีงาน — สร้างงานแล้วเลือกแคมเปญนี้ในฟอร์ม</p>
                ) : (
                  <div className="space-y-1.5">
                    {detail.tasks.map((t) => { const m = STATUS_META[t.status] ?? STATUS_META.backlog; return (
                      <div key={t.id} className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2">
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${m.dot}`} />
                        <span className="text-sm text-slate-700 flex-1 line-clamp-1">{t.title}</span>
                        <span className="text-xs text-slate-400">{t.assignee_label || "—"}</span>
                        <span className="text-[11px] text-slate-400">{t.progress_percent}%</span>
                      </div>
                    ); })}
                  </div>
                )}
                <a href="/tasks" className="inline-block mt-3 text-sm text-violet-700 hover:underline">→ ไปที่ตารางงานทั้งหมด</a>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
