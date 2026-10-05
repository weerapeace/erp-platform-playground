"use client";

// ============================================================
// Creative Campaigns — แคมเปญที่ครอบงาน creative
// ของกลาง: StandaloneShell, ERPModal, ConfirmDialog, ERPForm*, UserPicker
// ข้อมูลจาก /api/creative-campaigns (ดู app/tasks/data.ts)
// ============================================================

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/i18n";
import { useSWRLite, mutateSWR } from "@/lib/swr-lite";
import { StandaloneShell } from "@/components/standalone-shell";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { ERPFormSection, ERPFormField, ERPInput, ERPSelect, ERPTextarea } from "@/components/form";
import { UserPicker } from "@/components/pickers";
import type { UserPickerValue } from "@/components/pickers";
import { CAMPAIGN_STATUS, CampaignDrawer } from "./campaign-drawer";
import {
  listCampaigns, createCampaign, updateCampaign, deleteCampaign, listBrands,
  type Campaign,
} from "../data";
import { listOptions, createOption, type Option } from "../use-options";

const NO_CAT = "__none__";   // ตัวกรอง/กลุ่ม "ยังไม่จัดหมวด"

const CSTATUS = Object.fromEntries(CAMPAIGN_STATUS.map((s) => [s.value, s]));

type Toast = { id: number; type: "success" | "error" | "info"; message: string };

type FormState = { name: string; brand_id: string; category_id: string; objective: string; owner: UserPickerValue | null; start_date: string; end_date: string; note: string };
const EMPTY: FormState = { name: "", brand_id: "", category_id: "", objective: "", owner: null, start_date: "", end_date: "", note: "" };

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
  const [catFilter, setCatFilter] = useState<string>("");      // "" = ทุกหมวด · NO_CAT = ยังไม่จัดหมวด · id = หมวดนั้น
  const [newCatOpen, setNewCatOpen] = useState(false);          // เพิ่มหมวดใหม่จากในฟอร์มสร้างแคมเปญ
  const [newCatLabel, setNewCatLabel] = useState("");
  const [catBusy, setCatBusy] = useState(false);
  // โหมด "🗂 จัดหมวด": ติ๊กเลือกหลายแคมเปญ → ย้ายเข้าหมวดทีเดียว · หรือเปลี่ยนหมวดรายใบจาก dropdown บนการ์ด
  const [manage, setManage] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCat, setBulkCat] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);

  const pushToast = useCallback((type: Toast["type"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((p) => [...p, { id, type, message }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
  }, []);

  // ใช้ SWR คีย์เดียวกับหน้างาน → สลับ /tasks ↔ แคมเปญ ใช้ข้อมูลซ้ำ เห็นทันที
  const campaignsSWR = useSWRLite("creative:campaigns", () => listCampaigns());
  const brandsSWR = useSWRLite("creative:brands", () => listBrands());
  // หมวดแคมเปญ (ของกลาง creative-options kind=campaign_category · เพิ่ม/แก้/เรียงที่ /tasks/settings → 📁 หมวดแคมเปญ)
  const catsSWR = useSWRLite("creative:campaign_categories", () => listOptions("campaign_category"));
  const categories: Option[] = useMemo(() => (catsSWR.data ?? []).filter((o) => o.is_active !== false).sort((a, b) => a.sort_order - b.sort_order), [catsSWR.data]);
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
      await createCampaign({ name: form.name.trim(), brand_id: form.brand_id || null, category_id: form.category_id || null, objective: form.objective.trim() || null, owner_id: form.owner?.id ?? null, start_date: form.start_date || null, end_date: form.end_date || null, note: form.note.trim() || null });
      setModalOpen(false); setDirty(false); pushToast("success", t("สร้างแคมเปญแล้ว", "Campaign created")); await load();
    } catch (e) { setFormErr((e as Error).message); }
    finally { setSaving(false); }
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

  // สร้างหมวดใหม่จากแถบย้าย (ไม่เลือกเข้าฟอร์ม) → คืน id
  const createCatQuick = async (): Promise<string | null> => {
    const label = window.prompt(t("ชื่อหมวดใหม่", "New category name")) ?? "";
    if (!label.trim()) return null;
    try {
      const o = await createOption("campaign_category", label.trim());
      mutateSWR<Option[]>("creative:campaign_categories", [...(catsSWR.data ?? []).filter((x) => x.id !== o.id), o]);
      void catsSWR.revalidate(true);
      pushToast("success", t(`เพิ่มหมวด "${o.label}" แล้ว`, `Category "${o.label}" added`)); return o.id;
    }
    catch (e) { pushToast("error", (e as Error).message); return null; }
  };
  // เปลี่ยนหมวดรายใบ (จาก dropdown บนการ์ด) — บันทึกทันที
  const moveOne = async (c: Campaign, categoryId: string) => {
    setMovingId(c.id);
    try { await updateCampaign(c.id, { category_id: categoryId || null }); await load(); pushToast("success", t("ย้ายหมวดแล้ว", "Moved")); }
    catch (e) { pushToast("error", (e as Error).message); } finally { setMovingId(null); }
  };
  // ย้ายหลายใบที่ติ๊กไว้ → หมวดเดียวกัน (ทีละใบ ไม่ยิงพร้อมกัน)
  const moveSelected = async () => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    let ok = 0;
    for (const id of selected) { try { await updateCampaign(id, { category_id: bulkCat || null }); ok++; } catch (e) { pushToast("error", (e as Error).message); } }
    setBulkBusy(false); setSelected(new Set());
    await load();
    if (ok) pushToast("success", t(`ย้าย ${ok} แคมเปญแล้ว`, `Moved ${ok} campaigns`));
  };
  const toggleSel = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const exitManage = () => { setManage(false); setSelected(new Set()); };

  // จัดกลุ่มแคมเปญตามหมวด (เรียงตามลำดับหมวด · "ยังไม่จัดหมวด" ท้ายสุด) + ตัวกรอง
  const groups = useMemo(() => {
    const byCat = new Map<string, Campaign[]>();
    for (const c of campaigns) { const k = c.category_id ?? NO_CAT; const arr = byCat.get(k) ?? []; arr.push(c); byCat.set(k, arr); }
    const out: { key: string; label: string; icon: string | null; color: string | null; items: Campaign[] }[] = [];
    for (const cat of categories) { const items = byCat.get(cat.id) ?? []; if (items.length) out.push({ key: cat.id, label: cat.label, icon: cat.icon ?? null, color: cat.color ?? null, items }); byCat.delete(cat.id); }
    // หมวดที่ถูกปิดใช้แล้วแต่ยังมีแคมเปญค้าง → โชว์ด้วยชื่อจากแคมเปญ (ไม่หาย)
    for (const [k, items] of byCat) if (k !== NO_CAT) out.push({ key: k, label: items[0].category_label ?? t("หมวดเดิม", "Former category"), icon: items[0].category_icon ?? null, color: items[0].category_color ?? null, items });
    const none = byCat.get(NO_CAT) ?? [];
    if (none.length) out.push({ key: NO_CAT, label: t("ยังไม่จัดหมวด", "Uncategorized"), icon: null, color: null, items: none });
    return catFilter ? out.filter((g) => g.key === catFilter) : out;
  }, [campaigns, categories, catFilter, t]);

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
            <button onClick={() => (manage ? exitManage() : setManage(true))} title={t("ติ๊กเลือกแคมเปญแล้วย้ายเข้าหมวด / เปลี่ยนหมวดรายใบ", "Select campaigns and move them into a category")}
              className={`h-10 px-4 inline-flex items-center text-sm font-medium rounded-lg border ${manage ? "bg-violet-100 border-violet-300 text-violet-800" : "border-violet-200 text-violet-700 hover:bg-violet-50"}`}>{manage ? `✕ ${t("เสร็จแล้ว", "Done")}` : `🗂 ${t("จัดหมวด", "Organize")}`}</button>
            <button onClick={openCreate} className="h-10 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700">＋ {t("สร้างแคมเปญ", "Create campaign")}</button>
          </div>
        </div>
      </div>

      <div className={`px-8 py-6 ${manage ? "pb-28" : ""}`}>
        {loading ? (
          <div className="py-20 text-center text-slate-400">{t("กำลังโหลด...", "Loading...")}</div>
        ) : campaignsSWR.error && campaigns.length === 0 ? (
          <div className="bg-white rounded-xl border border-red-200 p-12 text-center">
            <div className="text-4xl mb-3">⚠️</div>
            <p className="text-slate-700 font-medium">{t("โหลดข้อมูลไม่สำเร็จ", "Failed to load")}</p>
            <p className="text-slate-400 text-sm mt-1">{t("เชื่อมต่อไม่ได้หรือเครือข่ายมีปัญหา", "Connection or network problem")}</p>
            <button onClick={() => void load()} className="mt-4 h-9 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700">↻ {t("ลองใหม่", "Retry")}</button>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <div className="text-4xl mb-3">📣</div>
            <p className="text-slate-600 font-medium">{t("ยังไม่มีแคมเปญ", "No campaigns yet")}</p>
            <p className="text-slate-400 text-sm mt-1">{t('สร้างแคมเปญเพื่อจัดกลุ่มงาน creative เช่น "Shopee 7.7" หรือ "เปิดตัวสินค้าใหม่"', 'Create a campaign to group creative tasks, e.g. "Shopee 7.7" or "New product launch"')}</p>
            <button onClick={openCreate} className="mt-4 h-9 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700">＋ {t("สร้างแคมเปญ", "Create campaign")}</button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* ตัวกรองหมวด */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" onClick={() => setCatFilter("")} className={`h-8 rounded-full border px-3 text-xs font-medium ${catFilter === "" ? "border-violet-600 bg-violet-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{t("ทุกหมวด", "All")} <span className="opacity-60">{campaigns.length}</span></button>
              {categories.map((cat) => { const n = campaigns.filter((c) => c.category_id === cat.id).length; return (
                <button key={cat.id} type="button" onClick={() => setCatFilter(catFilter === cat.id ? "" : cat.id)} className={`h-8 rounded-full border px-3 text-xs font-medium ${catFilter === cat.id ? "border-violet-600 bg-violet-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                  {cat.icon ? `${cat.icon} ` : ""}{cat.label} <span className="opacity-60">{n}</span></button>); })}
              {campaigns.some((c) => !c.category_id) && (
                <button type="button" onClick={() => setCatFilter(catFilter === NO_CAT ? "" : NO_CAT)} className={`h-8 rounded-full border border-dashed px-3 text-xs font-medium ${catFilter === NO_CAT ? "border-violet-600 bg-violet-600 text-white" : "border-slate-300 bg-white text-slate-500 hover:bg-slate-50"}`}>{t("ยังไม่จัดหมวด", "Uncategorized")} <span className="opacity-60">{campaigns.filter((c) => !c.category_id).length}</span></button>
              )}
              <a href="/tasks/settings" className="ml-auto text-xs text-violet-700 hover:underline">⚙️ {t("จัดการหมวด", "Manage categories")}</a>
            </div>

            {groups.length === 0 && <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-400">{t("ไม่มีแคมเปญในหมวดนี้", "No campaigns in this category")}</div>}
            {groups.map((g) => (
            <section key={g.key}>
              <div className="mb-2 flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: g.color || "#cbd5e1" }} />
                <h2 className="text-sm font-semibold text-slate-800">{g.icon ? `${g.icon} ` : ""}{g.label}</h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{g.items.length}</span>
              </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {g.items.map((c) => {
              const st = CSTATUS[c.status] ?? CAMPAIGN_STATUS[1];
              return (
                <div key={c.id} onClick={() => (manage ? toggleSel(c.id) : router.push(`/tasks/campaigns/${c.id}`))}
                  className={`bg-white rounded-xl border p-4 shadow-sm hover:shadow cursor-pointer transition-colors ${manage && selected.has(c.id) ? "border-violet-500 ring-2 ring-violet-200" : "border-slate-200 hover:border-violet-300"}`}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5">
                      {manage && <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSel(c.id)} onClick={(e) => e.stopPropagation()} className="h-4 w-4 accent-violet-600" />}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${st.cls}`}>{st.label()}</span>
                      {c.visibility === "private" && <span title={t("ส่วนตัว — เห็นเฉพาะเจ้าของ", "Private")} className="text-xs">🔒</span>}
                      {c.visibility === "shared" && <span title={t("แชร์เฉพาะคนที่เลือก", "Shared")} className="text-xs">🔗</span>}
                    </div>
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
                    {manage ? (
                      /* โหมดจัดหมวด: เปลี่ยนหมวดรายใบได้เลย */
                      <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-slate-500" onClick={(e) => e.stopPropagation()}>
                        <span className="shrink-0">📁</span>
                        <select value={c.category_id ?? ""} disabled={movingId === c.id} onChange={(e) => void moveOne(c, e.target.value)}
                          className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 disabled:opacity-50">
                          <option value="">{t("— ยังไม่จัดหมวด —", "— Uncategorized —")}</option>
                          {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.icon ? `${cat.icon} ` : ""}{cat.label}</option>)}
                        </select>
                        {movingId === c.id && <span className="text-[10px] text-slate-400">…</span>}
                      </label>
                    ) : (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); setDetailId(c.id); }} className="text-xs font-medium text-violet-700 hover:underline">📋 {t("ดูรายละเอียด", "View details")}</button>
                        <button onClick={(e) => { e.stopPropagation(); router.push(`/tasks/campaigns/${c.id}`); }} className="text-xs font-medium text-slate-500 hover:text-violet-700">🟪 {t("เข้ากระดาน", "Open board")}</button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
            </section>
            ))}
          </div>
        )}
      </div>

      {/* แถบย้ายหลายใบ (โหมดจัดหมวด) */}
      {manage && (
        <div className="fixed inset-x-0 bottom-0 z-[60] border-t border-violet-200 bg-white/95 px-4 py-3 shadow-[0_-6px_20px_rgba(15,23,42,0.10)] backdrop-blur">
          <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-800">🗂 {t("เลือกไว้", "Selected")} {selected.size} {t("แคมเปญ", "campaigns")}</span>
            <span className="text-xs text-slate-400">{t("กดการ์ดเพื่อเลือก · หรือเปลี่ยนหมวดรายใบจากช่องบนการ์ด", "Click cards to select, or change per card")}</span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button onClick={() => setSelected(new Set(groups.flatMap((g) => g.items.map((c) => c.id))))} className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50">{t("เลือกทั้งหมดที่เห็น", "Select all visible")}</button>
              <button onClick={() => setSelected(new Set())} disabled={selected.size === 0} className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40">{t("ล้าง", "Clear")}</button>
              <select value={bulkCat} onChange={(e) => setBulkCat(e.target.value)} className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm">
                <option value="">{t("— ยังไม่จัดหมวด —", "— Uncategorized —")}</option>
                {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.icon ? `${cat.icon} ` : ""}{cat.label}</option>)}
              </select>
              <button onClick={() => void createCatQuick().then((id) => { if (id) setBulkCat(id); })} className="h-9 rounded-md border border-violet-200 bg-violet-50 px-3 text-xs font-medium text-violet-700 hover:bg-violet-100">＋ {t("หมวดใหม่", "New category")}</button>
              <button onClick={() => void moveSelected()} disabled={selected.size === 0 || bulkBusy} className="h-9 rounded-md bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-40">{bulkBusy ? t("กำลังย้าย…", "Moving…") : `${t("ย้ายเข้าหมวด", "Move to category")} →`}</button>
              <button onClick={exitManage} className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50">{t("เสร็จแล้ว", "Done")}</button>
            </div>
          </div>
        </div>
      )}

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
