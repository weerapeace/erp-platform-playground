"use client";

// ============================================================
// GifPokeModal — ส่ง GIF จิ้มเพื่อน (เลือกคน + เลือก GIF จากคลัง/อัปโหลด + ข้อความ)
// ของกลาง: ERPModal, MultiUserPicker (เลือกหลายคน/ทั้งทีม), apiFetch (แนบ token)
// ส่งถึงหลายคนได้ · 1 GIF + 1 ข้อความ ต่อการส่ง 1 ครั้ง (กดส่งซ้ำได้)
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { ERPModal } from "@/components/modal";
import { MultiUserPicker } from "./multi-user-picker";
import type { UserPickerValue } from "@/components/pickers";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import { useT } from "@/components/i18n";

type GifItem = { id: string; gif_url: string | null; gif_key: string | null; title: string | null; category: string | null };

// GIF ไม่ใส่ &w= (ย่อจะทำอนิเมชั่นหาย) — url ภายนอกใช้ตรง, R2 key ผ่าน proxy
export const gifItemSrc = (g: { gif_url?: string | null; gif_key?: string | null }): string | null =>
  g.gif_url || (g.gif_key ? r2ImageUrl(g.gif_key) : null);

export function GifPokeModal({ open, onClose, onSent }: {
  open: boolean;
  onClose: () => void;
  onSent?: () => void;
}) {
  const t = useT();
  const [recipients, setRecipients] = useState<UserPickerValue[]>([]);
  const [message, setMessage] = useState("");
  const [lib, setLib] = useState<GifItem[]>([]);
  const [loadingLib, setLoadingLib] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);
  const [cat, setCat] = useState<string>("");   // ตัวกรองหมวด ("" = ทั้งหมด)
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const loadLib = useCallback(() => {
    setLoadingLib(true);
    apiFetch("/api/gif-poke/library").then((r) => r.json())
      .then((j) => { if (!j.error) setLib((j.data as GifItem[]) ?? []); })
      .catch(() => { /* noop */ }).finally(() => setLoadingLib(false));
  }, []);

  useEffect(() => {
    if (!open) return;
    setErr(""); setOkMsg("");
    if (lib.length === 0) loadLib();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const cats = Array.from(new Set(lib.map((g) => g.category).filter(Boolean))) as string[];
  const shown = cat ? lib.filter((g) => g.category === cat) : lib;
  const selected = lib.find((g) => g.id === selId) ?? null;

  const onUpload = async (file: File) => {
    setErr(""); setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await apiFetch("/api/gif-poke/library", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok || j.error) { setErr(j.error || t("อัปโหลดไม่สำเร็จ", "Upload failed")); return; }
      const item = j.data as GifItem;
      setLib((prev) => [item, ...prev]);
      setSelId(item.id); setCat("");
    } catch { setErr(t("อัปโหลดไม่สำเร็จ", "Upload failed")); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const send = async () => {
    setErr(""); setOkMsg("");
    if (!recipients.length) { setErr(t("เลือกผู้รับก่อน", "Pick a recipient first")); return; }
    if (!selId) { setErr(t("เลือก GIF ก่อน", "Pick a GIF first")); return; }
    setSending(true);
    try {
      const res = await apiFetch("/api/gif-poke", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to_user_ids: recipients.map((r) => r.id), gif_id: selId, message: message.trim() }),
      });
      const j = await res.json();
      if (!res.ok || j.error) { setErr(j.error || t("ส่งไม่สำเร็จ", "Send failed")); return; }
      const skip = j.skipped ? t(` (ข้าม ${j.skipped} คน — ส่งบ่อยเกิน)`, ` (skipped ${j.skipped})`) : "";
      setOkMsg(t(`ส่งแล้ว ${j.sent} คน 🎉${skip}`, `Sent to ${j.sent} 🎉${skip}`));
      onSent?.();
      // เคลียร์ผู้รับ/ข้อความ ให้ส่งคนต่อไปได้ทันที (คง GIF/คลังไว้)
      setRecipients([]); setMessage("");
      setTimeout(() => setOkMsg(""), 2500);
    } catch { setErr(t("ส่งไม่สำเร็จ", "Send failed")); }
    finally { setSending(false); }
  };

  return (
    <ERPModal open={open} onClose={onClose} size="lg" storageKey="gif-poke"
      title={t("🎁 ส่ง GIF หาเพื่อน", "🎁 Send a GIF")}
      description={t("เลือกเพื่อน เลือก GIF ใส่ข้อความ แล้วส่งให้เขาเห็นวิ่งบนจอ", "Pick people, a GIF, a message — it'll roam their screen")}
      footer={
        <>
          {okMsg && <span className="text-sm text-emerald-600 font-medium mr-auto">{okMsg}</span>}
          <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ปิด", "Close")}</button>
          <button onClick={send} disabled={sending || !recipients.length || !selId}
            className="h-9 px-5 text-sm font-bold text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">
            {sending ? t("กำลังส่ง...", "Sending...") : t("ส่งเลย 🚀", "Send 🚀")}
          </button>
        </>
      }>
      <div className="space-y-4">
        {/* ผู้รับ */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">{t("ส่งถึงใคร", "To")}</label>
          <MultiUserPicker value={recipients} onChange={setRecipients} disableCreate />
        </div>

        {/* เลือก GIF */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-slate-600">{t("เลือก GIF", "Pick a GIF")}</label>
            <div>
              <input ref={fileRef} type="file" accept="image/gif,image/webp,image/png,image/jpeg" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUpload(f); }} />
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="h-7 px-2.5 text-xs font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 rounded-lg disabled:opacity-50">
                {uploading ? t("กำลังอัปโหลด...", "Uploading...") : t("⬆ อัปโหลด GIF เอง", "⬆ Upload")}
              </button>
            </div>
          </div>

          {/* ตัวกรองหมวด */}
          {cats.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap mb-2">
              <button onClick={() => setCat("")} className={`h-6 px-2 text-[11px] rounded-full ${cat === "" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{t("ทั้งหมด", "All")}</button>
              {cats.map((c) => (
                <button key={c} onClick={() => setCat(c)} className={`h-6 px-2 text-[11px] rounded-full ${cat === c ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{c}</button>
              ))}
            </div>
          )}

          {loadingLib ? (
            <p className="text-sm text-slate-400 py-6 text-center">{t("กำลังโหลดคลัง...", "Loading...")}</p>
          ) : shown.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">{t("ยังไม่มี GIF ในคลัง — กดอัปโหลด GIF เองได้เลย", "No GIFs yet — upload one")}</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[300px] overflow-y-auto p-0.5">
              {shown.map((g) => {
                const src = gifItemSrc(g);
                const on = g.id === selId;
                return (
                  <button key={g.id} onClick={() => setSelId(g.id)} title={g.title ?? ""}
                    className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${on ? "border-violet-500 ring-2 ring-violet-200" : "border-slate-200 hover:border-slate-300"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {src && <img src={src} alt={g.title ?? ""} className="w-full h-full object-cover" loading="lazy" />}
                    {on && <span className="absolute top-1 right-1 bg-violet-600 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center shadow">✓</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ข้อความ */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">{t("ข้อความ (ไม่บังคับ)", "Message (optional)")}</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} maxLength={500}
            placeholder={t("เช่น เก่งมากวันนี้! 💪", "e.g. Great job today! 💪")}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-violet-300" />
        </div>

        {/* พรีวิวสิ่งที่จะส่ง */}
        {selected && (
          <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {gifItemSrc(selected) && <img src={gifItemSrc(selected)!} alt="" className="w-14 h-14 rounded-lg object-cover border border-slate-200" />}
            <div className="min-w-0 text-sm">
              <p className="text-slate-500 text-xs">{t("จะส่ง GIF นี้", "Sending this GIF")}{recipients.length ? ` → ${recipients.length} ${t("คน", "people")}` : ""}</p>
              {message.trim() && <p className="text-slate-700 truncate">💬 {message.trim()}</p>}
            </div>
          </div>
        )}

        {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
      </div>
    </ERPModal>
  );
}
