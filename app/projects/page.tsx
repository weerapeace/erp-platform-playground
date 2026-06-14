"use client";

// ============================================================
// Content Projects (Brainstorm) — รายการ + สร้างโปรเจกต์
// ของกลาง: StandaloneShell, ERPModal, ERPForm*, ProductPicker, UserPicker
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StandaloneShell } from "@/components/standalone-shell";
import { ERPModal } from "@/components/modal";
import { ERPFormSection, ERPFormField, ERPInput, ERPSelect } from "@/components/form";
import { SkuPicker, UserPicker } from "@/components/pickers";
import type { SkuPickerValue, UserPickerValue } from "@/components/pickers";
import {
  PROJECT_STATUS, listProjects, createProject, listBrands, listCampaigns,
  type Project, type BrandOption, type Campaign,
} from "./data";

const CSTAT = Object.fromEntries(PROJECT_STATUS.map((s) => [s.value, s]));
type Toast = { id: number; type: "success" | "error"; message: string };

export default function ProjectsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Project[]>([]);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [name, setName] = useState("");
  const [product, setProduct] = useState<SkuPickerValue | null>(null);
  const [brandId, setBrandId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [pm, setPm] = useState<UserPickerValue | null>(null);
  const [slides, setSlides] = useState("");
  const [drive, setDrive] = useState("");

  const pushToast = (type: Toast["type"], message: string) => { const id = Date.now() + Math.random(); setToasts((p) => [...p, { id, type, message }]); setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500); };

  const load = useCallback(async () => { try { setItems(await listProjects()); } catch (e) { pushToast("error", (e as Error).message); } }, []);
  useEffect(() => { (async () => { setLoading(true); await load(); try { const [b, c] = await Promise.all([listBrands(), listCampaigns()]); setBrands(b); setCampaigns(c); } catch { /* ignore */ } setLoading(false); })(); }, [load]);

  const openCreate = () => { setName(""); setProduct(null); setBrandId(""); setCampaignId(""); setPm(null); setSlides(""); setDrive(""); setErr(null); setOpen(true); };
  const save = async () => {
    if (!name.trim()) { setErr("กรุณาใส่ชื่อโปรเจกต์"); return; }
    setSaving(true); setErr(null);
    try {
      const { id } = await createProject({ name: name.trim(), sku_id: product?.id ?? null, brand_id: brandId || null, campaign_id: campaignId || null, pm_id: pm?.id ?? null, google_slides_url: slides.trim() || null, drive_folder_url: drive.trim() || null });
      setOpen(false); pushToast("success", "สร้างโปรเจกต์แล้ว — เปิดกระดาน...");
      router.push(`/projects/${id}/board`);
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <StandaloneShell title="โปรเจกต์คอนเทนต์ (Brainstorm)" icon="🧠" accent="violet">
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">โปรเจกต์คอนเทนต์</h1>
            <p className="text-slate-500 mt-1">กระดานระดมไอเดีย (Brainstorm) ต่อสินค้า/แคมเปญ → เลือกทิศทาง → ส่งเข้าผลิต</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a href="/tasks" className="h-10 px-4 inline-flex items-center text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">← งาน</a>
            <button onClick={openCreate} className="h-10 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700">＋ สร้าง Content Project</button>
          </div>
        </div>
      </div>

      <div className="px-8 py-6">
        {loading ? <div className="py-20 text-center text-slate-400">กำลังโหลด...</div>
          : items.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
              <div className="text-4xl mb-3">🧠</div>
              <p className="text-slate-600 font-medium">ยังไม่มีโปรเจกต์คอนเทนต์</p>
              <p className="text-slate-400 text-sm mt-1">สร้างโปรเจกต์เพื่อเริ่มระดมไอเดียบนกระดาน แล้วส่งงานเข้าผลิต</p>
              <button onClick={openCreate} className="mt-4 h-9 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700">＋ สร้าง Content Project</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((p) => {
                const st = CSTAT[p.status] ?? PROJECT_STATUS[0];
                return (
                  <a key={p.id} href={`/projects/${p.id}/board`} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:border-violet-300 hover:shadow transition-colors block">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${st.cls}`}>{st.label}</span>
                      <span className="font-mono text-[10px] text-slate-400">{p.code}</span>
                    </div>
                    <p className="text-base font-semibold text-slate-800 leading-snug line-clamp-2">{p.name}</p>
                    <div className="flex items-center gap-2 text-xs text-slate-400 mt-2 flex-wrap">
                      {p.brand_label && <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: p.brand_color || "#cbd5e1" }} />{p.brand_label}</span>}
                      {p.parent_sku_code && <span>· 📦 {p.parent_sku_code}</span>}
                      {p.pm_label && <span>· 👤 {p.pm_label}</span>}
                    </div>
                  </a>
                );
              })}
            </div>
          )}
      </div>

      <ERPModal open={open} onClose={() => setOpen(false)} title="สร้าง Content Project" size="lg"
        footer={<>
          <button onClick={() => setOpen(false)} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
          <button onClick={save} disabled={saving} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{saving ? "กำลังสร้าง..." : "สร้าง + เปิดกระดาน"}</button>
        </>}>
        {err && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠️ {err}</div>}
        <ERPFormSection title="ข้อมูลโปรเจกต์" columns={2}>
          <ERPFormField label="ชื่อโปรเจกต์" required span={2}><ERPInput value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น PD-CLEAR-BAG Launch (7.7)" /></ERPFormField>
          <ERPFormField label="สินค้า (ดึง SKU ตระกูลเดียวกัน)" span={2}><SkuPicker value={product} onChange={setProduct} /></ERPFormField>
          <ERPFormField label="แบรนด์"><ERPSelect value={brandId} options={[{ value: "", label: "— ไม่ระบุ —" }, ...brands.map((b) => ({ value: b.id, label: b.name }))]} onChange={(e) => setBrandId(e.target.value)} /></ERPFormField>
          <ERPFormField label="แคมเปญ"><ERPSelect value={campaignId} options={[{ value: "", label: "— ไม่ระบุ —" }, ...campaigns.map((c) => ({ value: c.id, label: c.name }))]} onChange={(e) => setCampaignId(e.target.value)} /></ERPFormField>
          <ERPFormField label="PM / ผู้ดูแล"><UserPicker value={pm} onChange={setPm} disableCreate /></ERPFormField>
          <ERPFormField label="Google Slides Brief (ลิงก์)"><ERPInput value={slides} onChange={(e) => setSlides(e.target.value)} placeholder="https://docs.google.com/presentation/..." /></ERPFormField>
          <ERPFormField label="โฟลเดอร์ Drive (ลิงก์)" span={2}><ERPInput value={drive} onChange={(e) => setDrive(e.target.value)} placeholder="https://drive.google.com/..." /></ERPFormField>
        </ERPFormSection>
        <p className="text-xs text-slate-400 mt-2">ระบบจะสร้างกระดานพร้อมโซน (Reference/Photo/Video/Banner/Caption/Approve/Done) + การ์ดสินค้าให้อัตโนมัติ</p>
      </ERPModal>

      <div className="fixed bottom-6 right-6 z-[70] flex flex-col gap-2">
        {toasts.map((t) => <div key={t.id} className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white ${t.type === "success" ? "bg-emerald-600" : "bg-red-600"}`}>{t.message}</div>)}
      </div>
    </StandaloneShell>
  );
}
