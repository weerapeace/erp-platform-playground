"use client";
/**
 * แท็บ "แชท" ในศูนย์แจ้งเตือน (ตัว Pet) — ห้องแชทที่ลูกค้าทักแล้วยังไม่มีใครตอบ (GET /api/chat/summary · lib/chat/store)
 * กดห้อง = เปิดหน้า /chat ที่ห้องนั้น (ไม่ตอบในป๊อป — ตอบที่หน้าแชทที่เดียว) · ไม่มีห้องรอ = แท็บไม่ขึ้น (WorkPopupHost)
 */
import { Icon } from "@/components/icon";
import { waitingText } from "@/lib/chat/rules";
import type { ChatConversation } from "@/lib/chat/types";
import { ChannelIcon, CustomerAvatar, customerLabel } from "@/components/chat-inbox/shared";

export type ChatSummary = { waiting: number; items: ChatConversation[] };

export function ChatTab({ data, onGo }: { data: ChatSummary | null; onGo: (href: string) => void }) {
  if (!data || data.waiting === 0) return (
    <div className="rounded-xl bg-emerald-50 p-5 text-center text-sm text-emerald-700">ตอบแชทลูกค้าครบแล้ว เยี่ยมมาก</div>
  );
  return (
    <div className="space-y-2">
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {data.items.map((c) => (
          <button key={c.id} type="button" onClick={() => onGo(`/chat?c=${encodeURIComponent(c.id)}`)} className="flex w-full gap-2.5 p-2 text-left hover:bg-slate-50">
            <div className="relative">
              <CustomerAvatar name={c.customer_name} src={c.customer_avatar} size={40} />
              <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white p-[1px]"><ChannelIcon channel={c.channel} size={14} /></span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="truncate text-sm text-slate-800">{customerLabel(c)}</span>
                <span className="ml-auto shrink-0 rounded bg-amber-100 px-1.5 text-[11px] text-amber-800">{waitingText(c.waiting_since)}</span>
              </div>
              <div className="truncate text-xs text-slate-500">{c.last_preview || "—"}</div>
              <div className="truncate text-[11px] text-slate-400">{c.brand_name ?? "ยังไม่ระบุแบรนด์"}{c.assigned_name ? ` · ${c.assigned_name}` : " · ยังไม่มีคนรับ"}</div>
            </div>
          </button>
        ))}
      </div>
      <button type="button" onClick={() => onGo("/chat?unanswered=1")} className="text-xs text-blue-700 hover:underline">
        {data.waiting > data.items.length ? `และอีก ${data.waiting - data.items.length} ห้อง — ` : ""}เปิดหน้าแชท <Icon name="open" />
      </button>
    </div>
  );
}
