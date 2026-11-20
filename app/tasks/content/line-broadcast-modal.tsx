"use client";

// ============================================================
// 💬 ร่าง LINE Broadcast — ระบบเตรียมข้อความ + รูป ให้คัดลอกไปส่งเองใน LINE OA Manager (เจ้าของเลือก 2026-11-20)
//   ทำไมไม่ให้ระบบส่งเอง: LINE นับโควตาต่อ "จำนวนเพื่อน" (2,000 เพื่อน = 2,000 ข้อความ/ครั้ง) แพ็กฟรี 300/เดือน
//   → ร่างให้ก่อน ไม่กินโควตาระบบ · ส่งเองถ้าจะส่งอัตโนมัติต้องอัปแพ็ก LINE OA แล้วค่อยต่อ lib/line-send
//   แหล่งข้อความ: แคปชั่น LINE ของโพสต์ (ถ้ามี) → ไม่งั้นแคปชั่น Facebook → แพลตฟอร์มแรก · แก้ได้ในป๊อป (ไม่บันทึกกลับ)
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { copyText } from "@/components/copy-button";
import { r2ImageUrl } from "@/lib/r2-image";
import type { PostImage } from "./post-confirm-modal";

const LINE_LIMIT = 5000;   // ข้อความ 1 bubble ของ LINE ยาวสุด 5,000 ตัวอักษร

export function LineBroadcastModal({ open, title, captions, media, link, onClose, pushToast }: {
  open: boolean;
  title: string;
  captions: Record<string, string>;     // platform → แคปชั่นที่ประกอบแล้ว
  media: PostImage[];
  link?: string | null;                 // ลิงก์โพสต์/หน้าเว็บที่ลงแล้ว (ถ้ามี)
  onClose: () => void;
  pushToast: (kind: "success" | "error" | "info", msg: string) => void;
}) {
  const base = useMemo(() => {
    const cap = captions.line_oa || captions.line || captions.facebook || Object.values(captions).find((c) => c?.trim()) || title;
    return [cap.trim(), link ? `\n👉 ${link}` : ""].join("").slice(0, LINE_LIMIT);
  }, [captions, title, link]);
  const [text, setText] = useState(base);
  useEffect(() => { if (open) setText(base); }, [open, base]);
  const images = media.filter((m) => m.type !== "video" && !m.key.startsWith("drive:")).slice(0, 4);

  return (
    <ERPModal open={open} onClose={onClose} size="md" title="💬 ร่าง LINE Broadcast" hasUnsavedChanges={text !== base}
      footer={<>
        <a href="https://manager.line.biz/" target="_blank" rel="noreferrer" className="mr-auto inline-flex h-9 items-center rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50">เปิด LINE OA Manager ↗</a>
        <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">ปิด</button>
        <button type="button" onClick={async () => { const ok = await copyText(text); pushToast(ok ? "success" : "error", ok ? "คัดลอกข้อความแล้ว — ไปวางใน LINE OA › Broadcast" : "คัดลอกไม่สำเร็จ"); }}
          className="h-9 rounded-lg bg-[#06C755] px-4 text-sm font-medium text-white hover:opacity-90">คัดลอกข้อความ</button>
      </>}>
      <div className="space-y-3 text-sm">
        <ol className="list-decimal space-y-0.5 pl-5 text-xs text-slate-500">
          <li>แก้ข้อความด้านล่างได้ แล้วกด "คัดลอกข้อความ"</li>
          <li>เปิด LINE OA Manager › บรอดแคสต์ › สร้างใหม่ → วางข้อความ + อัปรูป (กดรูปเพื่อเปิดไฟล์ใหญ่แล้วบันทึก)</li>
          <li>ตั้งเวลาส่ง/กลุ่มผู้รับใน LINE OA ได้เลย</li>
        </ol>
        <div>
          <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, LINE_LIMIT))} rows={8}
            className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          <div className="text-right text-[11px] text-slate-400">{text.length.toLocaleString()} / {LINE_LIMIT.toLocaleString()} ตัวอักษร</div>
        </div>
        {images.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-medium text-slate-600">รูปที่ใช้ได้ (กดเพื่อเปิดไฟล์ใหญ่)</div>
            <div className="grid grid-cols-4 gap-2">
              {images.map((m) => (
                <a key={m.key} href={r2ImageUrl(m.key) ?? undefined} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r2ImageUrl(m.key, 200) ?? ""} alt="" className="h-full w-full object-cover" />
                </a>
              ))}
            </div>
          </div>
        )}
        <p className="text-[11px] text-slate-400">ระบบไม่ส่ง LINE เอง: LINE นับโควตาตามจำนวนเพื่อน (เพื่อน 2,000 คน = 2,000 ข้อความต่อครั้ง) แพ็กฟรีมี 300 ต่อเดือน — ถ้าอัปแพ็กแล้วอยากให้ระบบส่งเอง บอกได้</p>
      </div>
    </ERPModal>
  );
}
