"use client";

/**
 * QR ไลน์บริษัท (อยู่ในส่วน "ไลน์บริษัท" ของศูนย์ LINE) — QR พนักงาน / ลูกค้ารวม / แอดมิน + QR รายร้าน
 *   ดู QR · พิมพ์โปสเตอร์ A4 (/print/line-company-qr) · คัดลอกลิงก์ · เปลี่ยน QR (ใบเก่าใช้ไม่ได้ทันที — ยืนยันก่อน)
 * กติกา QR: lib/line-company-qr · API: /api/admin/line-company (rotate_qr / shop_qr)
 */
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { askConfirm } from "@/components/modal/ask-dialog";
import { Icon } from "@/components/icon";
import { QrCode } from "@/components/qr-code";
import { CustomerPicker, type CustomerPickerValue } from "@/components/pickers";
import { POSTER_QR_KINDS, QR_LABEL } from "@/lib/line-company-qr-labels";   // ไม่ import lib/line-company-qr (มี crypto ฝั่งเซิร์ฟเวอร์)

export type CompanyQrData = Record<"staff" | "customer" | "admin", { link: string | null; rotated_at: string | null }> | null;

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : null);
const openPrint = (q: string) => window.open(`/print/line-company-qr?${q}`, "_blank", "noopener");

export function CompanyQrPanel({ qr, shopRotatedAt, busy, onChanged }: { qr: CompanyQrData; shopRotatedAt: string | null; busy?: boolean; onChanged: () => Promise<void> | void }) {
  const toast = useToast();
  const [shop, setShop] = useState<CustomerPickerValue | null>(null);
  const [working, setWorking] = useState(false);

  const rotate = async (kind: "staff" | "customer" | "admin" | "shop") => {
    const label = kind === "shop" ? "QR รายร้าน (ทุกร้าน)" : QR_LABEL[kind].title;
    const ok = await askConfirm({
      title: `เปลี่ยน${label}?`,
      message: "QR ใบเก่าที่พิมพ์/ส่งไปแล้วจะใช้ไม่ได้ทันที ต้องพิมพ์ติดใหม่ · คนที่ผูกไลน์ไปแล้วไม่กระทบ · ย้อนกลับเป็นใบเก่าไม่ได้",
      confirmText: "เปลี่ยน QR", variant: "danger",
    });
    if (!ok) return;
    setWorking(true);
    try {
      const r = await apiFetch("/api/admin/line-company", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rotate_qr: kind }) });
      const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || "เปลี่ยนไม่สำเร็จ");
      toast.success("เปลี่ยน QR แล้ว — พิมพ์แผ่นใหม่ไปติดแทนได้เลย");
      await onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "เปลี่ยนไม่สำเร็จ"); }
    finally { setWorking(false); }
  };
  const copy = async (link: string) => {
    try { await navigator.clipboard.writeText(link); toast.success("คัดลอกลิงก์แล้ว"); } catch { toast.error("คัดลอกไม่ได้"); }
  };
  const lock = busy || working;

  if (!qr) return <div className="text-[11px] text-rose-600">โหลด QR ไม่สำเร็จ — กดรีเฟรชอีกครั้ง</div>;

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-slate-600">QR เพิ่มเพื่อน + ผูกไลน์ (สแกนแล้วไปถูกทางเลย)</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {POSTER_QR_KINDS.map((k) => {
          const q = qr[k];
          return (
            <div key={k} className="rounded-lg border border-slate-200 p-2 flex flex-col items-center text-center gap-1">
              <div className="text-xs font-semibold text-slate-700">{QR_LABEL[k].title}</div>
              <QrCode text={q.link} size={112} alt={QR_LABEL[k].title} />
              <div className="text-[10px] text-slate-400 leading-snug">{QR_LABEL[k].where}{q.rotated_at ? ` · เปลี่ยนล่าสุด ${fmt(q.rotated_at)}` : ""}</div>
              <div className="flex flex-wrap justify-center gap-1 mt-0.5">
                <button type="button" onClick={() => openPrint(`kind=${k}`)} className="h-7 px-2 text-[11px] rounded-lg border border-slate-200 text-slate-700 inline-flex items-center gap-1"><Icon name="print" /> พิมพ์ A4</button>
                {q.link && <button type="button" onClick={() => void copy(q.link as string)} className="h-7 px-2 text-[11px] rounded-lg border border-slate-200 text-slate-700 inline-flex items-center gap-1"><Icon name="link" /> ลิงก์</button>}
                <button type="button" disabled={lock} onClick={() => void rotate(k)} className="h-7 px-2 text-[11px] rounded-lg border border-slate-200 text-slate-500 inline-flex items-center gap-1 disabled:opacity-40"><Icon name="refresh" /> เปลี่ยน QR</button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="rounded-lg border border-slate-200 p-2 space-y-1.5">
        <div className="text-xs font-semibold text-slate-700">QR รายร้าน <span className="font-normal text-slate-400">— ให้ร้านนั้นเท่านั้น · สแกนแล้วผูกร้านทันที ไม่ต้องรอยืนยัน</span></div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="min-w-[220px] flex-1"><CustomerPicker value={shop} onChange={setShop} placeholder="เลือกร้านลูกค้า…" /></div>
          <button type="button" disabled={!shop} onClick={() => shop && openPrint(`shop=${shop.id}`)}
            className="h-8 px-3 text-xs rounded-lg bg-indigo-600 text-white disabled:opacity-40 inline-flex items-center gap-1"><Icon name="print" /> พิมพ์ QR ร้านนี้</button>
          <button type="button" disabled={lock} onClick={() => void rotate("shop")} className="h-8 px-2 text-[11px] rounded-lg border border-slate-200 text-slate-500 disabled:opacity-40">
            เปลี่ยน QR รายร้านทั้งหมด{shopRotatedAt ? ` (ล่าสุด ${fmt(shopRotatedAt)})` : ""}
          </button>
        </div>
      </div>
      <div className="text-[11px] text-slate-400">ต้องตั้งค่าเพิ่ม 1 ครั้งที่ LINE Developers: ช่อง LINE Login ของระบบ → ผูกกับบัญชีไลน์บริษัท (Linked OA) + เปิด &ldquo;Add friend option: Aggressive&rdquo; ให้หน้าสแกนชวนเพิ่มเพื่อนเอง (คู่มือ docs/line-company-oa.md)</div>
    </div>
  );
}
