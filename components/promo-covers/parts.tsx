"use client";
/**
 * 🖼 เปลี่ยนปกโปรทุกร้าน — ชิ้นเล็กที่ใช้หลายจุดในหน้า (ป้ายสถานะ · รูปย่อ · แปลงเวลาไทย)
 */
import type { Tone } from "@/lib/promo-cover";

const TONE: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700",
  info: "bg-sky-50 text-sky-700",
  ok: "bg-emerald-50 text-emerald-700",
  warn: "bg-amber-50 text-amber-800",
  bad: "bg-rose-50 text-rose-700",
  muted: "bg-slate-50 text-slate-500",
};
export function Pill({ tone, children, className = "" }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-[12px] ${TONE[tone]} ${className}`}>{children}</span>;
}

/** รูปย่อจัตุรัส · ไม่มีรูป = กล่องเส้นประพร้อมข้อความ */
export function Thumb({ src, label, size = 56, accent = false }: { src: string | null; label?: string; size?: number; accent?: boolean }) {
  const box = { width: size, height: size };
  if (!src) return <div style={box} className="flex shrink-0 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 px-1 text-center text-[11px] leading-tight text-slate-400">{label ?? "ไม่มีรูป"}</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={label ?? ""} style={box} loading="lazy" className={`shrink-0 rounded-md bg-white object-cover ${accent ? "ring-2 ring-orange-400" : "border border-slate-200"}`} />;
}

/** ISO → ค่าในช่องวันเวลา (YYYY-MM-DDTHH:mm เวลาไทย) */
export function isoToLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t + 7 * 3600_000).toISOString().slice(0, 16);
}
/** ค่าในช่องวันเวลา (เวลาไทย) → ISO · ว่าง = null */
export function localToIso(v: string): string | null {
  if (!v || v.length < 16) return null;
  const t = Date.parse(`${v.slice(0, 16)}:00+07:00`);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
