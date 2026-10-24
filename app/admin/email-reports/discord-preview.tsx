"use client";

// ============================================================
// 💬 ตัวอย่างข้อความ Discord (หน้าแชทจำลอง) — ในป๊อปตั้งค่ารายงาน แท็บ 👁 ดูตัวอย่าง → Discord
// ข้อมูลมาจากตัวประกอบเดียวกับตอนส่งจริง (composeDiscordReport · preview?format=discord) + รูปรายงาน (preview?format=png)
// สีพื้น/ปุ่มเลียนแบบ Discord (ธีมมืด) ให้เห็นหน้าตาจริงในห้อง — ไม่ใช่ UI ของ ERP จึงใช้สีตายตัวของ Discord
// ============================================================

import type { ReactNode } from "react";

type Embed = { title?: string; url?: string; description?: string; color?: number; thumbnail?: { url: string }; fields?: { name: string; value: string }[] };
/** ปุ่ม (type 2) หรือเมนูเลือก (type 3 · placeholder) */
type Button = { type: number; style?: number; label?: string; url?: string; custom_id?: string; placeholder?: string };
export type DiscordCardMsg = { embeds?: Embed[]; components?: { type: number; components: Button[] }[] };
export type DiscordPreviewData = { content: string; cards: DiscordCardMsg[]; has_image: boolean; role_name: string | null; channel_name: string | null; ready: { bot: boolean; buttons: boolean } };

const hex = (n?: number) => `#${(n ?? 0x5865f2).toString(16).padStart(6, "0")}`;

/** markdown แบบ Discord ที่ใช้จริงในรายงาน: **ตัวหนา** · [ข้อความ](ลิงก์) · <@&บทบาท> */
function md(text: string, roleName: string | null): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)|<@&\d+>/g;
  let last = 0; let m: RegExpExecArray | null; let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<b key={k++} className="font-semibold text-white">{m[1]}</b>);
    else if (m[2] !== undefined) out.push(<span key={k++} className="text-[#00a8fc] hover:underline">{m[2]}</span>);
    else out.push(<span key={k++} className="rounded bg-[#5865f2]/30 px-0.5 text-[#c9cdfb]">@{roleName ?? "บทบาท"}</span>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Lines({ text, roleName }: { text: string; roleName: string | null }) {
  return <>{text.split("\n").map((l, i) => <div key={i} className="min-h-[1.25rem]">{md(l, roleName)}</div>)}</>;
}

function BotHeader() {
  const time = new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" });
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="font-medium text-white">ERP รายงาน</span>
      <span className="rounded bg-[#5865f2] px-1 text-[10px] font-semibold leading-4 text-white">BOT</span>
      <span className="text-[11px] text-[#949ba4]">วันนี้ เวลา {time}</span>
    </div>
  );
}

function Card({ msg }: { msg: DiscordCardMsg }) {
  const e = msg.embeds?.[0];
  return (
    <div className="mt-2 space-y-1.5">
      {e && (
        <div className="flex max-w-[520px] gap-3 rounded border-l-4 bg-[#2b2d31] p-3" style={{ borderLeftColor: hex(e.color) }}>
          <div className="min-w-0 flex-1 space-y-1.5 text-[13px]">
            {e.title && <div className={`font-semibold ${e.url ? "text-[#00a8fc]" : "text-white"}`}>{e.title}</div>}
            {e.description && <div className="text-[#dbdee1]">{e.description}</div>}
            {(e.fields ?? []).map((f, i) => (
              <div key={i}>
                <div className="font-semibold text-white">{f.name}</div>
                <div className="text-[#dbdee1]"><Lines text={f.value} roleName={null} /></div>
              </div>
            ))}
          </div>
          {e.thumbnail?.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={e.thumbnail.url} alt="" className="h-16 w-16 shrink-0 rounded object-cover" />
          )}
        </div>
      )}
      {(msg.components ?? []).map((row, i) => (
        <div key={i} className="flex flex-wrap gap-1.5">
          {row.components.map((b, j) => b.type === 3 ? (
            <span key={j} className="flex h-9 w-full max-w-[520px] items-center justify-between rounded bg-[#1e1f22] px-3 text-[13px] text-[#949ba4]">
              {b.placeholder ?? "เลือก…"}<span>▾</span>
            </span>
          ) : (
            <span key={j} className={`inline-flex h-8 items-center gap-1 rounded px-3 text-[13px] font-medium text-white ${b.style === 3 ? "bg-[#248046]" : b.style === 1 ? "bg-[#5865f2]" : "bg-[#4e5058]"}`}>
              {b.label}{b.style === 5 && <span className="opacity-70">↗</span>}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/** หน้าแชท Discord จำลอง: ข้อความ 1 (หัวเรื่อง + รูปรายงาน) + การ์ดติ๊กทีละใบ */
export function DiscordChatPreview({ data, imageUrl, imageBusy, imageErr }: {
  data: DiscordPreviewData; imageUrl: string | null; imageBusy: boolean; imageErr: string | null;
}) {
  return (
    <div className="overflow-hidden rounded-xl bg-[#313338] text-sm text-[#dbdee1]">
      <div className="flex items-center gap-2 border-b border-black/20 px-4 py-2.5 text-[#f2f3f5]">
        <span className="text-lg text-[#80848e]">#</span><span className="font-semibold">{data.channel_name ?? "ห้อง-รายงาน"}</span>
      </div>
      <div className="max-h-[65vh] space-y-5 overflow-y-auto px-4 py-4">
        {/* ข้อความ 1: ภาพรวม + รูป */}
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#5865f2] text-xs font-bold text-white">ERP</div>
          <div className="min-w-0 flex-1">
            <BotHeader />
            <div className="mt-0.5 leading-5"><Lines text={data.content} roleName={data.role_name} /></div>
            {data.has_image && (
              <div className="mt-2 max-w-[520px]">
                {imageUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={imageUrl} alt="รูปรายงานที่จะส่งเข้า Discord" className="w-full rounded-md" />
                  : <div className="flex h-40 items-center justify-center rounded-md bg-[#2b2d31] text-xs text-[#949ba4]">{imageBusy ? "กำลังวาดรูปรายงาน…" : imageErr ? `⚠ ${imageErr}` : "รูปรายงาน"}</div>}
              </div>
            )}
          </div>
        </div>
        {/* การ์ดติ๊ก (ข้อความละใบ) */}
        {data.cards.map((c, i) => (
          <div key={i} className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#5865f2] text-xs font-bold text-white">ERP</div>
            <div className="min-w-0 flex-1"><BotHeader /><Card msg={c} /></div>
          </div>
        ))}
        {data.cards.length === 0 && <div className="pl-[52px] text-xs text-[#949ba4]">(ตอนนี้ไม่มีใบไหนมีของรอ — จะมีแค่ข้อความแรก)</div>}
      </div>
    </div>
  );
}
