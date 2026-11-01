/**
 * หน้านโยบายความเป็นส่วนตัว — /privacy (เปิดได้โดยไม่ต้อง login)
 *
 * Google บังคับให้ใส่ลิงก์หน้านี้ในหน้า Branding ก่อนกด "Publish app" (ปุ่มเชื่อม Gmail ของ App Subscription)
 * → ถ้าเพิ่มการใช้ข้อมูล Google แบบใหม่ (scope ใหม่) ต้องมาอัปเดตหน้านี้ด้วย · ดู docs/gmail-connect-setup.md
 * หน้าเต็มไม่ผูก PlaygroundShell เพื่อให้คนนอก (ผู้ตรวจของ Google) เปิดอ่านได้
 */
import type { Metadata } from "next";
import { BRAND } from "@/components/brand";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `${BRAND.name} — นโยบายความเป็นส่วนตัวและการใช้ข้อมูลจาก Google`,
};

const UPDATED = "1 November 2026 / 1 พฤศจิกายน 2569";

function Section({ title, th, en }: { title: string; th: React.ReactNode; en: React.ReactNode }) {
  return (
    <section className="py-5 border-t border-slate-200 first:border-t-0">
      <h2 className="text-base font-semibold text-slate-900 mb-2">{title}</h2>
      <div className="text-sm text-slate-700 leading-relaxed space-y-2">{th}</div>
      <div className="mt-3 text-sm text-slate-500 leading-relaxed space-y-2">{en}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <article className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white px-6 py-8 shadow-sm">
        <header className="mb-4">
          <div className="text-xs font-medium uppercase tracking-wide text-orange-600">{BRAND.name}</div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">นโยบายความเป็นส่วนตัว · Privacy Policy</h1>
          <p className="mt-1 text-xs text-slate-400">ปรับปรุงล่าสุด / Last updated: {UPDATED}</p>
        </header>

        <Section
          title="1. ระบบนี้คืออะไร · About this app"
          th={<p>{BRAND.name} เป็นระบบ ERP ภายในบริษัท ใช้เฉพาะพนักงานที่ได้รับบัญชีจากผู้ดูแลระบบ ไม่ได้เปิดให้บุคคลทั่วไปสมัครใช้งาน</p>}
          en={<p>{BRAND.name} is an internal ERP system used only by staff accounts issued by the company administrator. It is not offered to the public.</p>}
        />

        <Section
          title="2. ข้อมูล Google ที่เราขอ · Google data we access"
          th={<>
            <p>เมื่อผู้ใช้กด &quot;เชื่อม Gmail&quot; ระบบจะขอสิทธิ์ <b>อ่าน Gmail อย่างเดียว</b> (<code className="text-xs">gmail.readonly</code>) ของกล่องเมลนั้น</p>
            <p>ระบบ <b>ส่ง ลบ หรือแก้ไขอีเมลไม่ได้</b> และไม่ได้ขอสิทธิ์อื่นของบัญชี Google</p>
          </>}
          en={<>
            <p>When a user clicks &quot;Connect Gmail&quot;, the app requests <b>read-only Gmail access</b> (<code className="text-xs">gmail.readonly</code>) for that mailbox.</p>
            <p>The app <b>cannot send, delete or modify email</b>, and requests no other Google account permissions.</p>
          </>}
        />

        <Section
          title="3. เราใช้ข้อมูลทำอะไร · How we use it"
          th={<>
            <p>ใช้เพื่อ <b>ค้นหาอีเมลใบแจ้งหนี้/ใบเสร็จค่าบริการรายเดือนของบริษัท</b> เมื่อผู้ใช้กดปุ่ม &quot;ดึงจากเมล&quot; เท่านั้น ระบบแสดงรายการให้ผู้ใช้เลือก และ <b>แนบไฟล์ที่ผู้ใช้กดยืนยัน</b> เข้ากับรายการค่าบริการในระบบ</p>
            <p>ระบบไม่ได้อ่านหรือเก็บอีเมลอื่นที่ไม่เกี่ยวข้อง และไม่ได้ทำงานเบื้องหลังโดยที่ผู้ใช้ไม่ได้กด</p>
          </>}
          en={<>
            <p>The data is used only to <b>search for the company&apos;s subscription invoices and receipts</b> when a user clicks &quot;Pull from mail&quot;. Results are shown to the user, and <b>only the attachment the user confirms</b> is copied into the matching subscription record.</p>
            <p>The app does not read or store unrelated email and does not run in the background without a user action.</p>
          </>}
        />

        <Section
          title="4. การจัดเก็บและความปลอดภัย · Storage and security"
          th={<>
            <p>รหัสเชื่อมต่อ (refresh token) เก็บแบบเข้ารหัส AES-256-GCM บนฐานข้อมูลของบริษัท อ่านได้จากฝั่งเซิร์ฟเวอร์เท่านั้น</p>
            <p>เก็บเฉพาะไฟล์บิลที่ผู้ใช้ยืนยันแนบ พร้อมรหัสอ้างอิงอีเมลเพื่อกันแนบซ้ำ ไม่เก็บเนื้อหาอีเมลส่วนอื่น</p>
            <p>ทุกการเชื่อม เลิกเชื่อม ค้นหา และแนบไฟล์ ถูกบันทึกในประวัติการใช้งาน (audit log)</p>
          </>}
          en={<>
            <p>Refresh tokens are encrypted with AES-256-GCM in the company database and are readable only on the server.</p>
            <p>Only invoice files the user confirms are stored, together with the email message ID to prevent duplicates. Other email content is not stored.</p>
            <p>Every connect, disconnect, search and attach action is recorded in an audit log.</p>
          </>}
        />

        <Section
          title="5. การแบ่งปันข้อมูล · Sharing"
          th={<p>เราไม่ขาย ไม่ให้เช่า และไม่ส่งต่อข้อมูลจาก Google ให้บุคคลภายนอก ไม่ใช้ทำโฆษณา และไม่ใช้ฝึกโมเดล AI</p>}
          en={<p>We do not sell, rent or transfer Google user data to third parties. It is not used for advertising and not used to train AI or machine-learning models.</p>}
        />

        <Section
          title="6. Google API Services User Data Policy"
          th={<p>การใช้และส่งต่อข้อมูลที่ได้รับจาก Google API เป็นไปตาม Google API Services User Data Policy รวมถึงข้อกำหนด Limited Use</p>}
          en={<p>
            {BRAND.name}&apos;s use and transfer of information received from Google APIs adheres to the{" "}
            <a className="text-orange-700 underline" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
              Google API Services User Data Policy
            </a>, including the Limited Use requirements.
          </p>}
        />

        <Section
          title="7. ยกเลิกการเชื่อมและลบข้อมูล · Revoking access and deletion"
          th={<>
            <p>ยกเลิกได้ทุกเมื่อ ด้วยปุ่ม &quot;เลิกเชื่อม&quot; ในทะเบียนโปรไฟล์ Chrome (ระบบจะลบรหัสเชื่อมต่อและแจ้งยกเลิกกับ Google ทันที) หรือที่{" "}
              <a className="text-orange-700 underline" href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">myaccount.google.com/permissions</a>
            </p>
            <p>ต้องการให้ลบไฟล์บิลที่แนบไว้ แจ้งผู้ดูแลระบบของบริษัทได้</p>
          </>}
          en={<>
            <p>Access can be revoked at any time with the &quot;Disconnect&quot; button in the app (the token is deleted and revoked at Google immediately) or at{" "}
              <a className="text-orange-700 underline" href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">myaccount.google.com/permissions</a>.
            </p>
            <p>To have stored invoice files deleted, contact the company&apos;s system administrator.</p>
          </>}
        />

        <Section
          title="8. ติดต่อ · Contact"
          th={<p>ติดต่อผู้ดูแลระบบได้ที่อีเมลฝ่ายสนับสนุน (support email) ที่แสดงบนหน้าขออนุญาตของ Google</p>}
          en={<p>Contact the administrator at the support email shown on the Google consent screen.</p>}
        />
      </article>
    </main>
  );
}
