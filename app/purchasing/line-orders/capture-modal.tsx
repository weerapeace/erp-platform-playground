"use client";

/**
 * ป๊อปตรวจ/ยืนยัน "คำสั่งซื้อจากไลน์" (ใบเดียว)
 *
 * ซ้าย: รูปต้นฉบับ (กดดูใหญ่) + ใครส่ง/เมื่อไหร่/AI มั่นใจแค่ไหน
 * ขวา: ข้อมูลที่ AI อ่าน (แก้ได้ทุกช่อง) + รายการสินค้า (จับคู่สินค้าในคลังด้วย SkuPicker กลาง)
 *      + ผูกกับใบสั่งซื้อ: ระบบเสนอ PO ที่ค้างและสินค้าใกล้เคียง → เลือกแล้วจับคู่บรรทัด / เปิด PO ใหม่ / เก็บไว้ก่อน
 * กดยืนยัน = ส่ง "ที่แก้ล่าสุด + วิธีผูก" ไปในคำขอเดียว (PATCH /api/purchasing/line-orders)
 *
 * ผล AI ไม่แตะใบสั่งซื้อจนกว่าคนกดยืนยันที่นี่เสมอ
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { SkuPicker } from "@/components/pickers";
import { ImageLightbox } from "@/components/image-lightbox";
import { PoDetailModal } from "@/components/po-detail-modal";
import { MoBomPicker } from "@/components/mo-bom-picker";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import {
  PLATFORM_LABEL, PO_STATUS_LABEL, curSym, fieldLabel, isCNY,
  type CaptureItem, type CapturePlatform, type CaptureRow, type PoLineLite, type PoSuggestion,
} from "@/lib/order-capture-shared";

type DupInfo = { id: string; status: string; sender_name: string | null; created_at: string; po_id: string | null };
type PoBrief = { id: string; po_no: string; seller_name: string; status: string; currency: string; order_date?: string | null; grand_total: number };
type Detail = { item: CaptureRow; dup: DupInfo | null; po: PoBrief | null; suggestions: PoSuggestion[] };
type Pick = PoBrief & { lines: PoLineLite[]; reasons?: string[] };
type Mode = "link" | "new" | "none";

type Draft = {
  platform: CapturePlatform | ""; shop_name: string; order_no: string; order_date: string; currency: "RMB" | "THB";
  items: CaptureItem[]; shipping_fee: string; discount: string; total_paid: string; tracking_no: string; note: string;
};

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const toNum = (v: string): number | null => { if (v.trim() === "") return null; const n = Number(v); return isFinite(n) ? n : null; };
const fmt = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const lineTotal = (it: CaptureItem) => (it.unit_price !== null && it.unit_price !== undefined ? it.unit_price * (it.qty || 0) : (it.line_total ?? 0));

function toDraft(c: CaptureRow): Draft {
  return {
    platform: c.platform ?? "", shop_name: s(c.shop_name), order_no: s(c.order_no), order_date: s(c.order_date).slice(0, 10),
    currency: isCNY(c.currency) ? "RMB" : "THB", items: c.items.map((it) => ({ ...it })),
    shipping_fee: s(c.shipping_fee), discount: s(c.discount), total_paid: s(c.total_paid), tracking_no: s(c.tracking_no), note: s(c.note),
  };
}
const draftFields = (d: Draft) => ({
  platform: d.platform || null, shop_name: d.shop_name, order_no: d.order_no, order_date: d.order_date || null, currency: d.currency,
  items: d.items, shipping_fee: toNum(d.shipping_fee), discount: toNum(d.discount), total_paid: toNum(d.total_paid),
  tracking_no: d.tracking_no, note: d.note,
});

export function CaptureModal({ id, canEdit, onClose, onOpen, onChanged }: {
  id: string;
  canEdit: boolean;
  onClose: () => void;
  /** เปิดใบอื่น (เช่น ใบที่เลขซ้ำ) */
  onOpen: (id: string) => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState<Mode>("new");
  const [pick, setPick] = useState<Pick | null>(null);
  const [updatePrices, setUpdatePrices] = useState(true);
  const [sellerName, setSellerName] = useState("");
  const [poQ, setPoQ] = useState("");
  const [poResults, setPoResults] = useState<PoBrief[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState(-1);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [dupConfirm, setDupConfirm] = useState<string | null>(null);
  const [rereadAsk, setRereadAsk] = useState(false);
  const [poOpen, setPoOpen] = useState<string | null>(null);
  /** รายการที่กำลังเลือกวัตถุดิบจากใบสั่งผลิต (index) */
  const [bomFor, setBomFor] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setLoadErr(null);
    try {
      const r = await apiFetch(`/api/purchasing/line-orders?id=${encodeURIComponent(id)}`);
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
      const d = j as Detail;
      setDetail(d);
      const dr = toDraft(d.item);
      // มี PO ที่ระบบเสนอ → เลือกอันแรกไว้ให้ + เติมการจับคู่บรรทัด (เฉพาะรายการที่ยังไม่ได้เลือกเอง)
      const top = d.suggestions[0];
      if (d.item.status === "pending" && top) {
        setMode("link");
        setPick({ ...top });
        dr.items = dr.items.map((it, i) => (it.po_line_id ? it : { ...it, po_line_id: top.mapping[i] ?? null }));
      } else {
        setMode("new"); setPick(null);
      }
      setDraft(dr); setDirty(false); setFormErr(null);
      setSellerName(d.item.platform && d.item.platform !== "other" ? PLATFORM_LABEL[d.item.platform] : s(d.item.shop_name));
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  // ค้น PO เอง (หน่วง 300ms)
  useEffect(() => {
    if (mode !== "link" || !poQ.trim()) { setPoResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await apiFetch(`/api/purchasing/line-orders?po_search=${encodeURIComponent(poQ.trim())}`);
        const j = await r.json(); if (r.ok && !j.error) setPoResults(j.rows as PoBrief[]);
      } catch { /* ค้นไม่ได้ก็แค่ไม่มีผล */ }
    }, 300);
    return () => clearTimeout(t);
  }, [poQ, mode]);

  const cap = detail?.item ?? null;
  const pending = cap?.status === "pending";
  const editableAll = canEdit && pending;
  const editableLate = canEdit && cap?.status === "confirmed";   // ยืนยันแล้ว: แก้ได้แค่เลขพัสดุ/หมายเหตุ

  const set = (patch: Partial<Draft>) => { setDraft((d) => (d ? { ...d, ...patch } : d)); setDirty(true); setFormErr(null); };
  const setItem = (i: number, patch: Partial<CaptureItem>) =>
    set({ items: (draft?.items ?? []).map((it, k) => (k === i ? { ...it, ...patch } : it)) });

  const choosePick = (p: Pick, mapping?: (string | null)[]) => {
    setPick(p);
    if (draft) set({ items: draft.items.map((it, i) => ({ ...it, po_line_id: mapping ? mapping[i] ?? null : null })) });
  };
  const chooseSearched = async (p: PoBrief) => {
    try {
      const r = await apiFetch(`/api/purchasing/line-orders?po_lines=${encodeURIComponent(p.id)}`);
      const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || "โหลดใบสั่งซื้อไม่สำเร็จ");
      choosePick({ ...(j.po as PoBrief), lines: j.lines as PoLineLite[] });
      setPoQ(""); setPoResults([]);
    } catch (e) { toast.error(e instanceof Error ? e.message : "โหลดใบสั่งซื้อไม่สำเร็จ"); }
  };

  // ตรวจยอด: รวมรายการ + ค่าส่ง − ส่วนลด เทียบยอดจ่ายจริง
  const sums = useMemo(() => {
    if (!draft) return null;
    const items = draft.items.reduce((a, it) => a + lineTotal(it), 0);
    const expected = items + (toNum(draft.shipping_fee) ?? 0) - (toNum(draft.discount) ?? 0);
    const paid = toNum(draft.total_paid);
    return { items, expected, paid, off: paid !== null && Math.abs(paid - expected) > 0.05 };
  }, [draft]);

  const patch = async (body: Record<string, unknown>, label: string): Promise<Record<string, unknown> | null> => {
    setBusy(label);
    try {
      const r = await apiFetch("/api/purchasing/line-orders", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }),
      });
      const j = await r.json();
      if (r.status === 409) { setDupConfirm(String(j.error)); return null; }
      if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
      return j as Record<string, unknown>;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ไม่สำเร็จ");
      return null;
    } finally { setBusy(null); }
  };

  const save = async () => {
    if (!draft) return;
    const fields = editableAll ? draftFields(draft) : { tracking_no: draft.tracking_no, note: draft.note };
    const j = await patch({ fields }, "save");
    if (j) { toast.success("บันทึกแล้ว"); onChanged(); await load(); }
  };

  const confirm = async (force = false) => {
    if (!draft) return;
    if (mode !== "none" && draft.items.length === 0) { setFormErr("ยังไม่มีรายการสินค้า — เพิ่มรายการก่อน หรือเลือก \"เก็บไว้ก่อน\""); return; }
    if (draft.items.some((it) => !(it.qty > 0))) { setFormErr("จำนวนต้องมากกว่า 0 ทุกรายการ"); return; }
    if (mode === "link" && !pick) { setFormErr("ยังไม่ได้เลือกใบสั่งซื้อที่จะผูก"); return; }
    if (mode === "new" && !sellerName.trim()) { setFormErr("ใส่ชื่อร้านในใบสั่งซื้อก่อน"); return; }
    const j = await patch({
      fields: draftFields(draft), action: "confirm",
      confirm: { mode, po_id: pick?.id ?? null, update_prices: updatePrices, seller_name: sellerName.trim(), force },
    }, "confirm");
    if (!j) return;
    setDirty(false);
    const poNo = j.po_no ? String(j.po_no) : "";
    toast.success(mode === "new" ? `ยืนยันแล้ว · เปิด ${poNo}` : mode === "link" ? `ยืนยันแล้ว · ผูกกับ ${poNo}` : "ยืนยันแล้ว (ยังไม่ผูกใบสั่งซื้อ)");
    for (const w of (j.warnings as string[] | undefined) ?? []) toast.warning(w);
    onChanged(); onClose();
  };

  const doReject = async () => {
    const j = await patch({ action: "reject", reason: rejectReason }, "reject");
    if (j) { setRejectOpen(false); setDirty(false); toast.success("ตีตกแล้ว (กู้คืนได้ที่แท็บตีตก)"); onChanged(); onClose(); }
  };
  const doRestore = async () => {
    const j = await patch({ action: "restore" }, "restore");
    if (j) { toast.success("กู้คืนเป็นรอตรวจแล้ว"); onChanged(); await load(); }
  };
  const doReread = async () => {
    setRereadAsk(false);
    const j = await patch({ action: "reread" }, "reread");
    if (j) { toast.success("AI อ่านใหม่แล้ว"); onChanged(); await load(); }
  };

  const sym = curSym(draft?.currency);
  const inp = "h-8 px-2 text-sm border border-slate-200 rounded-md w-full disabled:bg-slate-50 disabled:text-slate-600";
  const lbl = "block text-[11px] font-medium text-slate-500 mb-0.5";
  const images = (cap?.image_keys ?? []).map((k, i) => ({ url: r2ImageUrl(k) ?? "", label: `รูปที่ ${i + 1}` }));
  const curMismatch = mode === "link" && pick && draft ? isCNY(pick.currency) !== (draft.currency === "RMB") : false;

  return (
    <>
      <ERPModal open onClose={onClose} size="xl" storageKey="line-order-capture"
        title={cap ? `🧾 ${cap.platform ? PLATFORM_LABEL[cap.platform] : "คำสั่งซื้อ"}${cap.shop_name ? ` · ${cap.shop_name}` : ""}` : "คำสั่งซื้อจากไลน์"}
        description={cap ? `${cap.source === "upload" ? "📤 อัปโดย" : "💬 ส่งในไลน์โดย"} ${cap.sender_name || "—"} · ${when(cap.created_at)}` : undefined}
        hasUnsavedChanges={dirty}
        footer={cap && draft ? (
          <div className="flex flex-wrap items-center justify-between w-full gap-2">
            <div className="flex gap-2">
              {pending && canEdit && (
                <>
                  <button onClick={() => { setRejectReason(cap.dup_of ? "รูปซ้ำ" : ""); setRejectOpen(true); }} disabled={!!busy}
                    className="h-9 px-3 rounded-lg border border-rose-200 bg-white text-rose-600 text-sm hover:bg-rose-50 disabled:opacity-50">🚫 ตีตก</button>
                  <button onClick={() => (dirty ? setRereadAsk(true) : void doReread())} disabled={!!busy}
                    className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm hover:bg-slate-50 disabled:opacity-50">
                    {busy === "reread" ? "⏳ กำลังอ่าน…" : "🔄 ให้ AI อ่านใหม่"}
                  </button>
                </>
              )}
              {cap.status === "rejected" && canEdit && (
                <button onClick={() => void doRestore()} disabled={!!busy}
                  className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm hover:bg-slate-50 disabled:opacity-50">↩️ กู้คืน</button>
              )}
            </div>
            <div className="flex gap-2">
              {(editableAll || editableLate) && dirty && (
                <button onClick={() => void save()} disabled={!!busy}
                  className="h-9 px-4 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm hover:bg-slate-50 disabled:opacity-50">
                  {busy === "save" ? "กำลังบันทึก…" : "💾 บันทึก"}
                </button>
              )}
              {editableAll && (
                <button onClick={() => void confirm()} disabled={!!busy}
                  className="h-9 px-5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {busy === "confirm" ? "กำลังยืนยัน…" : "✓ ยืนยัน"}
                </button>
              )}
            </div>
          </div>
        ) : undefined}
      >
        {loading ? <div className="py-12 text-center text-sm text-slate-400">กำลังโหลด…</div>
          : loadErr || !cap || !draft ? (
            <div className="py-12 text-center text-sm text-rose-600">⚠️ {loadErr ?? "ไม่พบคำสั่งซื้อนี้"} <button onClick={() => void load()} className="ml-2 underline">ลองใหม่</button></div>
          ) : (
          <div className="space-y-3">
            {/* ---- คำเตือน ---- */}
            {detail?.dup && cap.status !== "rejected" && (
              <div className="text-sm bg-rose-50 border border-rose-200 text-rose-800 rounded-lg px-3 py-2">
                ⚠️ เลขคำสั่งซื้อนี้ส่งมาแล้วเมื่อ {when(detail.dup.created_at)}{detail.dup.sender_name ? ` โดย ${detail.dup.sender_name}` : ""}
                {detail.dup.status === "confirmed" ? " (ยืนยันไปแล้ว)" : ""} — อาจเป็นรูปซ้ำหรือซื้อซ้ำ
                <button onClick={() => onOpen(detail.dup!.id)} className="ml-2 underline">เปิดใบนั้น</button>
              </div>
            )}
            {cap.ai_is_order === false && <div className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">🤔 AI คิดว่ารูปนี้ไม่ใช่หน้าคำสั่งซื้อ — ถ้าไม่ใช่ให้ตีตก</div>}
            {cap.ai_error && <div className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">⚠️ {cap.ai_error}</div>}
            {cap.ai_unreadable.length > 0 && pending && (
              <div className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
                👀 AI อ่านไม่ชัด: {cap.ai_unreadable.map(fieldLabel).join(", ")} — ดูจากรูปแล้วกรอก/แก้เอง
              </div>
            )}
            {cap.ai_notes && <div className="text-xs text-slate-500 px-1">📝 AI: {cap.ai_notes}</div>}

            <div className="grid md:grid-cols-[200px_minmax(0,1fr)] gap-4">
              {/* ---- รูปต้นฉบับ ---- */}
              <div className="space-y-2">
                {images.length === 0 ? <div className="h-40 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 text-sm">ไม่มีรูป</div>
                  : images.map((im, i) => (
                    <button key={i} type="button" onClick={() => setLightbox(i)} title="กดดูรูปใหญ่"
                      className="block w-full rounded-lg overflow-hidden border border-slate-200 hover:border-blue-300">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r2ImageUrl(cap.image_keys[i], 480) ?? undefined} alt={im.label} className="w-full max-h-[420px] object-cover object-top" />
                    </button>
                  ))}
                <div className="text-[11px] text-slate-500 space-y-0.5 bg-slate-50 rounded-lg px-2.5 py-2">
                  {cap.ai_confidence !== null && <div>AI มั่นใจ <b className="text-slate-700">{Math.round(cap.ai_confidence)}%</b></div>}
                  {cap.ai_read_at && <div>อ่านเมื่อ {when(cap.ai_read_at)}</div>}
                  <div>🔒 รูปมีชื่อ/ที่อยู่ผู้รับ ดูได้เฉพาะคนมีสิทธิ์</div>
                </div>
              </div>

              <div className="space-y-3 min-w-0">
                {/* ---- หัวคำสั่งซื้อ ---- */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div><label className={lbl}>แพลตฟอร์ม</label>
                    <select value={draft.platform} disabled={!editableAll} onChange={(e) => set({ platform: e.target.value as CapturePlatform | "" })} className={inp}>
                      <option value="">—</option>
                      {(Object.keys(PLATFORM_LABEL) as CapturePlatform[]).map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}
                    </select></div>
                  <div className="col-span-1 sm:col-span-2"><label className={lbl}>ร้าน</label>
                    <input value={draft.shop_name} disabled={!editableAll} onChange={(e) => set({ shop_name: e.target.value })} className={inp} /></div>
                  <div><label className={lbl}>สกุลเงิน</label>
                    <div className="inline-flex rounded-md border border-slate-200 overflow-hidden text-sm w-full">
                      {(["THB", "RMB"] as const).map((c) => (
                        <button key={c} type="button" disabled={!editableAll} onClick={() => set({ currency: c })}
                          className={`h-8 flex-1 ${c === "RMB" ? "border-l border-slate-200" : ""} ${draft.currency === c ? "bg-blue-50 text-blue-700 font-medium" : "bg-white text-slate-500"}`}>
                          {c === "THB" ? "฿ บาท" : "¥ หยวน"}
                        </button>
                      ))}
                    </div></div>
                  <div className="col-span-2"><label className={lbl}>เลขคำสั่งซื้อ</label>
                    <input value={draft.order_no} disabled={!editableAll} onChange={(e) => set({ order_no: e.target.value })} className={inp + " font-mono"} /></div>
                  <div><label className={lbl}>วันที่สั่ง</label>
                    <input type="date" value={draft.order_date} disabled={!editableAll} onChange={(e) => set({ order_date: e.target.value })} className={inp} /></div>
                  <div><label className={lbl}>เลขพัสดุ</label>
                    <input value={draft.tracking_no} disabled={!(editableAll || editableLate)} onChange={(e) => set({ tracking_no: e.target.value })} className={inp + " font-mono"} placeholder="(ถ้ามี)" /></div>
                  <div><label className={lbl}>ค่าส่ง ({sym})</label>
                    <input type="number" step="any" value={draft.shipping_fee} disabled={!editableAll} onChange={(e) => set({ shipping_fee: e.target.value })}
                      className={inp + " text-right tabular-nums" + (cap.ai_unreadable.includes("shipping_fee") && pending ? " border-amber-400" : "")} /></div>
                  <div><label className={lbl}>ส่วนลด ({sym})</label>
                    <input type="number" step="any" value={draft.discount} disabled={!editableAll} onChange={(e) => set({ discount: e.target.value })} className={inp + " text-right tabular-nums"} /></div>
                  <div className="col-span-2"><label className={lbl}>ยอดจ่ายจริง ({sym})</label>
                    <input type="number" step="any" value={draft.total_paid} disabled={!editableAll} onChange={(e) => set({ total_paid: e.target.value })}
                      className={inp + " text-right tabular-nums font-semibold" + (cap.ai_unreadable.includes("total_paid") && pending ? " border-amber-400" : "")} /></div>
                </div>

                {/* ---- รายการสินค้า ---- */}
                <div className="border border-slate-200 rounded-lg">
                  <div className="px-2.5 py-1.5 bg-slate-50 text-[11px] font-medium text-slate-500 flex justify-between rounded-t-lg">
                    <span>รายการสินค้า ({draft.items.length})</span>
                    {mode === "link" && pick && pending && <span>จับคู่กับบรรทัดใน {pick.po_no} ได้ที่แต่ละรายการ</span>}
                  </div>
                  <div className="divide-y divide-slate-100">
                    {draft.items.length === 0 && <div className="p-4 text-center text-sm text-slate-400">ยังไม่มีรายการ</div>}
                    {draft.items.map((it, i) => (
                      <div key={i} className="p-2 space-y-1.5">
                        <div className="grid grid-cols-[minmax(0,1fr)_64px_84px_80px_28px] gap-1.5 items-center">
                          <input value={it.name_th} disabled={!editableAll} onChange={(e) => setItem(i, { name_th: e.target.value })} className={inp} placeholder="ชื่อสินค้า (ไทย)" />
                          <input type="number" step="any" value={s(it.qty)} disabled={!editableAll} onChange={(e) => setItem(i, { qty: Number(e.target.value) || 0 })} className={inp + " text-right tabular-nums"} title="จำนวน" />
                          <input type="number" step="any" value={s(it.unit_price)} disabled={!editableAll} onChange={(e) => setItem(i, { unit_price: toNum(e.target.value), line_total: null })} className={inp + " text-right tabular-nums"} placeholder="ราคา/ชิ้น" title="ราคาต่อชิ้น" />
                          <div className="text-sm text-right tabular-nums text-slate-700">{sym}{fmt(lineTotal(it))}</div>
                          {editableAll
                            ? <button type="button" onClick={() => set({ items: draft.items.filter((_, k) => k !== i) })} title="ลบรายการ"
                                className="h-7 w-7 rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600">🗑</button>
                            : <span />}
                        </div>
                        <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-1.5 items-center">
                          <input value={it.option} disabled={!editableAll} onChange={(e) => setItem(i, { option: e.target.value })} className={inp + " text-xs"} placeholder="ตัวเลือก (สี/ขนาด)" />
                          <div className={`flex gap-1.5 items-center ${editableAll ? "" : "pointer-events-none opacity-80"}`}>
                            <div className="flex-1 min-w-0">
                              <SkuPicker
                                // เลือกจากใบสั่งผลิตได้แค่รหัส (id เติมให้ตอนบันทึก) → โชว์รหัส/ชื่อไปก่อน
                                value={it.sku_id || it.sku_code ? { id: it.sku_id ?? it.sku_code ?? "", code: it.sku_code ?? "", name: it.sku_name ?? "" } : null}
                                onChange={(p) => setItem(i, p ? { sku_id: p.id, sku_code: p.code, sku_name: p.name } : { sku_id: null, sku_code: null, sku_name: null, mo_no: null })}
                                placeholder="จับคู่สินค้าในคลัง (ไม่บังคับ)"
                              />
                            </div>
                            {editableAll && (
                              <button type="button" onClick={() => setBomFor(i)} title="เลือกวัตถุดิบจากใบสั่งผลิต (BOM)"
                                className="h-8 px-2 rounded-md border border-slate-200 bg-white text-xs text-slate-700 hover:bg-slate-50 shrink-0">🏭 จากใบสั่งผลิต</button>
                            )}
                          </div>
                        </div>
                        {it.mo_no && (
                          <div className="flex items-center gap-1.5 text-[11px]">
                            <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">🏭 ซื้อให้ {it.mo_no}</span>
                            {editableAll && <button type="button" onClick={() => setItem(i, { mo_no: null })} className="text-slate-400 hover:text-rose-600" title="เอาใบสั่งผลิตออก">✕</button>}
                          </div>
                        )}
                        {it.name && it.name !== it.name_th && <div className="text-[11px] text-slate-400 truncate" title={it.name}>ตามรูป: {it.name}</div>}
                        {mode === "link" && pick && pending && (
                          <select value={it.po_line_id ?? ""} onChange={(e) => setItem(i, { po_line_id: e.target.value || null })}
                            className={inp + " text-xs " + (it.po_line_id ? "border-blue-300 bg-blue-50/40" : "")}>
                            <option value="">— ไม่ผูกกับบรรทัดในใบ —</option>
                            {pick.lines.map((l) => (
                              <option key={l.id} value={l.id}>
                                ↔ {l.item_name} ×{l.qty}{l.price_est ? ` @${curSym(pick.currency)}${fmt(l.price_est)}` : " (ยังไม่มีราคา)"}
                              </option>
                            ))}
                            <option value="new">➕ เพิ่มเป็นบรรทัดใหม่ใน {pick.po_no}</option>
                          </select>
                        )}
                      </div>
                    ))}
                  </div>
                  {editableAll && (
                    <button type="button" onClick={() => set({ items: [...draft.items, { name: "", name_th: "", option: "", qty: 1, unit_price: null, line_total: null }] })}
                      className="w-full h-8 text-xs text-blue-600 hover:bg-blue-50 border-t border-slate-100 rounded-b-lg">+ เพิ่มรายการ</button>
                  )}
                </div>

                {/* ---- ตรวจยอด ---- */}
                {sums && (
                  <div className={`text-xs rounded-lg px-3 py-2 ${sums.off ? "bg-amber-50 text-amber-800 border border-amber-200" : "bg-slate-50 text-slate-600"}`}>
                    รวมรายการ {sym}{fmt(sums.items)}
                    {toNum(draft.shipping_fee) ? ` + ค่าส่ง ${sym}${fmt(toNum(draft.shipping_fee)!)}` : ""}
                    {toNum(draft.discount) ? ` − ส่วนลด ${sym}${fmt(toNum(draft.discount)!)}` : ""}
                    {` = ${sym}${fmt(sums.expected)}`}
                    {sums.paid !== null && (sums.off ? ` ⚠ ไม่ตรงกับยอดจ่ายจริง ${sym}${fmt(sums.paid)} — ตรวจราคา/ค่าส่งอีกครั้ง` : " ✓ ตรงกับยอดจ่ายจริง")}
                  </div>
                )}

                <div><label className={lbl}>หมายเหตุ</label>
                  <input value={draft.note} disabled={!(editableAll || editableLate)} onChange={(e) => set({ note: e.target.value })} className={inp} placeholder="(ถ้ามี)" /></div>

                {/* ---- ผูกกับใบสั่งซื้อ (เฉพาะรอตรวจ) ---- */}
                {pending && canEdit && (
                  <div className="border border-slate-200 rounded-lg p-3 space-y-2">
                    <div className="text-sm font-semibold text-slate-800">ผูกกับใบสั่งซื้อ</div>
                    <div className="grid sm:grid-cols-3 gap-2">
                      {([
                        ["link", "🔗 ผูก PO เดิม", detail?.suggestions.length ? `ระบบเจอ ${detail.suggestions.length} ใบที่น่าจะใช่` : "เลือกจากใบที่ยังค้าง"],
                        ["new", "➕ เปิด PO ใหม่", "สร้างใบร่างจากคำสั่งซื้อนี้"],
                        ["none", "📥 เก็บไว้ก่อน", "บันทึกว่าตรวจแล้ว ยังไม่แตะใบสั่งซื้อ"],
                      ] as [Mode, string, string][]).map(([m, title, sub]) => (
                        <button key={m} type="button" onClick={() => { setMode(m); setFormErr(null); }}
                          className={`text-left rounded-lg px-3 py-2 border ${mode === m ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                          <div className="text-sm font-medium text-slate-800">{title}</div>
                          <div className="text-[11px] text-slate-500">{sub}</div>
                        </button>
                      ))}
                    </div>

                    {mode === "link" && (
                      <div className="space-y-2">
                        {(detail?.suggestions ?? []).length > 0
                          ? <div className="text-[11px] text-slate-500">💡 ใบที่ยังค้างและมีสินค้าใกล้เคียง — เลือกใบที่ใช่</div>
                          : <div className="text-[11px] text-amber-700">ไม่เจอใบที่ค้างและสินค้าใกล้เคียง — ค้นหาเองด้านล่าง หรือเลือก &quot;เปิด PO ใหม่&quot;</div>}
                        {(detail?.suggestions ?? []).map((sg) => (
                          <button key={sg.id} type="button" onClick={() => choosePick({ ...sg }, sg.mapping)}
                            className={`w-full text-left rounded-lg px-3 py-2 border text-sm ${pick?.id === sg.id ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                            <span className="font-semibold text-slate-800">{pick?.id === sg.id ? "◉" : "○"} {sg.po_no}</span>
                            <span className="text-slate-500"> · {sg.seller_name} · {PO_STATUS_LABEL[sg.status] ?? sg.status} · {sg.lines.length} รายการ</span>
                            <div className="text-[11px] text-slate-500 mt-0.5">{sg.reasons.join(" · ")}</div>
                          </button>
                        ))}
                        {pick && !(detail?.suggestions ?? []).some((sg) => sg.id === pick.id) && (
                          <div className="rounded-lg px-3 py-2 border border-blue-500 bg-blue-50 text-sm">
                            <span className="font-semibold text-slate-800">◉ {pick.po_no}</span>
                            <span className="text-slate-500"> · {pick.seller_name} · {PO_STATUS_LABEL[pick.status] ?? pick.status} · {pick.lines.length} รายการ</span>
                          </div>
                        )}
                        <div className="relative">
                          <input value={poQ} onChange={(e) => setPoQ(e.target.value)} placeholder="🔍 ค้นหา PO อื่น: เลขที่ หรือชื่อร้าน" className={inp} />
                          {poResults.length > 0 && (
                            <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                              {poResults.map((p) => (
                                <button key={p.id} type="button" onClick={() => void chooseSearched(p)}
                                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 border-b border-slate-50 last:border-0">
                                  <b>{p.po_no}</b> <span className="text-slate-500">· {p.seller_name} · {PO_STATUS_LABEL[p.status] ?? p.status}{p.order_date ? ` · ${new Date(p.order_date).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}` : ""}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        {pick && (
                          <label className="flex items-start gap-2 text-sm text-slate-700">
                            <input type="checkbox" checked={updatePrices} onChange={(e) => setUpdatePrices(e.target.checked)} className="mt-1" />
                            <span>ใส่ราคาจริงจากรูปลงใบ {pick.po_no} (เฉพาะรายการที่จับคู่) · จำนวนในใบไม่เปลี่ยน
                              {curMismatch && <span className="block text-[11px] text-amber-700">⚠ สกุลเงินในรูปไม่ตรงกับใบ — ระบบจะไม่ใส่ราคาให้</span>}
                            </span>
                          </label>
                        )}
                      </div>
                    )}

                    {mode === "new" && (
                      <div className="space-y-1">
                        <label className={lbl}>ชื่อร้านในใบสั่งซื้อ</label>
                        <input value={sellerName} onChange={(e) => { setSellerName(e.target.value); setFormErr(null); }} className={inp} placeholder="เช่น Taobao" />
                        <div className="text-[11px] text-slate-500">
                          จะสร้างใบสั่งซื้อสถานะ &quot;ร่าง&quot; {draft.items.length} รายการ ยอด {sym}{fmt(sums?.items ?? 0)} · ชื่อร้านตรงกับทะเบียนคู่ค้า ระบบผูกให้เอง
                        </div>
                      </div>
                    )}
                    {mode === "none" && <div className="text-[11px] text-slate-500">บันทึกว่าตรวจแล้ว เก็บรูปและข้อมูลไว้ค้นหาย้อนหลัง — ไม่แตะใบสั่งซื้อใด ๆ</div>}
                    {formErr && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-2 py-1.5">⚠️ {formErr}</div>}
                  </div>
                )}

                {/* ---- สถานะหลังยืนยัน / ตีตก ---- */}
                {cap.status === "confirmed" && (
                  <div className="text-sm bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-3 py-2 flex flex-wrap items-center gap-2">
                    <span>✓ ยืนยันโดย {cap.confirmed_by || "—"} · {when(cap.confirmed_at)}</span>
                    {detail?.po
                      ? <button onClick={() => setPoOpen(detail.po!.id)} className="underline">🔗 เปิด {detail.po.po_no} ({detail.po.seller_name})</button>
                      : <span className="text-emerald-700">· ไม่ได้ผูกใบสั่งซื้อ</span>}
                  </div>
                )}
                {cap.status === "rejected" && (
                  <div className="text-sm bg-slate-50 border border-slate-200 text-slate-600 rounded-lg px-3 py-2">
                    🚫 ตีตกโดย {cap.rejected_by || "—"} · {when(cap.rejected_at)}{cap.reject_reason ? ` · ${cap.reject_reason}` : ""}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </ERPModal>

      <ImageLightbox images={images} index={lightbox} onClose={() => setLightbox(-1)} onIndex={setLightbox} />

      <ConfirmDialog open={rejectOpen} onClose={() => setRejectOpen(false)} onConfirm={() => void doReject()}
        title="ตีตกคำสั่งซื้อนี้?" confirmText="ตีตก" variant="danger" loading={busy === "reject"}
        message={
          <div className="space-y-2">
            <div>ใบนี้จะย้ายไปแท็บ &quot;ตีตก&quot; (กู้คืนได้) และไม่แตะใบสั่งซื้อ</div>
            <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="เหตุผล (ไม่บังคับ) เช่น รูปซ้ำ / ไม่ใช่คำสั่งซื้อ"
              className="h-9 px-2 text-sm border border-slate-200 rounded-md w-full" />
          </div>
        } />
      <ConfirmDialog open={!!dupConfirm} onClose={() => setDupConfirm(null)} onConfirm={() => { setDupConfirm(null); void confirm(true); }}
        title="เลขคำสั่งซื้อนี้ยืนยันไปแล้ว" confirmText="ยืนยันซ้ำ" variant="danger"
        message={`${dupConfirm ?? ""} — ถ้าเป็นการซื้อซ้ำจริง (คนละครั้ง) กด "ยืนยันซ้ำ"`} />
      <ConfirmDialog open={rereadAsk} onClose={() => setRereadAsk(false)} onConfirm={() => void doReread()}
        title="ให้ AI อ่านใหม่?" confirmText="อ่านใหม่"
        message="ที่แก้ไว้ (ยังไม่บันทึก) จะถูกแทนด้วยผลที่ AI อ่านใหม่" />
      {poOpen && <PoDetailModal poId={poOpen} onClose={() => setPoOpen(null)} />}
      <MoBomPicker open={bomFor !== null} onClose={() => setBomFor(null)}
        hint={bomFor !== null && draft?.items[bomFor] ? (draft.items[bomFor].name_th || draft.items[bomFor].name) : undefined}
        onPick={(p) => {
          if (bomFor === null) return;
          setItem(bomFor, { sku_id: null, sku_code: p.code, sku_name: p.name, mo_no: p.mo_no });
          toast.success(`จับคู่กับ ${p.code ?? p.name ?? "วัตถุดิบ"} ของ ${p.mo_no} แล้ว — กดบันทึก/ยืนยันเพื่อเก็บ`);
        }} />
    </>
  );
}
