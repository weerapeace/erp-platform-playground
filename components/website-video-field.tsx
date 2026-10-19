"use client";

/**
 * 🎬 ช่อง "ไฟล์คลิป" (ชนิด videoFile ใน schema เว็บ) — อัปโหลดวิดีโอเอง แล้วเก็บ r2 key
 *
 * - ไฟล์ ≤ 4 MB → /api/admin/upload (ทางเดิม · ใช้ได้ทันที)
 * - ไฟล์ใหญ่ ≤ 200 MB → ขอลิงก์จาก /api/website/video-upload แล้วเบราว์เซอร์ส่งไฟล์ตรงเข้า R2 (มีแถบ %)
 *   ⚠️ ต้องตั้ง CORS ของ bucket R2 ก่อน (docs/website-video.md) — ยังไม่ตั้ง = ขึ้นข้อความบอกวิธี ไม่พังเงียบ
 * - ลากไฟล์มาวางได้ (ของกลาง useFileDrop) · ดูคลิปที่อัปแล้วได้ในช่อง · เปลี่ยน / เอาออก
 */
import { useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useFileDrop, FileDropHint } from "@/components/file-drop";

const SMALL = 4 * 1024 * 1024;
const MAX = 200 * 1024 * 1024;
const TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const url = (key: string) => `/api/r2-image?key=${encodeURIComponent(key)}`;
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;

export function WebsiteVideoField({ value, onChange }: { value: string | null; onChange: (key: string | null) => void }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const [busy, setBusy] = useState<{ name: string; pct: number | null } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    if (!TYPES.includes(file.type)) return toast.error("รับเฉพาะไฟล์วิดีโอ MP4 / WebM / MOV");
    if (file.size > MAX) return toast.error(`ไฟล์ใหญ่เกิน 200 MB (${mb(file.size)}) — คลิปยาวให้ใช้ลิงก์ YouTube/Vimeo แทน`);
    if (file.type === "video/quicktime") toast.warning("ไฟล์ .MOV บางไฟล์เล่นบน Chrome/Android ไม่ได้ — แนะนำแปลงเป็น MP4 (H.264)");
    setBusy({ name: file.name, pct: null });
    try {
      if (file.size <= SMALL) {
        // ไฟล์เล็ก: ทางเดิม (ผ่าน ERP)
        const fd = new FormData();
        fd.append("file", file);
        fd.append("folder", "storefront-videos");
        const r = await apiFetch("/api/admin/upload", { method: "POST", body: fd });
        const j = await r.json().catch(() => ({ error: r.status === 413 ? "ไฟล์ใหญ่เกินที่ระบบรับได้" : "อัปโหลดไม่สำเร็จ" }));
        if (!j.r2_key) throw new Error(j.error ?? "อัปโหลดไม่สำเร็จ");
        onChange(j.r2_key as string);
      } else {
        // ไฟล์ใหญ่: ขอลิงก์ แล้วส่งตรงเข้า R2 (ไม่ผ่าน ERP)
        const r = await apiFetch("/api/website/video-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, type: file.type, size: file.size }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.url) throw new Error(j.error ?? "ขอสิทธิ์อัปโหลดไม่สำเร็จ");
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhrRef.current = xhr;
          xhr.open("PUT", j.url as string);
          xhr.setRequestHeader("Content-Type", file.type);
          xhr.upload.onprogress = (e) => e.lengthComputable && setBusy({ name: file.name, pct: Math.round((e.loaded / e.total) * 100) });
          xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`ที่เก็บไฟล์ตอบ ${xhr.status}`)));
          // status 0 = เบราว์เซอร์ถูกกันไม่ให้ส่ง (ยังไม่ได้เปิด CORS ของ bucket) หรือเน็ตหลุด
          xhr.onerror = () => reject(new Error("CORS"));
          xhr.onabort = () => reject(new Error("ABORT"));
          xhr.send(file);
        });
        onChange(j.key as string);
      }
      toast.success("อัปโหลดคลิปแล้ว — กดบันทึก/เผยแพร่เพื่อขึ้นเว็บ");
    } catch (e) {
      const m = (e as Error).message;
      if (m === "ABORT") toast.info("ยกเลิกการอัปโหลดแล้ว");
      else if (m === "CORS")
        setProblem(
          `ไฟล์ใหญ่ (${mb(file.size)}) ยังอัปไม่ได้ — ต้องเปิดสิทธิ์อัปโหลดไฟล์ใหญ่ใน Cloudflare ก่อน 1 ครั้ง (ขั้นตอนในคู่มือ "วิดีโอเว็บ") · ระหว่างนี้ใช้คลิป ≤ 4 MB หรือลิงก์ YouTube`
        );
      else toast.error(m || "อัปโหลดไม่สำเร็จ");
    } finally {
      xhrRef.current = null;
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const drop = useFileDrop((files) => void upload(files[0]), {
    accept: "video/",
    disabled: !!busy,
    onReject: () => toast.error("ลากมาได้เฉพาะไฟล์วิดีโอ"),
    onBusy: () => toast.warning("กำลังอัปโหลดอยู่ — รอสักครู่"),
  });

  return (
    <div {...drop.zone("v")} className="relative space-y-2">
      <FileDropHint show={drop.over === "v"} label="วางคลิปเพื่ออัปโหลด" />
      <input ref={fileRef} type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
      {value ? (
        <video key={value} src={url(value)} className="w-full max-h-52 rounded-lg bg-black" controls muted playsInline preload="metadata" />
      ) : (
        !busy && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-3 py-5 text-center hover:border-blue-400"
          >
            <span className="text-2xl">🎬</span>
            <span className="text-sm font-medium text-slate-700">ลากคลิปมาวาง หรือกดเลือกไฟล์</span>
            <span className="text-[11px] text-slate-400">MP4 / WebM / MOV · ≤ 4 MB อัปได้ทันที · ใหญ่สุด 200 MB</span>
          </button>
        )
      )}

      {busy && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
          <div className="flex items-center justify-between gap-2 text-xs text-blue-800">
            <span className="truncate">⬆ กำลังอัปโหลด {busy.name}{busy.pct != null ? ` · ${busy.pct}%` : "…"}</span>
            {xhrRef.current && (
              <button type="button" onClick={() => xhrRef.current?.abort()} className="shrink-0 text-red-600 hover:underline">
                ยกเลิก
              </button>
            )}
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-blue-100">
            <div className={`h-full bg-blue-500 transition-all ${busy.pct == null ? "w-1/3 animate-pulse" : ""}`} style={busy.pct != null ? { width: `${busy.pct}%` } : undefined} />
          </div>
        </div>
      )}

      {problem && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">⚠️ {problem}</p>}

      {value && !busy && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button type="button" onClick={() => fileRef.current?.click()} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 hover:border-blue-400">
            ⬆ เปลี่ยนคลิป
          </button>
          <button type="button" onClick={() => onChange(null)} className="text-rose-500 hover:underline">
            เอาออก
          </button>
          <span className="text-[11px] text-slate-400">หรือลากคลิปใหม่มาวางที่ช่องนี้</span>
        </div>
      )}
    </div>
  );
}
