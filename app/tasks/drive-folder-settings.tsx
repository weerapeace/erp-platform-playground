"use client";

// ตั้งค่าโฟลเดอร์ Google Drive ปลายทางเก็บ "รูปปก" (งาน cover) — แอดมิน/ผู้จัดการ · ใช้ในแท็บ "โฟลเดอร์ปก" ของ /tasks/settings

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";

type Info = { folder_id: string; name: string; url: string; configured: boolean; drive_configured: boolean; default_path: string };

export function DriveFolderSettings() {
  const t = useT();
  const [info, setInfo] = useState<Info | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = () => apiFetch("/api/creative-cover-folder").then((r) => r.json()).then((j) => { if (j && !j.error) setInfo(j as Info); }).catch(() => {});
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!input.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const j = await apiFetch("/api/creative-cover-folder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input }) }).then((r) => r.json());
      if (j.error) setMsg({ kind: "err", text: j.error });
      else { setMsg({ kind: "ok", text: t(`ตั้งโฟลเดอร์เป็น "${j.name}" แล้ว ✓`, `Set folder to "${j.name}" ✓`) }); setInput(""); load(); }
    } catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
    finally { setBusy(false); }
  };

  const reset = async () => {
    if (!window.confirm(t("กลับไปใช้โฟลเดอร์เริ่มต้น?", "Use the default folder?"))) return;
    setBusy(true); setMsg(null);
    try { await apiFetch("/api/creative-cover-folder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clear: true }) }); setMsg({ kind: "ok", text: t("กลับไปใช้ค่าเริ่มต้นแล้ว ✓", "Reverted to default ✓") }); load(); }
    catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
    finally { setBusy(false); }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">🗂️ {t("โฟลเดอร์เก็บรูปปก (Google Drive)", "Cover image folder (Google Drive)")}</h2>
        <p className="text-sm text-slate-500 mt-1">{t("เวลาอนุมัติงาน \"เปลี่ยนปก\" ระบบจะเก็บรูปปกลงโฟลเดอร์นี้อัตโนมัติ", "Approved \"change cover\" images are saved to this folder automatically")}</p>
      </div>

      {info && !info.drive_configured && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">⚠️ {t("ยังไม่ได้เชื่อม Google Drive (service account) — ตั้ง env ก่อน", "Google Drive (service account) not configured yet")}</p>
      )}

      {/* โฟลเดอร์ปัจจุบัน */}
      <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/50">
        <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide mb-1">{t("โฟลเดอร์ที่ใช้อยู่", "Current folder")}</p>
        {info?.configured ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-800">📁 {info.name || t("(ไม่มีชื่อ)", "(no name)")}</span>
            {info.url && <a href={info.url} target="_blank" rel="noreferrer" className="text-xs text-violet-700 hover:underline">↗ {t("เปิดใน Drive", "Open in Drive")}</a>}
            <button onClick={reset} disabled={busy} className="ml-auto text-xs text-slate-500 hover:text-rose-600 disabled:opacity-50">↺ {t("ใช้ค่าเริ่มต้น", "Use default")}</button>
          </div>
        ) : (
          <p className="text-sm text-slate-600">{t("ค่าเริ่มต้น", "Default")}: <span className="font-mono text-xs bg-white border border-slate-200 rounded px-1.5 py-0.5">{info?.default_path ?? "[01] Catalogs / 02_Contents / 02_cover"}</span></p>
        )}
      </div>

      {/* ตั้งโฟลเดอร์ใหม่ */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700">{t("เปลี่ยนเป็นโฟลเดอร์อื่น", "Change to another folder")}</label>
        <p className="text-[11px] text-slate-400">{t("วางลิงก์โฟลเดอร์ Drive หรือ ID — ต้องแชร์โฟลเดอร์นั้นให้ service account (สิทธิ์ Editor) ก่อน", "Paste a Drive folder link or ID — share it with the service account (Editor) first")}</p>
        <div className="flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} placeholder="https://drive.google.com/drive/folders/..." className="flex-1 h-9 border border-slate-200 rounded-lg px-3 text-sm font-mono" />
          <button onClick={save} disabled={busy || !input.trim()} className="h-9 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 shrink-0">{busy ? "⏳" : t("บันทึก", "Save")}</button>
        </div>
      </div>

      {msg && <p className={`text-sm rounded-lg px-3 py-2 ${msg.kind === "ok" ? "text-emerald-700 bg-emerald-50 border border-emerald-200" : "text-rose-700 bg-rose-50 border border-rose-200"}`}>{msg.text}</p>}
    </div>
  );
}
