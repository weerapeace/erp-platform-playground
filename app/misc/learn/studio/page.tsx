"use client";

/**
 * /misc/learn/studio — 🎬 สตูดิโอจำลอง (ศูนย์เรียนรู้)
 *   จัดไฟหลายดวง ตัวปรับแสง ตัวคุมแสง เลือกวัตถุ (กระเป๋า/คน 3 ระยะ) แล้วดูผลบนจอกล้อง + สูตรไฟ Master Class
 *   สิทธิ์ตามเมนู /misc/learn (learn.view) · ตัวสตูดิโอ = components/lesson-anim/studio-lab · กติกา lib/studio-light · คู่มือ docs/studio-sim.md
 */
import Link from "next/link";
import { Icon } from "@/components/icon";
import { PlaygroundShell } from "@/components/playground-shell";
import { StudioLab } from "@/components/lesson-anim/studio-lab";

export default function StudioPage() {
  return (
    <PlaygroundShell>
      <div className="mx-auto max-w-[1500px] p-3 sm:p-5">
        <div className="mb-3 flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <Link href="/misc/learn" className="mb-1 inline-flex items-center gap-1 text-[12px] text-slate-500 hover:text-slate-800"><Icon name="arrow-left" /> ศูนย์เรียนรู้</Link>
            <h1 className="flex items-center gap-2 text-lg font-bold text-slate-800"><Icon name="bulb" /> สตูดิโอจำลอง</h1>
            <p className="text-[13px] text-slate-500">ลองจัดไฟก่อนถ่ายจริง — ลากไฟในผัง เปลี่ยนตัวปรับแสง แล้วดูภาพในจอกล้องเปลี่ยนทันที · เลือกสูตรไฟสำเร็จรูปเพื่อดูว่าช่างภาพมืออาชีพจัดยังไงและทำไม</p>
          </div>
        </div>
        <StudioLab />
      </div>
    </PlaygroundShell>
  );
}
