"use client";
/**
 * แท็บ "LINE" ในศูนย์แจ้งเตือน (ตัว Pet) — ของที่ส่งเข้ากลุ่มไลน์แล้วยังรอคนจัดการ (GET /api/line/pending · lib/line-pending)
 * ปุ่มพาไปหน้าเดิมที่จัดการรายการนั้น (ไม่ทำขั้นตอนซ้ำในป๊อป): งานออกแบบ → ฟอร์มสร้างใบงานที่กรอกให้แล้ว · คำสั่งซื้อ → ป๊อปผูก PO
 * ส่วนที่ไม่มีสิทธิ์ดู API ไม่ส่งมา = ไม่โชว์ · ไม่มีอะไรรอเลย = แท็บไม่ขึ้น (WorkPopupHost)
 */
import { Icon } from "@/components/icon";
import type { LinePendingItem, LinePendingPayload, LinePendingSection } from "@/lib/line-pending";

export const linePendingCount = (d: LinePendingPayload | null) => (d?.design?.count ?? 0) + (d?.order?.count ?? 0);

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "เมื่อกี้";
  if (s < 3600) return `${Math.floor(s / 60)} นาทีที่แล้ว`;
  if (s < 86400) return `${Math.floor(s / 3600)} ชม.ที่แล้ว`;
  return `${Math.floor(s / 86400)} วันที่แล้ว`;
}

function Row({ it, action, onGo }: { it: LinePendingItem; action: string; onGo: (href: string) => void }) {
  return (
    <div className="flex gap-2.5 p-2">
      {it.image
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={it.image} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-md border border-slate-200 object-cover object-top" />
        : <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-dashed border-slate-200 text-slate-300"><Icon name="chat" /></div>}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-slate-800">{it.title}</div>
        {it.sub && <div className="truncate text-xs text-slate-500">{it.sub}</div>}
        <div className="truncate text-[11px] text-slate-400">จาก {it.sender || "—"}{it.images > 1 ? ` · รูป ${it.images}` : ""} · {timeAgo(it.at)}</div>
        {it.warn && <div className="mt-0.5 text-[11px] text-amber-700"><Icon name="warning" /> {it.warn}</div>}
        <button type="button" onClick={() => onGo(it.href)}
          className="mt-1.5 inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700">
          {action} <Icon name="open" />
        </button>
      </div>
    </div>
  );
}

function Section({ icon, title, waiting, action, sec, onGo }: { icon: string; title: string; waiting: string; action: string; sec: LinePendingSection; onGo: (href: string) => void }) {
  if (!sec.count) return null;
  return (
    <section>
      <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
        <Icon name={icon} /> {title} <span className="font-normal text-slate-400">{sec.count} {waiting}</span>
      </h3>
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {sec.items.map((it) => <Row key={it.id} it={it} action={action} onGo={onGo} />)}
      </div>
      {sec.count > sec.items.length && (
        <button type="button" onClick={() => onGo(sec.view_all)} className="mt-1.5 text-xs text-blue-700 hover:underline">
          และอีก {sec.count - sec.items.length} รายการ — ดูทั้งหมด →
        </button>
      )}
    </section>
  );
}

export function LineInboxTab({ data, onGo }: { data: LinePendingPayload | null; onGo: (href: string) => void }) {
  if (!linePendingCount(data)) return (
    <div className="rounded-xl bg-emerald-50 p-5 text-center text-sm text-emerald-700">ไม่มีรายการจากไลน์ที่รออยู่ เยี่ยมมาก</div>
  );
  return (
    <div className="space-y-4">
      {data?.design && <Section icon="design" title="งานออกแบบจากไลน์" waiting="รอเปิดใบงาน" action="เปิดใบงาน" sec={data.design} onGo={onGo} />}
      {data?.order && <Section icon="cart" title="คำสั่งซื้อจากไลน์" waiting="รอผูก PO" action="ยืนยันผูก PO" sec={data.order} onGo={onGo} />}
    </div>
  );
}
