"use client";

// ============================================================
// CustomerView — หน้าเล็กของลูกค้าในไลน์บริษัท (เปิดผ่าน LIFF /a?me=orders|schedule)
//   เช็กร้านจาก LINE ใหม่ทุกครั้ง (id_token) · ไม่มีราคา/ยอดเงินเด็ดขาด
//   สถานะงาน = ใบสั่งขายของร้าน + ขั้นงานต่อรายการ · ตารางส่งงาน = ปฏิทินกลาง (DocCalendar) + รายการตามวัน
//   กติกา: lib/line-customer-view.ts · API: /api/line-company/customer-view
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { DocCalendar, type CalDoc } from "@/components/doc-calendar";
import { initLiffIdToken, type LiffSdk } from "@/lib/liff-client";
import {
  CUSTOMER_STAGE_COUNT, CUSTOMER_STAGE_TEXT, LINE_CUSTOMER_GATE_TEXT, LINE_CUSTOMER_PAGES, LINE_CUSTOMER_TITLE,
  type CustomerOrder, type LineCustomerPage, type ScheduleItem,
} from "@/lib/line-customer-view";
import type { SoLineStage } from "@/lib/so-order-stage";
import { Box, Skeleton } from "./liff-parts";

type Data =
  | { gate: "not_linked" | "pending" | "blocked" }
  | { gate: "ok"; page: "orders"; shop: string; orders: CustomerOrder[] }
  | { gate: "ok"; page: "schedule"; shop: string; items: ScheduleItem[]; no_date: number; today: string };

const TAB_ICON: Record<LineCustomerPage, string> = { orders: "package", schedule: "calendar" };
const TAB_SHORT: Record<LineCustomerPage, string> = { orders: "สถานะงาน", schedule: "ตารางส่งงาน" };
const STAGE_COLOR: Record<SoLineStage, string> = { 0: "#94a3b8", 1: "#60a5fa", 2: "#f59e0b", 3: "#8b5cf6", 4: "#10b981" };
const STAGE_PILL: Record<SoLineStage, string> = {
  0: "bg-slate-100 text-slate-600", 1: "bg-blue-50 text-blue-700", 2: "bg-amber-50 text-amber-700", 3: "bg-violet-50 text-violet-700", 4: "bg-emerald-50 text-emerald-700",
};
const qty = (v: number) => v.toLocaleString("th-TH", { maximumFractionDigits: 2 });
const date = (d: string | null, long = false) => (d ? new Date(`${d.slice(0, 10)}T00:00:00+07:00`).toLocaleDateString("th-TH", long ? { weekday: "short", day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "2-digit" }) : "-");

export function CustomerView({ initial }: { initial: LineCustomerPage }) {
  const [page, setPage] = useState<LineCustomerPage>(initial);
  const [liff, setLiff] = useState<LiffSdk | null>(null);
  const [idToken, setIdToken] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    initLiffIdToken()
      .then((r) => { if (r && alive) { setLiff(r.liff); setIdToken(r.idToken); } })
      .catch((e: Error) => { if (alive) { setErr(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  const load = useCallback(async (p: LineCustomerPage) => {
    if (!idToken) return;
    setLoading(true); setErr("");
    try {
      const r = await fetch("/api/line-company/customer-view", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id_token: idToken, page: p }) });
      const j = await r.json().catch(() => ({ error: "โหลดไม่สำเร็จ กรุณาลองใหม่" }));
      if (!r.ok || j.error) throw new Error(j.error || "โหลดไม่สำเร็จ กรุณาลองใหม่");
      setData(j.data as Data);
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setLoading(false); }
  }, [idToken]);
  useEffect(() => { void load(page); }, [load, page]);

  const shop = data && data.gate === "ok" ? data.shop : null;

  return (
    <main className="mx-auto min-h-screen max-w-md bg-slate-50 pb-10 md:max-w-3xl">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 pt-4 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-900">{LINE_CUSTOMER_TITLE[page]}</h1>
            {shop && <p className="truncate text-xs text-slate-500">{shop}</p>}
          </div>
          {liff?.closeWindow && <button type="button" onClick={() => liff.closeWindow?.()} className="h-9 rounded-lg border border-slate-200 px-3 text-xs text-slate-600">ปิด</button>}
        </div>
        <nav className="mt-3 grid grid-cols-2 gap-1">
          {LINE_CUSTOMER_PAGES.map((p) => (
            <button key={p} type="button" onClick={() => setPage(p)}
              className={`flex h-10 items-center justify-center gap-1 border-b-2 text-sm ${p === page ? "border-emerald-600 font-semibold text-emerald-700" : "border-transparent text-slate-500"}`}>
              <Icon name={TAB_ICON[p]} /> {TAB_SHORT[p]}
            </button>
          ))}
        </nav>
      </header>
      <div className="space-y-3 p-4">
        {err ? (
          <Box tone="danger" title="เปิดไม่สำเร็จ" body={err} action={idToken ? { label: "ลองใหม่", onClick: () => void load(page) } : undefined} />
        ) : loading && !data ? <Skeleton /> : !data ? null : data.gate !== "ok" ? (
          <Box tone={data.gate === "pending" ? "warning" : "muted"} title={LINE_CUSTOMER_GATE_TEXT[data.gate].title} body={LINE_CUSTOMER_GATE_TEXT[data.gate].body} />
        ) : data.page !== page ? <Skeleton /> : data.page === "orders" ? (
          <OrdersPage orders={data.orders} />
        ) : (
          <SchedulePage items={data.items} noDate={data.no_date} today={data.today} />
        )}
      </div>
    </main>
  );
}

function StageBar({ stage }: { stage: SoLineStage }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: CUSTOMER_STAGE_COUNT }, (_, i) => (
        <div key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i <= stage ? STAGE_COLOR[stage] : "#e2e8f0" }} />
      ))}
    </div>
  );
}

function OrdersPage({ orders }: { orders: CustomerOrder[] }) {
  const [open, setOpen] = useState<string | null>(orders.find((o) => !o.shipped)?.id ?? null);
  if (orders.length === 0) return <Box tone="muted" title="ยังไม่มีงานในระบบ" body="ถ้าสั่งงานไปแล้วแต่ยังไม่ขึ้น พิมพ์ถามในแชตได้เลย" />;
  return (
    <>
      {orders.map((o) => {
        const isOpen = open === o.id;
        const done = o.lines.filter((l) => l.stage === 4).length;
        return (
          <article key={o.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <button type="button" onClick={() => setOpen(isOpen ? null : o.id)} className="w-full p-3 text-left">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800">{o.order_no}{o.customer_po_no ? <span className="font-normal text-slate-500"> · PO {o.customer_po_no}</span> : null}</div>
                  <div className="text-xs text-slate-500">สั่ง {date(o.order_date)} · {o.lines.length} รายการ · ส่งแล้ว {done}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${STAGE_PILL[o.stage]}`}>{CUSTOMER_STAGE_TEXT[o.stage]}</span>
              </div>
              <div className="mt-2"><StageBar stage={o.stage} /></div>
            </button>
            {isOpen && (
              <div className="divide-y divide-slate-100 border-t border-slate-100">
                {o.lines.map((l) => (
                  <div key={l.id} className="flex gap-2.5 p-3">
                    {l.image_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={l.image_url} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-lg bg-slate-100 object-cover" />
                      : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400"><Icon name="package" /></div>}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 text-sm text-slate-800"><div className="line-clamp-2">{l.product}</div>{l.sku && <div className="text-[11px] text-slate-400">{l.sku}</div>}</div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${STAGE_PILL[l.stage]}`}>{CUSTOMER_STAGE_TEXT[l.stage]}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-xs text-slate-600">
                        <span>สั่ง {qty(l.qty)} {l.unit}{l.shipped > 0 && l.shipped < l.qty ? ` · ส่งแล้ว ${qty(l.shipped)}` : ""}</span>
                        {l.due_date && <span>นัดส่ง {l.due_approx ? "~" : ""}{date(l.due_date)}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>
        );
      })}
      <p className="text-center text-[11px] text-slate-400">สถานะอัปเดตจากโรงงานทุกครั้งที่เปิดหน้านี้ · สงสัยอะไรพิมพ์ถามในแชตได้เลย</p>
    </>
  );
}

function SchedulePage({ items, noDate, today }: { items: ScheduleItem[]; noDate: number; today: string }) {
  const [cursor, setCursor] = useState(() => new Date(`${(items.find((i) => i.due_date >= today)?.due_date ?? today)}T00:00:00`));
  const [day, setDay] = useState<string | null>(null);
  const docs: CalDoc[] = useMemo(() => items.map((i) => ({
    id: i.key, no: i.order_no, sub: i.product, date: i.due_date, approx: i.approx, color: i.late ? "#e11d48" : STAGE_COLOR[i.stage],
    title: `${i.product} · ${qty(i.qty_left)} ${i.unit}`,
  })), [items]);
  const shown = day ? items.filter((i) => i.due_date === day) : items.filter((i) => i.due_date >= today || i.late);
  const late = items.filter((i) => i.late).length;

  if (items.length === 0) {
    return <Box tone="muted" title="ยังไม่มีงานที่นัดวันส่ง" body={noDate ? `มีงานที่กำลังทำ ${noDate} รายการ แต่ยังไม่ได้นัดวันส่ง · พิมพ์ถามวันส่งในแชตได้เลย` : "ตอนนี้ไม่มีงานค้างส่ง"} />;
  }
  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white p-2">
        <DocCalendar docs={docs} cursor={cursor} onCursor={setCursor} unit="รายการ" onPickDay={(d) => setDay(d === day ? null : d)} selectedDay={day} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>{day ? `วันที่ ${date(day, true)}` : "ที่กำลังจะส่ง"} · {shown.length} รายการ{late && !day ? ` · เลยนัด ${late}` : ""}</span>
        {day && <button type="button" onClick={() => setDay(null)} className="h-8 rounded-lg border border-slate-200 px-3">ดูทั้งหมด</button>}
      </div>
      {shown.map((i) => (
        <div key={i.key} className={`flex items-center justify-between gap-2 rounded-xl border bg-white p-3 ${i.late ? "border-rose-200" : "border-slate-200"}`}>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-slate-800">{i.product}</div>
            <div className="text-xs text-slate-500">{i.order_no} · เหลือส่ง {qty(i.qty_left)} {i.unit}</div>
          </div>
          <div className="shrink-0 text-right">
            <div className={`text-sm font-semibold ${i.late ? "text-rose-600" : "text-slate-800"}`}>{i.approx ? "~" : ""}{date(i.due_date, true)}</div>
            <div className="text-[10px] text-slate-500">{i.late ? "เลยวันนัด" : CUSTOMER_STAGE_TEXT[i.stage]}</div>
          </div>
        </div>
      ))}
      {noDate > 0 && <p className="text-center text-xs text-slate-500">ยังไม่ได้นัดวันส่งอีก {noDate} รายการ — ดูได้ที่แท็บสถานะงาน</p>}
      <p className="text-center text-[11px] text-slate-400">&ldquo;~&rdquo; = วันโดยประมาณจากแผนผลิต · ยืนยันวันส่งพิมพ์ถามในแชต</p>
    </>
  );
}
