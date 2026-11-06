"use client";

/**
 * 📣 ส่งออกใบแจ้งลูกค้า (PDF / JPEG) — เปิดจากแท็บ "แจ้งลูกค้า" ในใบงานออกแบบ (เจ้าของขอ 2026-11-06)
 *   ?as=pdf | jpg = เปิดมาที่โหมดไหน (สลับในแผงได้)
 *   แผงซ้าย "เลือกสิ่งที่จะโชว์" แบบละเอียด (หัวกระดาษ / รูป / ตาราง / ท้ายกระดาษ) + ชุดสำเร็จ + กระดาษ/ขนาดรูป
 *   → พรีวิวเปลี่ยนทันที · เก็บไว้กับใบแจ้งใบนั้น (คนมีสิทธิ์แก้) · "จำไว้ใช้ครั้งหน้า" = ใบแจ้งใหม่ของคนนี้ตั้งต้นแบบนี้
 * ของกลาง: PrintToolbar / PrintFrame / SaveImageButton (components/report) · usePrintLog · buildNoticeHtml (lib/design-sheet-notice)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PrintToolbar, PrintFrame, printReportFrameOrWindow } from "@/components/report";
import { SaveImageButton } from "@/components/report/save-image-button";
import { usePrintLog } from "@/components/report/use-print-log";
import { useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { useUserPref } from "@/lib/use-user-pref";
import { docFileName } from "@/lib/print-filename";
import {
  buildNoticeHtml, cleanNoticeDisplay, DEFAULT_NOTICE_DISPLAY, noticeCompanyFrom, noticeDateText, noticeHasCalc, noticePageWidthPx,
  NOTICE_PRESETS, NOTICE_SHOW_GROUPS, presetShow,
  type NoticeDisplay, type NoticeFormat, type NoticeRecord, type NoticeShowKey,
} from "@/lib/design-sheet-notice";

type Sheet = { code?: string; name?: string; brand?: { name?: string } | Array<{ name?: string }> | null };

function Seg<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
      {options.map((o) => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)}
          className={`h-7 px-2.5 text-xs rounded-md transition ${value === o.v ? "bg-white text-slate-900 font-medium shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function PrintDesignSheetNoticePage() {
  const params = useParams();
  const router = useRouter();
  const sheetId = params.id as string;
  const noticeId = params.noticeId as string;
  const { can } = useAuth();
  const canEdit = can("products.edit");

  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [notice, setNotice] = useState<NoticeRecord | null>(null);
  const [companies, setCompanies] = useState<Record<string, unknown>[]>([]);
  const [display, setDisplay] = useState<NoticeDisplay>(DEFAULT_NOTICE_DISPLAY);
  const [as, setAs] = useState<"pdf" | "jpg">("pdf");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setDefDisplay] = useUserPref<NoticeDisplay>("ds_notice_display", DEFAULT_NOTICE_DISPLAY, (v) => (v && typeof v === "object" ? cleanNoticeDisplay(v) : null));
  const [remember, setRemember] = useUserPref<boolean>("ds_notice_display_remember", true, (v) => (typeof v === "boolean" ? v : null));

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("as");
    if (q === "jpg") setAs("jpg");
  }, []);

  useEffect(() => {
    Promise.all([
      apiFetch(`/api/design-sheets/${sheetId}`).then((r) => r.json()),
      apiFetch(`/api/design-sheets/${sheetId}/notices/${noticeId}`).then((r) => r.json()),
      apiFetch("/api/admin/companies").then((r) => r.json()).catch(() => ({ data: [] })),
    ])
      .then(([sRes, nRes, cRes]) => {
        if (sRes.error) throw new Error(sRes.error);
        if (nRes.error || !nRes.data) throw new Error(nRes.error || "ไม่พบใบแจ้งนี้");
        setSheet(sRes.data as Sheet);
        const n = nRes.data as NoticeRecord;
        setNotice(n);
        setDisplay(n.display);
        setCompanies((cRes.data ?? []) as Record<string, unknown>[]);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "โหลดไม่ได้"))
      .finally(() => setLoading(false));
  }, [sheetId, noticeId]);

  // เปลี่ยนสิ่งที่จะโชว์ → เก็บกับใบแจ้ง (หน่วง 0.8 วิ) + จำเป็นค่าตั้งต้นของคนนี้ (ถ้าติ๊กจำไว้)
  const loaded = useRef(false);
  useEffect(() => {
    if (!notice) return;
    if (!loaded.current) { loaded.current = true; return; }   // รอบแรก = ค่าที่โหลดมา ไม่ต้องบันทึก
    const h = setTimeout(() => {
      if (remember) setDefDisplay(display);
      if (canEdit) {
        void apiFetch(`/api/design-sheets/${sheetId}/notices/${noticeId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ display }),
        }).catch(() => { /* เก็บไม่ได้ก็ยังส่งออกได้ */ });
      }
    }, 800);
    return () => clearTimeout(h);
  }, [display]);   // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (k: NoticeShowKey) => setDisplay((d) => ({ ...d, show: { ...d.show, [k]: !d.show[k] } }));
  const setFmt = (p: Partial<NoticeFormat>) => setDisplay((d) => ({ ...d, fmt: { ...d.fmt, ...p } }));

  const brand = sheet ? ((Array.isArray(sheet.brand) ? sheet.brand[0] : sheet.brand) as { name?: string } | null) : null;
  const ctx = useMemo(() => ({
    sheetCode: String(sheet?.code ?? ""), sheetName: String(sheet?.name ?? ""), brandName: String(brand?.name ?? ""),
    company: noticeCompanyFrom(companies, display.fmt.company_id),
    senderName: notice?.created_by_name ?? "", dateText: noticeDateText(notice?.created_at),
    absUrl: (u: string) => (/^(https?:|data:|blob:)/i.test(u) ? u : `${window.location.origin}${u.startsWith("/") ? u : `/${u}`}`),
  }), [sheet, brand?.name, companies, display.fmt.company_id, notice]);

  const fileName = docFileName("ใบแจ้งลูกค้า", sheet?.code ? String(sheet.code) : null);
  const doc = useMemo(() => (notice ? { ...notice, display } : null), [notice, display]);
  const pdfHtml = useMemo(() => (doc ? buildNoticeHtml(doc, ctx, { docTitle: fileName }) : ""), [doc, ctx, fileName]);
  const jpgHtml = useMemo(() => (doc ? buildNoticeHtml(doc, ctx, { forImage: true, docTitle: fileName }) : ""), [doc, ctx, fileName]);
  const html = as === "jpg" ? jpgHtml : pdfHtml;

  // ประวัติพิมพ์ (ของกลาง) — จับปุ่ม PDF/พิมพ์/Ctrl+P ให้เอง · บันทึก JPEG ยังไม่ลงประวัติ (ตาราง print_logs รับแค่ print/pdf/link)
  const logItems = useMemo(() => (notice ? [{ doc_id: notice.id, doc_no: sheet?.code ? String(sheet.code) : null }] : []), [notice, sheet?.code]);
  usePrintLog("ds_notice", logItems);
  const activeCompanies = companies.filter((c) => String(c.status ?? "active") !== "inactive");
  const hasCalc = notice ? noticeHasCalc(notice.kind) : false;

  return (
    <div className="min-h-screen bg-slate-100">
      <PrintToolbar onBack={() => router.back()} fileName={fileName} />
      <div className="py-6 px-4">
        {loading ? (
          <div className="text-center py-20 text-slate-400">กำลังโหลด...</div>
        ) : error || !notice ? (
          <div className="text-center py-20 text-red-500">⚠️ {error ?? "ไม่พบใบแจ้ง"}</div>
        ) : (
          <div className="mx-auto max-w-[1200px] flex flex-col lg:flex-row gap-4 items-start">
            {/* แผงเลือกสิ่งที่จะโชว์ (ไม่ติดไปตอนพิมพ์) */}
            <aside className="no-print w-full lg:w-[300px] shrink-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-3 lg:sticky lg:top-20">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-700">ส่งออกเป็น</span>
                <Seg value={as} onChange={setAs} options={[{ v: "pdf", label: "PDF" }, { v: "jpg", label: "JPEG (ส่ง LINE)" }]} />
              </div>
              {as === "pdf" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500">กระดาษ</span>
                  <Seg value={display.fmt.paper} onChange={(v) => setFmt({ paper: v })} options={[{ v: "A4", label: "A4" }, { v: "A5", label: "A5" }]} />
                  <Seg value={display.fmt.orientation} onChange={(v) => setFmt({ orientation: v })} options={[{ v: "portrait", label: "แนวตั้ง" }, { v: "landscape", label: "แนวนอน" }]} />
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500">ขนาดรูป</span>
                  <Seg value={display.fmt.jpg_size} onChange={(v) => setFmt({ jpg_size: v })} options={[{ v: "fit", label: "พอดีเนื้อหา" }, { v: "page", label: "เท่ากระดาษ" }]} />
                  <Seg value={display.fmt.jpg_quality} onChange={(v) => setFmt({ jpg_quality: v })} options={[{ v: "normal", label: "ปกติ" }, { v: "high", label: "คมชัดสูง" }]} />
                </div>
              )}
              {activeCompanies.length > 1 && (
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  หัวกระดาษบริษัท
                  <select value={display.fmt.company_id ?? ""} onChange={(e) => setFmt({ company_id: e.target.value || null })}
                    className="flex-1 min-w-0 h-8 px-2 text-sm border border-slate-200 rounded-lg bg-white">
                    <option value="">บริษัทตั้งต้น</option>
                    {activeCompanies.map((c) => <option key={String(c.id)} value={String(c.id)}>{String(c.name_th || c.name || c.company_code)}</option>)}
                  </select>
                </label>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-500">ชุดสำเร็จ</span>
                {NOTICE_PRESETS.map((p) => (
                  <button key={p.key} type="button" onClick={() => setDisplay((d) => ({ ...d, show: presetShow(p.key) }))}
                    className="h-7 px-2 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">{p.label}</button>
                ))}
              </div>
              <div className="border-t border-slate-100 pt-2 space-y-2.5">
                <div className="text-xs font-medium text-slate-600">เลือกสิ่งที่จะโชว์</div>
                {NOTICE_SHOW_GROUPS.map((g) => {
                  const off = g.key === "table" && !hasCalc;
                  return (
                    <div key={g.key}>
                      <div className="text-[11px] text-slate-400 mb-1">{g.label}{off ? " — แบบแจ้งทั่วไปไม่มีตาราง" : ""}</div>
                      {!off && (
                        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                          {g.items.map(([k, label]) => (
                            <label key={k} className={`flex items-center gap-1.5 text-xs cursor-pointer ${display.show[k] ? "text-slate-700" : "text-slate-400 line-through"}`}>
                              <input type="checkbox" checked={display.show[k]} onChange={() => toggle(k)} className="accent-blue-600" />
                              {label}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="accent-blue-600" />
                จำไว้ใช้ครั้งหน้า (ใบแจ้งใหม่ของฉันตั้งต้นแบบนี้)
              </label>
              {!canEdit && <p className="text-[11px] text-amber-600">คุณดูได้อย่างเดียว — ที่ติ๊กไว้ใช้ได้ตอนนี้ แต่ไม่เก็บกับใบแจ้ง</p>}
              <div className="border-t border-slate-100 pt-3">
                {as === "pdf" ? (
                  <button type="button" onClick={() => printReportFrameOrWindow(fileName)}
                    className="w-full h-10 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">⬇ ดาวน์โหลด PDF</button>
                ) : (
                  <SaveImageButton html={jpgHtml} fileName={fileName} pageWidthPx={noticePageWidthPx(display.fmt)} scale={display.fmt.jpg_quality === "high" ? 3 : 2}
                    label="บันทึกเป็น JPEG"
                    className="w-full h-10 inline-flex items-center justify-center gap-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50" />
                )}
                <p className="text-[11px] text-slate-400 mt-1.5">{as === "pdf" ? "กดแล้วเลือกปลายทาง \"บันทึกเป็น PDF\" (ชื่อไฟล์ตั้งให้แล้ว)" : "ได้ไฟล์ .jpg ในโฟลเดอร์ดาวน์โหลด — ส่งเข้า LINE ลูกค้าได้เลย"}</p>
              </div>
            </aside>
            <div className="flex-1 min-w-0 w-full">
              <PrintFrame html={html} fileName={fileName} fit />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
