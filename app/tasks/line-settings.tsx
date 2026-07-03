"use client";

// ตั้งค่ากลุ่ม LINE สำหรับแจ้งเตือนงาน Creative (แอดมิน) — reuse บอท/โทเคนเดิม, จับ group id จาก webhook
// ใช้ใน OverviewCustomizer แท็บ "LINE"

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";
import { LINE_TEMPLATES } from "@/lib/creative-line-templates";

// ชุดอีโมจิคร่าว ๆ ให้เลือกแทรกในแม่แบบข้อความ (เน้นที่ใช้บ่อยในงาน/แจ้งเตือน)
const EMOJIS = ["🆕", "✅", "❌", "⚠️", "🟡", "🟢", "🔴", "🟠", "📌", "📝", "📋", "🖼", "📷", "🎨", "🔗", "👤", "👥", "🗓", "⏰", "⏳", "🔔", "📤", "📥", "🚀", "⭐", "💡", "🙏", "👍", "🔥", "✨", "🎉", "➡️", "↩️", "⬇️", "💬", "📎", "🏷", "🛒", "💰", "🏭", "✂️", "🧵", "😀", "😍", "🥳", "🤝", "💯"];

type Info = { captured: string; current: string; has_token: boolean; using_main: boolean; templates?: Record<string, string>; vars?: Record<string, string[]> };

export function LineSettings() {
  const t = useT();
  const [info, setInfo] = useState<Info | null>(null);
  const [gid, setGid] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tpls, setTpls] = useState<Record<string, string>>({});
  const [emojiFor, setEmojiFor] = useState<string | null>(null);   // เปิด palette อีโมจิของแม่แบบไหน
  const load = () => apiFetch("/api/creative-line-group").then((r) => r.json()).then((j) => { if (j && !j.error) { setInfo(j as Info); setTpls((j.templates ?? {}) as Record<string, string>); } }).catch(() => {});
  useEffect(() => { load(); }, []);
  const post = async (payload: Record<string, unknown>, okMsg: string) => {
    setBusy(true); setMsg(null);
    try {
      const j = await apiFetch("/api/creative-line-group", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then((r) => r.json());
      setMsg(j.error || okMsg); if (!j.error) { setGid(""); load(); }
    } catch { setMsg(t("ทำรายการไม่สำเร็จ", "Failed")); } finally { setBusy(false); setTimeout(() => setMsg(null), 3000); }
  };
  return (
    <div className="space-y-3 text-sm">
      <div className={`px-3 py-2 rounded-lg border ${info?.has_token ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
        {info?.has_token ? t("✅ เชื่อมบอท LINE แล้ว", "✅ LINE bot connected") : t("⚠️ ยังไม่ได้เชื่อมบอท LINE — ตั้งโทเคนบอทที่ระบบกลาง/จัดซื้อก่อน", "⚠️ No LINE bot token yet — set it up in the central/purchasing settings first")}
      </div>
      <div className="text-xs text-slate-600">
        {info?.current
          ? <>{t("กลุ่มที่ใช้ตอนนี้", "Current group")}: <span className="font-mono text-slate-800">{info.current}</span></>
          : info?.using_main
          ? t("ยังไม่ได้ตั้งกลุ่มงานแยก → ใช้กลุ่มหลักร่วมกับระบบอื่น", "No dedicated group yet → using the main group (shared)")
          : t("ยังไม่ได้ตั้งกลุ่ม", "No group set")}
      </div>
      {info?.captured && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-500">{t("group id ล่าสุดที่บอทจับได้", "Latest group id the bot saw")}:</span>
          <span className="font-mono text-xs text-slate-700">{info.captured}</span>
          <button disabled={busy} onClick={() => post({ group_id: info.captured }, t("ตั้งกลุ่มนี้แล้ว ✓", "Group set ✓"))} className="h-7 px-2.5 text-xs font-medium text-white bg-violet-600 rounded hover:bg-violet-700 disabled:opacity-50">{t("ใช้กลุ่มนี้", "Use this group")}</button>
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <input value={gid} onChange={(e) => setGid(e.target.value)} placeholder={t("หรือวาง group id เอง", "or paste a group id")} className="h-8 px-2 text-sm border border-slate-200 rounded flex-1 min-w-[160px]" />
        <button disabled={busy || !gid.trim()} onClick={() => post({ group_id: gid.trim() }, t("บันทึกแล้ว ✓", "Saved ✓"))} className="h-8 px-3 text-xs font-medium text-white bg-violet-600 rounded hover:bg-violet-700 disabled:opacity-40">{t("บันทึก", "Save")}</button>
      </div>
      <div className="flex items-center gap-2 flex-wrap pt-1">
        <button disabled={busy} onClick={load} className="h-8 px-3 text-xs font-medium text-slate-600 border border-slate-200 rounded hover:bg-slate-50">🔄 {t("รีเฟรช", "Refresh")}</button>
        <button disabled={busy} onClick={() => post({ test: true }, t("ส่งข้อความทดสอบแล้ว — เช็ก LINE ✓", "Test sent — check LINE ✓"))} className="h-8 px-3 text-xs font-medium text-slate-700 border border-slate-200 rounded hover:bg-slate-50">✉️ {t("ส่งข้อความทดสอบ", "Send test")}</button>
        {info?.current && <button disabled={busy} onClick={() => post({ clear: true }, t("ล้างแล้ว (กลับไปใช้กลุ่มหลัก)", "Cleared (using main group)"))} className="h-8 px-3 text-xs font-medium text-rose-600 border border-rose-200 rounded hover:bg-rose-50">{t("ล้างกลุ่มงาน", "Clear group")}</button>}
        {msg && <span className="text-[11px] text-emerald-600">{msg}</span>}
      </div>
      <div className="text-[11px] text-slate-400 leading-relaxed bg-slate-50 rounded-lg p-2.5">
        {t("วิธีตั้ง: 1) เพิ่มบอท LINE เข้ากลุ่มที่ต้องการ  2) พิมพ์อะไรก็ได้ในกลุ่มนั้น  3) กด “รีเฟรช” แล้วกด “ใช้กลุ่มนี้”  4) กด “ส่งข้อความทดสอบ” เช็กว่าเข้าถูกกลุ่ม",
          "How: 1) Add the LINE bot to the group  2) Send any message in that group  3) tap Refresh then Use this group  4) tap Send test to confirm")}
      </div>

      {/* แม่แบบข้อความต่อเหตุการณ์ */}
      <div className="border-t border-slate-100 pt-3">
        <div className="text-sm font-semibold text-slate-700 mb-1">{t("แม่แบบข้อความ (ต่อเหตุการณ์)", "Message templates (per event)")}</div>
        <p className="text-[11px] text-slate-400 mb-2">{t("เว้นว่าง = ใช้ข้อความเริ่มต้น · ใช้ตัวแปร {…} แทนค่าจริง (กดชิปเพื่อแทรก)", "Blank = default · use {…} variables (tap a chip to insert)")}</p>
        <div className="space-y-3">
          {LINE_TEMPLATES.map((d) => (
            <div key={d.key}>
              <div className="text-xs font-medium text-slate-600 mb-1">{d.label}</div>
              <textarea value={tpls[d.key] ?? ""} onChange={(e) => setTpls((p) => ({ ...p, [d.key]: e.target.value }))} rows={3} placeholder={d.defaultTpl}
                className="w-full text-xs border border-slate-200 rounded p-2 resize-none font-mono focus:outline-none focus:ring-2 focus:ring-violet-200" />
              {/* ปุ่มอีโมจิ — กดเด้ง palette ให้เลือกแทรก */}
              <div className="mt-1">
                <button type="button" onClick={() => setEmojiFor((k) => k === d.key ? null : d.key)}
                  className="text-[11px] px-2 py-0.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50">😀 {t("อีโมจิ", "Emoji")} {emojiFor === d.key ? "▲" : "▼"}</button>
                {emojiFor === d.key && (
                  <div className="mt-1 flex flex-wrap gap-0.5 p-2 border border-slate-200 rounded-lg bg-white shadow-sm max-h-32 overflow-y-auto">
                    {EMOJIS.map((em, i) => (
                      <button key={i} type="button" title={t("แทรกอีโมจินี้", "Insert this emoji")} onClick={() => setTpls((p) => ({ ...p, [d.key]: `${p[d.key] ?? ""}${em}` }))}
                        className="w-7 h-7 text-base flex items-center justify-center rounded hover:bg-violet-100">{em}</button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-start gap-1 flex-wrap mt-1 max-h-24 overflow-y-auto">
                <span className="text-[10px] text-slate-400 sticky left-0">{t("ตัวแปร (กดเพื่อแทรก):", "Variables (tap to insert):")}</span>
                {(info?.vars?.[d.key] ?? d.vars).map((v) => (
                  <button key={v} type="button" onClick={() => setTpls((p) => ({ ...p, [d.key]: `${p[d.key] ?? ""}{${v}}` }))}
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 hover:bg-violet-100 hover:text-violet-700">{`{${v}}`}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <button disabled={busy} onClick={() => post({ templates: tpls }, t("บันทึกแม่แบบแล้ว ✓", "Templates saved ✓"))} className="h-8 px-3 text-xs font-medium text-white bg-violet-600 rounded hover:bg-violet-700 disabled:opacity-50">{t("บันทึกแม่แบบ", "Save templates")}</button>
          <button disabled={busy} onClick={() => setTpls({})} className="h-8 px-3 text-xs font-medium text-slate-500 border border-slate-200 rounded hover:bg-slate-50">{t("ล้างเป็นค่าเริ่มต้น", "Clear to default")}</button>
        </div>
      </div>
    </div>
  );
}
