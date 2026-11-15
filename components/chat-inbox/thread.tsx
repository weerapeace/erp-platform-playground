"use client";
/**
 * ห้องแชทรวม — ช่องกลาง: ข้อความในห้อง (ลูกค้าซ้าย · เราขวา · ข้อความระบบกลาง) + กล่องตอบ (Composer)
 * ของกลาง: ImageLightbox (ดูรูปเต็ม) · r2ImageUrl (รูปย่อ) · Icon
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { ImageLightbox } from "@/components/image-lightbox";
import { r2ImageUrl } from "@/lib/r2-image";
import { lineStickerUrl } from "@/lib/chat/rules";
import type { ChatAttachment, ChatMessage } from "@/lib/chat/types";
import { ChannelIcon, CustomerAvatar, customerLabel, timeShort, type ChatDetail } from "./shared";
import { Composer } from "./composer";
import type { ChatQuickReply } from "@/lib/chat/types";

function Attachment({ a, onImage }: { a: ChatAttachment; onImage: (key: string) => void }) {
  if (a.kind === "image") {
    return (
      <button type="button" onClick={() => onImage(a.key)} className="block overflow-hidden rounded-lg border border-slate-200 bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={r2ImageUrl(a.key, 480) ?? ""} alt="รูปจากแชท" loading="lazy" className="max-h-64 max-w-[240px] object-contain" />
      </button>
    );
  }
  if (a.kind === "sticker") {
    const url = lineStickerUrl(a.sticker_id ?? null);
    // eslint-disable-next-line @next/next/no-img-element
    return url ? <img src={url} alt="สติกเกอร์" loading="lazy" className="h-24 w-24 object-contain" /> : <span className="text-xs text-slate-500">[สติกเกอร์]</span>;
  }
  if (a.kind === "product") {
    const img = r2ImageUrl(a.image_key ?? null, 160);
    return (
      <div className="flex w-60 gap-2 rounded-lg border border-slate-200 bg-white p-2 text-left">
        {img
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={img} alt="" className="h-14 w-14 shrink-0 rounded object-cover" />
          : <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-400"><Icon value="i:package" /></span>}
        <div className="min-w-0 text-xs">
          <div className="line-clamp-2 font-medium text-slate-800">{a.name}</div>
          <div className="text-slate-500">{a.code}</div>
          {a.price != null && <div className="font-semibold text-emerald-700">฿{a.price.toLocaleString("th-TH")}</div>}
          {a.url && <a href={a.url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">หน้าสินค้า</a>}
        </div>
      </div>
    );
  }
  const label: Record<string, string> = { video: "วิดีโอ", audio: "ข้อความเสียง", file: "ไฟล์", location: "ตำแหน่ง" };
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">
      <Icon value={a.kind === "location" ? "i:map-pin" : a.kind === "file" ? "i:paperclip" : "i:movie"} />
      {label[a.kind] ?? a.kind}{a.label ? `: ${a.label}` : ""} <span className="text-slate-400">(เปิดดูในแอปของแพลตฟอร์ม)</span>
    </span>
  );
}

function Bubble({ m, onImage }: { m: ChatMessage; onImage: (key: string) => void }) {
  if (m.sender_type === "system") {
    return <div className="my-2 text-center text-[11px] text-slate-400">{m.text} · {timeShort(m.sent_at)}</div>;
  }
  const out = m.direction === "out";
  return (
    <div className={`flex ${out ? "justify-end" : "justify-start"}`}>
      <div className={`flex max-w-[85%] flex-col gap-1 ${out ? "items-end" : "items-start"}`}>
        {m.text && (
          <div className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${out
            ? m.send_status === "failed" ? "border border-rose-200 bg-rose-50 text-rose-900" : "bg-indigo-600 text-white"
            : "border border-slate-200 bg-white text-slate-800"}`}>{m.text}</div>
        )}
        {m.attachments.map((a, i) => <Attachment key={i} a={a} onImage={onImage} />)}
        <div className="text-[10px] text-slate-400">
          {timeShort(m.sent_at)}
          {out && m.sent_by_name ? ` · ${m.sent_by_name}` : ""}
          {out && m.send_via === "push" ? " · นับโควตา" : ""}
          {out && m.send_via === "reply" ? " · ตอบฟรี" : ""}
        </div>
        {out && m.send_status === "failed" && (
          <div className="text-[11px] text-rose-700"><Icon value="i:alert-triangle" /> ส่งไม่สำเร็จ{m.send_error ? `: ${m.send_error}` : ""}</div>
        )}
      </div>
    </div>
  );
}

export function ChatThread({ detail, quickReplies, canReply, onBack, onTogglePanel, onLoadOlder, loadingOlder, onSent }: {
  detail: ChatDetail;
  quickReplies: ChatQuickReply[];
  canReply: boolean;
  onBack: () => void;
  onTogglePanel: () => void;
  onLoadOlder: () => void;
  loadingOlder: boolean;
  onSent: (m: ChatMessage | null) => void;
}) {
  const c = detail.conversation;
  const scroller = useRef<HTMLDivElement>(null);
  const lastId = detail.messages[detail.messages.length - 1]?.id ?? "";
  const images = useMemo(() => detail.messages.flatMap((m) => m.attachments.filter((a): a is Extract<ChatAttachment, { kind: "image" }> => a.kind === "image").map((a) => a.key)), [detail.messages]);
  const [lb, setLb] = useState(-1);

  // ข้อความใหม่ (หรือเปิดห้องใหม่) → เลื่อนลงล่างสุด
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId, c.id]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <button type="button" onClick={onBack} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 md:hidden" title="กลับไปรายการ">
          <Icon value="i:arrow-left" />
        </button>
        <CustomerAvatar name={c.customer_name} src={c.customer_avatar} size={32} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-800">{customerLabel(c)}</div>
          <div className="flex items-center gap-1 text-[11px] text-slate-500"><ChannelIcon channel={c.channel} size={12} /> {c.brand_name ?? "ยังไม่ระบุแบรนด์"}</div>
        </div>
        <button type="button" onClick={onTogglePanel} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 xl:hidden" title="ข้อมูลลูกค้า">
          <Icon value="i:layout-sidebar-right" />
        </button>
      </header>

      <div ref={scroller} className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-50 px-3 py-3">
        {detail.has_more && (
          <div className="text-center">
            <button type="button" onClick={onLoadOlder} disabled={loadingOlder} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50">
              {loadingOlder ? "กำลังโหลด…" : "ดูข้อความก่อนหน้า"}
            </button>
          </div>
        )}
        {detail.messages.length === 0 && <div className="py-10 text-center text-sm text-slate-400">ยังไม่มีข้อความ</div>}
        {detail.messages.map((m) => <Bubble key={m.id} m={m} onImage={(k) => setLb(Math.max(0, images.indexOf(k)))} />)}
      </div>

      {canReply
        ? <Composer key={c.id} detail={detail} quickReplies={quickReplies} onSent={onSent} />
        : <div className="border-t border-slate-200 bg-white px-3 py-3 text-center text-xs text-slate-500">คุณดูได้อย่างเดียว — ต้องมีสิทธิ์ "ตอบแชทลูกค้า" ถึงจะตอบได้</div>}

      <ImageLightbox images={images.map((k) => ({ url: r2ImageUrl(k) ?? "" }))} index={lb} onClose={() => setLb(-1)} onIndex={setLb} />
    </div>
  );
}
