"use client";
/**
 * แท็บ "GIF" ในศูนย์แจ้งเตือน (ตัว Pet) — GIF ที่เพื่อนส่งมาให้ (กล่องรับเดียวกับ "ส่ง GIF ให้เพื่อน" GET /api/gif-poke)
 * ปิดแต่ละอัน = PATCH /api/gif-poke {id} (ตัวที่วิ่งบนหน้าแดชบอร์ดงานหายไปด้วย) · ตอบกลับ / ส่งใหม่ = หน้าต่างส่ง GIF เดิม
 */
import { Icon } from "@/components/icon";
import { avatarSrc } from "@/lib/r2-image";

export type GifPoke = { id: string; from_user_id: string; from_name: string | null; from_avatar: string | null; gif_url: string | null; gif_key: string | null; message: string | null; created_at: string };

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "เมื่อกี้";
  if (s < 3600) return `${Math.floor(s / 60)} นาทีที่แล้ว`;
  if (s < 86400) return `${Math.floor(s / 3600)} ชม.ที่แล้ว`;
  return `${Math.floor(s / 86400)} วันที่แล้ว`;
}

export function GifInbox({ pokes, newIds, onDismiss, onReply, onSend }: {
  pokes: GifPoke[];
  /** ยังไม่เคยเห็น (ป้าย "ใหม่") */
  newIds: Set<string>;
  onDismiss: (id: string) => void;
  onReply: (p: GifPoke) => void;
  onSend: () => void;
}) {
  if (!pokes.length) return (
    <div className="rounded-xl bg-slate-50 p-5 text-center">
      <p className="text-sm text-slate-600">ยังไม่มี GIF จากเพื่อน</p>
      <p className="mt-0.5 text-xs text-slate-400">เพื่อนส่ง GIF มาเมื่อไหร่ จะขึ้นที่นี่ และตัว Pet จะกระโดดบอก</p>
      <button type="button" onClick={onSend} className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"><Icon name="add" /> ส่ง GIF ให้เพื่อน</button>
    </div>
  );
  const list = [...pokes].reverse();   // ใหม่สุดขึ้นก่อน
  return (
    <div className="space-y-2">
      {list.map((p) => {
        const gif = avatarSrc(p.gif_url || p.gif_key || null);
        const av = avatarSrc(p.from_avatar, 64);
        return (
          <div key={p.id} className="flex gap-2.5 rounded-xl border border-slate-200 bg-white p-2">
            {gif
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={gif} alt="" className="h-16 w-16 shrink-0 rounded-lg bg-slate-50 object-contain" />
              : <div className="h-16 w-16 shrink-0 rounded-lg bg-slate-100" />}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                {av
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={av} alt="" className="h-5 w-5 rounded-full object-cover" />
                  : <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-semibold text-indigo-700">{(p.from_name ?? "?").slice(0, 1)}</span>}
                <span className="truncate font-medium text-slate-700">{p.from_name ?? "เพื่อน"}</span>
                <span className="shrink-0">· {timeAgo(p.created_at)}</span>
                {newIds.has(p.id) && <span className="shrink-0 rounded-full bg-rose-50 px-1.5 text-[10px] font-medium text-rose-600">ใหม่</span>}
              </div>
              {p.message && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{p.message}</p>}
              <div className="mt-1.5 flex gap-1.5">
                <button type="button" onClick={() => onReply(p)} className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-[11px] text-slate-600 hover:bg-slate-50"><Icon name="back" /> ตอบกลับ</button>
                <button type="button" onClick={() => onDismiss(p.id)} className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-[11px] text-slate-500 hover:bg-slate-50"><Icon name="cancel" /> ปิด</button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
