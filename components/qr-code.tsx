"use client";

/**
 * QrCode — รูป QR ของกลาง (ใช้ได้ทุกหน้า: ลิงก์เปิดบนมือถือ, รหัสสแกน, ลิงก์ติดตั้งแอป ฯลฯ)
 *
 * - โหลดไลบรารี `qrcode` แบบ dynamic เฉพาะตอนใช้ → ไม่ถ่วงหน้าที่ไม่ได้ใช้
 * - คืน data-url ให้ <img> ธรรมดา → คัดลอก/บันทึกรูป/พิมพ์ได้เหมือนรูปทั่วไป
 *
 * ใช้:  <QrCode text={url} size={180} />
 * หรือ: const src = useQrDataUrl(url, { width: 180 });
 *
 * ห้ามเรียก import("qrcode") เองในหน้าอื่น — ให้ใช้ตัวนี้ (แก้ที่เดียว เช่น สี/ระดับกันผิดพลาด)
 */
import { useEffect, useState } from "react";

export type QrOptions = { width?: number; margin?: number; dark?: string; light?: string };

export async function qrDataUrl(text: string, opts?: QrOptions): Promise<string> {
  const QR = (await import("qrcode")).default;
  return QR.toDataURL(text || " ", {
    width: opts?.width ?? 200,
    margin: opts?.margin ?? 1,
    errorCorrectionLevel: "M",
    color: { dark: opts?.dark ?? "#0f172a", light: opts?.light ?? "#ffffff" },
  });
}

export function useQrDataUrl(text: string | null | undefined, opts?: QrOptions): string | null {
  const [src, setSrc] = useState<string | null>(null);
  const width = opts?.width; const margin = opts?.margin; const dark = opts?.dark; const light = opts?.light;
  useEffect(() => {
    let alive = true;
    if (!text) { setSrc(null); return; }
    qrDataUrl(text, { width, margin, dark, light }).then((d) => { if (alive) setSrc(d); }).catch(() => { if (alive) setSrc(null); });
    return () => { alive = false; };
  }, [text, width, margin, dark, light]);
  return src;
}

export function QrCode({ text, size = 180, className = "", alt = "QR code" }: { text: string | null | undefined; size?: number; className?: string; alt?: string }) {
  const src = useQrDataUrl(text, { width: size * 2 });   // เรนเดอร์ 2 เท่าให้คมบนจอ retina
  if (!src) {
    return <div className={`animate-pulse rounded-lg bg-slate-100 ${className}`} style={{ width: size, height: size }} aria-hidden />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} width={size} height={size} alt={alt} className={`rounded-lg bg-white ${className}`} style={{ width: size, height: size }} />;
}
