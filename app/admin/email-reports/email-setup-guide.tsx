"use client";

// ============================================================
// 📖 คู่มือตั้งระบบส่งอีเมล — ในหน้า "ส่งอีเมลรายงาน" ให้เจ้าของทำตามเองทีละขั้น
// ทางหลัก = Gmail (เจ้าของเลือก 2026-10-22: ไม่ต้องยุ่ง DNS) · ทางเลือก = Resend + โดเมนบริษัท (ซ่อนไว้ข้างล่าง)
// ระบบอ่านค่าจาก env ใน lib/email.ts · ฉบับเต็มเดียวกัน: docs/email-setup.md
// ============================================================

import { CopyButton } from "@/components/copy-button";

const Code = ({ children }: { children: string }) => (
  <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[12px] text-slate-800">
    {children}<CopyButton value={children} title={`คัดลอก ${children}`} />
  </span>
);
const Ext = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline-offset-2 hover:underline">{children} ↗</a>
);
const Secret = () => <span className="text-rose-600">⚠ เป็นความลับ — ห้ามส่งในแชต / LINE / อีเมล รวมถึงห้ามส่งให้ Claude ใส่ใน Vercel เองเท่านั้น</span>;

const GMAIL_STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: "เลือก Gmail ที่จะใช้ส่ง",
    body: <>แนะนำ <b>สมัคร Gmail ใหม่ไว้ให้ระบบใช้โดยเฉพาะ</b> เช่น louismontini.erp@gmail.com (ไม่ปนอีเมลส่วนตัว) · ลูกค้าจะเห็นผู้ส่งเป็น Gmail นี้ · ส่งได้ราว 500 ฉบับ/วัน</>,
  },
  {
    title: "เปิด \"การยืนยันแบบ 2 ขั้นตอน\"",
    body: <>ล็อกอิน Gmail นั้น → <Ext href="https://myaccount.google.com/security">myaccount.google.com → ความปลอดภัย</Ext> → <b>การยืนยันแบบ 2 ขั้นตอน</b> → เปิด (ใส่เบอร์มือถือรับรหัส) · Google บังคับ ไม่เปิดจะสร้างรหัสขั้นถัดไปไม่ได้</>,
  },
  {
    title: "สร้าง \"รหัสผ่านสำหรับแอป\"",
    body: <>เข้า <Ext href="https://myaccount.google.com/apppasswords">myaccount.google.com/apppasswords</Ext> → ชื่อแอปพิมพ์ <b>ERP</b> → กดสร้าง → คัดลอกรหัส <b>16 ตัวอักษร</b> (โชว์ครั้งเดียว)<br /><Secret /></>,
  },
  {
    title: "ใส่ใน Vercel",
    body: <>
      <Ext href="https://vercel.com/dashboard">vercel.com</Ext> → โปรเจกต์ <b>erp-platform-playground</b> → <b>Settings → Environment Variables</b> → เพิ่ม 2 ตัว (Environment: Production):
      <ul className="mt-1 list-disc space-y-1 pl-5">
        <li><Code>GMAIL_USER</Code> = Gmail จากขั้นที่ 1</li>
        <li><Code>GMAIL_APP_PASSWORD</Code> = รหัส 16 ตัวจากขั้นที่ 3 (มีเว้นวรรคก็ได้)</li>
      </ul>
    </>,
  },
  {
    title: "Deploy ใหม่ 1 ครั้ง",
    body: <>Vercel → แท็บ <b>Deployments</b> → อันบนสุด → <b>⋯ → Redeploy</b> (ค่าใหม่มีผลหลัง deploy ราว 2–3 นาที)</>,
  },
  {
    title: "เช็กผล + ส่งทดสอบ",
    body: <>กลับมาหน้านี้ (Ctrl+Shift+R) → กล่องด้านบนต้องเป็นสีเขียว <b>&quot;ระบบส่งอีเมลพร้อมแล้ว — ส่งผ่าน Gmail&quot;</b> → กด <b>✉️ ทดสอบ</b> ที่รายงาน แล้วเช็กกล่องอีเมลของคุณ (ไม่เจอให้ดูในจดหมายขยะด้วย)</>,
  },
];

export function EmailSetupGuide({ ready }: { ready: boolean }) {
  return (
    <details open={!ready} className="group rounded-xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3">
        <span className="text-sm font-semibold text-slate-800">📖 คู่มือตั้งระบบส่งอีเมล (Gmail) — ทำครั้งเดียว ~5 นาที</span>
        <span className="text-xs text-slate-400 group-open:hidden">กดเพื่อเปิด ▾</span>
        <span className="hidden text-xs text-slate-400 group-open:inline">ย่อ ▴</span>
      </summary>
      <ol className="space-y-3 border-t border-slate-100 px-4 py-4">
        {GMAIL_STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">{i + 1}</span>
            <div className="min-w-0 text-sm leading-relaxed text-slate-700">
              <div className="font-semibold text-slate-900">{s.title}</div>
              <div className="mt-0.5">{s.body}</div>
            </div>
          </li>
        ))}
      </ol>
      <details className="mx-4 mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
        <summary className="cursor-pointer text-xs font-medium text-slate-600">ทางเลือก: ส่งจากโดเมนบริษัทผ่าน Resend (ต้องแก้ DNS ของโดเมน)</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-relaxed">
          <li>สมัคร <Ext href="https://resend.com/signup">resend.com</Ext> → <b>Domains → Add Domain</b> (เช่น louismontini.co.th · Region: Tokyo)</li>
          <li>เอาค่า DNS (MX/TXT ที่ชื่อ <code>send</code> และ <code>resend._domainkey</code>) ไปใส่ที่เว็บที่ซื้อโดเมน → กด Verify จนเป็น Verified · ไม่กระทบอีเมลเดิม</li>
          <li><b>API Keys → Create</b> (Sending access) → ใส่ใน Vercel: <Code>RESEND_API_KEY</Code> และ <Code>EMAIL_FROM</Code> (เช่น erp@louismontini.co.th) → Redeploy</li>
          <li>ถ้าตั้งครบทั้ง Gmail และ Resend ระบบใช้ Resend ก่อน</li>
        </ol>
      </details>
    </details>
  );
}
