"use client";

/**
 * พาเนล "⚠️ บิลที่ยังขาด" — รายการ (subscription × เดือน) ที่ควรมีใบเสร็จแต่ยังไม่มี
 * แต่ละแถว: ปุ่มโหลด .bat (เปิด Chrome ไปเอาบิล) หรือเปิดหน้าบิล + 📎 แนบบิล (อัปโหลดตรงจากแถวนี้) + "ข้ามบิล"
 * แนบได้ทั้งกดปุ่มเลือกไฟล์ และลากไฟล์มาวางบนแถว (PDF หรือรูปบิล)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { canMakeBat, downloadChromeBat, downloadSubBat, subInvoiceUrl } from "@/lib/subs-bat";
import { canSearchMail, gmailSearchUrl } from "@/lib/gmail-search";
import { INVOICE_ACCEPT_ATTR, invoiceFileKind } from "@/lib/subscriptions";
import type { MissingInvoice } from "@/app/api/subscriptions/missing-invoices/route";

function fmtMonth(ym: string): string {
  const [y, m] = (ym ?? "").split("-");
  const names = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const idx = parseInt(m, 10) - 1;
  return names[idx] ? `${names[idx]} ${Number(y) + 543}` : ym;
}

const rowKey = (it: Pick<MissingInvoice, "subscription_id" | "month">) => `${it.subscription_id}|${it.month}`;

export function MissingInvoicesPanel({ canEdit, refreshKey, monthFilter, onAttached }: {
  canEdit: boolean;
  refreshKey?: number;
  monthFilter?: string;
  /** เรียกหลังแนบบิลสำเร็จ — ให้หน้าแม่โหลดตารางใบเสร็จใหม่ */
  onAttached?: () => void;
}) {
  const toast = useToast();
  const [items, setItems] = useState<MissingInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null); // key ที่กำลังข้าม
  const [uploadKey, setUploadKey] = useState<string | null>(null); // key ที่กำลังอัปโหลดบิล
  const [dragKey, setDragKey] = useState<string | null>(null);     // key ที่กำลังลากไฟล์มาวาง
  const [collapsed, setCollapsed] = useState(true); // default ซ่อน
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef<MissingInvoice | null>(null); // แถวที่กดปุ่มแนบไว้ (รอเลือกไฟล์)

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/subscriptions/missing-invoices");
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      setItems((j.data ?? []) as MissingInvoice[]);
    } catch { /* เงียบ */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  /** แนบไฟล์บิลของแถวนี้ (เดือนล็อกตามแถว ไม่ต้องเลือกเอง) */
  const attach = useCallback(async (it: MissingInvoice, file: File) => {
    const key = rowKey(it);
    if (!invoiceFileKind(file.name, file.type)) { toast.warning("รองรับเฉพาะไฟล์ PDF หรือรูปภาพ"); return; }
    setUploadKey(key);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("month", it.month);
      const res = await apiFetch(`/api/subscriptions/${it.subscription_id}/invoices`, { method: "POST", body: fd });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      toast.success(`แนบบิล ${it.name} (${fmtMonth(it.month)}) แล้ว`);
      setItems((prev) => prev.filter((x) => rowKey(x) !== key));
      onAttached?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : "แนบบิลไม่สำเร็จ"); }
    finally { setUploadKey(null); }
  }, [toast, onAttached]);

  const pickFile = (it: MissingInvoice) => { pendingRef.current = it; fileRef.current?.click(); };

  /**
   * เปิด Gmail ของบัญชีที่ผูกกับรายการ พร้อมคำค้นเมลบิลของเดือนนั้น
   * มีโฟลเดอร์โปรไฟล์ Chrome → โหลด .bat (การันตีว่าเปิดในโปรไฟล์ที่ล็อกอินเมลนั้น)
   * ไม่มี → เปิดแท็บใหม่ตรง ๆ (ถ้า Chrome ที่เปิดอยู่ไม่ได้ล็อกอินเมลนี้ Gmail จะให้เลือกบัญชี)
   */
  const searchMail = (it: MissingInvoice) => {
    const url = gmailSearchUrl(it, it.month);
    if (!url) { toast.warning("รายการนี้ยังไม่ได้ใส่อีเมลบัญชี — ใส่ก่อนถึงจะค้นในเมลได้"); return; }
    if (it.chrome_profile_dir && downloadChromeBat(it, url, "gmail")) {
      toast.success("ดาวน์โหลดไฟล์แล้ว — ดับเบิลคลิกเพื่อเปิด Gmail ในโปรไฟล์ที่ถูก");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const skip = async (it: MissingInvoice) => {
    const key = rowKey(it);
    setBusy(key);
    try {
      const res = await apiFetch("/api/subscriptions/missing-invoices", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription_id: it.subscription_id, month: it.month, action: "skip" }),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      toast.success(`ข้ามบิล ${it.name} (${fmtMonth(it.month)}) แล้ว`);
      setItems((prev) => prev.filter((x) => rowKey(x) !== key));
    } catch (e) { toast.error(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ"); }
    finally { setBusy(null); }
  };

  // โชว์ตามเดือนที่เลือกในตัวกรอง (ถ้าเลือกเดือนเจาะจง)
  const shown = monthFilter && monthFilter !== "all" ? items.filter((i) => i.month === monthFilter) : items;

  if (loading && items.length === 0) return null; // โหลดรอบแรกเท่านั้น (รอบรีเฟรชคงรายการเดิมไว้ ไม่ให้พาเนลกะพริบ)
  if (shown.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-4 py-2.5 text-sm text-emerald-700">
        ✅ ครบแล้ว — ไม่มีบิลที่ขาด{monthFilter && monthFilter !== "all" ? " (เดือนที่เลือก)" : " (รายเดือน + งาน ย้อน 3 เดือน)"}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 overflow-hidden">
      <button onClick={() => setCollapsed((c) => !c)} className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-amber-50">
        <span className="text-sm font-semibold text-amber-800">⚠️ บิลที่ยังขาด <span className="ml-1 px-2 py-0.5 rounded-full bg-amber-500 text-white text-xs">{shown.length}</span></span>
        <span className="text-amber-500 text-xs">{collapsed ? "▸ แสดง" : "▾ ซ่อน"}</span>
      </button>

      {!collapsed && (
        <div className="px-3 pb-3">
          <p className="text-[11px] text-amber-600 px-1 mb-1.5">
            รายการ รายเดือน + เปิดใช้งาน + งาน ที่ยังไม่มีใบเสร็จ (ย้อน 3 เดือน) ·
            หาบิลได้ 2 ทาง: <b>.bat/เปิดบิล</b> = ไปหน้าบิลของร้าน · <b>🔍 หาในเมล</b> = เปิด Gmail ของบัญชีนั้น พร้อมคำค้นเมลบิลของเดือนนั้นให้แล้ว
            (แก้คำค้นต่อในหน้า Gmail ได้) · ได้ไฟล์แล้วกด <b>📎 แนบบิล</b> หรือลากไฟล์มาวางบนแถว · เดือนไหนไม่มีบิลให้กด &ldquo;ข้ามบิล&rdquo;
          </p>
          {/* ช่องเลือกไฟล์ตัวเดียวใช้ร่วมทุกแถว (จำแถวที่กดไว้ใน pendingRef) */}
          <input ref={fileRef} type="file" accept={INVOICE_ACCEPT_ATTR} className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]; const it = pendingRef.current;
              e.target.value = ""; pendingRef.current = null;
              if (f && it) attach(it, f);
            }} />
          <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
          {shown.map((it) => {
            const key = rowKey(it);
            const link = subInvoiceUrl(it);
            const uploading = uploadKey === key;
            const dragging = dragKey === key;
            return (
              <div key={key}
                onDragOver={canEdit ? (e) => { e.preventDefault(); setDragKey(key); } : undefined}
                onDragLeave={canEdit ? () => setDragKey((k) => (k === key ? null : k)) : undefined}
                onDrop={canEdit ? (e) => {
                  e.preventDefault(); setDragKey(null);
                  const f = e.dataTransfer.files?.[0];
                  if (f) attach(it, f);
                } : undefined}
                className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 ${dragging ? "border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200" : "border-amber-100 bg-white"}`}>
                <span className="text-[11px] font-medium text-amber-700 bg-amber-100 rounded px-2 py-0.5 flex-shrink-0">{fmtMonth(it.month)}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800 truncate">{it.name}</div>
                  {(it.chrome_profile || it.account_email) && (
                    <div className="text-[11px] text-slate-400 truncate">{it.chrome_profile || it.account_email}</div>
                  )}
                </div>
                {dragging && <span className="text-[11px] font-medium text-indigo-600 flex-shrink-0">วางไฟล์เพื่อแนบบิลเดือนนี้</span>}
                {canMakeBat(it) ? (
                  <button onClick={() => downloadSubBat(it)} title="โหลดไฟล์เปิด Chrome ไปเอาบิล"
                    className="h-8 px-3 text-xs font-medium rounded-lg bg-slate-800 text-white hover:bg-slate-900 flex-shrink-0">⬇️ .bat</button>
                ) : link ? (
                  <a href={link} target="_blank" rel="noopener noreferrer" title="เปิดหน้าบิลของร้าน"
                    className="h-8 px-3 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 inline-flex items-center flex-shrink-0">🔗 เปิดบิล</a>
                ) : (
                  <span className="text-[11px] text-slate-300 flex-shrink-0">ตั้งลิงก์/โปรไฟล์ก่อน</span>
                )}
                <button onClick={() => searchMail(it)} disabled={!canSearchMail(it)}
                  title={!canSearchMail(it)
                    ? "ยังไม่ได้ใส่อีเมลบัญชีของรายการนี้"
                    : it.chrome_profile_dir
                      ? `โหลดไฟล์เปิด Gmail (โปรไฟล์ ${it.chrome_profile_dir}) พร้อมคำค้นเมลบิลเดือน ${fmtMonth(it.month)}`
                      : `เปิด Gmail ของ ${it.account_email} พร้อมคำค้นเมลบิลเดือน ${fmtMonth(it.month)}`}
                  className="h-8 px-3 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent flex-shrink-0">
                  🔍 หาในเมล
                </button>
                {canEdit && (
                  <button onClick={() => pickFile(it)} disabled={uploading}
                    title={`แนบไฟล์บิลของเดือน ${fmtMonth(it.month)} (PDF หรือรูป) — ลากไฟล์มาวางบนแถวนี้ก็ได้`}
                    className="h-8 px-3 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 flex-shrink-0">
                    {uploading ? "กำลังอัปโหลด…" : "📎 แนบบิล"}
                  </button>
                )}
                {canEdit && (
                  <button onClick={() => skip(it)} disabled={busy === key || uploading} title="เดือนนี้ไม่มีบิล — หยุดเตือน"
                    className="h-8 px-3 text-xs rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50 flex-shrink-0">
                    {busy === key ? "…" : "ข้ามบิล"}
                  </button>
                )}
              </div>
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
}
