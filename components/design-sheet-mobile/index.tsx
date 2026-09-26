"use client";

/**
 * DesignSheetMobileView — หน้ารายละเอียดใบงานออกแบบ "แบบหน้าเต็ม" สำหรับมือถือ/แท็บเล็ต (ของกลาง)
 *
 * ทำไมไม่ใช้ป๊อปอัปเดิม: ป๊อปอัป design-sheet-detail ออกแบบไว้สำหรับจอคอม (2 คอลัมน์ + 4 แท็บ + ตารางตีราคา)
 * บนมือถือต้องซูม/เลื่อนหาปุ่ม → หน้านี้จัดใหม่เป็นแอปมือถือ: รูปใหญ่ปัดดูได้ · สถานะ/กำหนดส่ง/โน้ตแก้ได้ทันที
 * · Comment ลูกค้าเป็นไทม์ไลน์ + พิมพ์เพิ่มได้ · งานหนัก (ตีราคา/เสนอราคา/Parent SKU) ส่งต่อไปป๊อปอัปเต็มด้วยปุ่ม "แก้ไขเต็ม"
 *
 * ใช้ API เดิมทั้งหมด (ไม่มี query ใหม่): /api/design-sheets/[id] (+ /images /comments /cost-lines /quotes) และ /statuses
 * มือถือ = คอลัมน์เดียว · แท็บเล็ต/จอคอม = รูปซ้าย เนื้อหาขวา (ตัดสินด้วย layout ของ device-view ให้พรีวิวตรง)
 */
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DesignSheetImage } from "@/app/api/design-sheets/[id]/images/route";
import type { DesignSheetComment } from "@/app/api/design-sheets/[id]/comments/route";
import type { DesignSheetQuote } from "@/app/api/design-sheets/[id]/quotes/route";
import type { CostLine } from "@/app/api/design-sheets/[id]/cost-lines/route";
import { apiFetch } from "@/lib/api";
import { buildStatusMeta, QUOTE_STATUS, QUOTE_STATUS_OPTS, type WfStatusRow } from "@/lib/design-sheets-meta";
import { withImageWidth } from "@/lib/r2-image";
import { usePermission } from "@/components/auth";
import { useToast } from "@/components/toast";
import { ImageLightbox } from "@/components/image-lightbox";
import { useViewportLayout, useDeviceMode, DevicePreviewFrame, DEVICE_PARAM } from "@/components/device-view";

// ป๊อปอัปเต็ม (ของกลางเดิม) โหลดเฉพาะตอนกด "แก้ไขเต็ม"
const DesignSheetDetail = dynamic(() => import("@/components/design-sheet-detail").then((m) => m.DesignSheetsDetail), { ssr: false });
// drawer ดู SKU / Parent SKU (ของกลาง master-crud) โหลดเฉพาะตอนแตะ
const MasterRecordDrawer = dynamic(() => import("@/components/master-crud").then((m) => m.MasterRecordDrawer), { ssr: false });

type CostExtra = { label: string; amount: number };
// ค่าใช้จ่ายเพิ่ม (ค่าแรง/โสหุ้ย) เก็บได้ 2 แบบ: array (เดิม = ทั่วไป) หรือ object แยกตาม Parent — แปลงเป็น map เหมือนป๊อปอัปเต็ม
function parseCostExtra(raw: unknown): Record<string, CostExtra[]> {
  const norm = (a: unknown): CostExtra[] => (Array.isArray(a) ? a : []).map((c) => ({ label: String((c as CostExtra)?.label ?? ""), amount: Number((c as CostExtra)?.amount) || 0 }));
  if (raw && !Array.isArray(raw) && typeof raw === "object") {
    const out: Record<string, CostExtra[]> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) out[k] = norm(v);
    return out;
  }
  return { "": norm(raw) };
}

type Sheet = {
  id: string; code: string; name: string; status: string;
  brand_id: string | null; brand: { name: string; color: string | null } | null;
  order_date: string | null; deadline: string | null; appointment_date: string | null;
  drive_link: string | null; note: string | null; detail: string | null;
  parent_sku_refs: { code: string; id: string }[]; parent_sku_drafts?: string[] | null;
  linked_skus: { id: string; code: string; name_th: string | null; color: string | null; image_key: string | null; is_active: boolean; parent_code: string | null; from_sheet: boolean }[];
  updated_at: string;
  cost_extra?: unknown;   // ค่าใช้จ่ายเพิ่ม (ค่าแรง/โสหุ้ย) — array หรือ map ต่อ Parent
};

const todayStr = () => new Date().toISOString().slice(0, 10);
const money = (n: number | null | undefined) => (n == null ? "—" : `฿${Number(n).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`);
const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  const t = new Date(`${d}T00:00:00`);
  return Number.isNaN(t.getTime()) ? d : new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "2-digit" }).format(t);
};
function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}
function deadlineChip(deadline: string | null, finished: boolean): { text: string; cls: string } {
  if (finished) return { text: "ปิดงานแล้ว", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  const d = daysUntil(deadline);
  if (d === null) return { text: "ยังไม่กำหนดส่ง", cls: "bg-slate-50 text-slate-500 border-slate-200" };
  if (d < 0) return { text: `เกินกำหนด ${Math.abs(d)} วัน`, cls: "bg-rose-50 text-rose-700 border-rose-200" };
  if (d === 0) return { text: "ส่งวันนี้", cls: "bg-rose-50 text-rose-700 border-rose-200" };
  if (d <= 2) return { text: d === 1 ? "ส่งพรุ่งนี้" : `อีก ${d} วัน`, cls: "bg-amber-50 text-amber-700 border-amber-200" };
  return { text: `อีก ${d} วัน`, cls: "bg-slate-50 text-slate-600 border-slate-200" };
}

async function readJson<T>(r: Response, fallback: string): Promise<T> {
  const j = await r.json() as T & { error?: string | null };
  if (!r.ok || j.error) throw new Error(j.error || fallback);
  return j;
}

export function DesignSheetMobileView({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const canEdit = usePermission("products.edit");
  const viewport = useViewportLayout();
  const { mode, layout } = useDeviceMode(viewport);
  const isPhone = layout === "phone";

  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [statusRows, setStatusRows] = useState<WfStatusRow[]>([]);
  const [images, setImages] = useState<DesignSheetImage[]>([]);
  const [comments, setComments] = useState<DesignSheetComment[]>([]);
  const [costLines, setCostLines] = useState<CostLine[]>([]);
  const [quotes, setQuotes] = useState<DesignSheetQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [imgIdx, setImgIdx] = useState(0);           // รูปที่ปัดถึง (นับ 1/N)
  const [lightbox, setLightbox] = useState(-1);      // -1 = ปิด
  const [statusSheet, setStatusSheet] = useState(false);   // แผ่นเลือกสถานะ (เลื่อนขึ้นจากล่าง)
  const [saving, setSaving] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);     // รายละเอียดงานยาว → กางดูทั้งหมด
  const [newComment, setNewComment] = useState("");
  const [commentDate, setCommentDate] = useState(todayStr());
  const [editOpen, setEditOpen] = useState(false);         // ป๊อปอัปเต็ม
  const stripRef = useRef<HTMLDivElement>(null);
  const [openSec, setOpenSec] = useState<"cost" | "quote" | "sku" | null>(null);   // ส่วนที่กางอยู่ (ตีราคา/เสนอราคา/SKU)
  const [costParent, setCostParent] = useState("");                                // ตีราคา: แท็บ Parent ที่ดูอยู่ ("" = ทั่วไป)
  const [skuDrawer, setSkuDrawer] = useState<{ moduleKey: string; id: string } | null>(null);   // drawer ดู SKU/Parent
  const [quoteForm, setQuoteForm] = useState(false);
  const [newQ, setNewQ] = useState({ offered: "", qty: "", status: "pending", note: "", date: todayStr() });

  // โหลดข้อมูล: ชุดหลักก่อน (ใบงาน+สถานะ+รูป) แล้วค่อยชุดรอง (comment/ตีราคา/เสนอราคา) — ไม่ยิงพร้อมกัน 6 เส้น
  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true); setError(null);
    (async () => {
      const [s, st, im] = await Promise.all([
        apiFetch(`/api/design-sheets/${encodeURIComponent(id)}`).then((r) => readJson<{ data: Sheet }>(r, "โหลดใบงานไม่สำเร็จ")),
        apiFetch("/api/design-sheets/statuses").then((r) => readJson<{ data: WfStatusRow[] }>(r, "โหลดสถานะไม่สำเร็จ")),
        apiFetch(`/api/design-sheets/${encodeURIComponent(id)}/images`).then((r) => r.ok ? r.json() as Promise<{ data: DesignSheetImage[] }> : { data: [] }).catch(() => ({ data: [] })),
      ]);
      if (!alive) return;
      setSheet(s.data); setStatusRows(st.data); setImages(Array.isArray(im.data) ? im.data : []); setNote(s.data.note ?? "");
      setLoading(false);
      const [cm, cl, qt] = await Promise.all([
        apiFetch(`/api/design-sheets/${encodeURIComponent(id)}/comments`).then((r) => r.ok ? r.json() as Promise<{ data: DesignSheetComment[] }> : { data: [] }).catch(() => ({ data: [] })),
        apiFetch(`/api/design-sheets/${encodeURIComponent(id)}/cost-lines`).then((r) => r.ok ? r.json() as Promise<{ data: CostLine[] }> : { data: [] }).catch(() => ({ data: [] })),
        apiFetch(`/api/design-sheets/${encodeURIComponent(id)}/quotes`).then((r) => r.ok ? r.json() as Promise<{ data: DesignSheetQuote[] }> : { data: [] }).catch(() => ({ data: [] })),
      ]);
      if (!alive) return;
      setComments(Array.isArray(cm.data) ? cm.data : []); setCostLines(Array.isArray(cl.data) ? cl.data : []); setQuotes(Array.isArray(qt.data) ? qt.data : []);
    })().catch((e) => { if (alive) { setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); setLoading(false); } });
    return () => { alive = false; };
  }, [id, reloadKey]);

  const statusMeta = useMemo(() => buildStatusMeta(statusRows), [statusRows]);
  const finished = sheet ? statusMeta.finished.has(sheet.status) : false;
  const statusColor = sheet ? (statusMeta.colorHex[sheet.status] ?? "#94a3b8") : "#94a3b8";
  const statusLabel = sheet ? (statusMeta.map[sheet.status]?.label ?? sheet.status) : "";
  const brandColor = sheet?.brand?.color && /^#[0-9a-fA-F]{6}$/.test(sheet.brand.color) ? sheet.brand.color : "#94a3b8";
  const latestQuote = quotes.length ? quotes[quotes.length - 1] : null;
  const lightboxImages = images.map((im) => ({ url: im.url, label: im.source_label }));

  // บันทึกฟิลด์เดี่ยว (สถานะ / กำหนดส่ง / โน้ต) — optimistic + toast
  async function patchField(patch: Record<string, unknown>, label: string) {
    if (!sheet || !canEdit) return;
    const prev = sheet;
    setSaving(label);
    setSheet({ ...sheet, ...patch } as Sheet);
    try {
      const r = await apiFetch(`/api/design-sheets/${encodeURIComponent(sheet.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const j = await r.json() as { error?: string | null };
      if (!r.ok || j.error) throw new Error(j.error || `บันทึก${label}ไม่สำเร็จ`);
      toast.success(`บันทึก${label}แล้ว`);
    } catch (e) {
      setSheet(prev);
      toast.error(e instanceof Error ? e.message : `บันทึก${label}ไม่สำเร็จ`);
    } finally { setSaving(null); }
  }

  async function sendComment() {
    const text = newComment.trim();
    if (!sheet || !text) return;
    setSaving("comment");
    try {
      const r = await apiFetch(`/api/design-sheets/${encodeURIComponent(sheet.id)}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: text, comment_date: commentDate }) });
      const j = await r.json() as { error?: string | null };
      if (!r.ok || j.error) throw new Error(j.error || "บันทึก comment ไม่สำเร็จ");
      setNewComment("");
      const cm = await apiFetch(`/api/design-sheets/${encodeURIComponent(sheet.id)}/comments`).then((x) => x.json() as Promise<{ data: DesignSheetComment[] }>);
      setComments(Array.isArray(cm.data) ? cm.data : []);
      toast.success("เพิ่ม comment แล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึก comment ไม่สำเร็จ"); }
    finally { setSaving(null); }
  }

  async function sendQuote() {
    if (!sheet) return;
    const offered = newQ.offered.replace(/,/g, "").trim();
    if (!offered || !Number.isFinite(Number(offered))) { toast.warning("กรุณาใส่ราคาที่เสนอ"); return; }
    setSaving("quote");
    try {
      const r = await apiFetch(`/api/design-sheets/${encodeURIComponent(sheet.id)}/quotes`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote_date: newQ.date, price: grandTotal || null, offered_price: Number(offered), qty: newQ.qty.trim() ? Number(newQ.qty) : null, status: newQ.status, note: newQ.note, parent_code: costParent || null }) });
      const j = await r.json() as { error?: string | null };
      if (!r.ok || j.error) throw new Error(j.error || "บันทึกเสนอราคาไม่สำเร็จ");
      const qt = await apiFetch(`/api/design-sheets/${encodeURIComponent(sheet.id)}/quotes`).then((x) => x.json() as Promise<{ data: DesignSheetQuote[] }>);
      setQuotes(Array.isArray(qt.data) ? qt.data : []);
      setNewQ({ offered: "", qty: "", status: "pending", note: "", date: todayStr() }); setQuoteForm(false);
      toast.success("เพิ่มรอบเสนอราคาแล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกเสนอราคาไม่สำเร็จ"); }
    finally { setSaving(null); }
  }

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push(`/master/design-dashboard${mode === "auto" ? "" : `?${DEVICE_PARAM}=${mode}`}`);
  };
  const onStripScroll = () => {
    const el = stripRef.current; if (!el || el.clientWidth === 0) return;
    setImgIdx(Math.round(el.scrollLeft / el.clientWidth));
  };

  // ── ส่วนรูป (ปัดดู + นับ 1/N + แตะดูเต็มจอ) ──
  const hero = (
    <div className="relative overflow-hidden bg-slate-100">
      {images.length === 0 ? (
        <div className="flex aspect-square w-full items-center justify-center text-sm text-slate-400">ยังไม่มีรูปงาน</div>
      ) : (
        <div ref={stripRef} onScroll={onStripScroll} className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]">
          {images.map((im, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={im.key} src={withImageWidth(im.url, 900) ?? im.url} alt={im.source_label} loading={i === 0 ? "eager" : "lazy"}
              onClick={() => setLightbox(i)}
              className="aspect-square w-full shrink-0 snap-center cursor-zoom-in object-contain" />
          ))}
        </div>
      )}
      {images.length > 1 && (
        <>
          <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white">{imgIdx + 1} / {images.length}</span>
          <div className="pointer-events-none absolute bottom-3 left-0 right-0 flex justify-center gap-1">
            {images.map((im, i) => <span key={im.key} className={`h-1.5 rounded-full transition-all ${i === imgIdx ? "w-4 bg-white" : "w-1.5 bg-white/60"}`} />)}
          </div>
        </>
      )}
      {images[imgIdx] && <span className="absolute left-2 top-2 rounded-md bg-white/85 px-1.5 py-0.5 text-[10px] text-slate-600">{images[imgIdx].source_label}</span>}
    </div>
  );

  const sectionCls = "rounded-xl border border-slate-200 bg-white p-3 shadow-sm";
  const dl = sheet ? deadlineChip(sheet.deadline, finished) : null;

  // ── ตีราคา (อ่านอย่างเดียวบนมือถือ — แก้บรรทัด/เลือกวัสดุทำในป๊อปอัปเต็ม) ──
  const costExtraMap = useMemo(() => parseCostExtra(sheet?.cost_extra), [sheet?.cost_extra]);
  const costParents = useMemo(() => {   // แท็บ Parent ที่มีข้อมูล ("" = ทั่วไป มาก่อน)
    const s = new Set<string>([""]);
    for (const l of costLines) s.add(l.parent_code ?? "");
    for (const k of Object.keys(costExtraMap)) s.add(k);
    return Array.from(s);
  }, [costLines, costExtraMap]);
  const curLines = costLines.filter((l) => (l.parent_code ?? "") === costParent);
  const curExtra = costExtraMap[costParent] ?? [];
  const curMaterial = curLines.reduce((n, l) => n + (Number(l.amount) || 0), 0);
  const curExtraTotal = curExtra.reduce((n, c) => n + (Number(c.amount) || 0), 0);
  const grandTotal = curMaterial + curExtraTotal;
  const editFullBtn = (label: string) => (
    <button type="button" onClick={() => setEditOpen(true)} className="mt-2 inline-flex h-9 w-full items-center justify-center gap-1 rounded-lg border border-blue-200 bg-blue-50 text-xs font-medium text-blue-700">✏️ {label}</button>
  );
  const parentChips = (list: string[], value: string, onPick: (k: string) => void) => list.length > 1 && (
    <div className="mb-2 flex gap-1 overflow-x-auto pb-1">
      {list.map((k) => (
        <button key={k || "__general"} type="button" onClick={() => onPick(k)}
          className={`h-7 shrink-0 rounded-full border px-2.5 text-[11px] font-medium ${value === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600"}`}>{k || "ทั่วไป"}</button>
      ))}
    </div>
  );
  const costSection = (
    <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-3">
      {parentChips(costParents, costParent, setCostParent)}
      {curLines.length === 0 && curExtra.every((c) => !c.amount) ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white p-4 text-center text-xs text-slate-400">ยังไม่ตีราคา{costParent ? ` (${costParent})` : ""}</div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-500">วัสดุ {curLines.length} รายการ</div>
          {curLines.map((l, i) => (
            <div key={l.id ?? i} className="flex items-start gap-2 border-b border-slate-100 px-2.5 py-2 last:border-0">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-slate-800">{l.item_name || l.group_name || l.item_sku_code || "—"}</div>
                <div className="text-[11px] text-slate-400">
                  {l.qty != null ? `${Number(l.qty).toLocaleString("th-TH", { maximumFractionDigits: 3 })} ${l.uom ?? ""}` : "—"}
                  {l.unit_price != null && <> × {money(l.unit_price)}</>}
                  {l.note && <span className="ml-1 text-slate-300">· {l.note}</span>}
                </div>
              </div>
              <div className="shrink-0 text-sm font-medium tabular-nums text-slate-800">{money(l.amount)}</div>
            </div>
          ))}
          <div className="flex justify-between bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600"><span>รวมวัสดุ</span><span className="tabular-nums">{money(curMaterial)}</span></div>
          {curExtra.filter((c) => c.amount || c.label).map((c, i) => (
            <div key={i} className="flex justify-between border-t border-slate-100 px-2.5 py-1.5 text-xs text-slate-600"><span className="truncate">{c.label || "ค่าใช้จ่ายเพิ่ม"}</span><span className="tabular-nums">{money(c.amount)}</span></div>
          ))}
          <div className="flex justify-between border-t border-slate-200 bg-amber-50 px-2.5 py-2 text-sm font-semibold text-slate-900"><span>ต้นทุนรวม</span><span className="tabular-nums">{money(grandTotal)}</span></div>
        </div>
      )}
      {canEdit && editFullBtn("แก้ตีราคา / เลือกวัสดุ (หน้าเต็ม)")}
    </div>
  );

  // ── เสนอราคา: ไทม์ไลน์รอบ + เพิ่มรอบใหม่ได้จากมือถือ (ราคา/จำนวน/ผล/โน้ต) ──
  const quoteSection = (
    <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-3">
      {quotes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white p-4 text-center text-xs text-slate-400">ยังไม่เคยเสนอราคา</div>
      ) : (
        <div className="space-y-1.5">
          {[...quotes].reverse().map((q) => {
            const st = QUOTE_STATUS[q.status] ?? QUOTE_STATUS.pending;
            return (
              <div key={q.id} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">รอบ {q.round}</span>
                  <span className="text-[11px] text-slate-400">{fmtDate(q.quote_date)}{q.parent_code ? ` · ${q.parent_code}` : ""}</span>
                  <span className={`ml-auto rounded-md px-1.5 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span>
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-lg font-semibold tabular-nums text-slate-900">{money(q.offered_price ?? q.price)}</span>
                  {q.qty != null && <span className="text-[11px] text-slate-400">ที่ {Number(q.qty).toLocaleString("th-TH")} ชิ้น</span>}
                  {q.price != null && q.offered_price != null && q.price !== q.offered_price && <span className="text-[11px] text-slate-400">ต้นทุน {money(q.price)}</span>}
                </div>
                {q.note && <div className="mt-0.5 text-xs text-slate-500">{q.note}</div>}
              </div>
            );
          })}
        </div>
      )}
      {canEdit && !quoteForm && (
        <button type="button" onClick={() => setQuoteForm(true)} className="mt-2 inline-flex h-9 w-full items-center justify-center rounded-lg bg-slate-900 text-xs font-medium text-white">＋ เพิ่มรอบเสนอราคา</button>
      )}
      {canEdit && quoteForm && (
        <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-white p-2.5">
          {parentChips(costParents, costParent, setCostParent)}
          <div className="grid grid-cols-2 gap-2">
            <label className="block"><span className="text-[11px] text-slate-500">ราคาที่เสนอ (บาท)</span>
              <input inputMode="decimal" value={newQ.offered} onChange={(e) => setNewQ({ ...newQ, offered: e.target.value })} placeholder={grandTotal ? `ต้นทุน ${money(grandTotal)}` : "0"} className="mt-0.5 h-10 w-full rounded-lg border border-slate-200 px-2.5 text-base tabular-nums" /></label>
            <label className="block"><span className="text-[11px] text-slate-500">จำนวน (ชิ้น)</span>
              <input inputMode="numeric" value={newQ.qty} onChange={(e) => setNewQ({ ...newQ, qty: e.target.value })} placeholder="ไม่ระบุ" className="mt-0.5 h-10 w-full rounded-lg border border-slate-200 px-2.5 text-base tabular-nums" /></label>
            <label className="block"><span className="text-[11px] text-slate-500">ผล</span>
              <select value={newQ.status} onChange={(e) => setNewQ({ ...newQ, status: e.target.value })} className="mt-0.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm">
                {QUOTE_STATUS_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></label>
            <label className="block"><span className="text-[11px] text-slate-500">วันที่</span>
              <input type="date" value={newQ.date} onChange={(e) => setNewQ({ ...newQ, date: e.target.value })} className="mt-0.5 h-10 w-full rounded-lg border border-slate-200 px-2 text-sm" /></label>
          </div>
          <input value={newQ.note} onChange={(e) => setNewQ({ ...newQ, note: e.target.value })} placeholder="โน้ต เช่น ลูกค้าขอต่อรอง…" className="h-10 w-full rounded-lg border border-slate-200 px-2.5 text-sm" />
          <div className="flex gap-2">
            <button type="button" onClick={() => setQuoteForm(false)} className="h-10 flex-1 rounded-lg border border-slate-200 text-sm text-slate-600">ยกเลิก</button>
            <button type="button" onClick={() => void sendQuote()} disabled={saving === "quote"} className="h-10 flex-1 rounded-lg bg-blue-600 text-sm font-medium text-white disabled:opacity-50">{saving === "quote" ? "กำลังบันทึก…" : "บันทึกรอบนี้"}</button>
          </div>
        </div>
      )}
    </div>
  );

  // ── SKU ที่เชื่อม: Parent เป็นชิป (แตะดู) · SKU เป็นการ์ดรูป 2 ต่อแถว (แตะดูใน drawer กลาง) ──
  const skuSection = sheet && (
    <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-3">
      {sheet.parent_sku_refs.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {sheet.parent_sku_refs.map((p) => (
            <button key={p.id} type="button" onClick={() => setSkuDrawer({ moduleKey: "parent-skus-v2", id: p.id })}
              className="inline-flex h-7 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 font-mono text-[11px] font-medium text-emerald-700">📦 {p.code}</button>
          ))}
        </div>
      )}
      {sheet.linked_skus.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white p-4 text-center text-xs text-slate-400">ยังไม่มี SKU จากใบงานนี้</div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {sheet.linked_skus.map((s) => (
            <button key={s.id} type="button" onClick={() => setSkuDrawer({ moduleKey: "skus-v2", id: s.id })}
              className={`overflow-hidden rounded-lg border bg-white text-left ${s.from_sheet ? "border-slate-200" : "border-slate-100 opacity-70"}`}>
              {s.image_key ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={withImageWidth(`/api/r2-image?key=${encodeURIComponent(s.image_key)}`, 300) ?? ""} alt={s.code} loading="lazy" className="aspect-square w-full bg-slate-50 object-contain" />
              ) : <div className="flex aspect-square w-full items-center justify-center bg-slate-50 text-2xl">🏷️</div>}
              <div className="p-2">
                <div className="truncate font-mono text-[11px] text-slate-500">{s.code}</div>
                <div className="line-clamp-2 text-xs font-medium text-slate-800">{s.name_th ?? "—"}</div>
                <div className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-400">
                  {s.color && <span className="truncate">{s.color}</span>}
                  {!s.is_active && <span className="rounded bg-slate-100 px-1 text-slate-500">ปิดใช้</span>}
                  {!s.from_sheet && <span className="rounded bg-slate-100 px-1 text-slate-500">ของเดิม</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {canEdit && editFullBtn("ตั้ง Parent / สร้าง SKU (หน้าเต็ม)")}
    </div>
  );

  const content = sheet && (
    <div className="space-y-3">
      {/* ชื่อ + สถานะ + กำหนดส่ง */}
      <div className={sectionCls}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold leading-snug text-slate-900">{sheet.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: brandColor }} />{sheet.brand?.name ?? "ไม่ระบุแบรนด์"}</span>
              <span>·</span><span className="font-mono">{sheet.code}</span>
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {/* สถานะ: แตะเพื่อเปลี่ยน (แผ่นเลือกจากล่าง) */}
          <button type="button" onClick={() => canEdit && setStatusSheet(true)} disabled={!canEdit || saving === "สถานะ"}
            className="inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm font-semibold text-white shadow-sm disabled:opacity-70"
            style={{ backgroundColor: statusColor }}>
            <span className="h-2 w-2 rounded-full bg-white/80" />{statusLabel}{canEdit && <span className="text-xs opacity-80">▾</span>}
          </button>
          {dl && (
            <label className={`relative inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium ${dl.cls}`}>
              📅 {dl.text}{sheet.deadline && <span className="text-xs opacity-70">· {fmtDate(sheet.deadline)}</span>}
              {canEdit && <input type="date" value={sheet.deadline ?? ""} onChange={(e) => void patchField({ deadline: e.target.value || null }, "กำหนดส่ง")}
                className="absolute inset-0 cursor-pointer opacity-0" aria-label="เปลี่ยนวันกำหนดส่ง" />}
            </label>
          )}
        </div>
      </div>

      {/* ข้อมูลสั้น */}
      <div className={`${sectionCls} grid grid-cols-2 gap-x-3 gap-y-2 text-sm`}>
        <div><div className="text-[11px] text-slate-400">วันที่สั่ง</div><div className="text-slate-800">{fmtDate(sheet.order_date)}</div></div>
        <div><div className="text-[11px] text-slate-400">นัดลูกค้า</div><div className="text-slate-800">{fmtDate(sheet.appointment_date)}</div></div>
        <div className="col-span-2">
          <div className="text-[11px] text-slate-400">Parent SKU</div>
          {sheet.parent_sku_refs.length === 0 && !(sheet.parent_sku_drafts?.length) ? <div className="text-slate-400">ยังไม่ตั้ง</div> : (
            <div className="mt-0.5 flex flex-wrap gap-1">
              {sheet.parent_sku_refs.map((p) => <a key={p.id} href={`/master/skus?open=${encodeURIComponent(p.id)}`} className="rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-xs text-emerald-700">{p.code}</a>)}
              {(sheet.parent_sku_drafts ?? []).map((d) => <span key={d} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-500">ร่าง: {d}</span>)}
            </div>
          )}
        </div>
        {sheet.drive_link && (
          <a href={sheet.drive_link} target="_blank" rel="noreferrer" className="col-span-2 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 text-sm font-medium text-slate-700">📁 เปิดไฟล์งาน (Drive)</a>
        )}
      </div>

      {/* โน้ต — แก้ได้ทันที */}
      <div className={sectionCls}>
        <div className="mb-1 flex items-center justify-between"><span className="text-xs font-semibold text-slate-600">📝 โน้ต</span>
          {canEdit && note !== (sheet.note ?? "") && (
            <button type="button" onClick={() => void patchField({ note: note.trim() || null }, "โน้ต")} disabled={saving === "โน้ต"}
              className="h-7 rounded-md bg-slate-900 px-3 text-xs font-medium text-white disabled:opacity-50">{saving === "โน้ต" ? "กำลังบันทึก…" : "บันทึก"}</button>
          )}
        </div>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} disabled={!canEdit} rows={2} placeholder="พิมพ์โน้ตสั้น ๆ ที่ทีมต้องรู้…"
          className="w-full resize-none rounded-lg border border-amber-200 bg-amber-50/60 px-2.5 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:opacity-70" />
      </div>

      {/* รายละเอียดงาน (อ่านอย่างเดียว — แก้ในป๊อปอัปเต็ม) */}
      {sheet.detail && (
        <div className={sectionCls}>
          <div className="mb-1 text-xs font-semibold text-slate-600">📄 รายละเอียดงาน</div>
          <div className={`prose prose-sm max-w-none text-sm text-slate-700 [&_img]:max-w-full [&_img]:rounded-md ${detailOpen ? "" : "max-h-40 overflow-hidden"}`}
            dangerouslySetInnerHTML={{ __html: sheet.detail }} />
          <button type="button" onClick={() => setDetailOpen((o) => !o)} className="mt-1 text-xs font-medium text-blue-600">{detailOpen ? "ย่อ ▲" : "ดูทั้งหมด ▼"}</button>
        </div>
      )}

      {/* ความคืบหน้า: ตีราคา / เสนอราคา / SKU — แถวสรุป แตะ = กางดูรายละเอียดแบบมือถือ (งานแก้หนักส่งไปป๊อปอัปเต็ม) */}
      <div className={`${sectionCls} divide-y divide-slate-100 !p-0`}>
        {([
          { key: "cost", icon: "🧮", label: "ตีราคา", value: costLines.length ? `${costLines.length} รายการ · ต้นทุน ${money(grandTotal)}` : "ยังไม่ตีราคา", done: costLines.length > 0 },
          { key: "quote", icon: "💰", label: "เสนอราคา", value: latestQuote ? `รอบ ${latestQuote.round} · ${money(latestQuote.offered_price ?? latestQuote.price)} · ${QUOTE_STATUS[latestQuote.status]?.label ?? latestQuote.status}` : "ยังไม่เสนอราคา", done: !!latestQuote },
          { key: "sku", icon: "🏷️", label: "SKU ที่เชื่อม", value: sheet.linked_skus.length ? `${sheet.linked_skus.length} ตัว${sheet.parent_sku_refs.length ? ` · ${sheet.parent_sku_refs.length} Parent` : ""}` : "ยังไม่มี SKU", done: sheet.linked_skus.length > 0 },
        ] as const).map((row) => {
          const open = openSec === row.key;
          return (
            <div key={row.key}>
              <button type="button" onClick={() => setOpenSec(open ? null : row.key)} className={`flex w-full items-center gap-3 px-3 py-2.5 text-left ${open ? "bg-slate-50" : ""}`}>
                <span className="text-lg">{row.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-slate-400">{row.label}</span>
                  <span className={`block truncate text-sm ${row.done ? "text-slate-800" : "text-slate-400"}`}>{row.value}</span>
                </span>
                <span className={`text-slate-300 transition ${open ? "rotate-90" : ""}`}>›</span>
              </button>
              {open && row.key === "cost" && costSection}
              {open && row.key === "quote" && quoteSection}
              {open && row.key === "sku" && skuSection}
            </div>
          );
        })}
      </div>

      {/* Comment ลูกค้า — ไทม์ไลน์ + พิมพ์เพิ่ม */}
      <div className={sectionCls}>
        <div className="mb-2 text-xs font-semibold text-slate-600">💬 Comment ลูกค้า ({comments.length})</div>
        {comments.length === 0 ? <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">ยังไม่มี comment</div> : (
          <div className="space-y-2">
            {comments.map((c) => (
              <div key={c.id} className="rounded-lg bg-slate-50 px-2.5 py-2">
                <div className="text-[10px] text-slate-400">{fmtDate(c.comment_date)}</div>
                <div className="whitespace-pre-wrap text-sm text-slate-700">{c.body}</div>
                {c.images.length > 0 && (
                  <div className="mt-1.5 flex gap-1.5 overflow-x-auto">
                    {c.images.map((u) => {
                      const gi = images.findIndex((im) => im.url === u);
                      // eslint-disable-next-line @next/next/no-img-element
                      return <img key={u} src={withImageWidth(u, 200) ?? u} alt="" loading="lazy" onClick={() => gi >= 0 && setLightbox(gi)}
                        className="h-16 w-16 shrink-0 rounded-md border border-slate-200 object-cover" />;
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {canEdit && (
          <div className="mt-2 space-y-1.5">
            <textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} rows={2} placeholder="พิมพ์ comment จากลูกค้า…"
              className="w-full resize-none rounded-lg border border-slate-200 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
            <div className="flex items-center gap-2">
              <input type="date" value={commentDate} onChange={(e) => setCommentDate(e.target.value)} className="h-8 flex-1 rounded-md border border-slate-200 px-2 text-xs text-slate-600" />
              <button type="button" onClick={() => void sendComment()} disabled={!newComment.trim() || saving === "comment"}
                className="h-8 rounded-md bg-blue-600 px-4 text-xs font-medium text-white disabled:opacity-40">{saving === "comment" ? "กำลังส่ง…" : "ส่ง"}</button>
            </div>
          </div>
        )}
      </div>
      <div className="h-2" />
    </div>
  );

  const page = (
    <div className="min-h-[100dvh] bg-slate-50">
      {/* แถบบน: ย้อนกลับ · รหัส · แก้ไขเต็ม */}
      <div className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-slate-200 bg-white/95 px-2 backdrop-blur">
        <button type="button" onClick={goBack} aria-label="ย้อนกลับ" className="flex h-9 w-9 items-center justify-center rounded-lg text-xl text-slate-700 active:bg-slate-100">←</button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-xs text-slate-500">{sheet?.code ?? "…"}</div>
          <div className="truncate text-sm font-semibold text-slate-800">{sheet?.name ?? (loading ? "กำลังโหลด…" : "")}</div>
        </div>
        {sheet && canEdit && (
          <button type="button" onClick={() => setEditOpen(true)} className="h-8 shrink-0 rounded-md border border-blue-200 bg-white px-2.5 text-xs font-medium text-blue-700">✏️ แก้ไขเต็ม</button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3 p-3">
          <div className="aspect-square w-full animate-pulse rounded-xl bg-slate-200" />
          <div className="h-20 animate-pulse rounded-xl bg-slate-200" />
          <div className="h-32 animate-pulse rounded-xl bg-slate-200" />
        </div>
      ) : error || !sheet ? (
        <div className="m-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          โหลดใบงานไม่สำเร็จ: {error ?? "ไม่พบใบงาน"}
          <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="ml-2 underline">ลองใหม่</button>
        </div>
      ) : isPhone ? (
        <div className="pb-20">
          {hero}
          <div className="p-3">{content}</div>
        </div>
      ) : (
        /* แท็บเล็ต/จอคอม: รูปซ้าย (ติดขอบบนตอนเลื่อน) · เนื้อหาขวา */
        <div className="mx-auto grid max-w-5xl grid-cols-[minmax(280px,42%)_1fr] gap-4 p-4">
          <div className="sticky top-16 self-start overflow-hidden rounded-xl border border-slate-200">{hero}</div>
          <div>{content}</div>
        </div>
      )}

      {/* มือถือ: แถบปุ่มล่างติดจอ */}
      {isPhone && sheet && canEdit && (
        <div className="sticky bottom-0 z-20 flex gap-2 border-t border-slate-200 bg-white/95 p-2 backdrop-blur" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
          <button type="button" onClick={() => setStatusSheet(true)} className="h-11 flex-1 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: statusColor }}>🔀 เปลี่ยนสถานะ</button>
          <button type="button" onClick={() => setEditOpen(true)} className="h-11 flex-1 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-800">✏️ แก้ไขเต็ม</button>
        </div>
      )}

      {/* แผ่นเลือกสถานะ (เลื่อนขึ้นจากล่าง) — ไม่ portal เพื่อให้อยู่ในกรอบพรีวิวตอนดูบนจอคอม */}
      {statusSheet && sheet && (
        <div className="fixed inset-0 z-[70] flex items-end bg-black/40" onClick={() => setStatusSheet(false)}>
          <div className="max-h-[70vh] w-full overflow-y-auto rounded-t-2xl bg-white p-3 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-200" />
            <div className="mb-2 text-sm font-semibold text-slate-800">เปลี่ยนสถานะ</div>
            {statusMeta.opts.map(([key, label]) => {
              const on = key === sheet.status; const color = statusMeta.colorHex[key] ?? "#94a3b8";
              return (
                <button key={key} type="button" onClick={() => { setStatusSheet(false); if (!on) void patchField({ status: key }, "สถานะ"); }}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${on ? "bg-slate-100 font-semibold text-slate-900" : "text-slate-700 active:bg-slate-50"}`}>
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />{label}{on && <span className="ml-auto text-xs text-slate-400">ปัจจุบัน</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <ImageLightbox images={lightboxImages} index={lightbox} onClose={() => setLightbox(-1)} onIndex={setLightbox} />

      {/* drawer ดู SKU / Parent SKU (ของกลาง) */}
      {skuDrawer && <MasterRecordDrawer moduleKey={skuDrawer.moduleKey} recordId={skuDrawer.id} onClose={() => setSkuDrawer(null)} />}

      {/* ป๊อปอัปเต็ม (ของกลางเดิม) — ปิดแล้วโหลดหน้าใหม่ให้เห็นค่าที่แก้ */}
      {editOpen && sheet && (
        <DesignSheetDetail detailOnly openId={sheet.id} onDetailClose={() => { setEditOpen(false); setReloadKey((k) => k + 1); }} />
      )}
    </div>
  );

  // "กลับมุมมองจอคอม" (ปุ่มข้าง QR ตอนพรีวิว) = กลับไปบอร์ดแล้วเปิดใบนี้เป็นป๊อปอัปแบบจอคอม
  const exitPreview = () => router.push(`/master/design-dashboard?open=${encodeURIComponent(id)}`);
  return <DevicePreviewFrame layout={layout} viewport={viewport} onExitPreview={exitPreview}>{page}</DevicePreviewFrame>;
}
