"use client";

// ตั้งค่าโฟลเดอร์ Google Drive "แม่" ต่อแบรนด์ — งานเรียงพิมพ์/สร้างโฟลเดอร์จะไปลงใต้โฟลเดอร์นี้ตามแบรนด์ของงาน
// ใช้ในแท็บ "โฟลเดอร์ต่อแบรนด์" ของ /tasks/settings · วางลิงก์โฟลเดอร์ Drive ต่อแบรนด์

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";

type BrandRow = { id: string; name: string; color: string | null; folder_id: string; folder_name: string; folder_url: string };

export function BrandDriveFolders() {
  const t = useT();
  const [rows, setRows] = useState<BrandRow[] | null>(null);
  const [driveOn, setDriveOn] = useState(true);
  const [inputs, setInputs] = useState<Record<string, string>>({});   // ลิงก์ที่พิมพ์ค้างต่อแบรนด์
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ id: string; kind: "ok" | "err"; text: string } | null>(null);

  const load = () => apiFetch("/api/creative-tasks/brand-drive-folders").then((r) => r.json())
    .then((j) => { if (j && !j.error) { setRows(j.brands ?? []); setDriveOn(!!j.drive_configured); } })
    .catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  const save = async (b: BrandRow) => {
    const input = (inputs[b.id] ?? "").trim(); if (!input) return;
    setBusyId(b.id); setMsg(null);
    try {
      const j = await apiFetch("/api/creative-tasks/brand-drive-folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_id: b.id, input }) }).then((r) => r.json());
      if (j.error) setMsg({ id: b.id, kind: "err", text: j.error });
      else { setMsg({ id: b.id, kind: "ok", text: t(`ตั้งเป็น "${j.folder_name}" ✓`, `Set to "${j.folder_name}" ✓`) }); setInputs((p) => ({ ...p, [b.id]: "" })); load(); }
    } catch (e) { setMsg({ id: b.id, kind: "err", text: (e as Error).message }); }
    finally { setBusyId(null); }
  };
  const clear = async (b: BrandRow) => {
    if (!window.confirm(t(`ล้างโฟลเดอร์ของแบรนด์ "${b.name}"?`, `Clear folder for "${b.name}"?`))) return;
    setBusyId(b.id); setMsg(null);
    try { await apiFetch("/api/creative-tasks/brand-drive-folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_id: b.id, clear: true }) }); load(); }
    catch (e) { setMsg({ id: b.id, kind: "err", text: (e as Error).message }); }
    finally { setBusyId(null); }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden max-w-3xl">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="font-semibold text-slate-800">🗂️ {t("โฟลเดอร์ Drive ต่อแบรนด์", "Drive folder per brand")}</h2>
        <p className="text-xs text-slate-400 mt-0.5">{t("ตั้งโฟลเดอร์แม่ใน Google Drive ให้แต่ละแบรนด์ — เวลากด \"สร้างโฟลเดอร์ + อัปไฟล์ขึ้น Drive\" ในงาน ระบบจะสร้างโครงโฟลเดอร์ (ตาม Parent SKU) ไว้ใต้โฟลเดอร์แม่ของแบรนด์นั้น", "Set a parent Google Drive folder for each brand — the task's \"Create Drive folder\" button builds the folder structure under that brand's parent folder")}</p>
        <p className="text-[11px] text-slate-400 mt-1">💡 {t("วิธีตั้ง: เปิดโฟลเดอร์แม่ใน Google Drive → คัดลอกลิงก์ → วางในช่องของแบรนด์ (ต้องแชร์โฟลเดอร์ให้ service account สิทธิ์ Editor ก่อน)", "How: open the parent folder in Google Drive → copy link → paste into the brand's box (share the folder with the service account as Editor first)")}</p>
      </div>
      <div className="p-5">
        {!driveOn && <div className="mb-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{t("⚠ ยังไม่ได้ตั้งค่า Google Drive (service account) — ตั้งค่าไม่ได้จนกว่าจะเพิ่ม env", "⚠ Google Drive is not configured (service account) — add env first")}</div>}
        {rows === null ? <div className="py-10 text-center text-slate-400">{t("กำลังโหลด...", "Loading...")}</div>
          : rows.length === 0 ? <div className="py-10 text-center text-slate-400">{t("ยังไม่มีแบรนด์", "No brands yet")}</div>
          : (
            <div className="space-y-2.5">
              {rows.map((b) => {
                const hex = b.color && /^#[0-9a-fA-F]{6}$/.test(b.color) ? b.color : "#94a3b8";
                return (
                  <div key={b.id} className="border border-slate-200 rounded-lg px-3 py-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: hex }} />
                      <span className="font-medium text-slate-800 text-sm min-w-[120px]">{b.name}</span>
                      {b.folder_id ? (
                        <a href={b.folder_url} target="_blank" rel="noopener noreferrer" className="text-xs px-2 py-0.5 rounded-md border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 truncate max-w-[220px]" title={b.folder_name}>📁 {b.folder_name || t("โฟลเดอร์", "Folder")}</a>
                      ) : (
                        <span className="text-xs text-slate-400">{t("ยังไม่ตั้ง", "Not set")}</span>
                      )}
                      {b.folder_id && <button onClick={() => clear(b)} disabled={busyId === b.id} className="text-[11px] text-slate-400 hover:text-rose-600 disabled:opacity-50">{t("ล้าง", "Clear")}</button>}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <input value={inputs[b.id] ?? ""} onChange={(e) => setInputs((p) => ({ ...p, [b.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && save(b)}
                        placeholder={t("วางลิงก์โฟลเดอร์ Drive...", "Paste Drive folder link...")}
                        disabled={!driveOn || busyId === b.id}
                        className="flex-1 h-8 border border-slate-200 rounded-lg px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 disabled:bg-slate-50" />
                      <button onClick={() => save(b)} disabled={!driveOn || busyId === b.id || !(inputs[b.id] ?? "").trim()}
                        className="h-8 px-3 text-xs font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 shrink-0">{busyId === b.id ? "..." : (b.folder_id ? t("เปลี่ยน", "Change") : t("ตั้งค่า", "Set"))}</button>
                    </div>
                    {msg && msg.id === b.id && <p className={`text-[11px] mt-1 ${msg.kind === "ok" ? "text-emerald-600" : "text-rose-600"}`}>{msg.text}</p>}
                  </div>
                );
              })}
            </div>
          )}
      </div>
    </div>
  );
}
