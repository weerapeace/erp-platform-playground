"use client";

// ============================================================
// 💌 หน้าเขียนการ์ด — /order-ops/gift-cards/edit?id=<การ์ด> | ?order=<ออเดอร์> | ?new=1 (การ์ดไม่ผูกออเดอร์)
// แบบ A (เจ้าของเลือก 2026-11-24): เลือกแม่แบบ → แก้แค่ข้อความ (ใส่จากหมายเหตุลูกค้าให้แล้ว) · กด "แก้ทั้งใบ" = ตัวออกแบบลากวางเต็ม
// AI ช่วยเรียบเรียง (ข้อ 5) · พิมพ์ · บันทึก PNG (ข้อ 10) · ติ๊กเขียนมือแล้ว · ย้อนการบันทึกครั้งก่อน · ลบ = ถังขยะ (ย้อนได้)
// API /api/order-gift-cards · กติกา lib/gift-card-design · ตัวออกแบบ components/card-designer
// ============================================================

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PlaygroundShell } from "@/components/playground-shell";
import { AccessDenied, useAuth, usePermission } from "@/components/auth";
import { ErrorState, LoadingState } from "@/components/state-views";
import { PlatformBadge } from "@/components/platform-icon";
import { SaveBar } from "@/components/save-bar";
import { askConfirm } from "@/components/modal/ask-dialog";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { CardDesignerAny, CardPreview, useCardFonts, type UploadedFont } from "@/components/card-designer";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/date";
import { downloadBlob } from "@/lib/image-clipboard";
import { acceptsMessage, cardStatus, faceDoc, fillTexts, foldLine, groupTemplates, hasRole, isFolded, roleTexts, type CardDoc, type CardTexts } from "@/lib/gift-card-design";

type Order = { id: string; order_no: string | null; customer_name: string | null; status: string | null; ordered_at: string | null; ship_by_at: string | null; packed_at: string | null; platform: string | null; platform_code: string | null; brand_id: string | null; brand_name: string | null; note: string | null };
type Card = { id: string; platform_order_id: string | null; order_no: string | null; platform: string | null; brand_id: string | null; customer_note: string | null; template_id: string | null; doc: CardDoc; message: string | null; note: string | null; print_count: number; printed_at: string | null; printed_by_name: string | null; hand_written_at: string | null; hand_written_by_name: string | null; created_by_name: string | null; updated_at: string; updated_by_name: string | null; deleted_at: string | null; has_prev: boolean };
type Tpl = { id: string; name: string; brand_id: string | null; doc: CardDoc; is_default: boolean; builtin: boolean; group?: string | null; sort_order?: number; replaces_builtin?: string | null };
type Loaded = { card: Card | null; order: Order | null; note: string | null; draft: { template_id: string; doc: CardDoc } | null; siblings: { id: string; message: string | null; printed_at: string | null; hand_written_at: string | null }[]; templates: Tpl[]; history: { id: string; action: string; metadata: Record<string, unknown>; created_at: string }[] };

async function gcJson<T = Record<string, unknown>>(url: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(url, init);
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error || "ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง");
  return j;
}
const ACTION_LABEL: Record<string, string> = { create: "สร้างการ์ด", update: "แก้การ์ด", print: "พิมพ์", unprint: "เอาติ๊กพิมพ์ออก", hand_written: "ติ๊กเขียนมือแล้ว", hand_written_undo: "เอาติ๊กเขียนมือออก", revert: "ย้อนเวอร์ชัน", delete: "ลบ", restore: "กู้คืน" };

export default function GiftCardEditPage() {
  const { permsReady } = useAuth();
  const canView = usePermission("order_ops.view");
  return (
    <PlaygroundShell>
      <div className="mx-auto w-full max-w-7xl px-3 pb-24 pt-3 sm:px-4">
        {!permsReady ? <LoadingState label="กำลังตรวจสิทธิ์…" />
          : !canView ? <AccessDenied message="หน้านี้สำหรับผู้มีสิทธิ์ดูงานหลังขาย (order_ops.view)" />
          : <Suspense fallback={<LoadingState />}><Editor /></Suspense>}
      </div>
    </PlaygroundShell>
  );
}

function Editor() {
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();
  const canEdit = usePermission("order_ops.edit");
  const canDelete = usePermission("order_ops.delete");
  const id = sp.get("id"), orderId = sp.get("order"), isNew = sp.get("new") === "1";
  const [data, setData] = useState<Loaded | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [doc, setDoc] = useState<CardDoc | null>(null);
  const [savedDoc, setSavedDoc] = useState<string>("");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [orderNo, setOrderNo] = useState("");
  const [note, setNote] = useState("");
  const [savedMeta, setSavedMeta] = useState("");
  const [full, setFull] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [ai, setAi] = useState<string[] | null>(null);
  const [fonts, setFonts] = useState<UploadedFont[]>([]);
  useCardFonts(fonts);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const qs = id ? `id=${encodeURIComponent(id)}` : orderId ? `order=${encodeURIComponent(orderId)}` : null;
      const [j, f] = await Promise.all([
        qs ? gcJson<Loaded>(`/api/order-gift-cards?${qs}`) : gcJson<{ templates: Tpl[] }>("/api/order-gift-cards?view=templates").then((t): Loaded => {
          const tpl = t.templates.find((x) => x.is_default && !x.brand_id) ?? t.templates.find((x) => x.builtin) ?? t.templates[0];
          return { card: null, order: null, note: null, draft: tpl ? { template_id: tpl.id, doc: tpl.doc } : null, siblings: [], templates: t.templates, history: [] };
        }),
        gcJson<{ fonts: UploadedFont[] }>("/api/order-gift-cards?view=fonts"),
      ]);
      setData(j); setFonts(f.fonts);
      const d = j.card?.doc ?? j.draft?.doc ?? null;
      setDoc(d); setSavedDoc(j.card ? JSON.stringify(j.card.doc) : "");
      setTemplateId(j.card?.template_id ?? j.draft?.template_id ?? null);
      setOrderNo(j.card?.order_no ?? ""); setNote(j.card?.note ?? "");
      setSavedMeta(JSON.stringify([j.card?.order_no ?? "", j.card?.note ?? ""]));
    } catch (e) { setErr((e as Error).message); }
  }, [id, orderId]);
  useEffect(() => { void load(); }, [load]);

  const card = data?.card ?? null;
  const order = data?.order ?? null;
  const custNote = card?.customer_note ?? data?.note ?? null;
  const dirty = !!doc && (!card || JSON.stringify(doc) !== savedDoc || JSON.stringify([orderNo, note]) !== savedMeta);
  const texts = doc ? roleTexts(doc) : { message: "", to: "", from: "" };
  const setText = (k: keyof CardTexts, v: string) => doc && setDoc(fillTexts(doc, { [k]: v }));
  const brandId = card?.brand_id ?? order?.brand_id ?? null;
  const templates = useMemo(() => {
    const list = data?.templates ?? [];
    return [...list.filter((t) => brandId && t.brand_id === brandId), ...list.filter((t) => !t.brand_id), ...list.filter((t) => t.brand_id && t.brand_id !== brandId)];
  }, [data, brandId]);

  const applyTemplate = async (t: Tpl) => {
    if (!doc) return;
    const tplSame = templates.find((x) => x.id === templateId);
    const customized = tplSame && JSON.stringify(fillTexts(tplSame.doc, roleTexts(doc))) !== JSON.stringify(doc);
    if (customized && !(await askConfirm({ title: "เปลี่ยนแม่แบบ?", message: "การ์ดนี้ถูกแก้หน้าตาไว้ (แก้ทั้งใบ) — เปลี่ยนแม่แบบแล้วหน้าตาที่แก้จะหาย ข้อความยังอยู่ · ย้อนได้ด้วยการไม่กดบันทึก", confirmText: "เปลี่ยนแม่แบบ" }))) return;
    setDoc(fillTexts(t.doc, roleTexts(doc))); setTemplateId(t.id);
  };

  const save = async (): Promise<string | null> => {
    if (!doc || !canEdit) return null;
    setSaving(true);
    try {
      const j = await gcJson<{ id: string }>("/api/order-gift-cards", { method: "POST", body: JSON.stringify({
        action: "save_card", id: card?.id, doc, template_id: templateId && !templateId.startsWith("builtin:") ? templateId : null,
        note, ...(card?.platform_order_id || order ? {} : { order_no: orderNo }), ...(card ? {} : { platform_order_id: order?.id ?? null }),
      }) });
      toast.success("บันทึกการ์ดแล้ว");
      if (!card) { router.replace(`/order-ops/gift-cards/edit?id=${j.id}`); return j.id; }
      await load();
      return j.id;
    } catch (e) { toast.error((e as Error).message); return null; }
    finally { setSaving(false); }
  };
  const print = async () => {
    const cid = dirty || !card ? await save() : card.id;
    if (cid) window.open(`/print/order-gift-cards?ids=${cid}`, "_blank");
  };
  const png = async () => {
    if (!doc) return;
    setBusy("png");
    try {
      const { cardToPngBlob } = await import("@/lib/gift-card-png");
      const blob = await cardToPngBlob(doc);
      downloadBlob(blob, `การ์ด ${card?.order_no ?? order?.order_no ?? orderNo ?? ""}`.trim() + ".png");
      toast.success("บันทึกรูป PNG แล้ว — ดูในโฟลเดอร์ดาวน์โหลด");
    } catch (e) { toast.error((e as Error).message || "สร้างรูปไม่สำเร็จ (ลองใช้ Chrome/Edge)"); }
    finally { setBusy(null); }
  };
  const written = async (on: boolean) => {
    if (!card) return;
    try { await gcJson("/api/order-gift-cards", { method: "POST", body: JSON.stringify({ action: "written", id: card.id, on }) }); toast.success(on ? "ติ๊กว่าเขียนมือแล้ว" : "เอาติ๊กออกแล้ว"); void load(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const unprint = async () => {
    if (!card) return;
    try { await gcJson("/api/order-gift-cards", { method: "POST", body: JSON.stringify({ action: "unprint", ids: [card.id] }) }); toast.success("เอาติ๊กพิมพ์แล้วออก"); void load(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const revert = async () => {
    if (!card || !(await askConfirm({ title: "ย้อนไปเวอร์ชันก่อนหน้า?", message: "การ์ดจะกลับไปเป็นแบบก่อนการบันทึกครั้งล่าสุด (กดย้อนอีกครั้งเพื่อกลับมาได้)", confirmText: "ย้อน" }))) return;
    try { await gcJson("/api/order-gift-cards", { method: "POST", body: JSON.stringify({ action: "revert", id: card.id }) }); toast.success("ย้อนแล้ว"); void load(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const remove = async () => {
    if (!card || !(await askConfirm({ title: "ลบการ์ดนี้?", message: "ย้ายลงถังขยะ กู้คืนได้จากแท็บ \"การ์ดทั้งหมด\" › ถังขยะ", confirmText: "ย้ายลงถังขยะ", variant: "danger" }))) return;
    try {
      await gcJson("/api/order-gift-cards", { method: "DELETE", body: JSON.stringify({ kind: "card", ids: [card.id] }) });
      const cid = card.id;
      toast.undo("ย้ายการ์ดลงถังขยะแล้ว", async () => { await gcJson("/api/order-gift-cards", { method: "DELETE", body: JSON.stringify({ kind: "card", ids: [cid], restore: true }) }); router.push(`/order-ops/gift-cards/edit?id=${cid}`); });
      router.push("/order-ops/instructions");
    } catch (e) { toast.error((e as Error).message); }
  };
  const askAi = async () => {
    setBusy("ai"); setAi(null);
    try { const j = await gcJson<{ options: string[] }>("/api/order-gift-cards", { method: "POST", body: JSON.stringify({ action: "ai", note: custNote ?? "", message: texts.message, brand_id: brandId }) }); setAi(j.options); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };

  if (err) return <ErrorState title={err} onRetry={load} />;
  if (!data || !doc) return <LoadingState />;
  if (!id && !orderId && !isNew) return <ErrorState title="ไม่ได้ระบุการ์ดหรือออเดอร์" />;
  const st = cardStatus(card);
  const readOnly = !canEdit || !!card?.deleted_at;
  const btn = "inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50";

  return (
    <>
      {/* หัว: ออเดอร์ + หมายเหตุลูกค้า */}
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <Link href="/order-ops/instructions" className="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" aria-label="กลับ"><Icon value="i:arrow-left" /></Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-bold text-slate-900">{card ? "การ์ด" : "เขียนการ์ด"} {card?.order_no ?? order?.order_no ?? (isNew ? "(ไม่ผูกออเดอร์)" : "")}</h1>
            {(order?.platform || card?.platform) && <PlatformBadge code={order?.platform_code} name={order?.platform ?? card?.platform} size="xs" />}
            {order?.brand_name && <span className="text-[12px] text-slate-500">{order.brand_name}</span>}
            {card && <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${st.tone === "success" ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700"}`}>{st.label}{card.printed_at ? ` · ${formatDateTime(card.printed_at)}` : ""}</span>}
            {card?.deleted_at && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700">อยู่ในถังขยะ</span>}
          </div>
          {order && <div className="text-[12px] text-slate-500">{order.customer_name ?? ""}{order.ordered_at ? ` · สั่ง ${formatDateTime(order.ordered_at)}` : ""}{order.ship_by_at ? ` · ส่งภายใน ${formatDateTime(order.ship_by_at)}` : ""}{order.packed_at ? " · แพ็กแล้ว" : ""}</div>}
        </div>
        {data.siblings.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 text-[12px]">
            {data.siblings.map((s, i) => <Link key={s.id} href={`/order-ops/gift-cards/edit?id=${s.id}`} className={`rounded-md border px-2 py-1 ${s.id === card?.id ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>ใบที่ {i + 1}</Link>)}
            {card && order && canEdit && <Link href={`/order-ops/gift-cards/edit?order=${order.id}`} className="rounded-md border border-dashed border-slate-300 px-2 py-1 text-slate-500 hover:bg-slate-50">+ ใบใหม่</Link>}
          </div>
        )}
      </div>
      {custNote && (
        <div className="mb-3 flex flex-wrap items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <Icon value="i:message-circle" className="mt-0.5 shrink-0" />
          <span className="min-w-0 flex-1 whitespace-pre-line"><b className="font-semibold">ลูกค้าเขียนมา:</b> {custNote}</span>
          {!readOnly && <button type="button" onClick={() => setText("message", custNote)} className="shrink-0 rounded-md border border-amber-300 bg-white px-2 py-0.5 text-[12px] hover:bg-amber-100">ใช้ข้อความนี้ทั้งหมด</button>}
        </div>
      )}

      {full && !readOnly ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-700">แก้ทั้งใบ (ลากวาง) — ใบนี้ใบเดียว ไม่กระทบแม่แบบ</span>
            <button type="button" onClick={() => setFull(false)} className={btn}><Icon value="i:check" /> เสร็จ กลับไปแก้ข้อความ</button>
          </div>
          <CardDesignerAny value={doc} onChange={setDoc} uploadedFonts={fonts} />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          {/* ซ้าย: ข้อความ + แม่แบบ */}
          <div className="order-2 space-y-3 lg:order-1">
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <label className="text-[12px] font-medium text-slate-500">ข้อความบนการ์ด</label>
              <textarea value={texts.message} disabled={readOnly} onChange={(e) => setText("message", e.target.value)} rows={4} maxLength={600} placeholder="เช่น Happy Birthday ขอให้มีความสุขมาก ๆ"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-base disabled:bg-slate-50" />
              <div className="mt-2 grid grid-cols-2 gap-2">
                {hasRole(doc, "to") && <label className="text-[12px] text-slate-500">ถึง<input value={texts.to} disabled={readOnly} onChange={(e) => setText("to", e.target.value)} placeholder="(ว่างได้)" className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm text-slate-800" /></label>}
                {hasRole(doc, "from") && <label className="text-[12px] text-slate-500">จาก<input value={texts.from} disabled={readOnly} onChange={(e) => setText("from", e.target.value)} placeholder="(ว่างได้)" className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm text-slate-800" /></label>}
              </div>
              {!readOnly && (
                <div className="mt-3">
                  <button type="button" onClick={() => void askAi()} disabled={busy === "ai"} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 text-[13px] font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-60"><Icon value="i:sparkles" /> {busy === "ai" ? "AI กำลังคิด…" : "ให้ AI ช่วยเรียบเรียง"}</button>
                  {ai && (
                    <div className="mt-2 space-y-1.5">
                      <div className="text-[11px] text-slate-400">กดเลือกเพื่อใส่ในการ์ด (ตรวจก่อนพิมพ์ทุกครั้ง)</div>
                      {ai.map((o, i) => <button key={i} type="button" onClick={() => { setText("message", o); setAi(null); }} className="block w-full whitespace-pre-line rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm hover:border-violet-300 hover:bg-violet-50">{o}</button>)}
                    </div>
                  )}
                </div>
              )}
            </div>
            {isNew && !card?.platform_order_id && (
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <label className="text-[12px] font-medium text-slate-500">เลขออเดอร์ (ใส่ทีหลังได้)</label>
                <input value={orderNo} disabled={readOnly} onChange={(e) => setOrderNo(e.target.value)} placeholder="เช่น 261124ABCD หรือชื่อลูกค้าในแชต" className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm" />
              </div>
            )}
            {card && !card.platform_order_id && !isNew && (
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <label className="text-[12px] font-medium text-slate-500">เลขออเดอร์ / อ้างอิง</label>
                <input value={orderNo} disabled={readOnly} onChange={(e) => setOrderNo(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm" />
              </div>
            )}
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12px] font-medium text-slate-500">แม่แบบ</span>
                {!readOnly && <button type="button" onClick={() => setFull(true)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-[12px] text-slate-700 hover:bg-slate-50"><Icon value="i:palette" /> แก้ทั้งใบ (ฟอนต์ สี รูป)</button>}
              </div>
              <div className="space-y-3">
                {groupTemplates(templates.filter((t) => !t.builtin), templates.filter((t) => t.builtin)).map(({ group, items }) => (
                  <div key={group}>
                    <div className="mb-1 text-[11px] font-medium text-slate-500">{group}</div>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {items.map((t, i) => (
                        <button key={t.id} type="button" disabled={readOnly} onClick={() => void applyTemplate(t)} className={`rounded-lg border p-1.5 text-left ${t.id === templateId ? "border-violet-400 ring-2 ring-violet-200" : "border-slate-200 hover:border-slate-300"}`}>
                          <CardPreview doc={faceDoc(fillTexts(t.doc, { message: texts.message || "ข้อความ" }), "out")} maxHeight={64} fold={foldLine(t.doc)} />
                          <div className="mt-1 flex items-center gap-1"><span className="text-[10px] font-medium text-violet-600">{i + 1}</span><span className="min-w-0 flex-1 truncate text-[11px] text-slate-600">{t.name}</span></div>
                          <div className="flex flex-wrap gap-0.5">
                            {!acceptsMessage(t.doc) && <span className="rounded bg-slate-100 px-1 text-[9px] text-slate-500">ข้อความตายตัว</span>}
                            {isFolded(t.doc) && <span className="rounded bg-sky-50 px-1 text-[9px] text-sky-700">พับ A6</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <label className="text-[12px] font-medium text-slate-500">โน้ตภายใน (ไม่พิมพ์บนการ์ด)</label>
              <input value={note} disabled={readOnly} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ใช้การ์ดสีชมพู · ลูกค้าขอทางแชต" className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm" />
            </div>
            {data.history.length > 0 && (
              <details className="rounded-xl border border-slate-200 bg-white p-3 text-[12px] text-slate-600">
                <summary className="cursor-pointer font-medium text-slate-500"><Icon value="i:history" className="mr-1" />ประวัติ ({data.history.length})</summary>
                <ul className="mt-2 space-y-1">{data.history.map((h) => <li key={h.id}>{formatDateTime(h.created_at)} · {String(h.metadata?.actor ?? "")} · {ACTION_LABEL[h.action] ?? h.action}</li>)}</ul>
              </details>
            )}
          </div>
          {/* ขวา: ตัวอย่างการ์ด */}
          <div className="order-1 lg:order-2">
            <div className="rounded-xl bg-slate-100 p-4 lg:sticky lg:top-3">
              {isFolded(doc) ? (
                <div className="space-y-3">
                  <div><div className="mb-1 text-[11px] font-medium text-slate-500">ด้านนอก (หลัง + ปกหน้า)</div><CardPreview doc={faceDoc(doc, "out")} maxHeight={220} fold={foldLine(doc)} /></div>
                  <div><div className="mb-1 text-[11px] font-medium text-slate-500">ด้านใน (ข้อความจากลูกค้า)</div><CardPreview doc={faceDoc(doc, "in")} maxHeight={220} fold={foldLine(doc)} /></div>
                </div>
              ) : <CardPreview doc={doc} maxHeight={420} />}
              <div className="mt-2 text-center text-[11px] text-slate-500">{isFolded(doc) ? `การ์ดพับ A6 · กระดาษ A5 ${doc.w / 10} × ${doc.h / 10} ซม. · เส้นปะแดง = รอยพับ (ไม่ติดตอนพิมพ์)` : `ขนาดจริง ${doc.w / 10} × ${doc.h / 10} ซม. · หน้าตาตอนพิมพ์`}</div>
            </div>
          </div>
        </div>
      )}

      {/* ปุ่มงาน */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void print()} disabled={saving} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"><Icon value="i:printer" /> พิมพ์การ์ด</button>
        <button type="button" onClick={() => void png()} disabled={busy === "png"} className={btn}><Icon value="i:download" /> {busy === "png" ? "กำลังสร้างรูป…" : "บันทึก PNG"}</button>
        {card && canEdit && (card.hand_written_at
          ? <button type="button" onClick={() => void written(false)} className={btn}><Icon value="i:x" /> เอาติ๊กเขียนมือออก</button>
          : <button type="button" onClick={() => void written(true)} className={btn}><Icon value="i:check" /> ติ๊กว่าเขียนมือแล้ว</button>)}
        {card?.printed_at && canEdit && <button type="button" onClick={() => void unprint()} className={btn}>เอาติ๊กพิมพ์แล้วออก</button>}
        {card?.has_prev && canEdit && <button type="button" onClick={() => void revert()} className={btn}><Icon value="i:arrow-back-up" /> ย้อนการบันทึกครั้งก่อน</button>}
        <span className="flex-1" />
        {card && canDelete && !card.deleted_at && <button type="button" onClick={() => void remove()} className={`${btn} text-rose-600`}><Icon value="i:trash" /> ลบการ์ด</button>}
      </div>
      {!readOnly && <SaveBar dirty={dirty} saving={saving} onSave={async () => { await save(); }} onDiscard={card ? () => { setDoc(card.doc); setOrderNo(card.order_no ?? ""); setNote(card.note ?? ""); } : undefined} saveLabel={card ? "บันทึก" : "บันทึกการ์ด"} />}
    </>
  );
}
