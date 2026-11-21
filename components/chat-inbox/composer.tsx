"use client";
/**
 * ห้องแชทรวม — กล่องตอบ: พิมพ์ · แนบรูป (ย่อเป็น JPEG ก่อนส่ง) · การ์ดสินค้า (SkuPicker กลาง) · ข้อความสำเร็จรูป
 * ป้ายเตือนก่อนส่ง: LINE ตอบฟรีได้อีกกี่วินาที / ส่งแล้วนับโควตา (เหลือเท่าไหร่) · ลูกค้าบล็อก · ข้อความยาวเกิน
 * ของกลาง: SkuPicker · ERPModal · ERPTextarea · useToast · Icon · toChatJpeg (lib/image-resize) · renderQuickReply (lib/chat/rules)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/icon";
import { ERPModal } from "@/components/modal";
import { ERPTextarea } from "@/components/form";
import { SkuPicker, type SkuPickerValue } from "@/components/pickers";
import { useToast } from "@/components/toast";
import { toChatJpeg } from "@/lib/image-resize";
import { usePhotoCapture } from "@/components/photo-capture";
import { CHAT_CHANNEL_INFO, chatTextError, renderQuickReply } from "@/lib/chat/rules";
import type { ChatMessage, ChatQuickReply } from "@/lib/chat/types";
import type { ChatDetail } from "./shared";

export function Composer({ detail, quickReplies, onSent }: { detail: ChatDetail; quickReplies: ChatQuickReply[]; onSent: (m: ChatMessage | null) => void }) {
  const c = detail.conversation;
  const s = detail.send;
  const toast = useToast();
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ file: File; url: string } | null>(null);
  const [product, setProduct] = useState<SkuPickerValue | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [pickValue, setPickValue] = useState<SkuPickerValue | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // นับถอยหลัง "ตอบฟรีได้อีก N วินาที" (LINE) — เริ่มใหม่ทุกครั้งที่โหลดห้อง
  const [freeLeft, setFreeLeft] = useState(s.free_seconds ?? 0);
  useEffect(() => { setFreeLeft(s.free_seconds ?? 0); }, [s.free_seconds, c.last_message_at]);
  useEffect(() => {
    if (freeLeft <= 0) return;
    const t = setTimeout(() => setFreeLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [freeLeft]);

  useEffect(() => () => { if (image) URL.revokeObjectURL(image.url); }, [image]);

  const info = CHAT_CHANNEL_INFO[c.channel];
  const tooLong = text ? chatTextError(c.channel, text) : null;
  const canSend = s.can_send && !sending && !tooLong && (text.trim() !== "" || !!image || !!product);
  const quotaLeft = s.quota && s.quota.limit != null && s.quota.used != null ? Math.max(0, s.quota.limit - s.quota.used) : null;
  const isLine = c.channel === "line";

  // มือถือ: ปุ่มถ่ายรูปส่งในแชต (ของกลาง photo-capture · ตัวส่งย่อรูปเองอยู่แล้ว → maxSide 0)
  const cap = usePhotoCapture({ onFiles: (fs) => pickImage(fs[0]), multiple: false, maxSide: 0 });
  const pickImage = async (f: File | null | undefined) => {
    if (!f) return;
    const jpg = await toChatJpeg(f);
    if (!jpg) { toast.error("เปิดรูปนี้ไม่ได้ — ใช้รูป JPG / PNG / WebP"); return; }
    if (jpg.size > 5 * 1024 * 1024) { toast.error("รูปใหญ่เกิน 5MB"); return; }
    setImage({ file: jpg, url: URL.createObjectURL(jpg) });
  };

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      const fd = new FormData();
      if (text.trim()) fd.set("text", text.trim());
      if (image) fd.set("file", image.file);
      if (product) fd.set("sku_id", product.id);
      const res = await apiFetch(`/api/chat/conversations/${c.id}/send`, { method: "POST", body: fd });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; via?: string; message?: ChatMessage | null; error?: string | null };
      if (j.ok) {
        setText(""); setImage(null); setProduct(null);
        if (j.via === "push" && isLine) toast.info("ส่งแล้ว · นับโควตา OA 1 ข้อความ");
        onSent(j.message ?? null);
      } else {
        toast.error(j.error || "ส่งไม่สำเร็จ กรุณาลองใหม่");
        if (j.message) onSent(j.message);
      }
    } catch {
      toast.error("ส่งไม่สำเร็จ — เช็กอินเทอร์เน็ตแล้วลองใหม่");
    } finally { setSending(false); }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    // มือถือ (จอสัมผัส) Enter = ขึ้นบรรทัดใหม่ · คอม Enter = ส่ง (Shift+Enter ขึ้นบรรทัด)
    if (typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches) return;
    e.preventDefault();
    void send();
  };

  const insertQuick = (q: ChatQuickReply) => {
    const body = renderQuickReply(q.body, { customer: c.customer_name, product: product?.name ?? null, sku: product?.code ?? null });
    setText((t) => (t.trim() ? `${t.trimEnd()}\n${body}` : body));
    setQrOpen(false);
  };

  const hint = useMemo(() => {
    if (!s.can_send) return { tone: "slate", text: `${info.label} ยังตอบจาก ERP ไม่ได้ — ตอบในแอปของแพลตฟอร์มไปก่อน` };
    if (s.blocked) return { tone: "rose", text: "ลูกค้าบล็อก OA อยู่ — ส่งไม่ถึงจนกว่าลูกค้าจะเลิกบล็อก" };
    if (!isLine) return null;
    if (freeLeft > 0) return { tone: "emerald", text: `ตอบฟรีได้อีก ${freeLeft} วินาที (ลูกค้าเพิ่งทัก)` };
    const q = quotaLeft != null ? ` · โควตาเดือนนี้เหลือ ${quotaLeft.toLocaleString("th-TH")}/${s.quota!.limit!.toLocaleString("th-TH")}` : s.quota && s.quota.limit == null ? " · แพ็กเกจไม่จำกัดโควตา" : "";
    return { tone: quotaLeft === 0 ? "rose" : "amber", text: `ส่งตอนนี้นับโควตา OA 1 ข้อความ${q}` };
  }, [s, info.label, isLine, freeLeft, quotaLeft]);

  const tone: Record<string, string> = {
    slate: "bg-slate-100 text-slate-600", rose: "bg-rose-50 text-rose-700", emerald: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-800",
  };

  return (
    <div className="border-t border-slate-200 bg-white px-3 pb-3 pt-2">
      {hint && <div className={`mb-2 rounded-md px-2 py-1 text-[11px] ${tone[hint.tone]}`}><Icon value="i:info-circle" /> {hint.text}</div>}

      {(image || product) && (
        <div className="mb-2 flex flex-wrap gap-2">
          {image && (
            <span className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt="รูปที่จะส่ง" className="h-16 w-16 rounded-md border border-slate-200 object-cover" />
              <button type="button" onClick={() => setImage(null)} title="เอารูปออก" className="absolute -right-1.5 -top-1.5 rounded-full bg-slate-700 p-0.5 text-white"><Icon value="i:x" size={12} /></button>
            </span>
          )}
          {product && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs text-indigo-800">
              <Icon value="i:package" /> การ์ดสินค้า: {product.code} {product.name}
              <button type="button" onClick={() => setProduct(null)} title="เอาออก" className="text-indigo-500 hover:text-indigo-800"><Icon value="i:x" /></button>
            </span>
          )}
        </div>
      )}

      <ERPTextarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} rows={2} disabled={!s.can_send}
        placeholder={s.can_send ? "พิมพ์ข้อความ… (Enter ส่ง · Shift+Enter ขึ้นบรรทัดใหม่)" : "ยังตอบจาก ERP ไม่ได้"} className="min-h-[64px] resize-y" />
      {tooLong && <div className="mt-1 text-[11px] text-rose-700">{tooLong}</div>}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {s.supports.image && (
          <>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={!s.can_send || sending}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              <Icon value="i:photo" /> รูป
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void pickImage(e.target.files?.[0]); e.target.value = ""; }} />
            {cap.touch && (
              <button type="button" onClick={cap.openCamera} disabled={!s.can_send || sending}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                <Icon name="camera" /> ถ่ายรูป
              </button>
            )}
            {cap.ui}
          </>
        )}
        {s.supports.product && (
          <button type="button" onClick={() => { setPickValue(null); setPickOpen(true); }} disabled={!s.can_send || sending}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <Icon value="i:package" /> การ์ดสินค้า
          </button>
        )}
        <span className="relative">
          <button type="button" onClick={() => setQrOpen((v) => !v)} disabled={!s.can_send}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <Icon value="i:messages" /> ข้อความสำเร็จรูป
          </button>
          {qrOpen && (
            <div className="absolute bottom-9 left-0 z-20 max-h-64 w-72 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
              {quickReplies.length === 0
                ? <div className="p-3 text-xs text-slate-500">ยังไม่มีข้อความสำเร็จรูป — ตั้งได้ที่ปุ่มตั้งค่า (เฟือง) มุมบนของรายการแชท</div>
                : quickReplies.map((q) => (
                  <button key={q.id} type="button" onClick={() => insertQuick(q)} className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-slate-50">
                    <div className="text-xs font-medium text-slate-800">{q.label}</div>
                    <div className="line-clamp-2 text-[11px] text-slate-500">{q.body}</div>
                  </button>
                ))}
            </div>
          )}
        </span>
        <span className="ml-auto text-[10px] text-slate-400">{text ? `${[...text].length.toLocaleString("th-TH")}/${info.maxText.toLocaleString("th-TH")}` : ""}</span>
        <button type="button" onClick={() => void send()} disabled={!canSend}
          className="inline-flex h-8 items-center gap-1 rounded-md bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40">
          <Icon value="i:send" /> {sending ? "กำลังส่ง…" : "ส่ง"}
        </button>
      </div>

      <ERPModal open={pickOpen} onClose={() => setPickOpen(false)} title="เลือกสินค้าที่จะส่งเป็นการ์ด" size="md"
        footer={<div className="flex justify-end gap-2">
          <button type="button" onClick={() => setPickOpen(false)} className="h-9 rounded-md border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50">ยกเลิก</button>
          <button type="button" disabled={!pickValue} onClick={() => { setProduct(pickValue); setPickOpen(false); }}
            className="h-9 rounded-md bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40">ใช้สินค้านี้</button>
        </div>}>
        <div className="space-y-2">
          <SkuPicker value={pickValue} onChange={setPickValue} placeholder="ค้นรหัส / ชื่อสินค้า…" salesOnly />
          <p className="text-xs text-slate-500">การ์ดใช้ชื่อ/รูปจากระบบ · ราคา + ลิงก์มาจากรายการบนร้านของช่องทางนี้ (ไม่มีรายการบนร้าน = ไม่ใส่ราคา พิมพ์เองได้)</p>
        </div>
      </ERPModal>
    </div>
  );
}
