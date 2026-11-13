"use client";

// แอป Lazada ที่แบรนด์ใช้ — แอปกลาง (IG International ERP · env) หรือแอปที่แบรนด์สมัครเอง (เช่น Louis Montini)
// ใช้ในหน้า จัดการร้าน/บัญชีแพลตฟอร์ม › Lazada เท่านั้น · บันทึกผ่าน /api/lazada/app (App Secret เข้ารหัส ไม่ส่งกลับมาหน้าเว็บ)
// เชื่อมร้านอยู่ = เปลี่ยนแอปไม่ได้ (แก้ได้แค่ App Secret ของแอปเดิม) — กติกาฝั่ง server: lib/lazada planLazAppSave

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { ERPInput } from "@/components/form";
import { ConfirmDialog } from "@/components/modal";
import { CopyButton } from "@/components/copy-button";

type OwnApp = { app_key: string; secret_ok: boolean } | null;

const BTN_DARK = "h-9 px-4 inline-flex items-center gap-1.5 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-40";
const BTN_LINE = "h-9 px-3.5 inline-flex items-center gap-1.5 text-sm text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40";

export function LazadaAppPanel({ brandId, brandName, ownApp, defaultReady, locked, canManage, onChanged, say }: {
  brandId: string; brandName: string; ownApp: OwnApp; defaultReady: boolean; locked: boolean; canManage: boolean;
  onChanged: () => void | Promise<void>; say: (text: string, bad?: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const callbackUrl = typeof window === "undefined" ? "/api/lazada/callback" : `${window.location.origin}/api/lazada/callback`;
  const keyLocked = locked && !!ownApp;   // เชื่อมอยู่ + มีแอปของแบรนด์ → แก้ได้แค่ secret

  const start = () => { setKey(ownApp?.app_key ?? ""); setSecret(""); setOpen(true); };
  const save = async () => {
    setBusy(true);
    try {
      const r = await apiFetch("/api/lazada/app", { method: "PUT", body: JSON.stringify({ brand_id: brandId, app_key: key, app_secret: secret }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) { say(j.error || "บันทึกไม่สำเร็จ", true); return; }
      say(j.unchanged ? "ไม่มีอะไรเปลี่ยน" : `บันทึกแอป Lazada ของ ${brandName} แล้ว${locked ? "" : " — กด เชื่อมต่อ Lazada ได้เลย"}`);
      setOpen(false); setSecret("");
      await onChanged();
    } catch { say("บันทึกไม่สำเร็จ — ลองใหม่อีกครั้ง", true); }
    finally { setBusy(false); }
  };
  const clear = async () => {
    setBusy(true);
    try {
      const r = await apiFetch("/api/lazada/app", { method: "DELETE", body: JSON.stringify({ brand_id: brandId }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) { say(j.error || "ล้างไม่สำเร็จ", true); return; }
      say(`${brandName} กลับไปใช้แอปกลางแล้ว`); setOpen(false);
      await onChanged();
    } catch { say("ล้างไม่สำเร็จ — ลองใหม่อีกครั้ง", true); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-slate-200 px-4 py-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600 min-w-0">
          แอป Lazada ที่ใช้:{" "}
          {ownApp
            ? <b className="font-medium text-slate-900">แอปของแบรนด์นี้ <span className="font-normal text-slate-500">(App Key {ownApp.app_key})</span></b>
            : <b className="font-medium text-slate-900">แอปกลาง <span className="font-normal text-slate-500">(IG International ERP{defaultReady ? "" : " — ยังไม่ได้ตั้งในโฮสต์"})</span></b>}
        </p>
        {canManage && !open && <button onClick={start} className="text-xs text-slate-600 hover:underline">{ownApp ? "แก้ไข" : "ใช้แอปของแบรนด์เอง"}</button>}
      </div>
      {ownApp && !ownApp.secret_ok && <p className="text-xs text-rose-700">อ่าน App Secret ที่เก็บไว้ไม่ได้ — กด แก้ไข แล้วกรอก App Secret ใหม่</p>}

      {open && (
        <div className="space-y-3 pt-1">
          <p className="text-xs text-slate-500 leading-relaxed">
            ใช้เมื่อแบรนด์นี้สมัครแอปของตัวเองที่ open.lazada.com (ประเภท Seller In-house APP ที่อนุมัติแล้ว) · App Key / App Secret อยู่ในหน้า App Management ของแอปนั้น ·
            ตั้ง Callback URL ของแอปเป็น <span className="font-mono text-slate-700 break-all">{callbackUrl}</span> <CopyButton value={callbackUrl} title="คัดลอก Callback URL" />
          </p>
          {keyLocked && <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2">เชื่อมร้านอยู่ — แก้ได้แค่ App Secret ของแอปเดิม · ถ้าจะเปลี่ยนแอป ให้กด ตัดการเชื่อมต่อ ก่อน</p>}
          {locked && !ownApp && <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2">แบรนด์นี้เชื่อมร้านผ่านแอปกลางอยู่ — ถ้าจะย้ายไปใช้แอปของแบรนด์ ให้กด ตัดการเชื่อมต่อ ก่อน แล้วค่อยบันทึก</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 min-w-0">
              <span className="text-xs text-slate-600">App Key</span>
              <ERPInput value={key} onChange={(e) => setKey(e.target.value)} disabled={keyLocked || busy} placeholder="ตัวเลข เช่น 123456" autoComplete="off" spellCheck={false} />
            </label>
            <label className="block space-y-1 min-w-0">
              <span className="text-xs text-slate-600">App Secret</span>
              <ERPInput type="password" value={secret} onChange={(e) => setSecret(e.target.value)} disabled={busy} autoComplete="new-password" spellCheck={false}
                placeholder={ownApp?.secret_ok && key.trim() === ownApp.app_key ? "เว้นว่าง = ใช้ของเดิม" : "วางจากหน้า App Management"} />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={save} disabled={busy || !key.trim()} className={BTN_DARK}>{busy ? "กำลังบันทึก..." : "บันทึก"}</button>
            <button onClick={() => { setOpen(false); setSecret(""); }} disabled={busy} className={BTN_LINE}>ยกเลิก</button>
            {ownApp && !locked && <button onClick={() => setConfirmClear(true)} disabled={busy} className="text-xs text-rose-600 hover:underline ml-auto">กลับไปใช้แอปกลาง</button>}
          </div>
          <p className="text-[11px] text-slate-400">App Secret เก็บแบบเข้ารหัส ไม่มีใครเปิดดูได้ (กรอกทับได้อย่างเดียว) · ทุกครั้งที่แก้จะบันทึกประวัติ</p>
        </div>
      )}

      <ConfirmDialog open={confirmClear} onClose={() => setConfirmClear(false)} variant="danger" title="กลับไปใช้แอปกลาง?" confirmText="กลับไปใช้แอปกลาง"
        message={`ลบกุญแจแอปของ ${brandName} ออกจากระบบ — ครั้งหน้าที่กดเชื่อมต่อจะใช้แอปกลาง (IG International ERP)`}
        onConfirm={() => { setConfirmClear(false); void clear(); }} />
    </div>
  );
}
