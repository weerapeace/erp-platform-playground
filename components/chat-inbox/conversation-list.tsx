"use client";
/**
 * ห้องแชทรวม — ช่องซ้าย: รายการห้อง (ป้ายช่องทาง · ยังไม่ตอบ · ตัวนับยังไม่อ่าน · คนรับผิดชอบ)
 * ของกลาง: state-views (โหลด/ว่าง/ผิดพลาด) · Icon
 */
import { Icon } from "@/components/icon";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { isUnanswered, waitingText } from "@/lib/chat/rules";
import type { ChatConversation } from "@/lib/chat/types";
import { ChannelIcon, CustomerAvatar, customerLabel, timeShort } from "./shared";

export function ConversationList({ rows, selectedId, onSelect, loading, error, onRetry, emptyHint }: {
  rows: ChatConversation[] | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  emptyHint: string;
}) {
  if (error && !rows) return <ErrorState title="โหลดรายการแชทไม่สำเร็จ" hint={error} onRetry={onRetry} className="m-3" />;
  if (!rows) return loading ? <LoadingState label="กำลังโหลดแชท…" className="py-10" /> : null;
  if (rows.length === 0) return <EmptyState icon={<Icon name="chat" />} title="ไม่มีห้องแชท" hint={emptyHint} className="m-3" />;
  const now = Date.now();
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((c) => {
        const waiting = isUnanswered(c);
        const on = c.id === selectedId;
        return (
          <li key={c.id}>
            <button type="button" onClick={() => onSelect(c.id)}
              className={`flex w-full min-w-0 gap-2.5 px-3 py-2.5 text-left ${on ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
              <div className="relative">
                <CustomerAvatar name={c.customer_name} src={c.customer_avatar} size={40} />
                <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white p-[1px]"><ChannelIcon channel={c.channel} size={14} /></span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className={`truncate text-sm ${c.unread_count > 0 ? "font-semibold text-slate-900" : "text-slate-800"}`}>{customerLabel(c)}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-slate-400">{timeShort(c.last_message_at)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`truncate text-xs ${c.unread_count > 0 ? "text-slate-700" : "text-slate-500"}`}>
                    {c.last_direction === "out" ? "คุณ: " : ""}{c.last_preview || "—"}
                  </span>
                  {c.unread_count > 0 && (
                    <span className="ml-auto shrink-0 rounded-full bg-rose-500 px-1.5 text-[10px] font-semibold leading-4 text-white">{c.unread_count > 99 ? "99+" : c.unread_count}</span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px]">
                  {waiting && <span className="rounded bg-amber-100 px-1.5 text-amber-800">{waitingText(c.waiting_since, now)}</span>}
                  {c.status === "done" && <span className="rounded bg-emerald-100 px-1.5 text-emerald-800">จบแล้ว</span>}
                  {c.brand_name && <span className="truncate rounded bg-slate-100 px-1.5 text-slate-600">{c.brand_name}</span>}
                  {c.assigned_name && <span className="truncate text-slate-400"><Icon value="i:user" /> {c.assigned_name}</span>}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
