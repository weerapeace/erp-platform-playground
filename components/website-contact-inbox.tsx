"use client";
/**
 * 📨 กล่องข้อความลูกค้า (ของกลาง) — ข้อความจาก Section "ฟอร์มติดต่อ" บนเว็บร้าน
 *   ใช้ที่: แท็บ "🏪 ข้อมูลร้าน" › 📨 ข้อความลูกค้า
 *   เปิดอ่าน (ERPModal) · ✓ ตอบแล้ว · สแปม · ↺ กลับเป็นใหม่ · โน้ตภายใน · ลบ (ConfirmDialog) · ✉️ ตอบทางอีเมล (mailto) · 📋 คัดลอก
 * API: /api/website/contact-messages · ตรวจค่า lib/website-contact · ตาราง store_contact_messages
 */
import { useCallback, useEffect, useState } from "react";
import { MiniTable } from "@/components/mini-table";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { CONTACT_STATUSES, contactStatusLabel, type ContactStatus } from "@/lib/website-contact";
import { useT } from "@/components/i18n";
import { getLang, tr } from "@/lib/lang";

type Msg = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  topic: string;
  message: string;
  lang: "th" | "en";
  status: ContactStatus;
  page: string | null;
  staff_note: string | null;
  handled_by: string | null;
  handled_at: string | null;
  created_at: string;
};

const dt = (s: string) => new Date(s).toLocaleString(getLang() === "en" ? "en-GB" : "th-TH", { dateStyle: "short", timeStyle: "short" });
const tone = (s: string) => CONTACT_STATUSES.find((x) => x.key === s)?.tone ?? "bg-slate-100 text-slate-600";
const fullName = (m: Msg) => `${m.first_name} ${m.last_name}`.trim();

export function ContactInboxCard({ shopSlug, cardCls }: { shopSlug: string; cardCls: string }) {
  const t = useT();
  const toast = useToast();
  const [status, setStatus] = useState<ContactStatus | "all">("new");
  const [rows, setRows] = useState<Msg[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [del, setDel] = useState<Msg | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await apiFetch(`/api/website/contact-messages?shop=${encodeURIComponent(shopSlug)}&status=${status}`).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setRows(j.messages ?? []);
      setCounts(j.counts ?? {});
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : tr("โหลดไม่สำเร็จ", "Load failed"));
    } finally {
      setLoading(false);
    }
  }, [shopSlug, status]);
  useEffect(() => {
    void load();
  }, [load]);

  const open = rows.find((r) => r.id === openId) ?? null;
  useEffect(() => {
    setNote(open?.staff_note ?? "");
  }, [open?.id, open?.staff_note]);

  const patch = async (id: string, body: Record<string, unknown>, okMsg: string) => {
    setBusy(true);
    try {
      const j = await apiFetch("/api/website/contact-messages", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) }).then((r) => r.json());
      if (!j.ok) throw new Error(j.error ?? t("บันทึกไม่สำเร็จ", "Save failed"));
      toast.success(okMsg);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("บันทึกไม่สำเร็จ", "Save failed"));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!del) return;
    setBusy(true);
    try {
      const j = await apiFetch(`/api/website/contact-messages?id=${encodeURIComponent(del.id)}`, { method: "DELETE" }).then((r) => r.json());
      if (!j.ok) throw new Error(j.error ?? t("ลบไม่สำเร็จ", "Delete failed"));
      toast.success(t("ลบข้อความแล้ว", "Message deleted"));
      setDel(null);
      setOpenId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("ลบไม่สำเร็จ", "Delete failed"));
    } finally {
      setBusy(false);
    }
  };
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t(`คัดลอก${what}แล้ว`, `Copied ${what}`));
    } catch {
      toast.error(t("คัดลอกไม่สำเร็จ", "Copy failed"));
    }
  };
  const mailto = (m: Msg) => `mailto:${m.email}?subject=${encodeURIComponent(m.lang === "en" ? `Re: ${m.topic || "Your message"}` : `ตอบกลับ: ${m.topic || "ข้อความของคุณ"}`)}`;

  return (
    <section className={cardCls}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-800">{t("📨 ข้อความจากลูกค้า", "📨 Customer messages")}</h3>
        <span className="text-xs text-slate-500">{t('จาก Section "ฟอร์มติดต่อ" บนเว็บ (เช่น หน้า ติดต่อเรา) · มีข้อความใหม่ = กระดิ่งในระบบเด้งหาผู้จัดการ', 'From the "Contact form" Section on the site (e.g. the Contact us page) · new messages ring the bell for managers')}</span>
      </div>
      {err ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {t(`เกิดข้อผิดพลาดในการโหลดข้อความ (${err})`, `Error loading messages (${err})`)} <button className="ml-2 underline" onClick={() => void load()}>{t("ลองใหม่", "Retry")}</button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {([...CONTACT_STATUSES.map((s) => [s.key, `${s.label} (${counts[s.key] ?? 0})`] as const), ["all", t("ทั้งหมด", "All")] as const]).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setStatus(k as ContactStatus | "all")} className={`px-2.5 py-1 rounded-full text-xs border ${status === k ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                {l}
              </button>
            ))}
          </div>
          <MiniTable<Msg>
            rows={rows}
            rowKey={(r) => r.id}
            dense
            countUnit={t("ข้อความ", "messages")}
            maxHeightClass="max-h-[28rem]"
            searchText={(r) => `${fullName(r)} ${r.email} ${r.phone} ${r.topic} ${r.message}`}
            searchPlaceholder={t("ค้นหาชื่อ/อีเมล/เบอร์/ข้อความ…", "Search name/email/phone/message…")}
            emptyText={loading ? t("กำลังโหลด…", "Loading…") : status === "new" ? t("ไม่มีข้อความใหม่ — ข้อความจากฟอร์มติดต่อบนเว็บจะขึ้นที่นี่", "No new messages — messages from the site's contact form show up here") : t("ไม่มีข้อความ", "No messages")}
            columns={[
              {
                key: "who",
                header: t("ลูกค้า", "Customer"),
                width: "minmax(0,1.1fr)",
                sortValue: (r) => fullName(r),
                cell: (r) => (
                  <button type="button" onClick={() => setOpenId(r.id)} className="min-w-0 text-left">
                    <div className="text-xs font-medium text-slate-800 truncate">
                      {fullName(r)}
                      {r.lang === "en" && <span className="ml-1 text-[10px] px-1 rounded bg-sky-100 text-sky-700" title={t("ลูกค้าส่งจากหน้าเว็บภาษาอังกฤษ — ตอบเป็นภาษาอังกฤษ", "Sent from the English site — reply in English")}>EN</span>}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">{r.email}</div>
                  </button>
                ),
              },
              {
                key: "msg",
                header: t("ข้อความ", "Message"),
                width: "minmax(0,2fr)",
                cell: (r) => (
                  <button type="button" onClick={() => setOpenId(r.id)} className="min-w-0 text-left w-full">
                    {r.topic && <span className="text-[11px] text-indigo-700">[{r.topic}] </span>}
                    <span className="text-xs text-slate-600 line-clamp-2">{r.message}</span>
                  </button>
                ),
              },
              { key: "at", header: t("ส่งเมื่อ", "Sent"), width: "7.5rem", sortValue: (r) => r.created_at, cell: (r) => <span className="text-[11px] text-slate-500">{dt(r.created_at)}</span> },
              { key: "st", header: t("สถานะ", "Status"), width: "5.5rem", cell: (r) => <span className={`text-[11px] px-2 py-0.5 rounded-full ${tone(r.status)}`}>{contactStatusLabel(r.status)}</span> },
              {
                key: "act",
                header: "",
                width: "8rem",
                cell: (r) => (
                  <div className="flex items-center justify-end gap-2 text-[11px]">
                    <button type="button" onClick={() => setOpenId(r.id)} className="text-blue-700 hover:underline">{t("เปิดอ่าน", "Open")}</button>
                    {r.status === "new" ? (
                      <button type="button" disabled={busy} onClick={() => void patch(r.id, { status: "done" }, t("ทำเครื่องหมายตอบแล้ว", "Marked as replied"))} className="text-emerald-700 hover:underline">{t("✓ ตอบแล้ว", "✓ Replied")}</button>
                    ) : (
                      <button type="button" disabled={busy} onClick={() => void patch(r.id, { status: "new" }, t("กลับเป็นข้อความใหม่แล้ว", "Moved back to new"))} className="text-slate-500 hover:underline">{t("↺ ใหม่", "↺ New")}</button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </div>
      )}

      <ERPModal
        open={!!open}
        onClose={() => setOpenId(null)}
        title={open ? `📨 ${fullName(open)}` : ""}
        description={open ? `${dt(open.created_at)}${open.topic ? ` · ${open.topic}` : ""}${open.lang === "en" ? t(" · ลูกค้าใช้หน้าภาษาอังกฤษ", " · customer used the English site") : ""}` : ""}
        size="lg"
        defaultExpanded={false}
        hasUnsavedChanges={!!open && note !== (open.staff_note ?? "")}
        footer={
          open ? (
            <div className="flex flex-wrap items-center gap-2 w-full">
              <button type="button" onClick={() => setDel(open)} className="mr-auto text-xs text-red-500 hover:underline">{t("ลบข้อความ", "Delete message")}</button>
              {open.status !== "spam" && (
                <button type="button" disabled={busy} onClick={() => void patch(open.id, { status: "spam" }, t("ย้ายไปสแปมแล้ว", "Moved to spam"))} className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">{t("สแปม", "Spam")}</button>
              )}
              {open.status === "new" ? (
                <button type="button" disabled={busy} onClick={() => void patch(open.id, { status: "done", staffNote: note }, t("ทำเครื่องหมายตอบแล้ว", "Marked as replied"))} className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50">{t("✓ ตอบแล้ว", "✓ Replied")}</button>
              ) : (
                <button type="button" disabled={busy} onClick={() => void patch(open.id, { status: "new" }, t("กลับเป็นข้อความใหม่แล้ว", "Moved back to new"))} className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">{t("↺ กลับเป็นใหม่", "↺ Mark as new")}</button>
              )}
            </div>
          ) : null
        }
      >
        {open && (
          <div className="space-y-3 text-sm">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-[11px] text-slate-500">{t("อีเมล", "Email")}</p>
                <div className="flex items-center gap-2">
                  <a href={mailto(open)} className="text-blue-700 hover:underline truncate">{open.email}</a>
                  <button type="button" onClick={() => void copy(open.email, t("อีเมล", "email"))} className="text-[11px] text-slate-400 hover:text-slate-700" title={t("คัดลอก", "Copy")}>📋</button>
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-[11px] text-slate-500">{t("เบอร์โทร", "Phone")}</p>
                {open.phone ? <a href={`tel:${open.phone}`} className="text-blue-700 hover:underline">{open.phone}</a> : <span className="text-slate-400">—</span>}
              </div>
            </div>
            <div>
              <p className="text-[11px] text-slate-500 mb-1">{t("ข้อความ", "Message")}</p>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 whitespace-pre-line text-slate-800">{open.message}</div>
              <div className="mt-1 flex gap-3 text-[11px]">
                <button type="button" onClick={() => void copy(open.message, t("ข้อความ", "message"))} className="text-slate-500 hover:text-slate-800">{t("📋 คัดลอกข้อความ", "📋 Copy message")}</button>
                <a href={mailto(open)} className="text-blue-700 hover:underline">{t("✉️ ตอบทางอีเมล", "✉️ Reply by email")}</a>
                {open.page && <span className="text-slate-400">{t(`ส่งจากหน้า ${open.page}`, `Sent from page ${open.page}`)}</span>}
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">{t("โน้ตภายใน (ลูกค้าไม่เห็น)", "Internal note (customers don't see it)")}</label>
              <div className="flex gap-2">
                <input className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder={t("เช่น โทรกลับแล้ว รอส่งรูปเพิ่ม", "e.g. called back, waiting for more photos")} />
                <button type="button" disabled={busy || note === (open.staff_note ?? "")} onClick={() => void patch(open.id, { staffNote: note }, t("บันทึกโน้ตแล้ว", "Note saved"))} className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-sm disabled:opacity-40">{t("บันทึก", "Save")}</button>
              </div>
            </div>
            {open.handled_at && (
              <p className="text-[11px] text-slate-400">
                {contactStatusLabel(open.status)} · {dt(open.handled_at)}
                {open.handled_by ? t(` โดย ${open.handled_by}`, ` by ${open.handled_by}`) : ""}
              </p>
            )}
          </div>
        )}
      </ERPModal>

      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={() => void remove()}
        title={t("ลบข้อความนี้?", "Delete this message?")}
        message={del ? t(`ลบข้อความจาก ${fullName(del)} (${del.email}) — ลบแล้วกู้คืนไม่ได้ (ถ้าแค่จัดการแล้ว ใช้ "ตอบแล้ว" แทน)`, `Delete the message from ${fullName(del)} (${del.email}) — can't be restored (if it's just handled, use "Replied" instead)`) : ""}
        confirmText={t("ลบ", "Delete")}
        variant="danger"
        loading={busy}
      />
    </section>
  );
}
