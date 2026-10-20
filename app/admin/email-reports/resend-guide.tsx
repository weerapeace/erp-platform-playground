"use client";

// ============================================================
// 📖 คู่มือตั้งค่าระบบส่งอีเมล (Resend) — โชว์ในหน้า "ส่งอีเมลรายงาน" ให้เจ้าของทำตามเองทีละขั้น
// (ฉบับเต็มเดียวกันอยู่ที่ docs/resend-setup.md) · ระบบอ่านกุญแจจาก env: RESEND_API_KEY + EMAIL_FROM (lib/email.ts)
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

const STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: "สมัคร Resend (ฟรี)",
    body: <>เข้า <Ext href="https://resend.com/signup">resend.com</Ext> → สมัครด้วยบัญชี Google ได้เลย · แพ็กฟรีส่งได้ 3,000 ฉบับ/เดือน (วันละไม่เกิน 100) — รายงานวันละฉบับถึง 5 คน ใช้ราว 130 ฉบับ/เดือน พอสบาย</>,
  },
  {
    title: "ยืนยันโดเมนอีเมลของบริษัท",
    body: <>
      ใน Resend กดเมนู <b>Domains → Add Domain</b> → พิมพ์โดเมนบริษัท (เช่น pixiedustie.com) · Region เลือก <b>Tokyo</b> (ใกล้ไทยสุด)
      <br />Resend จะให้ "ระเบียน DNS" 3–4 บรรทัด (MX / TXT) → เอาไปใส่ที่ที่จดโดเมนไว้ · <b>ถ้าโดเมนอยู่ที่ Cloudflare</b> มีปุ่มให้ Resend ใส่ให้อัตโนมัติ
      <br />รอจนสถานะขึ้น <b className="text-emerald-700">Verified</b> (ไม่กี่นาที – ไม่กี่ชั่วโมง)
    </>,
  },
  {
    title: "สร้างกุญแจส่งเมล (API Key)",
    body: <>
      เมนู <b>API Keys → Create API Key</b> · ชื่อ: ERP · Permission: <b>Sending access</b> · Domain: โดเมนที่ยืนยันแล้ว → กดสร้าง แล้ว <b>คัดลอกกุญแจ</b> (ขึ้นต้นด้วย re_ · โชว์ครั้งเดียว)
      <br /><span className="text-rose-600">⚠ กุญแจนี้เป็นความลับ — ห้ามส่งในแชต / LINE / อีเมล รวมถึงห้ามส่งให้ Claude ใส่เองในขั้นถัดไป</span>
    </>,
  },
  {
    title: "ใส่กุญแจในเว็บ (Vercel)",
    body: <>
      เข้า <Ext href="https://vercel.com/dashboard">vercel.com</Ext> → โปรเจกต์ <b>erp-platform-playground</b> → <b>Settings → Environment Variables</b> → เพิ่ม 2 ตัว (เลือก Environment: Production):
      <ul className="mt-1 list-disc space-y-1 pl-5">
        <li><Code>RESEND_API_KEY</Code> = กุญแจที่คัดลอกจากขั้นที่ 3</li>
        <li><Code>EMAIL_FROM</Code> = อีเมลผู้ส่งบนโดเมนที่ยืนยัน เช่น erp@pixiedustie.com (ไม่ต้องมีกล่องจดหมายจริง)</li>
      </ul>
    </>,
  },
  {
    title: "Deploy ใหม่ 1 ครั้ง",
    body: <>ใน Vercel กดแท็บ <b>Deployments</b> → อันบนสุด → ปุ่ม <b>⋯ → Redeploy</b> (ค่าที่ใส่ใหม่จะมีผลหลัง deploy ราว 2–3 นาที)</>,
  },
  {
    title: "กลับมาเช็กที่หน้านี้",
    body: <>กล่องด้านบนต้องเปลี่ยนเป็นสีเขียว <b>"ระบบส่งอีเมลพร้อมแล้ว"</b> (กด Ctrl+Shift+R ถ้ายังไม่เปลี่ยน) → แจ้ง Claude เพื่อเริ่มรอบ 2: ปุ่มส่งทดสอบ + เปิดส่งตามเวลา</>,
  },
];

export function ResendGuide({ ready }: { ready: boolean }) {
  return (
    <details open={!ready} className="group rounded-xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3">
        <span className="text-sm font-semibold text-slate-800">📖 คู่มือตั้งค่าระบบส่งอีเมล (Resend) — ทำครั้งเดียว</span>
        <span className="text-xs text-slate-400 group-open:hidden">กดเพื่อเปิด ▾</span>
        <span className="hidden text-xs text-slate-400 group-open:inline">ย่อ ▴</span>
      </summary>
      <ol className="space-y-3 border-t border-slate-100 px-4 py-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">{i + 1}</span>
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
