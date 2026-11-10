"use client";
/**
 * ลิ้นชักสินค้าบนร้าน (หน้าสินค้าบนแพลตฟอร์ม — แท็บจับคู่ + มุมมองหน้าร้าน) · แบบ Seller Center ของ LINE
 *
 * แท็บ: ข้อมูลสินค้า (ชื่อ · แบรนด์ · หมวด LINE · รายละเอียดจัดรูปแบบ) · รูป · ตัวเลือก & ราคา · จับคู่ · ประวัติ
 * แก้แล้วกด "บันทึกขึ้น LINE" → โชว์ก่อน → หลัง ทุกช่องให้ยืนยัน → ส่งขึ้นร้านจริง (ส่งเฉพาะที่เปลี่ยน) → แก้สำเนาในระบบ + ประวัติ
 * เปิด/ปิดขาย = สวิตช์ที่หัว (useLineDisplay — ถามก่อนเสมอ)
 * ยังไม่ทำ (เฟส 2): แก้รูป · น้ำหนัก/บาร์โค้ด · เพิ่ม/ลบตัวเลือก · สต๊อก (ระบบซิงค์สต๊อกกลาง)
 *
 * ข้อมูล: GET /api/platform-catalog?view=listing (รายละเอียด+ประวัติ) + ?view=variants (ตัวเลือก↔SKU + ราคาที่ระบบจะส่ง)
 * ส่ง: POST /api/line-shopping/listing-edit · กฎกลาง lib/line-listing-edit (planLineEdit — หน้าเว็บกับ API ใช้ตัวเดียวกัน)
 * ของกลางที่ใช้: Drawer · ConfirmDialog · ScrollTabs · MiniTable · MoneyInput · RichTextEditor · ToggleSwitch · ImageLightbox · PlatformCategoryPicker · state-views
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Drawer, ConfirmDialog } from "@/components/modal";
import { ScrollTabs } from "@/components/scroll-tabs";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { MoneyInput } from "@/components/money-input";
import { ToggleSwitch } from "@/components/toggle-switch";
import { Icon } from "@/components/icon";
import { ErrorState, LoadingState } from "@/components/state-views";
import { PlatformCategoryPicker, parseCategoryLabel } from "@/components/platform-category-picker";
import { ImageLightbox } from "@/components/image-lightbox";
import { ListingVariantMap } from "./listing-variants";
import { useLineDisplay } from "./use-line-display";
import { planLineEdit, type LineEditState, type LineEditVariant, type ListingDetail, type ListingDetailResponse } from "@/lib/line-listing-edit";
import type { ListingVariantsResponse } from "@/lib/platform-variant-match";

// กล่องข้อความจัดรูปแบบหนัก (tiptap) — โหลดเมื่อเปิดลิ้นชักเท่านั้น
const RichTextEditor = dynamic(() => import("@/components/rich-text").then((m) => m.RichTextEditor), { ssr: false, loading: () => <div className="h-40 rounded-lg bg-slate-50" /> });

type Tab = "info" | "images" | "options" | "match" | "history";
const baht = (n: number | null | undefined) => (n == null ? "—" : `${n.toLocaleString("th-TH", { maximumFractionDigits: 2 })}฿`);
const thDateTime = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }); };
const numOrNull = (raw: string) => { const n = Number(raw); return raw.trim() === "" || !Number.isFinite(n) ? null : n; };

export function ListingDrawer({ listingId, onClose, onChanged, canPublish, matchTab }: {
  listingId: string | null;
  onClose: () => void;
  /** ส่งขึ้น LINE / เปิดปิดขาย สำเร็จ → หน้าแม่อัปเดตแถว */
  onChanged?: (id: string, patch: { title?: string; display?: boolean }) => void;
  /** สิทธิ์ส่งขึ้นร้านจริง (products.platforms.publish) — ไม่มี = ดูอย่างเดียว */
  canPublish: boolean;
  /** เนื้อหาแท็บจับคู่จากหน้าแม่ (กล่องจับคู่ / ตัวซ้ำ / ส่งตามข้อมูลในระบบ) */
  matchTab?: ReactNode;
}) {
  const toast = useToast();
  const [detail, setDetail] = useState<ListingDetail | null>(null);
  const [variants, setVariants] = useState<ListingVariantsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [form, setForm] = useState<LineEditState | null>(null);
  const [tab, setTab] = useState<Tab>("info");
  const [ask, setAsk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lightbox, setLightbox] = useState(-1);
  const [descEdit, setDescEdit] = useState(false);

  // โหลดรายละเอียด + ตัวเลือก↔SKU พร้อมกัน · สลับรายการ = เริ่มใหม่ (ล้างของเดิม + กลับแท็บแรก) · โหลดซ้ำหลังส่ง = คงแท็บไว้
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!listingId) { loadedFor.current = null; return; }
    let alive = true;
    const fresh = loadedFor.current !== listingId;
    loadedFor.current = listingId;
    setError(null);
    if (fresh) { setDetail(null); setVariants(null); setForm(null); setDescEdit(false); }
    const q = encodeURIComponent(listingId);
    Promise.all([
      apiFetch(`/api/platform-catalog?view=listing&listing_id=${q}`).then((r) => r.json() as Promise<ListingDetailResponse>),
      apiFetch(`/api/platform-catalog?view=variants&listing_id=${q}`).then((r) => r.json() as Promise<ListingVariantsResponse>).catch(() => null),
    ]).then(([d, v]) => {
      if (!alive) return;
      if (d.error || !d.detail) { setError(d.error ?? "โหลดไม่สำเร็จ"); return; }
      setDetail(d.detail);
      setVariants(v && !v.error ? v : null);
      setForm(d.detail.line ? structuredClone(d.detail.line.edit) : null);
      if (fresh) setTab(d.detail.line ? "info" : "match");
    }).catch(() => { if (alive) setError("โหลดรายละเอียดไม่สำเร็จ ลองใหม่อีกครั้ง"); });
    return () => { alive = false; };
  }, [listingId, reload]);

  const base = detail?.line?.edit ?? null;
  const plan = useMemo(() => (base && form ? planLineEdit(base, form) : null), [base, form]);
  const dirty = !!plan && plan.changes.length > 0;
  const canEdit = canPublish && !!detail?.line && detail.status !== "removed";
  const rowByKey = useMemo(() => new Map((variants?.rows ?? []).map((r) => [r.key, r])), [variants]);

  const disp = useLineDisplay((results) => {
    const r = results.find((x) => x.listing_id === listingId);
    if (r?.ok && listingId) { onChanged?.(listingId, { display: !!r.display }); setReload((n) => n + 1); }
  });

  const setField = <K extends keyof LineEditState>(k: K, v: LineEditState[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const setVariant = (id: string, patch: Partial<LineEditVariant>) => setForm((f) => (f ? { ...f, variants: f.variants.map((v) => (v.id === id ? { ...v, ...patch } : v)) } : f));
  const applyErpPrice = (ids?: string[]) => setForm((f) => (f ? {
    ...f, variants: f.variants.map((v) => {
      if (ids && !ids.includes(v.id)) return v;
      const r = rowByKey.get(v.id);
      return r && r.erp_pay != null && r.erp_price != null ? { ...v, price: r.erp_price, pay: r.erp_pay } : v;
    }),
  } : f));
  const resetForm = () => { if (base) setForm(structuredClone(base)); setDescEdit(false); };

  const save = useCallback(async () => {
    if (!listingId || !form) return;
    setSaving(true);
    try {
      const r = await apiFetch("/api/line-shopping/listing-edit", { method: "POST", body: JSON.stringify({ listing_id: listingId, edit: form }) });
      const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
      if (j.ok) {
        toast.success("ส่งขึ้น LINE แล้ว — บันทึกประวัติแล้ว");
        onChanged?.(listingId, { title: form.name });
        setAsk(false); setDescEdit(false); setReload((n) => n + 1);
      } else {
        toast.error(`ส่งขึ้น LINE ไม่สำเร็จ: ${j.error ?? `HTTP ${r.status}`}`);
        if (j.details === "ok" || j.prices === "ok") { onChanged?.(listingId, { title: form.name }); setAsk(false); setReload((n) => n + 1); }
      }
    } catch (e) { toast.error(`ส่งขึ้น LINE ไม่สำเร็จ: ${(e as Error).message}`); }
    finally { setSaving(false); }
  }, [listingId, form, onChanged, toast]);

  const line = detail?.line ?? null;
  const tabs: { key: Tab; label: string }[] = [
    { key: "info", label: "ข้อมูลสินค้า" },
    { key: "images", label: `รูป${line ? ` (${line.images.length})` : ""}` },
    { key: "options", label: `ตัวเลือก & ราคา${form ? ` (${form.variants.length})` : ""}` },
    { key: "match", label: "จับคู่" },
    { key: "history", label: `ประวัติ${detail ? ` (${detail.history.length})` : ""}` },
  ];

  // ---------- ตัวเลือก & ราคา ----------
  const optCols: MiniColumn<LineEditVariant>[] = [
    {
      key: "opt", header: "ตัวเลือก", width: "1.6fr",
      cell: (v) => { const r = rowByKey.get(v.id); return (
        <div className="min-w-0">
          <div className="truncate" title={v.label}>{v.label}</div>
          <div className="truncate font-mono text-[11px] text-slate-400">{v.sku ?? "ไม่มีรหัส"}{r?.erp_code && r.erp_code !== v.sku ? ` → ${r.erp_code}` : ""}{r && (r.kind === "none" || r.kind === "nosku") ? " · ไม่เจอ SKU" : ""}</div>
        </div>
      ); },
    },
    {
      key: "erp", header: "ระบบจะส่ง", width: "6.5rem", align: "right",
      cell: (v) => { const r = rowByKey.get(v.id); if (!r || r.erp_pay == null) return <span className="text-slate-300">—</span>;
        const diff = v.pay != null && Math.abs(v.pay - r.erp_pay) >= 1;
        return (
          <span className={`leading-tight ${diff ? "text-rose-600" : "text-slate-500"}`} title={diff ? "ราคาที่ลูกค้าจ่ายไม่ตรงกับในระบบ" : "ตรงกับในระบบ"}>
            <span className="block">{baht(r.erp_pay)}</span>
            {r.erp_price != null && r.erp_price !== r.erp_pay && <span className="block text-[11px] text-slate-400 line-through">{baht(r.erp_price)}</span>}
            {canEdit && diff && <button type="button" onClick={() => applyErpPrice([v.id])} className="text-[11px] text-violet-700 hover:underline">ใช้ราคานี้</button>}
          </span>
        ); },
    },
    {
      key: "price", header: "ราคาเต็ม", width: "6.5rem", align: "right",
      cell: (v) => canEdit
        ? <MoneyInput value={v.price} onChange={(raw) => setVariant(v.id, { price: numOrNull(raw) })} className="h-8 w-full rounded-md border border-slate-200 px-2 text-right text-sm" />
        : <span>{baht(v.price)}</span>,
    },
    {
      key: "pay", header: "ลูกค้าจ่าย", width: "6.5rem", align: "right",
      cell: (v) => canEdit
        ? <MoneyInput value={v.pay} onChange={(raw) => setVariant(v.id, { pay: numOrNull(raw) })} className="h-8 w-full rounded-md border border-slate-200 px-2 text-right text-sm" />
        : <span>{baht(v.pay)}</span>,
    },
    {
      key: "disc", header: "ส่วนลด", width: "4.5rem", align: "right",
      cell: (v) => (v.price != null && v.pay != null && v.pay < v.price ? <span className="text-rose-600">-{Math.round((1 - v.pay / v.price) * 100)}%</span> : <span className="text-slate-300">—</span>),
    },
    {
      key: "stock", header: "สต๊อก", width: "4rem", align: "right",
      cell: (v) => { const s = rowByKey.get(v.id)?.stock; return s == null ? <span className="text-slate-300">—</span> : <span className={s === 0 ? "text-rose-600" : ""}>{s.toLocaleString()}</span>; },
    },
  ];
  const priceDiffN = form ? form.variants.filter((v) => { const r = rowByKey.get(v.id); return r?.erp_pay != null && v.pay != null && Math.abs(v.pay - r.erp_pay) >= 1; }).length : 0;

  // ---------- หัวลิ้นชัก ----------
  const header = detail && (
    <div className="flex items-start gap-3 border-b border-slate-100 pb-3">
      {line?.images[0]
        ? <button type="button" onClick={() => setLightbox(0)} className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-50"><img src={line.images[0]} alt="" className="h-full w-full object-cover" /></button>
        : <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-300"><Icon name="image" /></div>}
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-sm font-medium text-slate-800" title={detail.title ?? ""}>{form?.name || detail.title || "—"}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400">
          <span className="font-mono">#{detail.external_product_id ?? "—"}</span>
          {detail.matched_code ? <span className="font-mono text-emerald-700">จับคู่ {detail.matched_code}</span> : <span className="text-amber-700">ยังไม่จับคู่</span>}
          {detail.status === "removed" && <span className="rounded bg-slate-100 px-1.5 text-slate-500">ไม่อยู่บนร้านแล้ว</span>}
        </div>
      </div>
      {line && line.display != null && detail.status !== "removed" && (
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <ToggleSwitch on={line.display} disabled={!canPublish || disp.busy} label={<span className="text-xs text-slate-600">{line.display ? "เปิดขาย" : "ปิดขาย"}</span>}
            title={canPublish ? "เปิด/ปิดขายบน LINE (ถามก่อน)" : "ไม่มีสิทธิ์ส่งขึ้นร้าน"}
            onChange={(v) => listingId && disp.request([listingId], v ? "onsale" : "hide", [form?.name || detail.title || ""])} />
        </div>
      )}
    </div>
  );

  // ---------- เนื้อหาแท็บ ----------
  const noLine = (
    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
      {detail?.platform_code && detail.platform_code !== "line_shopping"
        ? "แก้จากหน้านี้ได้เฉพาะสินค้าบน LINE ตอนนี้ — ร้านนี้ดูข้อมูลได้ที่แท็บจับคู่"
        : "ยังไม่มีข้อมูลสินค้านี้จาก LINE — กด “ดึงสินค้าจาก LINE” ด้านบนหนึ่งครั้ง แล้วเปิดใหม่"}
    </p>
  );
  const infoTab = !form || !line ? noLine : (
    <div className="space-y-3 text-sm">
      <label className="block">
        <span className="mb-1 block text-xs text-slate-500">ชื่อสินค้าบน LINE</span>
        <input value={form.name} disabled={!canEdit} onChange={(e) => setField("name", e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm disabled:bg-slate-50" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">แบรนด์</span>
          <input value={form.brand} disabled={!canEdit} onChange={(e) => setField("brand", e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm disabled:bg-slate-50" />
        </label>
        <div>
          <span className="mb-1 block text-xs text-slate-500">หมวดบน LINE</span>
          <div className="mb-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700" title={form.categoryName ?? ""}>
            {form.categoryId ? <><span className="font-mono text-slate-400">{form.categoryId}</span> {form.categoryName ?? ""}</> : <span className="text-amber-700">ยังไม่มีหมวด</span>}
          </div>
          {canEdit && detail && <PlatformCategoryPicker platformId={detail.platform_id} placeholder="เปลี่ยนหมวด — พิมพ์ค้น เช่น กระเป๋า"
            onPick={(label) => { const c = parseCategoryLabel(label); if (c.id) setForm((f) => (f ? { ...f, categoryId: c.id, categoryName: c.name } : f)); }} />}
        </div>
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-slate-500">รายละเอียดสินค้า</span>
          {canEdit && !descEdit && <button type="button" onClick={() => setDescEdit(true)} className="inline-flex items-center gap-1 text-xs text-violet-700 hover:underline"><Icon name="edit" />แก้รายละเอียด</button>}
        </div>
        {descEdit
          ? <RichTextEditor value={form.description} onChange={(html) => setField("description", html)} minHeight={220} />
          : <div className="tiptap-content max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm [&_img]:max-w-full [&_img]:rounded"
              dangerouslySetInnerHTML={{ __html: form.description || "<p class=\"text-slate-400\">(ไม่มีรายละเอียด)</p>" }} />}
      </div>
    </div>
  );
  const imagesTab = !line ? noLine : (
    <div className="space-y-2">
      {line.images.length === 0 ? <p className="text-xs text-slate-500">ร้านไม่มีรูปสินค้านี้</p> : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {line.images.map((u, i) => (
            <button key={i} type="button" onClick={() => setLightbox(i)} className="relative aspect-square overflow-hidden rounded-lg bg-slate-50">
              <img src={u} alt="" loading="lazy" className="h-full w-full object-cover" />
              {i === 0 && <span className="absolute left-1 top-1 rounded-full bg-white/90 px-1.5 text-[10px] text-violet-700">ปก</span>}
            </button>
          ))}
        </div>
      )}
      <p className="text-[11px] text-slate-400">แก้รูป (เพิ่ม · ลบ · เรียง · ตั้งปก) จะทำในเฟส 2 — ต้องทดสอบกับร้าน LINE 1 สินค้าก่อน</p>
    </div>
  );
  const optionsTab = !form || !line ? noLine : (
    <div className="space-y-2">
      <MiniTable rows={form.variants} columns={optCols} rowKey={(v) => v.id} dense hideToolbar emptyText="ไม่มีตัวเลือก" resizable storageKey="listing-drawer-options" />
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        {priceDiffN > 0 && <span className="text-rose-600">ลูกค้าจ่ายไม่ตรงในระบบ {priceDiffN.toLocaleString()} ตัวเลือก</span>}
        {canEdit && priceDiffN > 0 && <button type="button" onClick={() => applyErpPrice()} className="rounded-md border border-violet-200 px-2 py-1 text-violet-700 hover:bg-violet-50">ใช้ราคาในระบบทั้งหมด</button>}
        <span className="ml-auto text-slate-400">สต๊อกดูอย่างเดียว (แก้ผ่านระบบซิงค์สต๊อก)</span>
      </div>
    </div>
  );
  const matchTabBody = (
    <div className="space-y-3">
      {matchTab}
      {detail && (detail.platform_code === "line_shopping" || detail.platform_code === "lazada") && (
        <div className="space-y-2 rounded-xl border border-slate-200 p-3">
          <div className="text-xs font-semibold text-slate-600">ตัวเลือกบนร้าน ↔ SKU ในระบบ</div>
          {listingId && <ListingVariantMap listingId={listingId} data={variants ?? undefined} />}
        </div>
      )}
    </div>
  );
  const historyTab = !detail ? null : detail.history.length === 0 ? <p className="text-xs text-slate-500">ยังไม่มีประวัติ</p> : (
    <ul className="divide-y divide-slate-100 text-xs">
      {detail.history.map((h, i) => (
        <li key={i} className="flex gap-3 py-1.5">
          <span className="w-28 shrink-0 text-slate-400">{thDateTime(h.at)}</span>
          <span className="w-32 shrink-0 truncate text-slate-500" title={h.actor ?? ""}>{h.actor ?? "ระบบ"}</span>
          <span className="min-w-0 flex-1 text-slate-700">{h.text}</span>
        </li>
      ))}
    </ul>
  );

  const footer = canEdit && plan ? (
    <div className="flex w-full flex-wrap items-center gap-2">
      <span className="min-w-0 flex-1 text-xs text-slate-500">
        {plan.errors.length ? <span className="text-rose-600">{plan.errors[0]}</span>
          : dirty ? `แก้แล้ว ${plan.changes.length.toLocaleString()} ช่อง — ยังไม่ได้ส่งขึ้น LINE` : "ยังไม่ได้แก้อะไร"}
      </span>
      {dirty && <button type="button" onClick={resetForm} disabled={saving} className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50">ยกเลิกที่แก้</button>}
      <button type="button" disabled={!dirty || plan.errors.length > 0 || saving} onClick={() => setAsk(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm text-white hover:bg-emerald-700 disabled:opacity-40"><Icon name="upload" />บันทึกขึ้น LINE</button>
    </div>
  ) : detail?.line && !canPublish ? <span className="text-xs text-slate-400">ดูอย่างเดียว — ไม่มีสิทธิ์ส่งขึ้นร้าน</span> : undefined;

  return (
    <>
      <Drawer open={!!listingId} onClose={onClose} title="สินค้าบนร้าน" size="xl" storageKey="platform-listing-drawer" hasUnsavedChanges={dirty} footer={footer}>
        {error ? <ErrorState title={error} onRetry={() => setReload((n) => n + 1)} />
          : !detail ? <LoadingState label="กำลังโหลดสินค้าจากร้าน…" />
          : (
            <div className="space-y-3">
              {header}
              <ScrollTabs activeKey={tab} className="border-b border-slate-200">
                {tabs.map((t) => (
                  <button key={t.key} type="button" data-tab-key={t.key} onClick={() => setTab(t.key)} aria-pressed={tab === t.key}
                    className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === t.key ? "border-violet-500 font-medium text-violet-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{t.label}</button>
                ))}
              </ScrollTabs>
              {tab === "info" ? infoTab : tab === "images" ? imagesTab : tab === "options" ? optionsTab : tab === "match" ? matchTabBody : historyTab}
            </div>
          )}
      </Drawer>

      <ConfirmDialog open={ask && !!plan} onClose={() => { if (!saving) setAsk(false); }} onConfirm={() => void save()} loading={saving}
        title={`ส่งการแก้ไข ${plan?.changes.length ?? 0} ช่องขึ้นร้าน LINE?`} confirmText="ส่งขึ้น LINE"
        message={plan ? (
          <div className="space-y-2 text-sm">
            <p>ระบบจะแก้สินค้าบนร้าน LINE จริงตามนี้ (ส่งเฉพาะที่เปลี่ยน) · มีประวัติว่าใครแก้อะไร</p>
            <ul className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs">
              {plan.changes.map((c, i) => (
                <li key={i}><span className="font-medium text-slate-700">{c.label}:</span> <span className="text-slate-400 line-through">{c.before}</span> → <span className="text-slate-800">{c.after}</span></li>
              ))}
            </ul>
            {plan.warnings.map((w, i) => <p key={i} className="flex items-start gap-1 text-xs text-amber-700"><Icon name="warning" className="mt-0.5 shrink-0" />{w}</p>)}
          </div>
        ) : ""} />

      {disp.dialog}
      {line && <ImageLightbox images={line.images.map((u) => ({ url: u }))} index={lightbox} onClose={() => setLightbox(-1)} onIndex={setLightbox} />}
    </>
  );
}

