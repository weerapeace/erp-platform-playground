"use client";
/**
 * 🎨 เปลี่ยนไอคอนแอป (ของกลาง) — ใช้กับแอปไหนก็ได้ที่ติดตั้งลงเครื่องได้ (lib/app-branding)
 *
 *   const b = useAppBranding("notify");
 *   <img src={appIconUrl("notify", 192, b.version)} />          ← ที่อยู่รูปเดียวกันทุกจุด (QR / หน้าจอโฮม / แจ้งเตือน)
 *   <AppIconEditButton appKey="notify" branding={b} />           ← ปุ่ม ✏️ โผล่เฉพาะคนมีสิทธิ์ (admin.users)
 *
 * ป๊อป: ดูไอคอนตอนนี้ + ตัวอย่างบนหน้าจอโฮม · อัปโหลดรูปใหม่ (ร่างก่อน กดบันทึกถึงใช้) · กลับไปใช้ไอคอนตั้งต้น
 * บันทึก → PATCH /api/app-branding (audit app_branding.update)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { HomeIconPreview } from "@/components/device-view";
import { APP_ICON_FOLDER, appIconUrl } from "@/lib/app-branding";

export type AppBrandingState = {
  key: string;
  label: string;
  custom: boolean;
  version: string | null;
  canEdit: boolean;
  loading: boolean;
  reload: () => Promise<void>;
};

export function useAppBranding(appKey: string): AppBrandingState {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [s, setS] = useState({ label: appKey, custom: false, version: null as string | null, canEdit: false, loading: true });
  const reload = useCallback(async () => {
    try {
      const j = await apiFetch(`/api/app-branding?key=${encodeURIComponent(appKey)}`).then((r) => r.json());
      if (!j.error) setS({ label: j.label, custom: !!j.custom, version: j.version ?? null, canEdit: !!j.canEdit, loading: false });
      else setS((p) => ({ ...p, loading: false }));
    } catch { setS((p) => ({ ...p, loading: false })); }
  }, [appKey]);
  // ล็อกอิน/สลับผู้ใช้ → ถามใหม่ (canEdit ขึ้นกับสิทธิ์ของคนที่เปิด)
  useEffect(() => { void reload(); }, [reload, userId]);
  return { key: appKey, ...s, reload };
}

/** ร่างที่เลือกไว้: undefined = ยังไม่เปลี่ยน · null = กลับไปใช้ไอคอนตั้งต้น · string = รูปใหม่ (r2 key) */
type Draft = string | null | undefined;

export function AppIconEditButton({ appKey, branding, className = "", label = "✏️ เปลี่ยนไอคอนแอป" }: {
  appKey: string; branding: AppBrandingState; className?: string; label?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!branding.canEdit) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className={`h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:border-blue-300 hover:text-blue-700 ${className}`}>{label}</button>
      {open && <AppIconEditorModal appKey={appKey} branding={branding} onClose={() => setOpen(false)} />}
    </>
  );
}

function AppIconEditorModal({ appKey, branding, onClose }: { appKey: string; branding: AppBrandingState; onClose: () => void }) {
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const previewSrc = draft === undefined ? appIconUrl(appKey, 256, branding.version)
    : draft === null ? `${appIconUrl(appKey, 256)}&d=1`
    : `/api/r2-image?key=${encodeURIComponent(draft)}&w=256`;
  const willBeCustom = draft === undefined ? branding.custom : draft !== null;

  const upload = async (file: File) => {
    setErr(null);
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setErr("ใช้รูป PNG / JPG / WEBP"); return; }
    if (file.size > 5 * 1024 * 1024) { setErr("รูปใหญ่เกิน 5MB"); return; }
    setBusy(true);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("folder", APP_ICON_FOLDER);
      const j = await apiFetch("/api/admin/upload", { method: "POST", body: fd }).then((r) => r.json());
      if (j.error || !j.r2_key) throw new Error(j.error || "อัปโหลดไม่สำเร็จ");
      setDraft(j.r2_key);
    } catch (e) { setErr(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ"); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const save = async () => {
    if (draft === undefined) { onClose(); return; }
    setBusy(true); setErr(null);
    try {
      const j = await apiFetch("/api/app-branding", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: appKey, icon_url: draft }) }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      await branding.reload();
      toast.success(draft === null ? "กลับไปใช้ไอคอนตั้งต้นแล้ว" : "เปลี่ยนไอคอนแอปแล้ว");
      onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  return (
    <ERPModal open onClose={onClose} title={`ไอคอนแอป “${branding.label}”`} size="md" defaultExpanded={false}
      hasUnsavedChanges={draft !== undefined} loading={busy}
      footer={(
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg border border-slate-200 text-sm text-slate-600">ยกเลิก</button>
          <button type="button" onClick={save} disabled={busy || draft === undefined}
            className="h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-50">บันทึก</button>
        </div>
      )}>
      <div className="space-y-4">
        <div className="flex items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewSrc} alt="ไอคอนแอป" className="w-24 h-24 rounded-[22%] border border-slate-200 bg-white object-cover shadow-sm" />
          <div className="flex-1 min-w-0 space-y-2">
            <p className="text-sm text-slate-700">
              {draft === undefined ? (branding.custom ? "ตอนนี้ใช้ไอคอนที่ตั้งเอง" : "ตอนนี้ใช้ไอคอนตั้งต้นของแอป")
                : draft === null ? "จะกลับไปใช้ไอคอนตั้งต้น (ยังไม่บันทึก)" : "รูปใหม่ (ยังไม่บันทึก)"}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
                className="h-9 px-3 rounded-lg border border-blue-200 bg-blue-50 text-sm font-medium text-blue-700 disabled:opacity-50">{busy ? "กำลังอัปโหลด..." : "📤 อัปโหลดรูปใหม่"}</button>
              {willBeCustom && (
                <button type="button" onClick={() => setDraft(null)} disabled={busy}
                  className="h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-600">↺ ใช้ไอคอนตั้งต้น</button>
              )}
              {draft !== undefined && (
                <button type="button" onClick={() => setDraft(undefined)} disabled={busy} className="h-9 px-2 text-sm text-slate-400 hover:text-slate-600">ยกเลิกการเปลี่ยน</button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
            <p className="text-xs text-slate-400">รูปสี่เหลี่ยมจัตุรัส อย่างน้อย 512×512 px · ระบบครอปตรงกลางให้เป็นจัตุรัสเอง</p>
          </div>
        </div>
        <HomeIconPreview app={{ key: appKey, label: branding.label, icon: null, iconSrc: previewSrc, customIcon: true }} />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 leading-relaxed">
          ไอคอนใหม่ใช้ทันทีกับ QR / ไอคอนในแจ้งเตือน / เครื่องที่ติดตั้งใหม่ ·
          <b> Android</b> ที่ติดตั้งไว้แล้ว ไอคอนบนหน้าจอเปลี่ยนเองภายใน 1–3 วัน ·
          <b> iPhone</b> ต้องลบไอคอนเดิมแล้ว “เพิ่มไปยังหน้าจอโฮม” ใหม่
        </div>
      </div>
    </ERPModal>
  );
}
