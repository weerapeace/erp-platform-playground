"use client";

/**
 * 🔑 ตั้งค่าการเข้าสู่ระบบเว็บร้าน (Google / LINE / Facebook) ต่อร้าน — ป๊อปในแท็บ 👥 สมาชิก
 *
 * เจ้าของสร้างแอปที่ผู้ให้บริการเอง (คู่มือทีละขั้นในป๊อปนี้ + docs/website-members-login-setup.md) แล้วนำรหัสมาวางที่นี่
 * - ช่องว่าง/ปิดไว้ = ปุ่มนั้นไม่ขึ้นบนเว็บร้าน · บันทึกแล้วเว็บร้านเปลี่ยนทันที (ล้างแคช)
 * - รหัสลับบันทึกแล้วเปิดดูไม่ได้ (เห็น ••••4 ตัวท้าย) · เว้นว่าง = ใช้ของเดิม · ประวัติการแก้ลง audit (ไม่บันทึกค่าลับ)
 * API /api/website/members/login-settings · ของกลาง: ERPModal · CopyButton · webForm
 */
import { useCallback, useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { CopyButton } from "@/components/copy-button";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { webForm } from "@/lib/website-form-styles";
import { useLang, useT } from "@/components/i18n";
import { tr } from "@/lib/lang";

type P = "google" | "line" | "facebook";
const PROVIDERS: P[] = ["google", "line", "facebook"];
const LABEL: Record<P, string> = { google: "Google", line: "LINE", facebook: "Facebook" };
const FIELD: Record<P, { id: string; secret: string; idHint: string }> = {
  google: { id: "Client ID", secret: "Client secret", idHint: "xxxx.apps.googleusercontent.com" },
  line: { id: "Channel ID", secret: "Channel secret", get idHint() { return tr("ตัวเลข ~10 หลัก", "~10 digits"); } },
  facebook: { id: "App ID", secret: "App secret", get idHint() { return tr("ตัวเลข ~16 หลัก", "~16 digits"); } },
};
const TONE: Record<P, string> = { google: "border-red-200", line: "border-green-200", facebook: "border-blue-200" };

type ProvState = { clientId: string; secretSet: boolean; secretTail: string; enabled: boolean; ready: boolean; updatedAt: string | null };
type EmailLogin = { password: boolean; otp: boolean };
type Loaded = { providers: Record<P, ProvState>; domains: string[]; callbacks: Record<P, string[]>; tokensReady: boolean; email: EmailLogin & { canMail: boolean } };
type Draft = Record<P, { clientId: string; secret: string; enabled: boolean }>;

const toDraft = (l: Loaded): Draft => Object.fromEntries(PROVIDERS.map((p) => [p, { clientId: l.providers[p].clientId, secret: "", enabled: l.providers[p].enabled }])) as Draft;

/** ขั้นตอนสร้างแอปของแต่ละเจ้า (ภาษาคน) — callback/โดเมนเติมให้จากร้านนี้ */
function Guide({ p, callbacks, domains }: { p: P; callbacks: string[]; domains: string[] }) {
  const { lang } = useLang();
  const t = useT();
  const privacy = domains.map((d) => `https://${d}/privacy`);
  const cb = (
    <span className="block space-y-1 my-1">
      {callbacks.map((u) => (
        <span key={u} className="flex items-center gap-1.5 rounded-md bg-slate-50 border border-dashed border-slate-300 px-2 py-1 font-mono text-[11px] text-slate-700 overflow-x-auto whitespace-nowrap">
          {u} <CopyButton value={u} title={t("คัดลอก", "Copy")} />
        </span>
      ))}
    </span>
  );
  const pv = (
    <span className="block space-y-1 my-1">
      {privacy.map((u) => (
        <span key={u} className="flex items-center gap-1.5 rounded-md bg-slate-50 border border-dashed border-slate-300 px-2 py-1 font-mono text-[11px] text-slate-700 overflow-x-auto whitespace-nowrap">
          {u} <CopyButton value={u} title={t("คัดลอก", "Copy")} />
        </span>
      ))}
    </span>
  );
  const stepsTh: Record<P, React.ReactNode[]> = {
    google: [
      <>เปิด <b>console.cloud.google.com</b> ด้วยบัญชี Google ของบริษัท → มุมซ้ายบนกด “เลือกโปรเจกต์” → <b>New project</b> ตั้งชื่อเช่น “เว็บร้าน”</>,
      <>เมนู <b>APIs &amp; Services → OAuth consent screen</b> (หรือ “Google Auth Platform”) → กด Get started → ใส่ชื่อร้าน + อีเมลติดต่อ → เลือก <b>External</b> → บันทึก</>,
      <>หัวข้อ Branding: ใส่โลโก้ + ลิงก์นโยบายความเป็นส่วนตัว {pv}</>,
      <>เมนู <b>Clients</b> (หรือ Credentials) → <b>Create client</b> → ชนิด <b>Web application</b> → ช่อง <b>Authorized redirect URIs</b> กด Add แล้ววางทีละบรรทัด {cb}</>,
      <>กด Create → คัดลอก <b>Client ID</b> และ <b>Client secret</b> มาวางในช่องด้านบน → บันทึก</>,
      <>หัวข้อ Audience: กด <b>Publish app</b> (ยังเป็น Testing = ใช้ได้เฉพาะอีเมลที่เพิ่มเป็นผู้ทดสอบ)</>,
    ],
    line: [
      <>เปิด <b>developers.line.biz</b> → Log in ด้วย LINE ของบริษัท → <b>Create a new provider</b> (ชื่อบริษัท)</>,
      <>ใน provider → <b>Create a new channel</b> → เลือก <b>LINE Login</b> → App types ติ๊ก <b>Web app</b> → กรอกชื่อร้าน/ไอคอน/อีเมล → Create</>,
      <>แท็บ <b>LINE Login</b> → Callback URL กด Edit แล้ววาง (บรรทัดละ 1 ที่อยู่) {cb}</>,
      <>(ไม่บังคับ) แท็บ Basic settings → <b>OpenID Connect → Email address permission → Apply</b> แนบลิงก์นโยบาย {pv} (ไม่ขอ = ได้แค่ชื่อและรูป ใช้งานได้ปกติ)</>,
      <>แท็บ Basic settings → คัดลอก <b>Channel ID</b> และ <b>Channel secret</b> มาวางด้านบน → บันทึก</>,
      <>มุมบนของ channel เปลี่ยนสถานะจาก Developing เป็น <b>Published</b></>,
    ],
    facebook: [
      <>เปิด <b>developers.facebook.com</b> → My Apps → <b>Create App</b> → ใช้กรณี “Authenticate and request data from users with <b>Facebook Login</b>” → ใส่ชื่อแอป (ชื่อร้าน) + อีเมล</>,
      <>เมนู Use cases → Facebook Login → <b>Customize → Settings</b> → ช่อง <b>Valid OAuth Redirect URIs</b> วาง {cb}</>,
      <>สิทธิ์ที่ใช้: <b>email</b> และ <b>public_profile</b> (สิทธิ์มาตรฐาน ไม่ต้องรอตรวจ)</>,
      <>App settings → <b>Basic</b>: App domains = {domains.join(", ") || "โดเมนร้าน"} · Privacy Policy URL {pv} · User data deletion = ใส่ลิงก์เดียวกันต่อท้าย #delete-account · หมวดหมู่ · ไอคอน → Save</>,
      <>หน้า Basic เดียวกัน: คัดลอก <b>App ID</b> และกด Show ที่ <b>App secret</b> แล้วคัดลอกมาวางด้านบน → บันทึก</>,
      <>มุมบนเปลี่ยน App Mode เป็น <b>Live</b> (ยังเป็น Development = ใช้ได้เฉพาะคนที่เพิ่มเป็นผู้ทดสอบ)</>,
    ],
  };
  const stepsEn: Record<P, React.ReactNode[]> = {
    google: [
      <>Open <b>console.cloud.google.com</b> with the company Google account → top left click “Select a project” → <b>New project</b>, name it e.g. “Web shop”</>,
      <>Menu <b>APIs &amp; Services → OAuth consent screen</b> (or “Google Auth Platform”) → click Get started → enter shop name + contact email → choose <b>External</b> → save</>,
      <>Branding section: add a logo + privacy policy link {pv}</>,
      <>Menu <b>Clients</b> (or Credentials) → <b>Create client</b> → type <b>Web application</b> → under <b>Authorized redirect URIs</b> click Add and paste one per line {cb}</>,
      <>Click Create → copy the <b>Client ID</b> and <b>Client secret</b> into the fields above → save</>,
      <>Audience section: click <b>Publish app</b> (while in Testing = only emails added as testers can use it)</>,
    ],
    line: [
      <>Open <b>developers.line.biz</b> → log in with the company LINE → <b>Create a new provider</b> (company name)</>,
      <>Inside the provider → <b>Create a new channel</b> → choose <b>LINE Login</b> → App types tick <b>Web app</b> → fill in shop name/icon/email → Create</>,
      <><b>LINE Login</b> tab → Callback URL click Edit and paste (one address per line) {cb}</>,
      <>(Optional) Basic settings tab → <b>OpenID Connect → Email address permission → Apply</b> attach the policy link {pv} (without it you only get name and picture — works fine)</>,
      <>Basic settings tab → copy the <b>Channel ID</b> and <b>Channel secret</b> into the fields above → save</>,
      <>At the top of the channel change status from Developing to <b>Published</b></>,
    ],
    facebook: [
      <>Open <b>developers.facebook.com</b> → My Apps → <b>Create App</b> → use case “Authenticate and request data from users with <b>Facebook Login</b>” → enter app name (shop name) + email</>,
      <>Menu Use cases → Facebook Login → <b>Customize → Settings</b> → in <b>Valid OAuth Redirect URIs</b> paste {cb}</>,
      <>Permissions used: <b>email</b> and <b>public_profile</b> (standard permissions, no review needed)</>,
      <>App settings → <b>Basic</b>: App domains = {domains.join(", ") || "shop domain"} · Privacy Policy URL {pv} · User data deletion = the same link with #delete-account at the end · category · icon → Save</>,
      <>Same Basic page: copy the <b>App ID</b>, click Show on <b>App secret</b> and copy it into the fields above → save</>,
      <>At the top switch App Mode to <b>Live</b> (while in Development = only people added as testers can use it)</>,
    ],
  };
  const steps = lang === "en" ? stepsEn : stepsTh;
  return (
    <ol className="list-decimal pl-5 space-y-1.5 text-xs text-slate-600 leading-relaxed">
      {steps[p].map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ol>
  );
}

export function MemberLoginSettingsModal({ open, shopSlug, shopName, onClose, onSaved }: { open: boolean; shopSlug: string; shopName?: string; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const toast = useToast();
  const [data, setData] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [guide, setGuide] = useState<P | null>(null);
  const [em, setEm] = useState<EmailLogin>({ password: false, otp: false });

  const load = useCallback(() => {
    setErr("");
    apiFetch(`/api/website/members/login-settings?shop=${encodeURIComponent(shopSlug)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error ?? (r.status === 403 ? tr("ต้องมีสิทธิ์แก้ไขเว็บไซต์", "You need website edit permission") : tr("โหลดไม่สำเร็จ", "Load failed")));
        setData(j as Loaded);
        setDraft(toDraft(j as Loaded));
        setEm({ password: !!(j as Loaded).email?.password, otp: !!(j as Loaded).email?.otp });
      })
      .catch((e: Error) => setErr(e.message));
  }, [shopSlug]);
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const emDirty = !!data && (em.password !== !!data.email?.password || em.otp !== !!data.email?.otp);
  const dirty = !!data && !!draft && (emDirty || PROVIDERS.some((p) => draft[p].clientId.trim() !== data.providers[p].clientId || !!draft[p].secret.trim() || draft[p].enabled !== data.providers[p].enabled));
  const set = (p: P, patch: Partial<Draft[P]>) => setDraft((d) => (d ? { ...d, [p]: { ...d[p], ...patch } } : d));

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const r = await apiFetch("/api/website/members/login-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop: shopSlug, providers: Object.fromEntries(PROVIDERS.map((p) => [p, { clientId: draft[p].clientId.trim(), clientSecret: draft[p].secret.trim(), enabled: draft[p].enabled }])), email: em }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) return toast.error(j.error ?? t("บันทึกไม่สำเร็จ", "Save failed"));
      toast.success(j.changed ? (j.purged ? t("บันทึกแล้ว — ปุ่มบนเว็บร้านเปลี่ยนแล้ว", "Saved — the buttons on the shop site have changed") : t("บันทึกแล้ว — เว็บร้านจะเปลี่ยนภายใน 1 นาที", "Saved — the shop site will update within 1 minute")) : t("ไม่มีอะไรเปลี่ยน", "Nothing changed"));
      load();
      onSaved();
    } catch {
      toast.error(t("เชื่อมต่อไม่ได้", "Can't connect"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ERPModal
      open={open}
      onClose={onClose}
      title={`${t("🔑 ตั้งค่าการเข้าสู่ระบบ", "🔑 Login settings")}${shopName ? ` · ${shopName}` : ""}`}
      description={t("สมัครด้วยอีเมลบนเว็บ (ไม่ต้องตั้งอะไรเพิ่ม) และ/หรือ วางรหัสจาก Google / LINE / Facebook · ช่องไหนว่าง ปุ่มนั้นไม่ขึ้นบนเว็บ", "Email sign-up on the site (nothing else to set up) and/or paste keys from Google / LINE / Facebook · empty ones don't show a button on the site")}
      size="lg"
      hasUnsavedChanges={dirty}
      loading={busy}
      footer={
        <div className="flex items-center justify-end gap-2">
          <span className="mr-auto text-[11px] text-slate-400">{t("รหัสลับบันทึกแล้วเปิดดูไม่ได้ (เห็น 4 ตัวท้าย) · ทุกการแก้มีประวัติ", "Saved secrets can't be viewed (last 4 shown) · every change is logged")}</span>
          <button type="button" onClick={onClose} className="h-9 px-3 rounded-lg border border-slate-200 text-sm">
            {t("ปิด", "Close")}
          </button>
          <button type="button" disabled={!dirty || busy} onClick={() => void save()} className="h-9 px-4 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-40" data-login-save>
            {busy ? t("กำลังบันทึก…", "Saving…") : t("บันทึก", "Save")}
          </button>
        </div>
      }
    >
      {err ? (
        <p className="text-sm text-red-600 py-6 text-center">{err}</p>
      ) : !data || !draft ? (
        <p className="text-sm text-slate-400 py-10 text-center">{t("กำลังโหลด…", "Loading…")}</p>
      ) : (
        <div className="space-y-3">
          {!data.tokensReady && <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">{t("ERP ยังออกบัตรสมาชิกไม่ได้ (ไม่มีกุญแจของระบบ) — แจ้งผู้ดูแลระบบ", "The ERP can't issue member tokens yet (system key missing) — contact the admin")}</p>}
          {data.domains.length === 0 && <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">{t("ร้านนี้ยังไม่มีโดเมนเว็บ — เพิ่มโดเมนในแท็บข้อมูลร้านก่อน (ต้องใช้ทำที่อยู่ callback)", "This shop has no web domain yet — add one in the Shop info tab first (needed for the callback address)")}</p>}
          {/* ✉️ สมัคร/เข้าด้วยอีเมล — ไม่ต้องตั้งรหัสกับผู้ให้บริการ · ERP ส่งอีเมลยืนยัน/รหัสให้ (lib/member-email-login) */}
          <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2" data-login-email>
            <div className="flex items-center gap-2">
              <b className="text-sm text-slate-800">{t("✉️ สมัครด้วยอีเมลบนเว็บ", "✉️ Email sign-up on site")}</b>
              <span className={`ml-auto text-[11px] font-medium ${data.email?.canMail ? "text-emerald-700" : "text-amber-700"}`}>{data.email?.canMail ? t("✓ ระบบส่งอีเมลพร้อม", "✓ Email sending ready") : t("⚠ ยังส่งอีเมลไม่ได้", "⚠ Can't send email yet")}</span>
            </div>
            <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" className="mt-1" checked={em.password} onChange={(e) => setEm((v) => ({ ...v, password: e.target.checked }))} data-login-email-password />
              <span>
                {t("อีเมล + รหัสผ่าน", "Email + password")}
                <span className="block text-[11px] text-slate-500">{t("ลูกค้าตั้งรหัสเอง · ยืนยันอีเมลด้วยลิงก์ · ลืมรหัสขอลิงก์ตั้งใหม่ได้ · ใส่ผิด 5 ครั้งล็อก 15 นาที", "Customers set their own password · email verified by link · forgot password = reset link · 5 wrong tries locks for 15 minutes")}</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" className="mt-1" checked={em.otp} onChange={(e) => setEm((v) => ({ ...v, otp: e.target.checked }))} data-login-email-otp />
              <span>
                {t("อีเมล + รหัส 6 หลัก (ไม่ต้องจำรหัสผ่าน)", "Email + 6-digit code (no password to remember)")}
                <span className="block text-[11px] text-slate-500">{t("ใส่อีเมล → ได้รหัสทางอีเมล (ใช้ได้ 10 นาที) → เข้าได้เลย · ขอใหม่ได้ทุก 60 วินาที", "Enter email → get a code by email (valid 10 minutes) → logged in · can request a new one every 60 seconds")}</span>
              </span>
            </label>
            {!data.email?.canMail && <p className="rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[11px] text-amber-800">{t("ERP ยังไม่ได้ตั้งระบบส่งอีเมล — เปิดไว้ได้ แต่ปุ่มจะยังไม่ขึ้นบนเว็บจนกว่าผู้ดูแลระบบตั้งค่าการส่งอีเมล", "The ERP hasn't set up email sending — you can turn this on, but the button won't show on the site until the admin sets up email sending")}</p>}
            <p className="text-[11px] text-slate-400">{t("เปิดทั้ง 2 แบบ = ลูกค้าเลือกได้ในป๊อปสมัคร · ปิดแบบรหัสผ่าน = ไม่รับสมัครใหม่ด้วยรหัสผ่าน (สมาชิกเดิมยังเข้าได้)", "Both on = customers choose in the sign-up popup · password off = no new password sign-ups (existing members can still log in)")}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {PROVIDERS.map((p) => {
              const s = data.providers[p];
              const d = draft[p];
              const willReady = d.enabled && !!d.clientId.trim() && (s.secretSet || !!d.secret.trim());
              return (
                <div key={p} className={`rounded-xl border bg-white p-3 space-y-2 ${TONE[p]}`} data-login-provider={p}>
                  <div className="flex items-center gap-2">
                    <b className="text-sm text-slate-800">{LABEL[p]}</b>
                    <span className={`ml-auto text-[11px] font-medium ${willReady ? "text-emerald-700" : "text-slate-400"}`}>{willReady ? (s.ready ? t("✓ พร้อมใช้", "✓ Ready") : t("✓ พร้อม (ยังไม่บันทึก)", "✓ Ready (not saved)")) : t("ยังไม่ตั้ง", "Not set")}</span>
                  </div>
                  <label className="block">
                    <span className={webForm.label}>{FIELD[p].id}</span>
                    <input value={d.clientId} onChange={(e) => set(p, { clientId: e.target.value })} placeholder={FIELD[p].idHint} className={`${webForm.input} font-mono text-xs`} autoComplete="off" spellCheck={false} data-login-id={p} />
                  </label>
                  <label className="block">
                    <span className={webForm.label}>{FIELD[p].secret}</span>
                    <input
                      type="password"
                      value={d.secret}
                      onChange={(e) => set(p, { secret: e.target.value })}
                      placeholder={s.secretSet ? t(`${s.secretTail} (เว้นว่าง = ใช้ของเดิม)`, `${s.secretTail} (blank = keep current)`) : t("วางรหัสลับ", "Paste secret")}
                      className={`${webForm.input} font-mono text-xs`}
                      autoComplete="new-password"
                      spellCheck={false}
                      data-login-secret={p}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input type="checkbox" checked={d.enabled} onChange={(e) => set(p, { enabled: e.target.checked })} />
                    {t(`โชว์ปุ่ม ${LABEL[p]} บนเว็บ`, `Show ${LABEL[p]} button on site`)}
                  </label>
                  <button type="button" onClick={() => setGuide(guide === p ? null : p)} className="text-xs text-blue-600 hover:underline" data-login-guide={p}>
                    {guide === p ? t("▾ ซ่อนวิธีสร้าง", "▾ Hide guide") : t("📘 วิธีสร้าง (ทีละขั้น)", "📘 How to create (step by step)")}
                  </button>
                </div>
              );
            })}
          </div>
          {guide && (
            <div className={webForm.card}>
              <p className="text-sm font-medium text-slate-700 mb-2">{t(`📘 สร้างแอป ${LABEL[guide]} สำหรับปุ่มสมัครสมาชิก`, `📘 Create a ${LABEL[guide]} app for the sign-up button`)}</p>
              <Guide p={guide} callbacks={data.callbacks[guide]} domains={data.domains} />
              <p className="text-[11px] text-slate-400 mt-2">{t("ทำด้วยบัญชีของบริษัทเอง (ระบบสร้างบัญชีหรือกรอกรหัสผ่านแทนไม่ได้) · มีโดเมนใหม่ = เพิ่มที่อยู่ callback ของโดเมนนั้นด้วย", "Do this with the company's own account (the system can't create accounts or enter passwords for you) · new domain = add that domain's callback address too")}</p>
            </div>
          )}
        </div>
      )}
    </ERPModal>
  );
}
