"use client";

// ============================================================
// AppLogo + LogoPicker (ของกลาง) — โลโก้ของแอป/บริการ
// - AppLogo: โชว์โลโก้ (URL เต็ม หรือ R2 key) · ไม่มี/โหลดไม่ขึ้น → ตัวอักษรแรกบนพื้นสี
// - LogoPicker: แผงหาโลโก้ — เดาเว็บจากลิงก์/ชื่อ → เลือกไอคอนจากเว็บ · วาง/ลาก/อัปรูปเอง · ค้น Google รูป
// ใช้ที่: App Subscription (ฟอร์ม/บอร์ด/ตาราง) · ใช้กับโมดูลอื่นที่มี "ชื่อ + เว็บ" ได้
// ============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { avatarSrc } from "@/lib/r2-image";
import { cleanDomain, guessLogoDomain, letterBg, logoCandidates, logoImageSearchUrl } from "@/lib/app-logo";
import { uploadResizedImage } from "@/components/image-attach";
import { useToast } from "@/components/toast";

export function AppLogo({ src, name, size = 32, className }: {
  src?: string | null; name: string; size?: number; className?: string;
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [src]);
  const url = broken ? null : avatarSrc(src, size * 2);
  const radius = Math.max(6, Math.round(size * 0.22));
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" width={size} height={size} onError={() => setBroken(true)}
        style={{ width: size, height: size, borderRadius: radius }}
        className={`shrink-0 object-contain bg-white border border-slate-100 ${className ?? ""}`} />
    );
  }
  const letter = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: radius, fontSize: Math.round(size * 0.45) }}
      className={`shrink-0 inline-flex items-center justify-center text-white font-semibold ${letterBg(name)} ${className ?? ""}`}>
      {letter}
    </span>
  );
}

/** ไทล์ตัวเลือกโลโก้ 1 รูป — โหลดไม่ขึ้นก็ซ่อนตัวเอง */
function CandidateTile({ url, label, selected, onPick }: { url: string; label: string; selected: boolean; onPick: () => void }) {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => { setOk(null); }, [url]);
  if (ok === false) return null;
  return (
    <button type="button" onClick={onPick}
      className={`flex flex-col items-center gap-1.5 rounded-lg border p-2 bg-white transition ${selected ? "border-indigo-500 ring-2 ring-indigo-100" : "border-slate-200 hover:border-indigo-300"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" onLoad={() => setOk(true)} onError={() => setOk(false)} className="w-10 h-10 object-contain rounded-md" />
      <span className="text-[11px] text-slate-500">{ok === null ? "กำลังโหลด…" : label}</span>
    </button>
  );
}

export function LogoPicker({ value, name, url, folder = "app-logos", onChange }: {
  value: string;
  name: string;
  /** ลิงก์ที่ใช้เดาเว็บ (เช่น ลิงก์หน้าบิล) */
  url?: string | null;
  folder?: string;
  onChange: (logo: string) => void;
}) {
  const toast = useToast();
  const [domain, setDomain] = useState(() => guessLogoDomain({ url, name }));
  const [imgUrl, setImgUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const candidates = useMemo(() => logoCandidates(domain), [domain]);

  const upload = async (file: File | undefined | null) => {
    if (!file || !file.type.startsWith("image/")) { if (file) toast.error("รับเฉพาะไฟล์รูป"); return; }
    setBusy(true);
    try {
      const r = await uploadResizedImage(file, { folder, max: 256 });
      onChange(r.r2_key);
      toast.success("ตั้งโลโก้แล้ว");
    } catch (e) { toast.error("อัปโหลดรูปไม่สำเร็จ: " + (e as Error).message); }
    finally { setBusy(false); }
  };

  // วางรูปจากคลิปบอร์ด (Ctrl+V) ขณะแผงนี้เปิด — ข้อความธรรมดาปล่อยให้ช่องพิมพ์ตามปกติ
  const uploadRef = useRef(upload); uploadRef.current = upload;
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.items ?? []).map((i) => i.getAsFile()).find((x): x is File => !!x && x.type.startsWith("image/"));
      if (f) { e.preventDefault(); void uploadRef.current(f); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const applyImgUrl = () => {
    const u = imgUrl.trim();
    if (!/^https?:\/\/\S+$/i.test(u)) { toast.error("ลิงก์รูปต้องขึ้นต้นด้วย http"); return; }
    onChange(u); setImgUrl("");
  };

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-600 shrink-0">เว็บของแอป</span>
        <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="เช่น adobe.com"
          className="flex-1 h-8 px-2.5 text-sm border border-slate-200 rounded-lg bg-white outline-none focus:border-indigo-400" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {candidates.map((c) => (
          <CandidateTile key={c.url} url={c.url} label={c.label} selected={value === c.url} onPick={() => onChange(c.url)} />
        ))}
        <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); void upload(e.dataTransfer.files?.[0]); }}
          className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed p-2 transition ${dragOver ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-white hover:border-indigo-300"}`}>
          <span className="text-xl">{busy ? "⏳" : "📋"}</span>
          <span className="text-[11px] text-slate-500 text-center">{busy ? "กำลังอัป…" : "วาง (Ctrl+V) / ลาก / อัปรูปเอง"}</span>
        </button>
        <a href={logoImageSearchUrl(name || cleanDomain(domain) || "")} target="_blank" rel="noopener noreferrer"
          className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white p-2 hover:border-indigo-300">
          <span className="text-xl">🔎</span>
          <span className="text-[11px] text-slate-500 text-center">ค้นใน Google รูปภาพ</span>
        </a>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />

      <div className="flex items-center gap-2">
        <input value={imgUrl} onChange={(e) => setImgUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyImgUrl(); } }}
          placeholder="หรือวางลิงก์รูป (คลิกขวาที่รูป → คัดลอกที่อยู่รูปภาพ)"
          className="flex-1 h-8 px-2.5 text-xs border border-slate-200 rounded-lg bg-white outline-none focus:border-indigo-400" />
        <button type="button" onClick={applyImgUrl} disabled={!imgUrl.trim()}
          className="h-8 px-3 text-xs border border-slate-200 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-50">ใช้ลิงก์นี้</button>
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
        <span>กดรูปที่ใช่ · เว็บเดาจากลิงก์หน้าบิลหรือชื่อรายการ แก้เองได้</span>
        {value && <button type="button" onClick={() => onChange("")} className="text-red-500 hover:underline shrink-0">เอาโลโก้ออก</button>}
      </div>
    </div>
  );
}
