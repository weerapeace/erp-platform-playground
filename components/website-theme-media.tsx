"use client";

/**
 * ของกลางเล็ก ๆ — ช่องอัปโหลดรูปสำหรับหน้าตั้งค่าธีม (โลโก้ / favicon)
 * อัปผ่าน /api/admin/upload (R2) แล้วเก็บเป็น r2_key · แสดงผลผ่าน /api/r2-image
 * 🖼 ในหน้าเว็บไซต์ของร้าน (มี ImageSetsContext) = มีปุ่ม "🔗 ใช้ชุดรูป" → เก็บค่า imgset/<id> (เปลี่ยนรูปของชุดทีเดียว ทุกที่ที่ผูกเปลี่ยนตาม)
 * 📥 ลากไฟล์รูปจากเครื่องมาวางที่ช่องได้ (ของกลาง useFileDrop) = เหมือนกด "อัปโหลดรูป" · หลายไฟล์ = ใช้ไฟล์แรก
 */
import { useContext, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useFileDrop } from "@/components/file-drop";
import { removeBackground, type RemoveBgStage } from "@/lib/remove-bg";
import { ImageSetsContext } from "@/components/website-image-sets-context";
import { imgSetIdOf, imgSetRef } from "@/lib/website-image-sets";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";
import { labelEn } from "@/lib/website-admin-en";

// คลังรูปเป็นตัวใหญ่ — โหลดตอนกดเปิดเท่านั้น ไม่ถ่วงหน้าตั้งค่า
const AssetPicker = dynamic(() => import("@/components/asset-picker").then((m) => m.AssetPicker), { ssr: false });

export const keyUrl = (key: string | null, w = 200) =>
  key ? `/api/r2-image?key=${encodeURIComponent(key)}&w=${w}` : null;

/** พื้นตารางหมากรุก = เห็นว่าส่วนไหนของรูปใส */
const CHECKER = "repeating-conic-gradient(#e5e7eb 0% 25%, #ffffff 0% 50%) 50% / 12px 12px";
const cutStageLabel = (s: RemoveBgStage): string => ({ model: tr("กำลังโหลดตัว AI…", "Loading AI model…"), cutting: tr("กำลังตัดพื้น…", "Removing background…"), saving: tr("กำลังบันทึก…", "Saving…") })[s];

export function ImageUploadField({
  label,
  hint,
  value,
  onChange,
  previewBg = "#ffffff",
  height = 56,
  compact,
  removeBg,
}: {
  label: string;
  hint?: string;
  value: string | null;
  onChange: (key: string | null) => void;
  previewBg?: string;
  height?: number;
  /** แบบแคบ: รูปเต็มความกว้าง + ปุ่มเล็กเรียงใต้รูป · ไม่ใส่ = เลือกเองตามความกว้างที่วาง (แคบกว่า 260px = แบบแคบ) */
  compact?: boolean;
  /** ✂️ ปุ่มตัดพื้นด้วย AI ในเบราว์เซอร์ (lib/remove-bg · รูปคน) — ได้รูปพื้นใสใหม่ลงคลัง รูปเดิมไม่หาย · กดย้อนได้ */
  removeBg?: boolean;
}) {
  const toast = useToast();
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [cutStage, setCutStage] = useState<RemoveBgStage | null>(null);
  /** รูปก่อนตัดพื้น (กดย้อนได้ ตราบใดที่ช่องยังเป็นรูปที่ตัดได้) */
  const [cut, setCut] = useState<{ from: string; to: string } | null>(null);
  // 📐 วางในช่องแคบ (เช่น การ์ดในตัวจัดเมนู) → สลับเป็นแบบแคบเอง กันปุ่มเบียด/ทับกัน
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (compact !== undefined) return;
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setNarrow(el.clientWidth > 0 && el.clientWidth < 260));
    ro.observe(el);
    return () => ro.disconnect();
  }, [compact]);
  const small = compact ?? narrow;
  // 🖼 ชุดรูปกลาง: ผูกอยู่ = โชว์รูปปัจจุบันของชุด + ป้ายชื่อชุด
  const setsCtx = useContext(ImageSetsContext);
  const setId = imgSetIdOf(value);
  const linked = setId ? setsCtx?.sets.find((x) => x.id === setId) ?? null : null;
  const [setOpen, setSetOpen] = useState(false);

  /** อัปเข้า R2 (+ ลงคลังกลางเอง) → คืน r2_key · ไม่สำเร็จ = null */
  const upload = async (file: File, okMsg = tr("อัปโหลดแล้ว", "Uploaded")): Promise<string | null> => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "storefront-brand");
      const r = await apiFetch("/api/admin/upload", { method: "POST", body: fd });
      const j = await r.json();
      if (j.r2_key) {
        onChange(j.r2_key);
        toast.success(okMsg);
        return j.r2_key as string;
      }
      toast.error(j.error ?? tr("อัปโหลดไม่สำเร็จ", "Upload failed"));
    } catch {
      toast.error(tr("เชื่อมต่อไม่ได้", "Connection failed"));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
    return null;
  };

  // ✂️ ตัดพื้น: รูปปัจจุบัน → AI ในเบราว์เซอร์ → รูปพื้นใส (ตัดขอบใสรอบตัว) อัปเป็นรูปใหม่ · รูปเดิมยังอยู่ในคลัง
  const cutBackground = async () => {
    if (!value || cutStage || busy) return;
    const from = value;
    try {
      const file = await removeBackground(`/api/r2-image?key=${encodeURIComponent(from)}&w=1600`, { trim: true, onStage: setCutStage });
      setCutStage(null);
      const to = await upload(file, tr("ตัดพื้นแล้ว — รูปเดิมยังอยู่ในคลังรูป", "Background removed — the original stays in the image library"));
      if (to) setCut({ from, to });
    } catch {
      toast.error(tr("ตัดพื้นไม่สำเร็จ — ลองใหม่อีกครั้ง (ครั้งแรกต้องโหลดตัว AI ~25MB ใช้เน็ตสักครู่)", "Background removal failed — try again (the first time downloads a ~25MB AI model)"));
    } finally {
      setCutStage(null);
    }
  };
  const canUndo = !!cut && cut.to === value;
  const working = busy || !!cutStage;
  // 📥 ลากรูปมาวาง = อัปโหลดเหมือนกดปุ่ม (ผูกชุดรูปอยู่ = เปลี่ยนเป็นรูปของช่องนี้เอง แบบเดียวกับกดอัปโหลด)
  const drop = useFileDrop((files) => void upload(files[0]), {
    accept: "image/",
    disabled: working,
    onReject: () => toast.error(tr("ลากได้เฉพาะไฟล์รูป (PNG / JPG / WebP / GIF)", "Only image files can be dropped (PNG / JPG / WebP / GIF)")),
    onBusy: () => toast.info(tr("กำลังอัปโหลดอยู่ — รอสักครู่แล้วลากใหม่", "Upload in progress — wait a moment and drop again")),
  });
  const dropping = drop.over === "img";
  const emptyText = dropping ? t("วางเพื่ออัปโหลด", "Drop to upload") : t("ยังไม่มีรูป · ลากมาวางได้", "No image · drag & drop");

  const url = keyUrl(setId ? linked?.desk ?? linked?.mob ?? null : value, 300);
  const previewStyle = removeBg && value ? CHECKER : previewBg;
  const cutBtnLabel = cutStage ? cutStageLabel(cutStage) : t("✂️ ตัดพื้น (AI)", "✂️ Remove background (AI)");

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept="image/png,image/jpeg,image/webp,image/gif"
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) void upload(f);
      }}
    />
  );
  const smallBtn = "h-7 px-2 rounded-md border border-slate-200 text-[11px] text-slate-700 bg-white whitespace-nowrap";
  // 🔗 ผูก/เปลี่ยน/เลิกผูกชุดรูป (มีเฉพาะในหน้าเว็บไซต์ของร้าน)
  const setBar = setsCtx && (
    <div className="relative mb-1">
      {setId ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] text-violet-800">
          <span className="min-w-0 truncate font-medium">🔗 {t("ชุดรูป", "Image set")}: {linked ? linked.name : setsCtx.loaded ? t("ชุดนี้ถูกลบแล้ว", "This set was deleted") : "…"}</span>
          <button type="button" onClick={() => setSetOpen((v) => !v)} className="hover:underline">
            {t("เปลี่ยนชุด", "Change set")}
          </button>
          <button type="button" onClick={() => onChange(linked?.desk ?? null)} className="hover:underline" title={t("ช่องนี้กลับไปใช้รูปของตัวเอง (เริ่มจากรูปปัจจุบันของชุด)", "This field goes back to its own image (starting from the set's current image)")}>
            {t("เลิกผูก", "Unlink")}
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setSetOpen((v) => !v)} className="text-[11px] text-violet-700 hover:underline" title={t("เลือกชุดรูป — เปลี่ยนรูปของชุดทีเดียว ทุกที่ที่ผูกเปลี่ยนตาม (คอม + มือถือ)", "Pick an image set — change the set once and every linked spot updates (desktop + mobile)")}>
          🔗 {t("ใช้ชุดรูป", "Use image set")}
        </button>
      )}
      {setOpen && (
        <div className="absolute left-0 z-30 mt-1 max-h-64 w-64 overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          {setsCtx.sets.length === 0 ? (
            <p className="p-2 text-[11px] text-slate-500">{t("ยังไม่มีชุดรูป — สร้างได้ที่แท็บ 🖼 ชุดรูป", "No image sets yet — create one in the 🖼 Image sets tab")}</p>
          ) : (
            setsCtx.sets.map((x) => {
              const thumb = keyUrl(x.desk ?? x.mob, 120);
              return (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => {
                    onChange(imgSetRef(x.id));
                    setSetOpen(false);
                    toast.success(tr(`ผูกชุด “${x.name}” แล้ว`, `Linked set “${x.name}”`));
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-slate-50 ${x.id === setId ? "bg-violet-50" : ""}`}
                >
                  <span className="flex h-8 w-12 shrink-0 items-center justify-center overflow-hidden rounded bg-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : <span className="text-[9px] text-slate-400">{t("ไม่มีรูป", "No image")}</span>}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{x.name}</span>
                  {x.id === setId && <span className="text-violet-700">✓</span>}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );

  return (
    <div ref={boxRef} {...drop.zone("img")} className={`min-w-0 rounded-lg transition-shadow ${dropping ? "ring-2 ring-blue-400 ring-offset-2 bg-blue-50/50" : ""}`}>
      <label className="block text-[11px] font-medium text-slate-500 mb-1">
        {labelEn(label)}
        {hint && <span className="text-slate-400"> · {labelEn(hint)}</span>}
      </label>
      {setBar}

      {small ? (
        /* แบบแคบ: รูปเต็มความกว้าง (กดที่รูป = เลือกจากคลัง) + ปุ่มเล็กใต้รูป */
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            title={t("เลือกจากคลังรูป", "Pick from image library")}
            className="w-full rounded-lg border border-slate-200 flex items-center justify-center overflow-hidden hover:border-blue-400"
            style={{ height, background: previewStyle }}
          >
            {url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={url} alt={labelEn(label)} style={{ maxHeight: height - 6, maxWidth: "94%", objectFit: "contain" }} />
            ) : (
              <span className={`px-1 text-center text-[10px] leading-tight ${dropping ? "font-medium text-blue-600" : "text-slate-400"}`}>{emptyText}</span>
            )}
          </button>
          <div className="flex flex-wrap gap-1">
            <button type="button" onClick={() => setPickerOpen(true)} className={`${smallBtn} hover:border-blue-400 hover:text-blue-700`} title={t("เลือกจากคลังรูป", "Pick from image library")}>
              🖼 {t("คลัง", "Library")}
            </button>
            <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className={`${smallBtn} hover:border-slate-500 disabled:opacity-50`} title={value ? t("อัปโหลดรูปใหม่", "Upload new image") : t("อัปโหลดรูป", "Upload image")}>
              {busy ? "…" : t("⬆ อัปโหลด", "⬆ Upload")}
            </button>
            {value && (
              <button type="button" onClick={() => onChange(null)} className={`${smallBtn} text-red-500 hover:border-red-300`} title={t("เอารูปออก", "Remove image")}>
                ✕
              </button>
            )}
            {removeBg && value && !setId && (
              <button type="button" onClick={cutBackground} disabled={working} className={`${smallBtn} hover:border-violet-400 hover:text-violet-700 disabled:opacity-60`} title={t("ตัดพื้นหลังออกด้วย AI (รูปคน)", "Remove background with AI (people photos)")}>
                {cutBtnLabel}
              </button>
            )}
            {removeBg && canUndo && (
              <button type="button" onClick={() => { onChange(cut!.from); setCut(null); }} className={`${smallBtn} hover:border-slate-500`} title={t("กลับไปใช้รูปก่อนตัดพื้น", "Go back to the image before background removal")}>
                ↩ {t("รูปเดิม", "Original")}
              </button>
            )}
          </div>
          {fileInput}
        </div>
      ) : (
      <div className="flex items-center gap-2">
        <div
          className="shrink-0 rounded-lg border border-slate-200 flex items-center justify-center overflow-hidden"
          style={{ width: 96, height, background: previewStyle }}
        >
          {url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={url} alt={labelEn(label)} style={{ maxHeight: height - 8, maxWidth: 88, objectFit: "contain" }} />
          ) : (
            <span className={`px-1 text-center text-[10px] leading-tight ${dropping ? "font-medium text-blue-600" : "text-slate-400"}`}>{emptyText}</span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <button
            onClick={() => setPickerOpen(true)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 hover:border-blue-400 hover:text-blue-700"
          >
            🖼 {t("เลือกจากคลังรูป", "Pick from image library")}
          </button>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 hover:border-slate-500 disabled:opacity-50"
          >
            {busy ? t("กำลังอัปโหลด…", "Uploading…") : value ? t("อัปโหลดรูปใหม่", "Upload new image") : t("อัปโหลดรูป", "Upload image")}
          </button>
          {removeBg && value && !setId && (
            <button
              type="button"
              onClick={cutBackground}
              disabled={working}
              className="px-3 py-1.5 rounded-lg border border-violet-200 text-xs text-violet-700 hover:border-violet-400 disabled:opacity-60"
              title={t("ตัดพื้นหลังออกด้วย AI ในเครื่อง — ได้รูปพื้นใสใหม่ รูปเดิมไม่หาย", "Remove the background with on-device AI — creates a new transparent image; the original is kept")}
            >
              {cutBtnLabel}
            </button>
          )}
          {removeBg && canUndo && (
            <button type="button" onClick={() => { onChange(cut!.from); setCut(null); }} className="text-[11px] text-slate-600 hover:underline text-left">
              {t("↩ กลับไปใช้รูปเดิม (ก่อนตัดพื้น)", "↩ Use the original (before background removal)")}
            </button>
          )}
          {value && (
            <button onClick={() => onChange(null)} className="text-[11px] text-red-500 hover:underline text-left">
              {t("เอารูปออก", "Remove image")}
            </button>
          )}
        </div>

        {fileInput}
      </div>
      )}

      {/* คลังรูปกลางของ ERP — เลือกแล้วเก็บ r2_key เหมือนตอนอัปโหลดเอง */}
      {pickerOpen && (
        <AssetPicker
          open
          onClose={() => setPickerOpen(false)}
          typeFilter="image"
          title={t(`เลือกรูป — ${labelEn(label)}`, `Pick image — ${labelEn(label)}`)}
          onSelect={(rows) => {
            const key = rows[0]?.r2_key;
            if (key) {
              onChange(key);
              toast.success(tr("เลือกรูปแล้ว", "Image selected"));
            }
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}
