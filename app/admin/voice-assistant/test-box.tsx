"use client";

/**
 * 🧪 ลองพูดทดสอบ (หน้าตั้งค่าผู้ช่วยเสียง) — พูด/พิมพ์ → ดูว่าผู้ช่วย "จะทำอะไร" โดยไม่ทำจริง
 * ส่ง dry: true ไป /api/voice-assistant/command (ใช้ค่าที่บันทึกแล้ว · ประวัติติดป้าย "ทดสอบ") · ตัวฟังเสียงตัวเดียวกับปุ่มไมค์ (useVoiceInput)
 */
import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import { useVoiceInput } from "@/components/voice-assistant/use-voice-input";
import { VOICE_LIMITS, type VoiceReply } from "@/lib/voice-assistant";

/** คำตอบของผู้ช่วย → ภาษาคน "ระบบจะ…" */
export function describeVoiceAction(r: Pick<VoiceReply, "action" | "sku" | "query"> & { page?: { label?: string; href?: string } | string | null }): string {
  const page = typeof r.page === "string" ? r.page : r.page?.label ?? r.page?.href;
  if (r.action === "open_page") return `เปิดหน้า ${page ?? ""}`.trim();
  if (r.action === "add_sku") {
    const s = r.sku ?? {};
    const parts = [s.name_th, s.color && `สี${s.color}`, s.code && `รหัส ${s.code}`, s.standard_price != null && `ราคาซื้อ ${s.standard_price}`, s.rmb_cost != null && `${s.rmb_cost} หยวน`].filter(Boolean);
    return `เพิ่ม SKU${parts.length ? ` (${parts.join(" · ")})` : ""}`;
  }
  if (r.action === "product_detail") return `ทำรายละเอียดสินค้า · ค้นหา "${r.query ?? ""}"`;
  if (r.action === "choose") return "เลือกตัวเลือกที่ค้างอยู่";
  return "ไม่ทำอะไร (ตอบอย่างเดียว)";
}

export function VoiceTestBox() {
  const [listen, setListen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<(VoiceReply & { error?: string }) | null>(null);
  useEffect(() => {
    apiFetch("/api/voice-assistant/command").then((r) => (r.ok ? r.json() : null)).then((j) => setListen(!!j?.listen)).catch(() => {});
  }, []);
  const voice = useVoiceInput({ listenAvailable: listen, disabled: busy, onText: setText, onInterim: setText });

  const run = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true); setRes(null);
    try {
      const r = await apiFetch("/api/voice-assistant/command", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: t, dry: true }) });
      const j = await r.json().catch(() => ({}));
      setRes(r.ok ? (j as VoiceReply) : { action: "none", say: "", error: j.error || "ผู้ช่วยตอบไม่ได้ตอนนี้" });
    } catch { setRes({ action: "none", say: "", error: "เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง" }); }
    finally { setBusy(false); }
  };

  const phase = busy ? "thinking" : voice.phase;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-[14px] font-medium text-slate-800 flex items-center gap-1.5"><Icon name="microphone" size={16} className="text-blue-600" /> ลองพูดทดสอบ</p>
      <p className="text-[12px] text-slate-500 mb-2">ดูว่าผู้ช่วยเข้าใจว่าอะไร โดยไม่ทำจริง · ใช้ค่าที่บันทึกแล้ว</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={VOICE_LIMITS.textChars}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void run(); } }}
        placeholder="เช่น ทำรายละเอียดกระเป๋า Ma tote"
        className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-200" />
      <div className="flex gap-2 mt-2">
        <button type="button" disabled={busy || voice.listenMode === "none"} {...voice.holdProps}
          className={`select-none touch-none flex-1 h-9 rounded-lg text-[13px] flex items-center justify-center gap-1.5 border disabled:opacity-50 ${phase === "recording" ? "bg-red-50 border-red-300 text-red-700" : "bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100"}`}>
          <Icon name="microphone" size={15} /> {phase === "recording" ? "กำลังฟัง…" : phase === "transcribing" ? "กำลังแปลงเสียง…" : voice.listenMode === "none" ? "พิมพ์แทน" : "กดค้างแล้วพูด"}
        </button>
        <button type="button" onClick={() => void run()} disabled={!text.trim() || busy}
          className="h-9 px-4 rounded-lg bg-blue-600 text-white text-[13px] hover:bg-blue-700 disabled:opacity-40">{busy ? "กำลังคิด…" : "ลองส่ง"}</button>
      </div>
      {res && (
        <div className={`mt-2.5 rounded-lg px-3 py-2 text-[13px] ${res.error ? "bg-rose-50 text-rose-700" : "bg-slate-50 text-slate-700"}`}>
          {res.error ? res.error : (
            <>
              <p><span className="text-slate-500">ระบบจะ:</span> <b className="font-medium">{describeVoiceAction(res)}</b></p>
              {res.say && <p className="mt-0.5 text-slate-500">ผู้ช่วยพูด: “{res.say}”</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
