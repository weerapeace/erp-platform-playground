"use client";

// ============================================================
// CampaignCreateModal (ของกลางในโมดูล Creative) — ป๊อป "สร้างแคมเปญใหม่"
// ใช้ที่: หน้า /tasks/campaigns (ปุ่มสร้างแคมเปญ) และ Wizard สร้างงาน (ปุ่ม ＋ ใหม่ ข้างช่อง Campaign)
// บันทึกผ่าน /api/creative-campaigns (guardApi tasks.create + writeAudit) · ค่าเริ่มต้น: เห็นทั้งทีม + จำคนสร้าง
// สร้างเสร็จ → ใส่แคมเปญใหม่ลง cache "creative:campaigns" ให้ทุกหน้าเห็นทันที แล้วส่งกลับผ่าน onCreated
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { useT } from "@/components/i18n";
import { useSWRLite, mutateSWR, peekSWR } from "@/lib/swr-lite";
import { ERPModal } from "@/components/modal";
import { ERPFormSection, ERPFormField, ERPInput, ERPSelect, ERPTextarea } from "@/components/form";
import { UserPicker } from "@/components/pickers";
import type { UserPickerValue } from "@/components/pickers";
import { listBrands, createCampaign, type Campaign } from "../data";
import { listOptions, createOption, type Option } from "../use-options";

type FormState = { name: string; brand_id: string; category_id: string; objective: string; owner: UserPickerValue | null; start_date: string; end_date: string; note: string };
const EMPTY: FormState = { name: "", brand_id: "", category_id: "", objective: "", owner: null, start_date: "", end_date: "", note: "" };

function todayStr(): string { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }

export function CampaignCreateModal({ open, onClose, onCreated, pushToast, initial }: {
  open: boolean;
  onClose: () => void;
  /** แคมเปญที่เพิ่งสร้าง (มี id/ชื่อ/แบรนด์/หมวด) — ใช้เลือกเข้าช่องได้ทันที */
  onCreated?: (c: Campaign) => void;
  pushToast: (type: "success" | "error" | "info", m: string) => void;
  /** ค่าตั้งต้นตอนเปิด เช่น แบรนด์ที่เลือกไว้ใน Wizard */
  initial?: { name?: string; brand_id?: string | null };
}) {
  const t = useT();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [newCatOpen, setNewCatOpen] = useState(false);          // เพิ่มหมวดใหม่จากในฟอร์ม
  const [newCatLabel, setNewCatLabel] = useState("");
  const [catBusy, setCatBusy] = useState(false);

  // โหลดเฉพาะตอนเปิด (คีย์เดียวกับหน้าอื่น → เคยโหลดแล้วเห็นทันที)
  const brandsSWR = useSWRLite(open ? "creative:brands" : null, () => listBrands());
  const catsSWR = useSWRLite(open ? "creative:campaign_categories" : null, () => listOptions("campaign_category"));
  const brands = brandsSWR.data ?? [];
  const categories: Option[] = useMemo(() => (catsSWR.data ?? []).filter((o) => o.is_active !== false).sort((a, b) => a.sort_order - b.sort_order), [catsSWR.data]);

  useEffect(() => {
    if (!open) return;
    setForm({ ...EMPTY, name: initial?.name ?? "", brand_id: initial?.brand_id ?? "", start_date: todayStr() });
    setDirty(false); setFormErr(null); setNewCatOpen(false); setNewCatLabel("");
  }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps

  const update = (patch: Partial<FormState>) => { setForm((p) => ({ ...p, ...patch })); setDirty(true); };

  const save = async () => {
    if (saving) return;
    const name = form.name.trim();
    if (!name) { setFormErr(t("กรุณากรอกชื่อแคมเปญ", "Please enter a campaign name")); return; }
    setSaving(true); setFormErr(null);
    try {
      const { id } = await createCampaign({ name, brand_id: form.brand_id || null, category_id: form.category_id || null, objective: form.objective.trim() || null, owner_id: form.owner?.id ?? null, start_date: form.start_date || null, end_date: form.end_date || null, note: form.note.trim() || null });
      const brand = brands.find((b) => b.id === form.brand_id);
      const cat = categories.find((c) => c.id === form.category_id);
      const created: Campaign = {
        id, name, brand_id: form.brand_id || null, brand_label: brand?.name ?? null, brand_color: brand?.color ?? null,
        category_id: form.category_id || null, category_label: cat?.label ?? null, category_color: cat?.color ?? null, category_icon: cat?.icon ?? null,
        objective: form.objective.trim() || null, status: "active", start_date: form.start_date || null, end_date: form.end_date || null,
        owner_id: form.owner?.id ?? null, owner_label: form.owner?.name ?? null, note: form.note.trim() || null, visibility: "team",
      };
      // ใส่ลง cache กลาง → หน้า /tasks, แคมเปญ, คอนเทนต์ เห็นแคมเปญใหม่ทันทีโดยไม่ต้องรีเฟรช
      const cur = peekSWR<Campaign[]>("creative:campaigns");
      if (cur) mutateSWR<Campaign[]>("creative:campaigns", [created, ...cur.filter((c) => c.id !== id)]);
      setDirty(false);
      pushToast("success", t(`สร้างแคมเปญ "${name}" แล้ว`, `Campaign "${name}" created`));
      onCreated?.(created);
      onClose();
    } catch (e) {
      setFormErr((e as Error).message || t("สร้างแคมเปญไม่สำเร็จ กรุณาลองใหม่", "Could not create campaign, please try again"));
    } finally { setSaving(false); }
  };

  // เพิ่มหมวดใหม่จากในฟอร์ม (ไม่ต้องไปหน้า settings) → เลือกให้ทันที
  const addCategory = async () => {
    const label = newCatLabel.trim(); if (!label) return;
    setCatBusy(true);
    try {
      const o = await createOption("campaign_category", label);
      // ใส่เข้า cache ทันที (ไม่รอโหลดใหม่) → dropdown เห็นหมวดใหม่และเลือกให้เลย · แล้วค่อยโหลดสดเบื้องหลัง
      mutateSWR<Option[]>("creative:campaign_categories", [...(catsSWR.data ?? []).filter((x) => x.id !== o.id), o]);
      update({ category_id: o.id }); setNewCatLabel(""); setNewCatOpen(false);
      pushToast("success", t(`เพิ่มหมวด "${o.label}" แล้ว`, `Category "${o.label}" added`));
      void catsSWR.revalidate(true);
    }
    catch (e) { pushToast("error", (e as Error).message); } finally { setCatBusy(false); }
  };

  return (
    <ERPModal open={open} onClose={onClose} title={t("สร้างแคมเปญใหม่", "Create new campaign")} size="lg" hasUnsavedChanges={dirty}
      footer={<>
        <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button onClick={() => void save()} disabled={saving} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{saving ? t("กำลังบันทึก...", "Saving...") : t("สร้างแคมเปญ", "Create campaign")}</button>
      </>}>
      {formErr && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠️ {formErr}</div>}
      <ERPFormSection title={t("ข้อมูลแคมเปญ", "Campaign details")} columns={2}>
        <ERPFormField label={t("ชื่อแคมเปญ", "Campaign name")} required span={2}><ERPInput value={form.name} autoFocus onChange={(e) => update({ name: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void save(); } }} placeholder={t("เช่น Shopee 7.7 / เปิดตัว Heart Bag", "e.g. Shopee 7.7 / Heart Bag launch")} /></ERPFormField>
        <ERPFormField label={t("แบรนด์", "Brand")}><ERPSelect value={form.brand_id} options={[{ value: "", label: t("— ไม่ระบุ —", "— None —") }, ...brands.map((b) => ({ value: b.id, label: b.name })), ...(form.brand_id && !brands.some((b) => b.id === form.brand_id) ? [{ value: form.brand_id, label: t("(กำลังโหลด…)", "(loading…)") }] : [])]} onChange={(e) => update({ brand_id: e.target.value })} /></ERPFormField>
        <ERPFormField label={t("หมวดแคมเปญ", "Category")}>
          <div className="flex items-center gap-1.5">
            <div className="min-w-0 flex-1"><ERPSelect value={form.category_id} options={[{ value: "", label: t("— ยังไม่จัดหมวด —", "— Uncategorized —") }, ...categories.map((c) => ({ value: c.id, label: `${c.icon ? `${c.icon} ` : ""}${c.label}` })), ...(form.category_id && !categories.some((c) => c.id === form.category_id) ? [{ value: form.category_id, label: t("(หมวดใหม่)", "(new category)") }] : [])]} onChange={(e) => update({ category_id: e.target.value })} /></div>
            <button type="button" onClick={() => setNewCatOpen((o) => !o)} title={t("เพิ่มหมวดใหม่", "Add category")} className="h-9 shrink-0 rounded-lg border border-violet-200 bg-violet-50 px-2.5 text-xs font-medium text-violet-700 hover:bg-violet-100">＋ {t("หมวดใหม่", "New")}</button>
          </div>
          {newCatOpen && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <input value={newCatLabel} onChange={(e) => setNewCatLabel(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addCategory(); } }} placeholder={t("ชื่อหมวด เช่น โปรโมชัน / เปิดตัวสินค้า", "Category name")} className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 text-sm" autoFocus />
              <button type="button" onClick={() => void addCategory()} disabled={catBusy || !newCatLabel.trim()} className="h-9 rounded-lg bg-violet-600 px-3 text-xs font-medium text-white disabled:opacity-40">{catBusy ? "…" : t("เพิ่ม", "Add")}</button>
            </div>
          )}
        </ERPFormField>
        <ERPFormField label={t("ผู้ดูแลแคมเปญ", "Campaign owner")}><UserPicker value={form.owner} onChange={(v) => update({ owner: v })} disableCreate /></ERPFormField>
        <ERPFormField label={t("เริ่ม", "Start")}><ERPInput type="date" value={form.start_date} onChange={(e) => update({ start_date: e.target.value })} /></ERPFormField>
        <ERPFormField label={t("สิ้นสุด", "End")}><ERPInput type="date" value={form.end_date} onChange={(e) => update({ end_date: e.target.value })} /></ERPFormField>
        <ERPFormField label={t("วัตถุประสงค์", "Objective")} span={2}><ERPTextarea value={form.objective} rows={2} onChange={(e) => update({ objective: e.target.value })} placeholder={t("เป้าหมายของแคมเปญ", "Campaign goal")} /></ERPFormField>
        <ERPFormField label={t("หมายเหตุ", "Note")} span={2}><ERPTextarea value={form.note} rows={2} onChange={(e) => update({ note: e.target.value })} /></ERPFormField>
      </ERPFormSection>
    </ERPModal>
  );
}
