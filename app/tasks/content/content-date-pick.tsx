"use client";
/**
 * 📅 ป๊อป "เลือกวันลงโพสต์จากปฏิทินคอนเทนต์" (ของกลางของโมดูลคอนเทนต์) — เจ้าของสั่ง 2026-11-22
 *   เห็นโพสต์เดิมของแบรนด์แต่ละวัน (ดูว่าวันไหนว่าง) · โพสต์จากอัลบั้มที่ระบุ = สีม่วง · วันที่ผ่านไปแล้วกดไม่ได้
 *   กดวัน = onPick("YYYY-MM-DD") (ผู้เรียกเติมเวลาแนะนำของวันนั้นเอง)
 * ใช้ที่: ป๊อปสร้างคอนเทนต์กลาง (ปุ่ม "เลือกจากปฏิทิน") · ป๊อปอัลบั้ม Contents (ขั้นส่งเข้าปฏิทิน)
 * ของกลางที่ใช้: ERPModal · DocCalendar · listContent
 */
import { useEffect, useState, type ReactNode } from "react";
import { ERPModal } from "@/components/modal";
import { DocCalendar, type CalDoc } from "@/components/doc-calendar";
import { useT } from "@/components/i18n";
import { listContent } from "../data";

export function ContentDatePickModal({ open, brandId, selectedDay, albumId, onPick, onClose, footer, description }: {
  open: boolean;
  brandId: string | null | undefined;
  /** วันที่ตั้งไว้แล้ว (ไฮไลต์ + เปิดเดือนนั้น) */
  selectedDay?: string | null;
  /** โพสต์ที่มาจากอัลบั้มนี้ = สีม่วง */
  albumId?: string | null;
  onPick: (day: string) => void;
  onClose: () => void;
  footer?: ReactNode;
  description?: string;
}) {
  const t = useT();
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [docs, setDocs] = useState<CalDoc[]>([]);
  useEffect(() => {
    if (!open) return;
    const d0 = selectedDay ? new Date(`${selectedDay.slice(0, 10)}T00:00:00`) : new Date();
    if (!Number.isNaN(d0.getTime())) setCursor(new Date(d0.getFullYear(), d0.getMonth(), 1));
    let live = true;
    listContent(brandId ? { brand_id: brandId } : {})
      .then((rows) => { if (live) setDocs(rows.filter((r) => r.scheduled_at && r.status !== "cancelled").map((r) => {
        const d = new Date(r.scheduled_at as string);
        const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const time = d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false });
        return { id: r.id, no: `${time} ${r.content_no ?? ""}`.trim(), sub: r.title, date: ymd, color: albumId && r.album_id === albumId ? "#7c3aed" : (r.brand_color ?? "#94a3b8"), title: `${time} · ${r.title}` };
      })); })
      .catch(() => { if (live) setDocs([]); });
    return () => { live = false; };
  }, [open, brandId, selectedDay, albumId]);
  if (!open) return null;
  return (
    <ERPModal open onClose={onClose} title={t("เลือกวันลงโพสต์", "Pick a post date")} size="xl" storageKey="content-date-pick" zIndex={60}
      description={description ?? t("กดวันที่จะลง · ในช่องวันคือโพสต์ที่มีอยู่แล้วของแบรนด์ (ดูว่าวันไหนว่าง)", "Pick a day · each day shows the brand's existing posts")}
      footer={footer ?? <button onClick={onClose} className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>}>
      <DocCalendar docs={docs} cursor={cursor} onCursor={setCursor} unit={t("โพสต์", "posts")} selectedDay={selectedDay?.slice(0, 10) ?? null} disablePast
        onPickDay={onPick} hint={t("เวลาโพสต์ใส่ให้ตามเวลาแนะนำของวันนั้น (แก้ได้)", "Time follows the day's recommended time (editable)")} />
    </ERPModal>
  );
}
