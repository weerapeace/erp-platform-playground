"use client";
/**
 * ตัวอย่างโพสต์เลียนแบบหน้าตาแต่ละแพลตฟอร์ม (Facebook / Instagram / X / TikTok / LINE OA / YouTube / อื่น ๆ = การ์ดทั่วไป)
 * ใช้ในป๊อป 👁 ดูตัวอย่าง ของการ์ดแคปชั่น (content.tsx) — เป็นภาพประกอบให้เห็นว่าข้อความ/รูปจะวางยังไง ไม่ใช่ของจริง 100%
 */
import { useState } from "react";
import { r2ImageUrl } from "@/lib/r2-image";
import { platformLabel } from "../use-options";
import type { PostImage } from "./post-confirm-modal";

type Props = {
  platform: string;
  pageName?: string | null;      // ชื่อเพจ/บัญชี (ไม่มี = ชื่อแบรนด์)
  avatarUrl?: string | null;     // โลโก้แบรนด์
  images: PostImage[];           // รูปที่เลือกไว้ (เรียงตามที่เลือก)
  text: string;                  // ข้อความที่ประกอบแล้ว (แม่แบบ + แคปชั่น + แฮชแท็ก)
  format?: string | null;        // รูปแบบโพสต์ (single/carousel/reels/story…)
  t: (th: string, en: string) => string;
};

const Avatar = ({ url, name, size = 36, round = true }: { url?: string | null; name: string; size?: number; round?: boolean }) => (
  url
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={url} alt="" style={{ width: size, height: size }} className={`${round ? "rounded-full" : "rounded-md"} object-cover bg-slate-100 shrink-0`} />
    : <span style={{ width: size, height: size, fontSize: size * 0.42 }} className={`${round ? "rounded-full" : "rounded-md"} bg-gradient-to-br from-violet-400 to-fuchsia-500 text-white font-bold flex items-center justify-center shrink-0`}>{(name || "?").trim().slice(0, 1).toUpperCase()}</span>
);

/** ข้อความแบบมี "ดูเพิ่มเติม" (Facebook/IG ตัดที่ ~3 บรรทัด) + แฮชแท็กเป็นสีลิงก์ */
function RichText({ text, clampLines, linkCls = "text-blue-600", className = "" }: { text: string; clampLines?: number; linkCls?: string; className?: string }) {
  const [more, setMore] = useState(false);
  const parts = text.split(/(#[^\s#]+)/g);
  const body = parts.map((p, i) => (p.startsWith("#") ? <span key={i} className={linkCls}>{p}</span> : <span key={i}>{p}</span>));
  const lines = text.split("\n").length;
  const clamp = clampLines && !more && (lines > clampLines || text.length > 220);
  return (
    <div className={className}>
      <div className="whitespace-pre-wrap break-words" style={clamp ? { display: "-webkit-box", WebkitLineClamp: clampLines, WebkitBoxOrient: "vertical", overflow: "hidden" } : undefined}>{body}</div>
      {clamp && <button type="button" onClick={() => setMore(true)} className="text-slate-500 hover:underline">… ดูเพิ่มเติม</button>}
    </div>
  );
}

const img = (im: PostImage, w: number) => r2ImageUrl(im.key, w) ?? "";

/** กริดรูปแบบ Facebook: 1 รูปเต็ม · 2 ครึ่ง · 3 = 1 ใหญ่ + 2 เล็ก · 4+ = 2×2 (+N) */
function ImageGrid({ images, max = 4, tall }: { images: PostImage[]; max?: number; tall?: boolean }) {
  if (!images.length) return null;
  const shown = images.slice(0, max); const extra = images.length - shown.length;
  const Cell = ({ im, cls, badge }: { im: PostImage; cls: string; badge?: number }) => (
    <div className={`relative overflow-hidden bg-slate-100 ${cls}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img(im, 700)} alt="" className="w-full h-full object-cover" />
      {im.type === "video" && <span className="absolute inset-0 flex items-center justify-center"><span className="h-10 w-10 rounded-full bg-black/55 text-white flex items-center justify-center text-lg">▶</span></span>}
      {badge ? <span className="absolute inset-0 bg-black/50 text-white flex items-center justify-center text-2xl font-semibold">+{badge}</span> : null}
    </div>
  );
  if (shown.length === 1) return <Cell im={shown[0]} cls={tall ? "aspect-[4/5]" : "aspect-[4/3]"} />;
  if (shown.length === 2) return <div className="grid grid-cols-2 gap-0.5">{shown.map((im) => <Cell key={im.key} im={im} cls="aspect-square" />)}</div>;
  if (shown.length === 3) return <div className="grid grid-cols-2 gap-0.5"><Cell im={shown[0]} cls="row-span-2 aspect-auto h-full min-h-[16rem]" /><Cell im={shown[1]} cls="aspect-square" /><Cell im={shown[2]} cls="aspect-square" /></div>;
  return <div className="grid grid-cols-2 gap-0.5">{shown.map((im, i) => <Cell key={im.key} im={im} cls="aspect-square" badge={i === shown.length - 1 && extra > 0 ? extra : undefined} />)}</div>;
}

/** รูปเดียวแบบเลื่อนได้ (IG carousel) — ปุ่ม ‹ › + จุดบอกตำแหน่ง */
function Carousel({ images, aspect = "aspect-square", dark }: { images: PostImage[]; aspect?: string; dark?: boolean }) {
  const [i, setI] = useState(0);
  if (!images.length) return <div className={`${aspect} bg-slate-100 flex items-center justify-center text-slate-300 text-3xl`}>🖼</div>;
  const im = images[Math.min(i, images.length - 1)];
  return (
    <div className={`relative ${aspect} overflow-hidden ${dark ? "bg-black" : "bg-slate-100"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img(im, 800)} alt="" className="w-full h-full object-cover" />
      {im.type === "video" && <span className="absolute inset-0 flex items-center justify-center"><span className="h-12 w-12 rounded-full bg-black/55 text-white flex items-center justify-center text-xl">▶</span></span>}
      {images.length > 1 && (
        <>
          <button type="button" onClick={() => setI((x) => (x - 1 + images.length) % images.length)} className="absolute left-1.5 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-white/85 text-slate-700 shadow text-sm">‹</button>
          <button type="button" onClick={() => setI((x) => (x + 1) % images.length)} className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-white/85 text-slate-700 shadow text-sm">›</button>
          <span className="absolute top-2 right-2 rounded-full bg-black/60 text-white text-[10px] px-1.5 py-0.5">{Math.min(i, images.length - 1) + 1}/{images.length}</span>
          <span className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">{images.map((_, k) => <span key={k} className={`h-1.5 w-1.5 rounded-full ${k === i ? "bg-blue-500" : "bg-white/70"}`} />)}</span>
        </>
      )}
    </div>
  );
}

export function PostMockup({ platform, pageName, avatarUrl, images, text, format, t }: Props) {
  const name = (pageName || "").trim() || t("ชื่อเพจ/แบรนด์", "Page name");
  const handle = `@${name.toLowerCase().replace(/[^a-z0-9ก-๙._]+/gi, "").slice(0, 20) || "brand"}`;
  const now = t("เมื่อสักครู่", "Just now");

  if (platform === "facebook") {
    const story = format === "story";
    if (story) return <StoryMock images={images} text={text} name={name} avatarUrl={avatarUrl} />;
    return (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden text-[13px] text-slate-800">
        <div className="flex items-center gap-2 px-3 pt-3 pb-2">
          <Avatar url={avatarUrl} name={name} />
          <div className="min-w-0"><div className="font-semibold truncate leading-tight">{name}</div><div className="text-[11px] text-slate-500">{now} · 🌐</div></div>
          <span className="ml-auto text-slate-400">···</span>
        </div>
        {text.trim() && <RichText text={text} clampLines={3} className="px-3 pb-2 leading-snug" />}
        <ImageGrid images={images} />
        <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-slate-500 border-b border-slate-100"><span>👍❤️ 128</span><span>{t("ความคิดเห็น 12 รายการ · แชร์ 3 ครั้ง", "12 comments · 3 shares")}</span></div>
        <div className="grid grid-cols-3 text-center text-xs text-slate-600 py-1">
          <span className="py-1">👍 {t("ถูกใจ", "Like")}</span><span className="py-1">💬 {t("แสดงความคิดเห็น", "Comment")}</span><span className="py-1">↗ {t("แชร์", "Share")}</span>
        </div>
      </div>
    );
  }

  if (platform === "instagram") {
    if (format === "story") return <StoryMock images={images} text={text} name={name} avatarUrl={avatarUrl} />;
    const reels = format === "reels" || (!format && images[0]?.type === "video");
    return (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden text-[13px] text-slate-800">
        <div className="flex items-center gap-2 px-3 py-2">
          <span className="rounded-full p-[2px] bg-gradient-to-tr from-amber-400 via-rose-500 to-fuchsia-600"><Avatar url={avatarUrl} name={name} size={30} /></span>
          <div className="font-semibold text-xs truncate">{handle.slice(1)}</div>
          <span className="ml-auto text-slate-400">···</span>
        </div>
        <Carousel images={images} aspect={reels ? "aspect-[9/16] max-h-[26rem]" : "aspect-square"} dark={reels} />
        <div className="px-3 pt-2 flex items-center gap-3 text-lg"><span>♡</span><span>💬</span><span>✈</span><span className="ml-auto">🔖</span></div>
        <div className="px-3 pt-1 text-xs font-semibold">{t("ถูกใจ 1,024 คน", "1,024 likes")}</div>
        <div className="px-3 pb-3 pt-0.5 text-xs leading-snug"><span className="font-semibold mr-1">{handle.slice(1)}</span><RichText text={text} clampLines={2} className="inline" /></div>
      </div>
    );
  }

  if (platform === "x") {
    return (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm px-3 py-3 text-[13px] text-slate-900">
        <div className="flex gap-2.5">
          <Avatar url={avatarUrl} name={name} size={40} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-xs"><span className="font-bold truncate">{name}</span><span className="text-sky-500">✔</span><span className="text-slate-500 truncate">{handle} · {now}</span></div>
            <RichText text={text} linkCls="text-sky-600" className="mt-0.5 leading-snug" />
            {images.length > 0 && <div className="mt-2 rounded-2xl overflow-hidden border border-slate-200"><ImageGrid images={images} /></div>}
            <div className="mt-2 flex justify-between text-slate-500 text-xs pr-6"><span>💬 12</span><span>🔁 4</span><span>♡ 86</span><span>📊 2.1K</span><span>⤴</span></div>
          </div>
        </div>
      </div>
    );
  }

  if (platform === "tiktok" || platform === "tiktok_shop") {
    const im = images[0];
    return (
      <div className="relative mx-auto w-[15rem] aspect-[9/16] rounded-2xl overflow-hidden bg-black text-white shadow">
        {im
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={img(im, 700)} alt="" className="absolute inset-0 w-full h-full object-cover opacity-90" />
          : <div className="absolute inset-0 flex items-center justify-center text-4xl text-white/40">🎵</div>}
        <div className="absolute inset-x-0 bottom-0 p-3 pr-12 bg-gradient-to-t from-black/80 to-transparent text-[11px] leading-snug">
          <div className="font-semibold mb-1">{handle}</div>
          <RichText text={text} clampLines={3} linkCls="font-semibold" />
          <div className="mt-1 text-[10px] opacity-80">🎵 {t("เสียงต้นฉบับ", "Original sound")} · {name}</div>
        </div>
        <div className="absolute right-2 bottom-16 flex flex-col items-center gap-3 text-center text-[10px]"><Avatar url={avatarUrl} name={name} size={32} /><span>♥<br />12.3K</span><span>💬<br />88</span><span>↗<br />41</span></div>
      </div>
    );
  }

  if (platform === "line_oa" || platform === "line_shopping") {
    return (
      <div className="rounded-xl bg-[#8cabd9] p-3 text-[13px]">
        <div className="flex items-start gap-2">
          <Avatar url={avatarUrl} name={name} size={32} />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-slate-800 mb-0.5">{name}</div>
            {images.length > 0 && <div className="w-56 rounded-xl overflow-hidden mb-1"><Carousel images={images} aspect="aspect-square" /></div>}
            {text.trim() && <div className="inline-block max-w-[16rem] rounded-2xl rounded-tl-sm bg-white px-3 py-2 leading-snug text-slate-800 whitespace-pre-wrap break-words">{text}</div>}
            <div className="text-[10px] text-slate-700 mt-0.5">{t("อ่านแล้ว", "Read")} · 10:30</div>
          </div>
        </div>
      </div>
    );
  }

  if (platform === "youtube") {
    const im = images[0];
    const [title, ...rest] = text.split("\n");
    return (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden text-[13px] text-slate-800">
        <div className="relative aspect-video bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {im && <img src={img(im, 800)} alt="" className="w-full h-full object-cover opacity-90" />}
          <span className="absolute inset-0 flex items-center justify-center"><span className="h-12 w-16 rounded-xl bg-red-600 text-white flex items-center justify-center text-xl">▶</span></span>
        </div>
        <div className="flex gap-2.5 p-3">
          <Avatar url={avatarUrl} name={name} />
          <div className="min-w-0"><div className="font-semibold leading-snug line-clamp-2">{title || t("ชื่อวิดีโอ", "Video title")}</div><div className="text-[11px] text-slate-500">{name} · {t("ดู 1.2K ครั้ง", "1.2K views")} · {now}</div>
            {rest.join("\n").trim() && <RichText text={rest.join("\n")} clampLines={2} className="mt-1 text-xs text-slate-600" />}</div>
        </div>
      </div>
    );
  }

  // อื่น ๆ (Shopee/Lazada/Pinterest/เว็บ…) = การ์ดทั่วไป
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden text-[13px] text-slate-800">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100"><Avatar url={avatarUrl} name={name} size={28} /><span className="font-semibold text-xs truncate">{name}</span><span className="ml-auto text-[10px] text-slate-400">{platformLabel(platform)}</span></div>
      {images.length > 0 && <Carousel images={images} aspect="aspect-[4/3]" />}
      {text.trim() && <RichText text={text} className="px-3 py-2 leading-snug" />}
    </div>
  );
}

/** Story (FB/IG): แนวตั้ง 9:16 รูปเต็ม + ชื่อบัญชี + ข้อความซ้อนล่าง */
function StoryMock({ images, text, name, avatarUrl }: { images: PostImage[]; text: string; name: string; avatarUrl?: string | null }) {
  const im = images[0];
  return (
    <div className="relative mx-auto w-[15rem] aspect-[9/16] rounded-2xl overflow-hidden bg-gradient-to-b from-fuchsia-500 to-violet-700 text-white shadow">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {im && <img src={img(im, 700)} alt="" className="absolute inset-0 w-full h-full object-cover" />}
      <div className="absolute top-2 inset-x-2 flex gap-0.5">{(images.length ? images : [im]).slice(0, 8).map((_, i) => <span key={i} className={`h-0.5 flex-1 rounded ${i === 0 ? "bg-white" : "bg-white/40"}`} />)}</div>
      <div className="absolute top-4 left-2 flex items-center gap-1.5 text-[11px] drop-shadow"><Avatar url={avatarUrl} name={name} size={24} /><span className="font-semibold">{name}</span><span className="opacity-80">1h</span></div>
      {text.trim() && <div className="absolute inset-x-3 bottom-10 text-center text-sm font-semibold leading-snug drop-shadow whitespace-pre-wrap line-clamp-5">{text}</div>}
      <div className="absolute bottom-2 inset-x-3 h-7 rounded-full border border-white/60 text-[11px] flex items-center px-3 opacity-80">ส่งข้อความ…</div>
    </div>
  );
}
