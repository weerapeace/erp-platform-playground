"use client";

// ============================================================
// Creative Campaigns — แคมเปญที่ครอบงาน creative
// ของกลาง: StandaloneShell, ERPModal, ConfirmDialog, ERPForm*, UserPicker
// ข้อมูลจาก /api/creative-campaigns (ดู app/tasks/data.ts)
// ============================================================

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/i18n";
import { useSWRLite } from "@/lib/swr-lite";
import { StandaloneShell } from "@/components/standalone-shell";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { ERPFormSection, ERPFormField, ERPInput, ERPSelect, ERPTextarea } from "@/components/form";
import { UserPicker } from "@/components/pickers";
import type { UserPickerValue } from "@/components/pickers";
import { CAMPAIGN_STATUS, CampaignDrawer } from "./campaign-drawer";
import {
  listCampaigns, createCampaign, deleteCampaign, listBrands,
  type Campaign,
} from "../data";

const CSTATUS = Object.fromEntries(CAMPAIGN_STATUS.map((s) => [s.value, s]));

type Toast = { id: number; type: "success" | "error" | "info"; message: string };

type FormState = { name: string; brand_id: string; objective: string; owner: UserPickerValue | null; start_date: string; end_date: string; note: string };
const EMPTY: FormState = { name: "", brand_id: "", objective: "", owner: null, start_date: "", end_date: "", note: "" };

export default function CampaignsPage() {
  const router = useRouter();
  const t = useT();
  const [modalOpen, setModalOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [delTarget, setDelTarget] = useState<Campaign | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback((type: Toast["type"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((p) => [...p, { id, type, message }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
  }, []);

  // ใช้ SWR คีย์เดียวกับหน้างาน → สลับ /tasks ↔ แคมเปญ ใช้ข้อมูลซ้ำ เห็นทันที
  const campaignsSWR = useSWRLite("creative:campaigns", () => listCampaigns());
  const brandsSWR = useSWRLite("creative:brands", () => listBrands());
  const campaigns = campaignsSWR.data ?? [];
  const brands = brandsSWR.data ?? [];
  const loading = campaignsSWR.loading;
  const load = useCallback(async () => { await campaignsSWR.revalidate(true); }, [campaignsSWR]);

  const update = (patch: Partial<FormState>) => { setForm((p) => ({ ...p, ...patch })); setDirty(true); };
  const openCreate = () => { setForm({ ...EMPTY, start_date: new Date().toISOString().slice(0, 10) }); setDirty(false); setFormErr(null); setModalOpen(true); };

  const save = async () => {
    if (!form.name.trim()) { setFormErr(t("กรุณากรอกชื่อแคมเปญ", "Please enter a campaign name")); return; }
    setSaving(true); setFormErr(null);
    try {
      await createCampaign({ name: form.name.trim(), brand_id: form.brand_id || null, objective: form.objective.trim() || null, owner_id: form.owner?.id ?? null, start_date: form.start_date || null, end_date: form.end_date || null, note: form.note.trim() || null });
      setModalOpen(false); setDirty(false); pushToast("success", t("สร้างแคมเปญแล้ว", "Campaign created")); await load();
    } catch (e) { setFormErr((e as Error).message); }
    finally { setSaving(false); }
  };

  const onDelete = async () => { if (!delTarget) return; try { await deleteCampaign(delTarget.id); pushToast("info", t("ลบแคมเปญแล้ว", "Campaign deleted")); await load(); } catch (e) { pushToast("error", (e as Error).message); } finally { setDelTarget(null); } };

  return (
    <StandaloneShell title={t("แคมเปญ Creative", "Creative Campaigns")} icon="📣" accent="violet">
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t("แคมเปญ Creative", "Creative Campaigns")}</h1>
            <p className="text-slate-500 mt-1">{t("ตัวครอบงาน — รวมงานถ่ายรูป/แต่งรูป/Banner/Content ของแต่ละแคมเปญไว้ด้วยกัน", "Campaign wrapper — groups photo, retouch, Banner, and Content tasks for each campaign")}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a href="/tasks" className="h-10 px-4 inline-flex items-center text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">← {t("งานทั้งหมด", "All tasks")}</a>
            <button onClick={openCreate} className="h-10 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700">＋ {t("สร้างแคมเปญ", "Create campaign")}</button>
          </div>
        </div>
      </div>

      <div className="px-8 py-6">
        {loading ? (
          <div className="py-20 text-center text-slate-400">{t("กำลังโหลด...", "Loading...")}</div>
        ) : campaigns.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <div className="text-4xl mb-3">📣</div>
            <p className="text-slate-600 font-medium">{t("ยังไม่มีแคมเปญ", "No campaigns yet")}</p>
            <p className="text-slate-400 text-sm mt-1">{t('สร้างแคมเปญเพื่อจัดกลุ่มงาน creative เช่น "Shopee 7.7" หรือ "เปิดตัวสินค้าใหม่"', 'Create a campaign to group creative tasks, e.g. "Shopee 7.7" or "New product launch"')}</p>
            <button onClick={openCreate} className="mt-4 h-9 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700">＋ {t("สร้างแคมเปญ", "Create campaign")}</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {campaigns.map((c) => {
              const st = CSTATUS[c.status] ?? CAMPAIGN_STATUS[1];
              return (
                <div key={c.id} onClick={() => router.push(`/tasks/campaigns/${c.id}`)} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:border-violet-300 hover:shadow cursor-pointer transition-colors">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${st.cls}`}>{st.label}</span>
                    <button onClick={(e) => { e.stopPropagation(); setDelTarget(c); }} className="text-xs text-slate-300 hover:text-red-500">{t("ลบ", "Delete")}</button>
                  </div>
                  <p className="text-base font-semibold text-slate-800 leading-snug line-clamp-2">{c.name}</p>
                  {c.objective && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{c.objective}</p>}
                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-3 flex-wrap">
                    {c.brand_label && <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: c.brand_color || "#cbd5e1" }} />{c.brand_label}</span>}
                    {(c.start_date || c.end_date) && <span>· 🗓 {c.start_date ?? "?"} → {c.end_date ?? "?"}</span>}
                    {c.owner_label && <span>· 👤 {c.owner_label}</span>}
                  </div>
                  <div className="mt-3 pt-2 border-t border-slate-100 flex items-center gap-2">
                    <button onClick={(e) => { e.stopPropagation(); setDetailId(c.id); }} className="text-xs font-medium text-violet-700 hover:underline">📋 {t("ดูรายละเอียด", "View details")}</button>
                    <button onClick={(e) => { e.stopPropagation(); router.push(`/tasks/campaigns/${c.id}`); }} className="text-xs font-medium text-slate-500 hover:text-violet-700">🟪 {t("เข้ากระดาน", "Open board")}</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* create modal */}
      <ERPModal open={modalOpen} onClose={() => setModalOpen(false)} title={t("สร้างแคมเปญใหม่", "Create new campaign")} size="lg" hasUnsavedChanges={dirty}
        footer={<>
          <button onClick={() => setModalOpen(false)} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
          <button onClick={save} disabled={saving} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{saving ? t("กำลังบันทึก...", "Saving...") : t("สร้างแคมเปญ", "Create campaign")}</button>
        </>}>
        {formErr && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠️ {formErr}</div>}
        <ERPFormSection title={t("ข้อมูลแคมเปญ", "Campaign details")} columns={2}>
          <ERPFormField label={t("ชื่อแคมเปญ", "Campaign name")} required span={2}><ERPInput value={form.name} onChange={(e) => update({ name: e.target.value })} placeholder={t("เช่น Shopee 7.7 / เปิดตัว Heart Bag", "e.g. Shopee 7.7 / Heart Bag launch")} /></ERPFormField>
          <ERPFormField label={t("แบรนด์", "Brand")}><ERPSelect value={form.brand_id} options={[{ value: "", label: t("— ไม่ระบุ —", "— None —") }, ...brands.map((b) => ({ value: b.id, label: b.name }))]} onChange={(e) => update({ brand_id: e.target.value })} /></ERPFormField>
          <ERPFormField label={t("ผู้ดูแลแคมเปญ", "Campaign owner")}><UserPicker value={form.owner} onChange={(v) => update({ owner: v })} disableCreate /></ERPFormField>
          <ERPFormField label={t("เริ่ม", "Start")}><ERPInput type="date" value={form.start_date} onChange={(e) => update({ start_date: e.target.value })} /></ERPFormField>
          <ERPFormField label={t("สิ้นสุด", "End")}><ERPInput type="date" value={form.end_date} onChange={(e) => update({ end_date: e.target.value })} /></ERPFormField>
          <ERPFormField label={t("วัตถุประสงค์", "Objective")} span={2}><ERPTextarea value={form.objective} rows={2} onChange={(e) => update({ objective: e.target.value })} placeholder={t("เป้าหมายของแคมเปญ", "Campaign goal")} /></ERPFormField>
          <ERPFormField label={t("หมายเหตุ", "Note")} span={2}><ERPTextarea value={form.note} rows={2} onChange={(e) => update({ note: e.target.value })} /></ERPFormField>
        </ERPFormSection>
      </ERPModal>

      <ConfirmDialog open={!!delTarget} onClose={() => setDelTarget(null)} onConfirm={onDelete}
        title={t("ลบแคมเปญ", "Delete campaign")} message={<span>{t("ต้องการลบ", "Delete")} <span className="font-semibold">{delTarget?.name}</span> {t("ใช่ไหม? (งานในแคมเปญจะไม่ถูกลบ แต่จะไม่ผูกกับแคมเปญนี้)", "? (Tasks in this campaign will not be deleted but will be unlinked from it)")}</span>}
        confirmText={t("ลบแคมเปญ", "Delete campaign")} variant="danger" />

      {detailId && <CampaignDrawer campaignId={detailId} onClose={() => setDetailId(null)} onChanged={load} pushToast={pushToast} />}

      <div className="fixed bottom-6 right-6 z-[70] flex flex-col gap-2">
        {toasts.map((t) => <div key={t.id} className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white ${t.type === "success" ? "bg-emerald-600" : t.type === "error" ? "bg-red-600" : "bg-slate-800"}`}><span>{t.type === "success" ? "✓" : t.type === "error" ? "⚠️" : "ℹ️"}</span>{t.message}</div>)}
      </div>
    </StandaloneShell>
  );
}
