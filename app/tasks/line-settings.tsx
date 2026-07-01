"use client";

// ตั้งค่ากลุ่ม LINE สำหรับแจ้งเตือนงาน Creative (แอดมิน) — reuse บอท/โทเคนเดิม, จับ group id จาก webhook
// ใช้ใน OverviewCustomizer แท็บ "LINE"

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";

type Info = { captured: string; current: string; has_token: boolean; using_main: boolean };

export function LineSettings() {
  const t = useT();
  const [info, setInfo] = useState<Info | null>(null);
  const [gid, setGid] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => apiFetch("/api/creative-line-group").then((r) => r.json()).then((j) => { if (j && !j.error) setInfo(j as Info); }).catch(() => {});
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
    </div>
  );
}
