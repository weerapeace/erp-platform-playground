"use client";

/**
 * 🎴 พิมพ์การ์ดของขวัญจากออเดอร์เว็บร้าน — /print/gift-cards?shop=<slug>&ids=<orderId,...>
 *   ไม่ส่ง ids = ทุกออเดอร์ที่มีการ์ดและยังไม่ได้พิมพ์ (ไม่นับที่ยกเลิก)
 *   การ์ดรายชิ้น (ดีไซน์ตะกร้า "เลือกรายชิ้น") = items[].gift.cardInfo — 1 ใบต่อรายการ พิมพ์รวมกับการ์ดทั้งออเดอร์
 *   แบบพิมพ์: A4 หลายใบ (มีเส้นประให้ตัด) · 1 ใบต่อแผ่น (กระดาษขนาดการ์ด)
 *   กดพิมพ์ = ติ๊ก "พิมพ์การ์ดแล้ว" ให้ทุกใบในชุด (กันพิมพ์ซ้ำ) · พิมพ์ไม่ออกกด "เอาติ๊กออก" ได้
 * ของกลาง: lib/website-gift-cards (ตัววาดการ์ด/จัดหน้า — ตัวเดียวกับพรีวิวในหน้าเว็บร้าน) · PrintFrame + printReportHtmlInNewWindow
 * ข้อมูล: /api/website/orders (ออเดอร์) · /api/website/gift-cards (ลาย/ขนาด) · PATCH cardPrinted (audit)
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PrintFrame, printReportHtmlInNewWindow } from "@/components/report";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import { useToast } from "@/components/toast";
import {
  giftCardHtml,
  giftCardsPrintHtml,
  sheetGrid,
  DEFAULT_GIFT_DESIGN,
  type GiftCardConfig,
  type GiftPrintMode,
  type OrderGiftCard,
} from "@/lib/website-gift-cards";

type ItemCard = { message: string; cardInfo?: OrderGiftCard | null };
type Order = { id: string; orderNo: string; status: string; giftWrap?: boolean; giftCardOnly?: boolean; giftMessage?: string; giftCard?: OrderGiftCard | null; items?: { gift?: ItemCard & { card?: boolean } }[] };
/** การ์ดทุกใบของออเดอร์ (ทั้งออเดอร์ + รายชิ้น) · onlyUnprinted = เฉพาะที่ยังไม่ได้พิมพ์ */
function cardsOf(o: Order, onlyUnprinted: boolean): { card: OrderGiftCard; message: string }[] {
  const out: { card: OrderGiftCard; message: string }[] = [];
  if ((o.giftWrap || o.giftCardOnly) && o.giftCard && !(onlyUnprinted && o.giftCard.printedAt)) out.push({ card: o.giftCard, message: o.giftMessage ?? "" });
  for (const it of o.items ?? []) {
    const c = it.gift?.card ? it.gift.cardInfo : null;
    if (c && !(onlyUnprinted && c.printedAt)) out.push({ card: c, message: it.gift?.message ?? "" });
  }
  return out;
}

function Inner() {
  const sp = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const shop = sp.get("shop") ?? "";
  const ids = useMemo(() => (sp.get("ids") ?? "").split(",").filter(Boolean), [sp]);
  const [cfg, setCfg] = useState<GiftCardConfig | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<GiftPrintMode>("sheet");
  const [marked, setMarked] = useState(false);

  const load = useCallback(async () => {
    try {
      const [o, c] = await Promise.all([
        apiFetch(`/api/website/orders?shop=${encodeURIComponent(shop)}`).then((r) => r.json()),
        apiFetch(`/api/website/gift-cards?shop=${encodeURIComponent(shop)}`).then((r) => r.json()),
      ]);
      if (o.error || c.error) return setErr(o.error ?? c.error);
      const all = ((o.orders ?? []) as Order[]).filter((x) => x.status !== "cancelled" && cardsOf(x, false).length > 0);
      setOrders(ids.length ? all.filter((x) => ids.includes(x.id)) : all.filter((x) => cardsOf(x, true).length > 0));
      setCfg(c.config as GiftCardConfig);
    } catch {
      setErr("โหลดข้อมูลไม่สำเร็จ");
    }
  }, [shop, ids]);
  useEffect(() => {
    void load();
  }, [load]);

  const html = useMemo(() => {
    if (!cfg || !orders) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    // เปิดจากออเดอร์ที่เลือก (ids) = พิมพ์ทุกใบของออเดอร์นั้น · รวมทุกออเดอร์ = เฉพาะใบที่ยังไม่ได้พิมพ์
    const cards = orders.flatMap((o) => cardsOf(o, !ids.length)).map(({ card, message }) => {
      const d = cfg.designs.find((x) => x.id === card.design) ?? cfg.designs[0] ?? DEFAULT_GIFT_DESIGN;
      const img = r2ImageUrl(d.imageKey, 1600);
      return giftCardHtml(cfg, d, { to: card.to, from: card.anon ? "" : card.from, message, font: card.font }, img ? origin + img : null);
    });
    return giftCardsPrintHtml(cfg, cards, mode, `การ์ดของขวัญ ${cards.length} ใบ`);
  }, [cfg, orders, mode]);

  const mark = async (printed: boolean) => {
    if (!orders?.length) return;
    const r = await apiFetch("/api/website/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardPrinted: { orderIds: orders.map((o) => o.id), printed } }),
    }).then((x) => x.json()).catch(() => ({ error: "บันทึกไม่สำเร็จ" }));
    if (r.error) return toast.error(r.error);
    setMarked(printed);
    toast.success(printed ? `ติ๊ก "พิมพ์การ์ดแล้ว" ${r.updated} ใบ` : "เอาติ๊กพิมพ์แล้วออก");
  };
  const print = () => {
    if (!html) return;
    printReportHtmlInNewWindow(html);
    if (!marked) void mark(true);
  };

  const g = cfg ? sheetGrid(cfg) : null;
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-100 px-6 py-3">
        <button onClick={() => (window.history.length > 1 ? router.back() : router.push(`/website/${shop}`))} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-600 hover:bg-slate-50">
          ← กลับ
        </button>
        <span className="text-sm text-slate-600">
          🎴 การ์ดของขวัญ · {orders ? `${orders.flatMap((o) => cardsOf(o, !ids.length)).length} ใบ · ${orders.length} ออเดอร์` : "กำลังโหลด…"}
          {cfg && ` · ขนาด ${cfg.size.w / 10} × ${cfg.size.h / 10} ซม.`}
        </span>
        <span className="inline-flex rounded-lg border border-slate-200 bg-white overflow-hidden text-sm">
          {(
            [
              ["sheet", g && g.cols * g.rows > 0 ? `A4 แผ่นละ ${g.cols * g.rows} ใบ (มีเส้นตัด)` : "A4 (การ์ดใหญ่เกิน — ใบละแผ่น)"],
              ["single", "1 ใบต่อแผ่น (กระดาษขนาดการ์ด)"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} onClick={() => setMode(k)} className={`px-3 h-9 ${mode === k ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
              {l}
            </button>
          ))}
        </span>
        <div className="flex-1" />
        {marked && (
          <button onClick={() => void mark(false)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50" title="พิมพ์ไม่ออก/ต้องพิมพ์ใหม่">
            ↩ เอาติ๊ก &quot;พิมพ์แล้ว&quot; ออก
          </button>
        )}
        <button onClick={print} disabled={!orders?.length} className="h-9 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          🖨 พิมพ์การ์ด
        </button>
      </div>
      <p className="no-print px-6 pt-3 text-xs text-slate-500">
        ตอนพิมพ์ให้ตั้ง &quot;ขนาดจริง (100%)&quot; / ปิด &quot;ย่อให้พอดีหน้า&quot; · กดพิมพ์แล้วระบบติ๊กว่าการ์ดชุดนี้พิมพ์แล้วให้เอง (กันพิมพ์ซ้ำ)
      </p>
      {err && <div className="mx-6 mt-4 rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm">{err}</div>}
      {!err && orders && !orders.length && (
        <div className="p-10 text-center text-slate-500 text-sm">ไม่มีการ์ดที่ต้องพิมพ์ — ออเดอร์ที่ห่อของขวัญและเขียนการ์ดจะขึ้นที่นี่</div>
      )}
      {html && orders?.length ? (
        <div className="p-6">
          <PrintFrame html={html} maxWidth={mode === "sheet" ? 860 : 640} />
        </div>
      ) : null}
    </div>
  );
}

export default function GiftCardsPrintPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-400">กำลังโหลด…</div>}>
      <Inner />
    </Suspense>
  );
}
