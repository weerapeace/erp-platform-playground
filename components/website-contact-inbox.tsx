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

const dt = (s: string) => new Date(s).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
const tone = (s: string) => CONTACT_STATUSES.find((x) => x.key === s)?.tone ?? "bg-slate-100 text-slate-600";
const fullName = (m: Msg) => `${m.first_name} ${m.last_name}`.trim();

export function ContactInboxCard({ shopSlug, cardCls }: { shopSlug: string; cardCls: string }) {
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
      setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
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
      if (!j.ok) throw new Error(j.error ?? "บันทึกไม่สำเร็จ");
      toast.success(okMsg);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!del) return;
    setBusy(true);
    try {
      const j = await apiFetch(`/api/website/contact-messages?id=${encodeURIComponent(del.id)}`, { method: "DELETE" }).then((r) => r.json());
      if (!j.ok) throw new Error(j.error ?? "ลบไม่สำเร็จ");
      toast.success("ลบข้อความแล้ว");
      setDel(null);
      setOpenId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`คัดลอก${what}แล้ว`);
    } catch {
      toast.error("คัดลอกไม่สำเร็จ");
    }
  };
  const mailto = (m: Msg) => `mailto:${m.email}?subject=${encodeURIComponent(m.lang === "en" ? `Re: ${m.topic || "Your message"}` : `ตอบกลับ: ${m.topic || "ข้อความของคุณ"}`)}`;

  return (
    <section className={cardCls}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-800">📨 ข้อความจากลูกค้า</h3>
        <span className="text-xs text-slate-500">จาก Section &quot;ฟอร์มติดต่อ&quot; บนเว็บ (เช่น หน้า ติดต่อเรา) · มีข้อความใหม่ = กระดิ่งในระบบเด้งหาผู้จัดการ</span>
      </div>
      {err ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          เกิดข้อผิดพลาดในการโหลดข้อความ ({err}) <button className="ml-2 underline" onClick={() => void load()}>ลองใหม่</button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {([...CONTACT_STATUSES.map((s) => [s.key, `${s.label} (${counts[s.key] ?? 0})`] as const), ["all", "ทั้งหมด"] as const]).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setStatus(k as ContactStatus | "all")} className={`px-2.5 py-1 rounded-full text-xs border ${status === k ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                {l}
              </button>
            ))}
          </div>
          <MiniTable<Msg>
            rows={rows}
            rowKey={(r) => r.id}
            dense
            countUnit="ข้อความ"
            maxHeightClass="max-h-[28rem]"
            searchText={(r) => `${fullName(r)} ${r.email} ${r.phone} ${r.topic} ${r.message}`}
            searchPlaceholder="ค้นหาชื่อ/อีเมล/เบอร์/ข้อความ…"
            emptyText={loading ? "กำลังโหลด…" : status === "new" ? "ไม่มีข้อความใหม่ — ข้อความจากฟอร์มติดต่อบนเว็บจะขึ้นที่นี่" : "ไม่มีข้อความ"}
            columns={[
              {
                key: "who",
                header: "ลูกค้า",
                width: "minmax(0,1.1fr)",
                sortValue: (r) => fullName(r),
                cell: (r) => (
                  <button type="button" onClick={() => setOpenId(r.id)} className="min-w-0 text-left">
                    <div className="text-xs font-medium text-slate-800 truncate">
                      {fullName(r)}
                      {r.lang === "en" && <span className="ml-1 text-[10px] px-1 rounded bg-sky-100 text-sky-700" title="ลูกค้าส่งจากหน้าเว็บภาษาอังกฤษ — ตอบเป็นภาษาอังกฤษ">EN</span>}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">{r.email}</div>
                  </button>
                ),
              },
              {
                key: "msg",
                header: "ข้อความ",
                width: "minmax(0,2fr)",
                cell: (r) => (
                  <button type="button" onClick={() => setOpenId(r.id)} className="min-w-0 text-left w-full">
                    {r.topic && <span className="text-[11px] text-indigo-700">[{r.topic}] </span>}
                    <span className="text-xs text-slate-600 line-clamp-2">{r.message}</span>
                  </button>
                ),
              },
              { key: "at", header: "ส่งเมื่อ", width: "7.5rem", sortValue: (r) => r.created_at, cell: (r) => <span className="text-[11px] text-slate-500">{dt(r.created_at)}</span> },
              { key: "st", header: "สถานะ", width: "5.5rem", cell: (r) => <span className={`text-[11px] px-2 py-0.5 rounded-full ${tone(r.status)}`}>{contactStatusLabel(r.status)}</span> },
              {
                key: "act",
                header: "",
                width: "8rem",
                cell: (r) => (
                  <div className="flex items-center justify-end gap-2 text-[11px]">
                    <button type="button" onClick={() => setOpenId(r.id)} className="text-blue-700 hover:underline">เปิดอ่าน</button>
                    {r.status === "new" ? (
                      <button type="button" disabled={busy} onClick={() => void patch(r.id, { status: "done" }, "ทำเครื่องหมายตอบแล้ว")} className="text-emerald-700 hover:underline">✓ ตอบแล้ว</button>
                    ) : (
                      <button type="button" disabled={busy} onClick={() => void patch(r.id, { status: "new" }, "กลับเป็นข้อความใหม่แล้ว")} className="text-slate-500 hover:underline">↺ ใหม่</button>
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
        description={open ? `${dt(open.created_at)}${open.topic ? ` · ${open.topic}` : ""}${open.lang === "en" ? " · ลูกค้าใช้หน้าภาษาอังกฤษ" : ""}` : ""}
        size="lg"
        defaultExpanded={false}
        hasUnsavedChanges={!!open && note !== (open.staff_note ?? "")}
        footer={
          open ? (
            <div className="flex flex-wrap items-center gap-2 w-full">
              <button type="button" onClick={() => setDel(open)} className="mr-auto text-xs text-red-500 hover:underline">ลบข้อความ</button>
              {open.status !== "spam" && (
                <button type="button" disabled={busy} onClick={() => void patch(open.id, { status: "spam" }, "ย้ายไปสแปมแล้ว")} className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">สแปม</button>
              )}
              {open.status === "new" ? (
                <button type="button" disabled={busy} onClick={() => void patch(open.id, { status: "done", staffNote: note }, "ทำเครื่องหมายตอบแล้ว")} className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50">✓ ตอบแล้ว</button>
              ) : (
                <button type="button" disabled={busy} onClick={() => void patch(open.id, { status: "new" }, "กลับเป็นข้อความใหม่แล้ว")} className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">↺ กลับเป็นใหม่</button>
              )}
            </div>
          ) : null
        }
      >
        {open && (
          <div className="space-y-3 text-sm">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-[11px] text-slate-500">อีเมล</p>
                <div className="flex items-center gap-2">
                  <a href={mailto(open)} className="text-blue-700 hover:underline truncate">{open.email}</a>
                  <button type="button" onClick={() => void copy(open.email, "อีเมล")} className="text-[11px] text-slate-400 hover:text-slate-700" title="คัดลอก">📋</button>
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-[11px] text-slate-500">เบอร์โทร</p>
                {open.phone ? <a href={`tel:${open.phone}`} className="text-blue-700 hover:underline">{open.phone}</a> : <span className="text-slate-400">—</span>}
              </div>
            </div>
            <div>
              <p className="text-[11px] text-slate-500 mb-1">ข้อความ</p>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 whitespace-pre-line text-slate-800">{open.message}</div>
              <div className="mt-1 flex gap-3 text-[11px]">
                <button type="button" onClick={() => void copy(open.message, "ข้อความ")} className="text-slate-500 hover:text-slate-800">📋 คัดลอกข้อความ</button>
                <a href={mailto(open)} className="text-blue-700 hover:underline">✉️ ตอบทางอีเมล</a>
                {open.page && <span className="text-slate-400">ส่งจากหน้า {open.page}</span>}
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">โน้ตภายใน (ลูกค้าไม่เห็น)</label>
              <div className="flex gap-2">
                <input className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="เช่น โทรกลับแล้ว รอส่งรูปเพิ่ม" />
                <button type="button" disabled={busy || note === (open.staff_note ?? "")} onClick={() => void patch(open.id, { staffNote: note }, "บันทึกโน้ตแล้ว")} className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-sm disabled:opacity-40">บันทึก</button>
              </div>
            </div>
            {open.handled_at && (
              <p className="text-[11px] text-slate-400">
                {contactStatusLabel(open.status)} · {dt(open.handled_at)}
                {open.handled_by ? ` โดย ${open.handled_by}` : ""}
              </p>
            )}
          </div>
        )}
      </ERPModal>

      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={() => void remove()}
        title="ลบข้อความนี้?"
        message={del ? `ลบข้อความจาก ${fullName(del)} (${del.email}) — ลบแล้วกู้คืนไม่ได้ (ถ้าแค่จัดการแล้ว ใช้ "ตอบแล้ว" แทน)` : ""}
        confirmText="ลบ"
        variant="danger"
        loading={busy}
      />
    </section>
  );
}
