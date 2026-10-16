"use client";

/**
 * ของกลางเล็ก ๆ — ช่องอัปโหลดรูปสำหรับหน้าตั้งค่าธีม (โลโก้ / favicon)
 * อัปผ่าน /api/admin/upload (R2) แล้วเก็บเป็น r2_key · แสดงผลผ่าน /api/r2-image
 */
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";

// คลังรูปเป็นตัวใหญ่ — โหลดตอนกดเปิดเท่านั้น ไม่ถ่วงหน้าตั้งค่า
const AssetPicker = dynamic(() => import("@/components/asset-picker").then((m) => m.AssetPicker), { ssr: false });

export const keyUrl = (key: string | null, w = 200) =>
  key ? `/api/r2-image?key=${encodeURIComponent(key)}&w=${w}` : null;

export function ImageUploadField({
  label,
  hint,
  value,
  onChange,
  previewBg = "#ffffff",
  height = 56,
  compact,
}: {
  label: string;
  hint?: string;
  value: string | null;
  onChange: (key: string | null) => void;
  previewBg?: string;
  height?: number;
  /** แบบแคบ: รูปเต็มความกว้าง + ปุ่มเล็กเรียงใต้รูป · ไม่ใส่ = เลือกเองตามความกว้างที่วาง (แคบกว่า 260px = แบบแคบ) */
  compact?: boolean;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
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

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "storefront-brand");
      const r = await apiFetch("/api/admin/upload", { method: "POST", body: fd });
      const j = await r.json();
      if (j.r2_key) {
        onChange(j.r2_key);
        toast.success("อัปโหลดแล้ว");
      } else toast.error(j.error ?? "อัปโหลดไม่สำเร็จ");
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const url = keyUrl(value, 300);

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

  return (
    <div ref={boxRef} className="min-w-0">
      <label className="block text-[11px] font-medium text-slate-500 mb-1">
        {label}
        {hint && <span className="text-slate-400"> · {hint}</span>}
      </label>

      {small ? (
        /* แบบแคบ: รูปเต็มความกว้าง (กดที่รูป = เลือกจากคลัง) + ปุ่มเล็กใต้รูป */
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            title="เลือกจากคลังรูป"
            className="w-full rounded-lg border border-slate-200 flex items-center justify-center overflow-hidden hover:border-blue-400"
            style={{ height, background: previewBg }}
          >
            {url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={url} alt={label} style={{ maxHeight: height - 6, maxWidth: "94%", objectFit: "contain" }} />
            ) : (
              <span className="text-[10px] text-slate-400">ยังไม่มีรูป</span>
            )}
          </button>
          <div className="flex flex-wrap gap-1">
            <button type="button" onClick={() => setPickerOpen(true)} className={`${smallBtn} hover:border-blue-400 hover:text-blue-700`} title="เลือกจากคลังรูป">
              🖼 คลัง
            </button>
            <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className={`${smallBtn} hover:border-slate-500 disabled:opacity-50`} title={value ? "อัปโหลดรูปใหม่" : "อัปโหลดรูป"}>
              {busy ? "…" : "⬆ อัปโหลด"}
            </button>
            {value && (
              <button type="button" onClick={() => onChange(null)} className={`${smallBtn} text-red-500 hover:border-red-300`} title="เอารูปออก">
                ✕
              </button>
            )}
          </div>
          {fileInput}
        </div>
      ) : (
      <div className="flex items-center gap-2">
        <div
          className="shrink-0 rounded-lg border border-slate-200 flex items-center justify-center overflow-hidden"
          style={{ width: 96, height, background: previewBg }}
        >
          {url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={url} alt={label} style={{ maxHeight: height - 8, maxWidth: 88, objectFit: "contain" }} />
          ) : (
            <span className="text-[10px] text-slate-400">ยังไม่มีรูป</span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <button
            onClick={() => setPickerOpen(true)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 hover:border-blue-400 hover:text-blue-700"
          >
            🖼 เลือกจากคลังรูป
          </button>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 hover:border-slate-500 disabled:opacity-50"
          >
            {busy ? "กำลังอัปโหลด…" : value ? "อัปโหลดรูปใหม่" : "อัปโหลดรูป"}
          </button>
          {value && (
            <button onClick={() => onChange(null)} className="text-[11px] text-red-500 hover:underline text-left">
              เอารูปออก
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
          title={`เลือกรูป — ${label}`}
          onSelect={(rows) => {
            const key = rows[0]?.r2_key;
            if (key) {
              onChange(key);
              toast.success("เลือกรูปแล้ว");
            }
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}
