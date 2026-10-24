"use client";

// ============================================================
// 📖 คู่มือตั้งบอท Discord — ในหน้า "ส่งอีเมลรายงาน" ให้เจ้าของเซิร์ฟเวอร์ Discord ทำตามเองทีละขั้น (ครั้งเดียว)
// ระบบอ่านค่าจาก env ใน lib/discord.ts · ฉบับเต็มเดียวกัน: docs/discord-setup.md
// ============================================================

import { useEffect, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { apiFetch } from "@/lib/api";

const Code = ({ children }: { children: string }) => (
  <span className="inline-flex items-center gap-1 break-all rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[12px] text-slate-800">
    {children}<CopyButton value={children} title={`คัดลอก ${children}`} />
  </span>
);
const Ext = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline-offset-2 hover:underline">{children} ↗</a>
);
const Secret = () => <span className="text-rose-600">⚠ เป็นความลับ — ห้ามส่งในแชต / LINE / อีเมล รวมถึงห้ามส่งให้ Claude ใส่ใน Vercel เองเท่านั้น</span>;

type Meta = { ready: { bot: boolean; buttons: boolean; link: boolean }; invite_url: string | null; channels: unknown[]; error: string | null };

export function DiscordSetupGuide() {
  const [meta, setMeta] = useState<Meta | null>(null);
  // API ตอบ error (ไม่มี ready/channels) = ไม่โชว์สถานะ แทนที่จะทำทั้งหน้าพัง
  useEffect(() => { apiFetch("/api/admin/email-reports/discord").then((r) => r.json()).then((j) => { if (j?.ready && Array.isArray(j.channels)) setMeta(j as Meta); }).catch(() => {}); }, []);
  const origin = typeof window !== "undefined" ? window.location.origin : "https://erp-platform-playground.vercel.app";
  const allReady = !!meta && meta.ready.bot && meta.ready.buttons && meta.ready.link && meta.channels.length > 0;
  const tick = (ok: boolean | undefined) => (ok ? <span className="text-emerald-600">✓</span> : <span className="text-slate-300">○</span>);

  const steps: { title: string; body: React.ReactNode }[] = [
    {
      title: "สร้างแอปบอท",
      body: <>เข้า <Ext href="https://discord.com/developers/applications">discord.com/developers/applications</Ext> (ล็อกอินด้วยบัญชีเจ้าของเซิร์ฟเวอร์) → <b>New Application</b> → ตั้งชื่อ เช่น <b>ERP รายงาน</b> → Create · ใส่รูปโลโก้ได้ที่หน้านี้</>,
    },
    {
      title: "คัดลอก 2 ค่าจากหน้า General Information",
      body: <><b>APPLICATION ID</b> → ใช้เป็น <Code>DISCORD_APPLICATION_ID</Code> · <b>PUBLIC KEY</b> → ใช้เป็น <Code>DISCORD_PUBLIC_KEY</Code></>,
    },
    {
      title: "สร้างโทเคนบอท (แท็บ Bot)",
      body: <>แท็บ <b>Bot</b> → <b>Reset Token</b> → คัดลอก → ใช้เป็น <Code>DISCORD_BOT_TOKEN</Code> (ไม่ต้องเปิด Privileged Intents)<br /><Secret /></>,
    },
    {
      title: "ตั้งการผูกบัญชี (แท็บ OAuth2)",
      body: <>แท็บ <b>OAuth2</b> → <b>Reset Secret</b> → คัดลอก Client Secret → ใช้เป็น <Code>DISCORD_CLIENT_SECRET</Code> <Secret /><br />
        ช่อง <b>Redirects → Add Redirect</b> ใส่ <Code>{`${origin}/api/account/discord-link/callback`}</Code> → <b>Save Changes</b></>,
    },
    {
      title: "ใส่ 4 ค่าใน Vercel แล้ว Deploy ใหม่",
      body: <><Ext href="https://vercel.com/dashboard">vercel.com</Ext> → โปรเจกต์ <b>erp-platform-playground</b> → <b>Settings → Environment Variables</b> (Production) → ใส่ 4 ค่าจากขั้น 2–4 → แท็บ <b>Deployments</b> → อันบนสุด → <b>⋯ → Redeploy</b> (รอ 2–3 นาที)</>,
    },
    {
      title: "เชิญบอทเข้าเซิร์ฟเวอร์",
      body: meta?.invite_url
        ? <>กด <Ext href={meta.invite_url}>ลิงก์เชิญบอท</Ext> → เลือกเซิร์ฟเวอร์ → Authorize (สิทธิ์: ดูห้อง · ส่งข้อความ · แนบรูป/การ์ด · แท็กบทบาท) · ห้องที่เป็นส่วนตัว ให้เพิ่มบอทเข้าห้องนั้นด้วย</>
        : <>หลังขั้น 5 เสร็จ กลับมาหน้านี้ (Ctrl+Shift+R) จะมี <b>ลิงก์เชิญบอท</b> ขึ้นตรงนี้</>,
    },
    {
      title: "ตั้งลิงก์รับปุ่ม (ปุ่มติ๊กใน Discord)",
      body: <>กลับหน้า <b>General Information</b> ของแอป → ช่อง <b>Interactions Endpoint URL</b> ใส่ <Code>{`${origin}/api/discord/interactions`}</Code> → <b>Save Changes</b> (Discord จะทดลองเรียก ถ้าขึ้นบันทึกสำเร็จ = ใช้ได้ · ต้องทำหลังขั้น 5)</>,
    },
    {
      title: "ผูกบัญชีทุกคนที่จะกดติ๊ก",
      body: <>แต่ละคนกด <b>เมนูบัญชี (มุมขวาบน) → 💬 ผูกบัญชี Discord</b> → ยืนยันกับ Discord ครั้งเดียว · คนที่ยังไม่ผูก กดติ๊กแล้วจะเห็นข้อความ (เห็นคนเดียว) ให้ไปผูก</>,
    },
    {
      title: "เปิด Discord ในรายงาน + ทดสอบ",
      body: <>รายงาน → <b>✏️ แก้ไข</b> → ติ๊ก <b>💬 ส่งเข้า Discord ด้วย</b> → เลือกห้อง (และบทบาทที่จะแท็ก) → บันทึก → กด <b>✉️ ทดสอบ</b> = ส่งเข้า DM ของคุณ → ถ้าหน้าตาโอเค กด <b>📤 ส่งเดี๋ยวนี้</b> หรือรอส่งตามเวลา</>,
    },
  ];

  return (
    <details open={!!meta && !allReady && (meta.ready.bot || meta.ready.link)} className="group rounded-xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3">
        <span className="text-sm font-semibold text-slate-800">💬 คู่มือตั้งบอท Discord (ส่งรายงาน + ปุ่มติ๊กในแชท) — ทำครั้งเดียว ~10 นาที</span>
        <span className="flex items-center gap-3 text-xs text-slate-500">
          {meta && <>{tick(meta.ready.bot)} บอท {tick(meta.ready.buttons)} ปุ่มติ๊ก {tick(meta.ready.link)} ผูกบัญชี {tick(meta.channels.length > 0)} อยู่ในเซิร์ฟเวอร์</>}
          <span className="text-slate-400 group-open:hidden">กดเพื่อเปิด ▾</span>
          <span className="hidden text-slate-400 group-open:inline">ย่อ ▴</span>
        </span>
      </summary>
      {meta?.error && <p className="mx-4 mb-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">{meta.error}</p>}
      <ol className="space-y-3 border-t border-slate-100 px-4 py-4">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#5865f2] text-xs font-semibold text-white">{i + 1}</span>
            <div className="min-w-0 text-sm leading-relaxed text-slate-700">
              <div className="font-semibold text-slate-900">{s.title}</div>
              <div className="mt-0.5">{s.body}</div>
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}
