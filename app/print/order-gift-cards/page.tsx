"use client";

/**
 * 💌 พิมพ์การ์ดของขวัญจากหมายเหตุออเดอร์ — /print/order-gift-cards?ids=<การ์ด,...>
 *   แบบพิมพ์: A4 หลายใบ (มีเส้นประให้ตัด) · 1 ใบต่อแผ่น (กระดาษขนาดการ์ด) · การ์ดคนละขนาดแยกหน้าให้เอง
 *   กดพิมพ์ = ติ๊ก "พิมพ์แล้ว" ทุกใบในชุด (กันพิมพ์ซ้ำ) · พิมพ์ไม่ออกกด "เอาติ๊กออก" ได้ · บันทึกประวัติพิมพ์ (usePrintLog · gift_card)
 * ของกลาง: lib/gift-card-design (cardsPrintHtml — สูตรเดียวกับตัวออกแบบ) · PrintFrame + printReportHtmlInNewWindow · usePrintLog
 * ข้อมูล: /api/order-gift-cards?ids= · POST printed/unprint (audit) · สิทธิ์ order_ops.view (ติ๊กพิมพ์ = order_ops.edit)
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoadingState } from "@/components/state-views";
import { PrintFrame, printReportHtmlInNewWindow } from "@/components/report";
import { usePrintLog } from "@/components/report/use-print-log";
import { usePermission } from "@/components/auth";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import { cardsPrintHtml, cleanDoc, isFolded, type CardDoc, type CardPrintMode } from "@/lib/gift-card-design";
import { sheetGrid, type GiftCardConfig } from "@/lib/website-gift-cards";

type Card = { id: string; order_no: string | null; doc: CardDoc; printed_at: string | null };

function Inner() {
  const sp = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const canEdit = usePermission("order_ops.edit");
  const ids = useMemo(() => (sp.get("ids") ?? "").split(",").filter(Boolean), [sp]);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<CardPrintMode>("sheet");
  const [marked, setMarked] = useState(false);
  const [flipInside, setFlipInside] = useState(false);

  const load = useCallback(async () => {
    if (!ids.length) { setCards([]); return; }
    try {
      const res = await apiFetch(`/api/order-gift-cards?ids=${ids.join(",")}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "โหลดการ์ดไม่สำเร็จ");
      setCards((j.cards as Card[]).map((c) => ({ ...c, doc: cleanDoc(c.doc) })));
    } catch (e) { setErr((e as Error).message); }
  }, [ids]);
  useEffect(() => { void load(); }, [load]);

  const trackPrint = usePrintLog("gift_card", (cards ?? []).map((c) => ({ doc_id: c.id, doc_no: c.order_no })));
  const html = useMemo(() => {
    if (!cards) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return cardsPrintHtml(cards.map((c) => c.doc), mode, { r2ToUrl: (k) => { const u = r2ImageUrl(k, 1600); return u ? origin + u : null; }, origin, title: `การ์ดของขวัญ ${cards.length} ใบ`, flipInside });
  }, [cards, mode, flipInside]);

  const mark = async (printed: boolean) => {
    if (!cards?.length || !canEdit) return;
    try {
      const res = await apiFetch("/api/order-gift-cards", { method: "POST", body: JSON.stringify({ action: printed ? "printed" : "unprint", ids: cards.map((c) => c.id) }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      setMarked(printed);
      toast.success(printed ? `ติ๊ก "พิมพ์แล้ว" ${j.count} ใบ` : "เอาติ๊กพิมพ์แล้วออก");
    } catch (e) { toast.error((e as Error).message); }
  };
  const print = () => {
    if (!html) return;
    printReportHtmlInNewWindow(html);
    trackPrint("print");
    if (!marked) void mark(true);
  };

  const first = cards?.[0]?.doc;
  const g = first ? sheetGrid({ size: { preset: "custom", w: first.w, h: first.h } } as GiftCardConfig) : null;
  const already = (cards ?? []).filter((c) => c.printed_at).length;
  const foldN = (cards ?? []).filter((c) => isFolded(c.doc)).length;
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-100 px-4 py-3 sm:px-6">
        <button onClick={() => (window.history.length > 1 ? router.back() : router.push("/order-ops/instructions?s=cards"))} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-600 hover:bg-slate-50">← กลับ</button>
        <span className="text-sm text-slate-600">การ์ดของขวัญ · {cards ? `${cards.length} ใบ` : "กำลังโหลด…"}{first ? ` · ${first.w / 10} × ${first.h / 10} ซม.` : ""}{already ? ` · เคยพิมพ์แล้ว ${already} ใบ` : ""}</span>
        <span className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          {([["sheet", g && g.cols * g.rows > 0 ? `A4 แผ่นละ ${g.cols * g.rows} ใบ (มีเส้นตัด)` : "A4 (การ์ดใหญ่เกิน — ใบละแผ่น)"], ["single", "1 ใบต่อแผ่น (กระดาษขนาดการ์ด)"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setMode(k)} className={`h-9 px-3 ${mode === k ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{l}</button>
          ))}
        </span>
        <div className="flex-1" />
        {marked && canEdit && <button onClick={() => void mark(false)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50" title="พิมพ์ไม่ออก/ต้องพิมพ์ใหม่">↩ เอาติ๊ก &quot;พิมพ์แล้ว&quot; ออก</button>}
        <button onClick={print} disabled={!cards?.length} className="h-9 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">พิมพ์การ์ด</button>
      </div>
      <p className="no-print px-4 pt-3 text-xs text-slate-500 sm:px-6">ตอนพิมพ์ให้ตั้ง &quot;ขนาดจริง (100%)&quot; / ปิด &quot;ย่อให้พอดีหน้า&quot; · กดพิมพ์แล้วระบบติ๊กว่าการ์ดชุดนี้พิมพ์แล้วให้เอง (กันพิมพ์ซ้ำ)</p>
      {foldN > 0 && (
        <div className="no-print mx-4 mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[13px] text-sky-900 sm:mx-6">
          <b>การ์ดพับ {foldN} ใบ (กระดาษ A5 พับครึ่ง)</b> — หน้าแรก ๆ = ด้านนอกทุกใบ ต่อด้วยด้านในทุกใบ (ลำดับเดียวกัน) · วิธีพิมพ์: 1) สั่งพิมพ์เฉพาะหน้าด้านนอก ({foldN} หน้าแรก) 2) เอาปึกกระดาษที่พิมพ์แล้วกลับด้าน ใส่ถาดใหม่ 3) สั่งพิมพ์หน้าด้านในที่เหลือ · เครื่องพิมพ์ 2 หน้าอัตโนมัติ = เลือก &quot;พิมพ์ 2 หน้า พลิกขอบยาว&quot;
          <label className="ml-2 inline-flex items-center gap-1"><input type="checkbox" checked={flipInside} onChange={(e) => setFlipInside(e.target.checked)} /> ด้านในออกมากลับหัว → หมุนด้านใน 180°</label>
        </div>
      )}
      {err && <div className="mx-6 mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}
      {!err && cards && !cards.length && <div className="p-10 text-center text-sm text-slate-500">ไม่มีการ์ดที่จะพิมพ์ — เลือกการ์ดจากหน้าเขียนการ์ดของขวัญก่อน</div>}
      {html && cards?.length ? <div className="p-4 sm:p-6"><PrintFrame html={html} maxWidth={mode === "sheet" ? 860 : 640} /></div> : null}
    </div>
  );
}

export default function OrderGiftCardsPrintPage() {
  return <Suspense fallback={<LoadingState />}><Inner /></Suspense>;
}
