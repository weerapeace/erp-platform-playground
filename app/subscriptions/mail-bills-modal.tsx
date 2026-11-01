"use client";

/**
 * ป๊อปอัป "📥 ดึงบิลจากเมล" — ค้นเมลบิลของรายการ+เดือนในกล่อง Gmail ที่เชื่อมไว้ → โชว์ไฟล์แนบ (พร้อมยอดที่อ่านได้)
 * ผู้ใช้เลือกไฟล์ (ดูไฟล์ก่อนได้) → กล่องสรุป "จะแนบอะไร เข้าเดือนไหน" → กด "ยืนยันแนบบิล" ถึงจะแนบจริง
 * API: /api/subscriptions/mail-bills (ค้น) · /mail-bills/file (ดูไฟล์) · /mail-bills/attach (แนบ)
 */
import { useCallback, useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { Spinner } from "@/components/spinner";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { openGmailSearch, type MailBillFile, type MailBillMessage } from "@/lib/gmail-search";

export type MailBillsTarget = { subscription_id: string; name: string; month: string; account_email: string; invoice_url: string };

const fmtSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "");
const fmtAmount = (f: MailBillFile) => (f.amount == null ? null : `${f.currency ? `${f.currency} ` : ""}${f.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
/** "Name <a@b.com>" → "a@b.com" */
const fromAddr = (from: string) => /<([^>]+)>/.exec(from)?.[1] ?? from;

export function MailBillsModal({ target, monthLabel, onClose, onAttached }: {
  target: MailBillsTarget | null;
  monthLabel: (ym: string) => string;
  onClose: () => void;
  onAttached: (t: MailBillsTarget) => void;
}) {
  const toast = useToast();
  const open = !!target;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<MailBillMessage[]>([]);
  const [email, setEmail] = useState("");
  const [pick, setPick] = useState<{ msg: MailBillMessage; file: MailBillFile } | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);

  const search = useCallback(async () => {
    if (!target) return;
    setLoading(true); setError(null); setItems([]); setPick(null);
    try {
      const res = await apiFetch("/api/subscriptions/mail-bills", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sub_id: target.subscription_id, month: target.month }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error ?? "ค้นเมลไม่สำเร็จ"); return; }
      setItems((j.data ?? []) as MailBillMessage[]);
      setEmail(j.email ?? target.account_email);
    } catch { setError("ค้นเมลไม่สำเร็จ ลองใหม่อีกครั้ง"); }
    finally { setLoading(false); }
  }, [target]);
  useEffect(() => { if (open) search(); }, [open, search]);

  /** เปิดดูไฟล์ในแท็บใหม่ (เปิดแท็บเปล่าก่อน กันเบราว์เซอร์บล็อกป๊อปอัป แล้วค่อยใส่ไฟล์) */
  const view = async (msg: MailBillMessage, file: MailBillFile) => {
    if (!target) return;
    const key = `${msg.message_id}|${file.part_id}`;
    const win = window.open("", "_blank");
    setViewing(key);
    try {
      const res = await apiFetch("/api/subscriptions/mail-bills/file", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sub_id: target.subscription_id, message_id: msg.message_id, part_id: file.part_id }),
      });
      if (!res.ok) { win?.close(); const j = await res.json().catch(() => ({})); toast.error(j.error ?? "เปิดไฟล์ไม่สำเร็จ"); return; }
      const url = URL.createObjectURL(await res.blob());
      if (win) win.location.href = url; else window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch { win?.close(); toast.error("เปิดไฟล์ไม่สำเร็จ"); }
    finally { setViewing(null); }
  };

  const confirm = async () => {
    if (!target || !pick) return;
    setSaving(true);
    try {
      const res = await apiFetch("/api/subscriptions/mail-bills/attach", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sub_id: target.subscription_id, month: target.month, message_id: pick.msg.message_id, part_id: pick.file.part_id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(j.error ?? "แนบบิลไม่สำเร็จ"); return; }
      toast.success(`แนบบิล ${target.name} (${monthLabel(target.month)}) จากเมลแล้ว`);
      onAttached(target);
    } catch { toast.error("แนบบิลไม่สำเร็จ ลองใหม่อีกครั้ง"); }
    finally { setSaving(false); }
  };

  const withFiles = items.filter((m) => m.files.length > 0);
  const noFiles = items.filter((m) => m.files.length === 0);

  return (
    <ERPModal open={open} onClose={() => !saving && onClose()} size="lg" storageKey="subs-mail-bills"
      title="📥 ดึงบิลจากเมล" description={target ? `${target.name} · ${monthLabel(target.month)}${email ? ` · ค้นใน ${email}` : ""}` : undefined}
      footer={
        <>
          <button onClick={onClose} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
          <button onClick={confirm} disabled={!pick || saving}
            className="h-9 px-5 inline-flex items-center gap-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {saving && <Spinner size={14} />} {saving ? "กำลังแนบ…" : "ยืนยันแนบบิล"}
          </button>
        </>
      }>
      {loading ? <LoadingState label="กำลังค้นเมล… (อ่านยอดจาก PDF ด้วย อาจใช้เวลาสักครู่)" /> : error ? (
        <ErrorState title="ค้นเมลไม่สำเร็จ" hint={error} onRetry={search} />
      ) : items.length === 0 ? (
        <EmptyState icon="📭" title="ไม่เจอเมลบิลของเดือนนี้"
          hint="ร้านอาจส่งบิลมาช้า/ส่งไปเมลอื่น หรือคำค้นไม่ตรง — ลองค้นเองใน Gmail แล้วแก้คำค้นต่อได้"
          action={target ? { label: "🔍 เปิดค้นใน Gmail", onClick: () => openGmailSearch(target, target.month) } : undefined} />
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">เลือกไฟล์ที่เป็นบิลของเดือนนี้ (กด &quot;ดูไฟล์&quot; เปิดดูก่อนได้) — ระบบยังไม่แนบอะไรจนกว่าจะกด &quot;ยืนยันแนบบิล&quot;</p>

          {withFiles.map((m) => (
            <div key={m.message_id} className="rounded-lg border border-slate-200 bg-white">
              <div className="px-3 pt-2.5 pb-1.5">
                <div className="text-sm font-medium text-slate-800 truncate" title={m.subject}>{m.subject || "(ไม่มีหัวเรื่อง)"}</div>
                <div className="text-[11px] text-slate-400 truncate">{fromAddr(m.from)} · {fmtDate(m.date)}</div>
              </div>
              <div className="px-2 pb-2 space-y-1">
                {m.files.map((f) => {
                  const key = `${m.message_id}|${f.part_id}`;
                  const selected = pick?.msg.message_id === m.message_id && pick.file.part_id === f.part_id;
                  return (
                    <label key={key} className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 ${f.attached ? "opacity-60" : "cursor-pointer hover:bg-slate-50"} ${selected ? "bg-indigo-50 ring-1 ring-indigo-300" : ""}`}>
                      <input type="radio" name="mail-bill" checked={selected} disabled={f.attached || saving}
                        onChange={() => setPick({ msg: m, file: f })} className="w-4 h-4 text-indigo-600" />
                      <span className="text-base">{f.kind === "pdf" ? "📄" : "🖼️"}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm text-slate-700 truncate" title={f.filename}>{f.filename}</span>
                        <span className="block text-[11px] text-slate-400">
                          {fmtSize(f.size)}
                          {fmtAmount(f) && <> · อ่านได้ <b className="text-slate-600">{fmtAmount(f)}</b></>}
                          {f.date && <> · ลงวันที่ {fmtDate(f.date)}</>}
                          {f.kind === "image" && " · รูปอ่านยอดอัตโนมัติไม่ได้ (กรอกเองทีหลัง)"}
                        </span>
                      </span>
                      {f.attached && <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">แนบแล้ว</span>}
                      <button type="button" onClick={(e) => { e.preventDefault(); view(m, f); }} disabled={viewing === key}
                        className="h-7 px-2.5 text-xs border border-slate-200 rounded-md text-slate-600 hover:bg-white disabled:opacity-50">
                        {viewing === key ? "กำลังเปิด…" : "ดูไฟล์"}
                      </button>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}

          {noFiles.length > 0 && (
            <div className="rounded-lg border border-dashed border-slate-200 px-3 py-2">
              <div className="text-xs text-slate-500 mb-1">เมลที่เจอแต่ไม่มีไฟล์แนบ ({noFiles.length}) — แนบอัตโนมัติไม่ได้ เปิดในเมลแล้วโหลดเองจากลิงก์ในเมล</div>
              {noFiles.map((m) => (
                <div key={m.message_id} className="text-[11px] text-slate-400 truncate">• {m.subject || "(ไม่มีหัวเรื่อง)"} · {fromAddr(m.from)} · {fmtDate(m.date)}</div>
              ))}
              {target && (
                <button type="button" onClick={() => openGmailSearch(target, target.month)} className="mt-1.5 text-xs text-indigo-600 hover:underline">🔍 เปิดค้นใน Gmail</button>
              )}
            </div>
          )}

          {/* สรุปก่อนยืนยัน */}
          <div className={`rounded-lg px-3 py-2.5 text-sm ${pick ? "bg-indigo-50 text-indigo-800 border border-indigo-100" : "bg-amber-50 text-amber-800 border border-amber-100"}`}>
            {pick && target ? (
              <>จะแนบ <b>{pick.file.filename}</b> เข้า <b>{target.name}</b> เดือน <b>{monthLabel(target.month)}</b>
                {fmtAmount(pick.file) && <> · ยอด {fmtAmount(pick.file)}</>} <span className="text-indigo-500">(แก้ยอดทีหลังได้ในแท็บใบเสร็จ)</span></>
            ) : "ยังไม่ได้เลือกไฟล์ — เลือกไฟล์บิลก่อน แล้วกดยืนยันแนบบิล"}
          </div>
        </div>
      )}
    </ERPModal>
  );
}
