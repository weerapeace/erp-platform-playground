"use client";

// ============================================================
// Creative Content / Social — จัดการโพสต์ + caption หลายแพลตฟอร์ม + ปฏิทิน
// ของกลาง: StandaloneShell, ERPModal, ConfirmDialog, ERPForm*, ProductPicker
// ข้อมูลจาก /api/creative-content + /api/creative-hashtags (ดู app/tasks/data.ts)
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { StandaloneShell } from "@/components/standalone-shell";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { ERPFormSection, ERPFormField, ERPInput, ERPSelect, ERPTextarea } from "@/components/form";
import { SkuPicker } from "@/components/pickers";
import type { SkuPickerValue } from "@/components/pickers";
import {
  CONTENT_STATUS_META, POST_TYPES,
  listContent, getContent, createContent, updateContent, deleteContent,
  listCampaigns, listBrands, listHashtags, createHashtag,
  type ContentItem, type ContentDetail, type ContentCaption, type ContentStatus,
  type Campaign, type BrandOption, type Hashtag,
} from "../data";
import { useCreativeOptions, platformLabel } from "../use-options";

const POST_TYPE_LABEL = Object.fromEntries(POST_TYPES.map((p) => [p.value, p.label]));
type Toast = { id: number; type: "success" | "error" | "info"; message: string };

function StatusBadge({ status }: { status: ContentStatus }) {
  const m = CONTENT_STATUS_META[status] ?? CONTENT_STATUS_META.draft;
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${m.cls}`}><span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />{m.label}</span>;
}

const EMPTY_FORM = { title: "", post_type: "image", status: "draft" as ContentStatus, brand_id: "", campaign_id: "", scheduled_at: "", product: null as SkuPickerValue | null, platforms: [] as string[], note: "" };

export default function ContentPage() {
  const { platforms } = useCreativeOptions();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "calendar">("list");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [delTarget, setDelTarget] = useState<ContentItem | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // create modal
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  const pushToast = useCallback((type: Toast["type"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((p) => [...p, { id, type, message }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
  }, []);

  const load = useCallback(async () => { try { setItems(await listContent()); } catch (e) { pushToast("error", (e as Error).message); } }, [pushToast]);
  useEffect(() => { (async () => { setLoading(true); await load(); try { const [b, c] = await Promise.all([listBrands(), listCampaigns()]); setBrands(b); setCampaigns(c); } catch { /* ignore */ } setLoading(false); })(); }, [load]);
  // เปิด drawer คอนเทนต์อัตโนมัติจากลิงก์ /tasks/content?content=<id> (กดมาจากการ์ดบน Canvas)
  useEffect(() => { const cid = new URLSearchParams(window.location.search).get("content"); if (cid) setDetailId(cid); }, []);

  const upd = (patch: Partial<typeof EMPTY_FORM>) => { setForm((p) => ({ ...p, ...patch })); setDirty(true); };
  const togglePlatform = (v: string) => upd({ platforms: form.platforms.includes(v) ? form.platforms.filter((x) => x !== v) : [...form.platforms, v] });
  const openCreate = () => { setForm(EMPTY_FORM); setDirty(false); setFormErr(null); setOpen(true); };

  const save = async () => {
    if (!form.title.trim()) { setFormErr("กรุณาใส่ชื่อคอนเทนต์"); return; }
    setSaving(true); setFormErr(null);
    try {
      const { content_no } = await createContent({
        title: form.title.trim(), campaign_id: form.campaign_id || null, brand_id: form.brand_id || null,
        sku_id: form.product?.id ?? null, product_name: form.product?.name ?? null, post_type: form.post_type || null,
        platforms: form.platforms, status: form.status, scheduled_at: form.scheduled_at || null, note: form.note.trim() || null,
      });
      setOpen(false); setDirty(false); pushToast("success", `สร้างคอนเทนต์ ${content_no} แล้ว`); await load();
    } catch (e) { setFormErr((e as Error).message); }
    finally { setSaving(false); }
  };

  const onDelete = async () => { if (!delTarget) return; try { await deleteContent(delTarget.id); pushToast("info", "ลบแล้ว"); await load(); } catch (e) { pushToast("error", (e as Error).message); } finally { setDelTarget(null); } };

  return (
    <StandaloneShell title="คอนเทนต์ Social" icon="📱" accent="violet">
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">คอนเทนต์ Social</h1>
            <p className="text-slate-500 mt-1">โพสต์โซเชียล · เขียน caption ได้หลายแพลตฟอร์มต่อ 1 คอนเทนต์ · คลัง hashtag · ปฏิทิน</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a href="/tasks" className="h-10 px-4 inline-flex items-center text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">← งาน</a>
            <button onClick={openCreate} className="h-10 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700">＋ สร้างคอนเทนต์</button>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit mt-4">
          <button onClick={() => setView("list")} className={`h-8 px-3 rounded-md text-sm font-medium ${view === "list" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}>📋 รายการ</button>
          <button onClick={() => setView("calendar")} className={`h-8 px-3 rounded-md text-sm font-medium ${view === "calendar" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}>🗓️ ปฏิทิน</button>
        </div>
      </div>

      <div className="px-8 py-6">
        {loading ? <div className="py-20 text-center text-slate-400">กำลังโหลด...</div>
          : view === "calendar" ? <MonthCalendar items={items} onOpen={(id) => setDetailId(id)} />
          : items.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
              <div className="text-4xl mb-3">📱</div>
              <p className="text-slate-600 font-medium">ยังไม่มีคอนเทนต์</p>
              <button onClick={openCreate} className="mt-4 h-9 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700">＋ สร้างคอนเทนต์</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((c) => (
                <div key={c.id} onClick={() => setDetailId(c.id)} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:border-violet-300 hover:shadow cursor-pointer transition-colors">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <StatusBadge status={c.status} />
                    <span className="font-mono text-[10px] text-slate-400">{c.content_no}</span>
                  </div>
                  <p className="text-base font-semibold text-slate-800 leading-snug line-clamp-2">{c.title}</p>
                  <div className="flex flex-wrap gap-1 mt-2">{(c.platforms ?? []).map((p) => <span key={p} className="text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{platformLabel(p)}</span>)}</div>
                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-2 flex-wrap">
                    {c.brand_label && <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: c.brand_color || "#cbd5e1" }} />{c.brand_label}</span>}
                    {c.post_type && <span>· {POST_TYPE_LABEL[c.post_type] ?? c.post_type}</span>}
                    {c.scheduled_at && <span>· 🗓 {c.scheduled_at.slice(0, 16).replace("T", " ")}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>

      {/* create modal */}
      <ERPModal open={open} onClose={() => setOpen(false)} title="สร้างคอนเทนต์ใหม่" size="lg" hasUnsavedChanges={dirty}
        footer={<>
          <button onClick={() => setOpen(false)} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
          <button onClick={save} disabled={saving} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{saving ? "กำลังบันทึก..." : "สร้าง"}</button>
        </>}>
        {formErr && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠️ {formErr}</div>}
        <ERPFormSection title="ข้อมูลคอนเทนต์" columns={2}>
          <ERPFormField label="ชื่อคอนเทนต์" required span={2}><ERPInput value={form.title} onChange={(e) => upd({ title: e.target.value })} placeholder="เช่น โปรโมต Heart Bag สีชมพู 7.7" /></ERPFormField>
          <ERPFormField label="ประเภทโพสต์"><ERPSelect value={form.post_type} options={POST_TYPES} onChange={(e) => upd({ post_type: e.target.value })} /></ERPFormField>
          <ERPFormField label="สถานะ"><ERPSelect value={form.status} options={Object.entries(CONTENT_STATUS_META).map(([v, m]) => ({ value: v, label: m.label }))} onChange={(e) => upd({ status: e.target.value as ContentStatus })} /></ERPFormField>
          <ERPFormField label="แบรนด์"><ERPSelect value={form.brand_id} options={[{ value: "", label: "— ไม่ระบุ —" }, ...brands.map((b) => ({ value: b.id, label: b.name }))]} onChange={(e) => upd({ brand_id: e.target.value })} /></ERPFormField>
          <ERPFormField label="แคมเปญ"><ERPSelect value={form.campaign_id} options={[{ value: "", label: "— ไม่ระบุ —" }, ...campaigns.map((c) => ({ value: c.id, label: c.name }))]} onChange={(e) => upd({ campaign_id: e.target.value })} /></ERPFormField>
          <ERPFormField label="ตั้งเวลาโพสต์"><ERPInput type="datetime-local" value={form.scheduled_at} onChange={(e) => upd({ scheduled_at: e.target.value })} /></ERPFormField>
          <ERPFormField label="สินค้า/SKU (ถ้ามี)"><SkuPicker value={form.product} onChange={(v) => upd({ product: v })} /></ERPFormField>
          <ERPFormField label="แพลตฟอร์ม" span={2}>
            <div className="flex flex-wrap gap-1.5">{platforms.map((p) => <button key={p.value} type="button" onClick={() => togglePlatform(p.value)} className={`px-2.5 py-1 rounded-full text-xs border ${form.platforms.includes(p.value) ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200 hover:border-violet-300"}`}>{p.label}</button>)}</div>
          </ERPFormField>
          <ERPFormField label="โน้ต/บรีฟ" span={2}><ERPTextarea value={form.note} rows={2} onChange={(e) => upd({ note: e.target.value })} /></ERPFormField>
        </ERPFormSection>
      </ERPModal>

      {detailId && <ContentDrawer contentId={detailId} brands={brands} onClose={() => setDetailId(null)} onChanged={load} onDelete={(c) => setDelTarget(c)} pushToast={pushToast} />}

      <ConfirmDialog open={!!delTarget} onClose={() => setDelTarget(null)} onConfirm={onDelete}
        title="ลบคอนเทนต์" message={<span>ต้องการลบ <span className="font-semibold">{delTarget?.title}</span> ใช่ไหม?</span>} confirmText="ลบ" variant="danger" />

      <div className="fixed bottom-6 right-6 z-[70] flex flex-col gap-2">
        {toasts.map((t) => <div key={t.id} className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white ${t.type === "success" ? "bg-emerald-600" : t.type === "error" ? "bg-red-600" : "bg-slate-800"}`}>{t.message}</div>)}
      </div>
    </StandaloneShell>
  );
}

// ============================================================
// Month calendar (เดือนปัจจุบัน + เลื่อนเดือน) — แสดงคอนเทนต์ตามวันตั้งเวลา
// ============================================================
function MonthCalendar({ items, onOpen }: { items: ContentItem[]; onOpen: (id: string) => void }) {
  const [offset, setOffset] = useState(0);
  const base = useMemo(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + offset, 1); }, [offset]);
  const year = base.getFullYear(), month = base.getMonth();
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const byDay = useMemo(() => {
    const map: Record<string, ContentItem[]> = {};
    for (const c of items) { if (!c.scheduled_at) continue; const d = c.scheduled_at.slice(0, 10); (map[d] ??= []).push(c); }
    return map;
  }, [items]);
  const ym = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthName = base.toLocaleDateString("th-TH", { month: "long", year: "numeric" });

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setOffset((o) => o - 1)} className="h-8 w-8 rounded-md hover:bg-slate-100 text-slate-500">‹</button>
        <h2 className="font-semibold text-slate-800">{monthName}</h2>
        <button onClick={() => setOffset((o) => o + 1)} className="h-8 w-8 rounded-md hover:bg-slate-100 text-slate-500">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-400 mb-1">{["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"].map((d) => <div key={d} className="py-1">{d}</div>)}</div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: first }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: days }).map((_, i) => {
          const day = i + 1;
          const key = `${ym}-${String(day).padStart(2, "0")}`;
          const list = byDay[key] ?? [];
          return (
            <div key={day} className="min-h-[84px] border border-slate-100 rounded-lg p-1.5 align-top">
              <div className="text-xs text-slate-400 mb-1">{day}</div>
              <div className="space-y-1">
                {list.slice(0, 3).map((c) => { const m = CONTENT_STATUS_META[c.status] ?? CONTENT_STATUS_META.draft; return (
                  <button key={c.id} onClick={() => onOpen(c.id)} className={`w-full text-left text-[10px] leading-tight px-1.5 py-1 rounded border ${m.cls} truncate`} title={c.title}>{c.title}</button>
                ); })}
                {list.length > 3 && <div className="text-[10px] text-slate-400">+{list.length - 3} อื่น ๆ</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Content detail drawer — caption หลายแพลตฟอร์ม + คลัง hashtag + ลิงก์
// ============================================================
function ContentDrawer({ contentId, brands, onClose, onChanged, onDelete, pushToast }: {
  contentId: string; brands: BrandOption[];
  onClose: () => void; onChanged: () => void; onDelete: (c: ContentItem) => void;
  pushToast: (type: Toast["type"], m: string) => void;
}) {
  const { platforms } = useCreativeOptions();
  const [d, setD] = useState<ContentDetail | null>(null);
  const [caps, setCaps] = useState<ContentCaption[]>([]);
  const [links, setLinks] = useState<{ platform: string; url: string }[]>([]);
  const [status, setStatus] = useState<ContentStatus>("draft");
  const [scheduledAt, setScheduledAt] = useState("");
  const [publishedUrl, setPublishedUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const detail = await getContent(contentId);
      setD(detail); setStatus(detail.status); setScheduledAt(detail.scheduled_at ? detail.scheduled_at.slice(0, 16) : ""); setPublishedUrl(detail.published_url ?? "");
      setLinks(Array.isArray(detail.product_links) ? detail.product_links : []);
      // เตรียม caption ให้ครบทุกแพลตฟอร์มของคอนเทนต์
      const platforms = detail.platforms ?? [];
      const byPlat = new Map(detail.captions.map((c) => [c.platform, c]));
      setCaps(platforms.map((p) => byPlat.get(p) ?? { platform: p, caption: "", hashtags: "" }));
    } catch (e) { pushToast("error", (e as Error).message); }
  }, [contentId, pushToast]);
  useEffect(() => { load(); }, [load]);

  const setCap = (platform: string, patch: Partial<ContentCaption>) => setCaps((cs) => cs.map((c) => c.platform === platform ? { ...c, ...patch } : c));

  const save = async () => {
    setSaving(true);
    try {
      await updateContent(contentId, {
        status, scheduled_at: scheduledAt || null, published_url: publishedUrl.trim() || null,
        product_links: links.filter((l) => l.url.trim()), captions: caps.map((c) => ({ platform: c.platform, caption: c.caption, hashtags: c.hashtags, caption_type: c.caption_type ?? "short" })),
      });
      pushToast("success", "บันทึกแล้ว"); await load(); onChanged();
    } catch (e) { pushToast("error", (e as Error).message); }
    finally { setSaving(false); }
  };

  if (!d) return (<><div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} /><div className="fixed right-0 top-0 h-full w-[640px] max-w-[97vw] bg-white shadow-2xl z-50 flex items-center justify-center text-slate-400">กำลังโหลด...</div></>);

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[640px] max-w-[97vw] bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="min-w-0"><h3 className="text-base font-semibold text-slate-900 truncate">{d.title}</h3><span className="font-mono text-xs text-slate-500">{d.content_no}</span></div>
          <div className="flex items-center gap-1">
            <button onClick={() => onDelete(d)} className="h-8 px-2 text-xs text-red-500 hover:bg-red-50 rounded-md">ลบ</button>
            <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* status + schedule */}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-slate-400">สถานะ</label><ERPSelect value={status} options={Object.entries(CONTENT_STATUS_META).map(([v, m]) => ({ value: v, label: m.label }))} onChange={(e) => setStatus(e.target.value as ContentStatus)} /></div>
            <div><label className="text-xs text-slate-400">ตั้งเวลาโพสต์</label><ERPInput type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /></div>
          </div>
          {(d.sku_code || d.product_name) && <div className="text-sm text-slate-600 bg-slate-50 rounded-lg p-2">📦 {d.sku_code} {d.sku_name || d.product_name}</div>}

          {/* captions per platform */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Caption แยกตามแพลตฟอร์ม</p>
            {caps.length === 0 ? <p className="text-sm text-slate-400 italic">ยังไม่ได้เลือกแพลตฟอร์ม (แก้ที่ตอนสร้าง)</p> : (
              <div className="space-y-3">
                {caps.map((c) => <CaptionCard key={c.platform} cap={c} brandId={d.brand_id} links={links} skuPrice={d.sku_price} skuColor={d.sku_color} onChange={(patch) => setCap(c.platform, patch)} pushToast={pushToast} />)}
              </div>
            )}
          </div>

          {/* product links */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">ลิงก์สินค้า (Shopee/Lazada/Website)</p>
            <div className="space-y-2">
              {links.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <select value={l.platform} onChange={(e) => setLinks((ls) => ls.map((x, j) => j === i ? { ...x, platform: e.target.value } : x))} className="h-9 border border-slate-200 rounded-lg px-2 text-sm w-32">
                    {platforms.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                  <ERPInput value={l.url} onChange={(e) => setLinks((ls) => ls.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} placeholder="https://..." />
                  <button onClick={() => setLinks((ls) => ls.filter((_, j) => j !== i))} className="h-9 px-2 text-slate-400 hover:text-red-500">✕</button>
                </div>
              ))}
              <button onClick={() => setLinks((ls) => [...ls, { platform: "shopee", url: "" }])} className="text-sm text-violet-700 hover:underline">＋ เพิ่มลิงก์</button>
            </div>
          </div>

          {/* published url */}
          {(status === "published") && <div><label className="text-xs text-slate-400">ลิงก์โพสต์ที่เผยแพร่</label><ERPInput value={publishedUrl} onChange={(e) => setPublishedUrl(e.target.value)} placeholder="https://..." /></div>}
        </div>

        <div className="border-t border-slate-200 px-6 py-4 shrink-0 flex justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">ปิด</button>
          <button onClick={save} disabled={saving} className="h-9 px-5 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{saving ? "กำลังบันทึก..." : "บันทึก"}</button>
        </div>
      </div>
    </>
  );
}

// ประเภท caption (สี) — กดแล้วประกอบข้อมูลสินค้าให้ตามชนิด
const CAPTION_TYPES: { key: string; label: string; cls: string; active: string }[] = [
  { key: "short",         label: "Short",        cls: "bg-slate-50 text-slate-600 border-slate-200",     active: "bg-slate-700 text-white border-slate-700" },
  { key: "landing",       label: "Landing Page", cls: "bg-sky-50 text-sky-700 border-sky-200",           active: "bg-sky-600 text-white border-sky-600" },
  { key: "product_links", label: "Product Links",cls: "bg-emerald-50 text-emerald-700 border-emerald-200", active: "bg-emerald-600 text-white border-emerald-600" },
  { key: "page_links",    label: "Page Links",   cls: "bg-violet-50 text-violet-700 border-violet-200",  active: "bg-violet-600 text-white border-violet-600" },
];
const CAP_MARK = "\n———\n"; // เส้นคั่น caption ที่พิมพ์เอง กับบล็อกข้อมูลสินค้าที่ระบบเติม

// caption ต่อ 1 แพลตฟอร์ม + ประเภท caption + ตัวเลือก hashtag จากคลัง
function CaptionCard({ cap, brandId, links, skuPrice, skuColor, onChange, pushToast }: { cap: ContentCaption; brandId: string | null; links: { platform: string; url: string }[]; skuPrice: number | null; skuColor: string | null; onChange: (p: Partial<ContentCaption>) => void; pushToast: (type: Toast["type"], m: string) => void }) {
  const [showTags, setShowTags] = useState(false);
  const [tags, setTags] = useState<Hashtag[]>([]);
  const [newTag, setNewTag] = useState("");
  const [loadingTags, setLoadingTags] = useState(false);

  const loadTags = useCallback(async () => {
    setLoadingTags(true);
    try { setTags(await listHashtags({ brand_id: brandId || undefined, platform: cap.platform })); } catch { /* ignore */ }
    finally { setLoadingTags(false); }
  }, [brandId, cap.platform]);
  useEffect(() => { if (showTags) loadTags(); }, [showTags, loadTags]);

  const appendTag = (text: string) => { const cur = cap.hashtags ?? ""; if (cur.includes(text)) return; onChange({ hashtags: (cur ? cur + " " : "") + text }); };
  const addNew = async () => {
    const t = newTag.trim(); if (!t) return;
    try { const h = await createHashtag({ text: t, brand_id: brandId || null, platform: cap.platform }); setNewTag(""); appendTag(h.text); await loadTags(); }
    catch (e) { pushToast("error", (e as Error).message); }
  };
  const copy = async () => {
    const text = `${cap.caption ?? ""}\n\n${cap.hashtags ?? ""}`.trim();
    try { await navigator.clipboard.writeText(text); pushToast("success", `คัดลอก ${platformLabel(cap.platform)} แล้ว`); } catch { pushToast("error", "คัดลอกไม่สำเร็จ"); }
  };

  // สร้างบล็อกข้อมูลสินค้าตามประเภท (ดึงจาก product_links + ราคา/สีของ SKU)
  const buildBlock = (type: string): string => {
    const shopee = links.find((l) => l.platform === "shopee" && l.url.trim())?.url;
    const lazada = links.find((l) => l.platform === "lazada" && l.url.trim())?.url;
    const anyLink = links.find((l) => l.url.trim())?.url;
    const priceLine = skuPrice != null ? `💰 ราคา ${Number(skuPrice).toLocaleString()} บาท` : null;
    const colorLine = skuColor ? `🎨 สี ${skuColor}` : null;
    const out: string[] = [];
    if (type === "landing") { if (anyLink) out.push(`🛒 สั่งซื้อ: ${anyLink}`); }
    else if (type === "product_links") { if (shopee) out.push(`🛒 Shopee: ${shopee}`); if (lazada) out.push(`🛒 Lazada: ${lazada}`); if (priceLine) out.push(priceLine); if (colorLine) out.push(colorLine); }
    else if (type === "page_links") { if (priceLine) out.push(priceLine); if (colorLine) out.push(colorLine); }
    return out.join("\n");
  };
  // กดประเภท → เก็บประเภท + เติมบล็อกสินค้า (แทนที่บล็อกเดิม คงข้อความที่พิมพ์เอง)
  const applyType = (type: string) => {
    const base = (cap.caption ?? "").split(CAP_MARK)[0].replace(/\s+$/, "");
    const block = buildBlock(type);
    onChange({ caption_type: type, caption: block ? `${base}${CAP_MARK}${block}` : base });
  };

  return (
    <div className="border border-slate-200 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-700">{platformLabel(cap.platform)}</span>
        <button onClick={copy} className="text-xs text-violet-700 hover:underline">📋 คัดลอก</button>
      </div>
      {/* ประเภท caption — กดแล้วเติมข้อมูลสินค้าให้ตามชนิด */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {CAPTION_TYPES.map((tp) => { const on = (cap.caption_type ?? "short") === tp.key; return (
          <button key={tp.key} onClick={() => applyType(tp.key)} title="กดเพื่อเปลี่ยนประเภท caption (เติมข้อมูลสินค้าให้)" className={`px-2 py-0.5 rounded-full text-xs border ${on ? tp.active : tp.cls}`}>{tp.label}</button>
        ); })}
      </div>
      <ERPTextarea value={cap.caption ?? ""} rows={3} onChange={(e) => onChange({ caption: e.target.value })} placeholder={`เขียน caption สำหรับ ${platformLabel(cap.platform)}...`} />
      <div className="mt-2">
        <ERPInput value={cap.hashtags ?? ""} onChange={(e) => onChange({ hashtags: e.target.value })} placeholder="#hashtag คั่นด้วยเว้นวรรค" />
        <button onClick={() => setShowTags((s) => !s)} className="text-xs text-violet-700 hover:underline mt-1">{showTags ? "ซ่อนคลัง hashtag" : "＋ เลือกจากคลัง hashtag"}</button>
        {showTags && (
          <div className="mt-2 bg-slate-50 rounded-lg p-2">
            <div className="flex gap-1.5 mb-2">
              <input value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addNew()} placeholder="เพิ่ม hashtag ใหม่เข้าคลัง" className="flex-1 h-8 border border-slate-200 rounded-md px-2 text-sm" />
              <button onClick={addNew} className="h-8 px-3 text-xs font-medium text-violet-700 border border-violet-200 rounded-md hover:bg-violet-50">เพิ่ม</button>
            </div>
            {loadingTags ? <p className="text-xs text-slate-400">กำลังโหลด...</p> : tags.length === 0 ? <p className="text-xs text-slate-400">ยังไม่มี hashtag ในคลัง (พิมพ์เพิ่มด้านบน)</p> : (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((h) => <button key={h.id} onClick={() => appendTag(h.text)} className="text-xs bg-white border border-slate-200 rounded-full px-2 py-0.5 text-slate-600 hover:border-violet-300 hover:text-violet-700" title={`ใช้ ${h.usage_count} ครั้ง`}>{h.text}</button>)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
