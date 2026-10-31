"use client";

/**
 * พิมพ์ใบสั่งผลิตรวมทั้งรุ่น — /print/work-order/family
 *   ?mo=<id>        จากใบเดียว → รวมทุกใบที่ยังเปิดของรุ่นเดียวกัน
 *   ?parent=<code>  จากรหัสสินค้าแม่ (หัวกลุ่มบนบอร์ด)
 *   ?ids=a,b,c      ใบที่ติ๊กเลือก → แยกรุ่นละ 1 แผ่น
 *   ?sheet=         buy (ค่าเริ่ม) · route · status · track (= route + status)
 * ใบ "ซื้อ-ตัด" = ตาราง ของ × สี (lib/family-print) · ใบ "ติดตามงาน" แบบเขียนมือ A/D (lib/family-track)
 * ใช้ระบบพิมพ์กลาง + เส้น/ตัวอักษรจาก "ตั้งค่าใบพิมพ์" ใบสั่งงาน
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { PrintFrame, PrintDocLinkButton, printReportHtmlInNewWindow } from "@/components/report";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import { docFileName } from "@/lib/print-filename";
import { buildReportHtmlMulti } from "@/lib/template";
import { WO_DEFAULT_STYLE, woBarcodeHtml, woQrHtml, woStyleCss } from "@/lib/work-order-print";
import { scanUrl } from "@/lib/scan-code";
import { useWoPrintColumns } from "@/components/wo-print-columns";
import { FamilyPrintSettingsButton, useFamilyPrintSettings } from "@/components/family-print-settings";
import { FamilyDataCheck } from "@/components/family-data-check";
import { familyIssues, issueFlags } from "@/lib/family-checks";
import {
  FAMILY_DEFAULT_OPTIONS, buildFamilySheet, buildFamilyTemplate, familyHtmlData, familyOrientation, familySizeCss,
  type FamilyPrintOptions, type FamilyPrintResponse, type FamilyPrintSettings, type FamilySheetKind, type MoCodes,
} from "@/lib/family-print";
import {
  TRACK_CSS, TRACK_EXTRAS, buildFamilyTrack, familyTrackHtmlData, normalizeTrackExtras,
  type TrackExtras, type TrackOptions,
} from "@/lib/family-track";

type Sections = "both" | "buy" | "cut";
type Paper = "auto" | "landscape" | "portrait";
const SHEETS: FamilySheetKind[] = ["buy", "route", "status", "track"];
const EXTRAS_KEY = "erp.familyTrack.extras.v1";   // ช่องเสริมที่ติ๊กไว้ — จำต่อเครื่อง

function Seg<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <span className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white">
      {options.map((o) => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)}
          className={`h-9 px-3 text-sm ${value === o.v ? "bg-blue-50 font-medium text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}>{o.label}</button>
      ))}
    </span>
  );
}

function FamilyPrintInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const query = useMemo(() => {
    const p = new URLSearchParams();
    for (const k of ["ids", "mo", "parent"]) { const v = sp.get(k); if (v) p.set(k, v); }
    return p.toString();
  }, [sp]);

  const [data, setData] = useState<FamilyPrintResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<FamilySheetKind>(() => (SHEETS as string[]).includes(sp.get("sheet") ?? "") ? (sp.get("sheet") as FamilySheetKind) : "buy");
  const [sections, setSections] = useState<Sections>("both");
  const [onlyToBuy, setOnlyToBuy] = useState(false);
  const [paper, setPaper] = useState<Paper>("auto");
  const [blank, setBlank] = useState(false);
  const [extras, setExtras] = useState<TrackExtras>(() => normalizeTrackExtras(null));
  const { cols } = useWoPrintColumns();   // เส้นตาราง/ขนาดตัวอักษร = ค่ากลางเดียวกับใบสั่งงาน
  const { settings: savedSettings, reload: reloadSettings } = useFamilyPrintSettings();   // วิธีรวมแถว/ช่องติ๊ก/บาร์โค้ด (ค่ากลาง)
  const [previewSettings, setPreviewSettings] = useState<FamilyPrintSettings | null>(null);   // ค่าที่กำลังปรับในแผง (ยังไม่บันทึก)
  const settings = previewSettings ?? savedSettings;
  const [codes, setCodes] = useState<Record<string, MoCodes>>({});
  const [reloadKey, setReloadKey] = useState(0);                 // แก้ข้อมูลจากแผงตรวจแล้ว → โหลดใหม่
  const [checkOpen, setCheckOpen] = useState(false);
  const [activeIssue, setActiveIssue] = useState<string | null>(null);   // กดกรอบเหลืองบนเอกสาร (แบบ B)
  const isTrack = sheet !== "buy";

  // อ่านค่าที่จำไว้หลังเปิดหน้า (อ่านตอน render แรกจะไม่ตรงกับฝั่ง server)
  useEffect(() => {
    try { setExtras(normalizeTrackExtras(JSON.parse(localStorage.getItem(EXTRAS_KEY) ?? "null"))); } catch { /* ไม่มี/อ่านไม่ได้ = ค่าเริ่ม */ }
  }, []);

  const toggleExtra = (k: keyof TrackExtras) => setExtras((cur) => {
    const next = { ...cur, [k]: !cur[k] };
    try { localStorage.setItem(EXTRAS_KEY, JSON.stringify(next)); } catch { /* โหมดส่วนตัว — ไม่จำก็ได้ */ }
    return next;
  });

  useEffect(() => {
    if (!query) { setError("ไม่ได้เลือกใบสั่งผลิตหรือรุ่น"); return; }
    let on = true;
    setError(null);
    apiFetch(`/api/mo/family-print?${query}`).then((r) => r.json())
      .then((j: { data: FamilyPrintResponse | null; error: string | null }) => {
        if (!on) return;
        if (j.error || !j.data) setError(j.error || "โหลดข้อมูลไม่สำเร็จ");
        else setData(j.data);
      })
      .catch(() => { if (on) setError("โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่"); });
    return () => { on = false; };
  }, [query, reloadKey]);
  useEffect(() => { setData(null); }, [query]);   // เปลี่ยนรุ่น = ล้างของเก่า · โหลดซ้ำหลังแก้ข้อมูล = คงเอกสารเดิมไว้ระหว่างรอ

  // บาร์โค้ดเลขใบ (เส้น Code128 + QR ชี้หน้ากลาง /s/<เลขใบ>) — สร้างครั้งเดียวต่อการโหลด ตั้งค่าแค่เลือกว่าจะโชว์แบบไหน
  useEffect(() => {
    const moNos = [...new Set((data?.families ?? []).flatMap((f) => f.mos.map((m) => m.mo_no)))];
    if (!moNos.length) return;
    let on = true;
    void Promise.all(moNos.map(async (no) => [no, { line: await woBarcodeHtml(no), qr: await woQrHtml(scanUrl(no)) }] as const))
      .then((list) => { if (on) setCodes(Object.fromEntries(list)); });
    return () => { on = false; };
  }, [data]);

  const sheets = useMemo(() => (data?.families ?? []).map((f) => buildFamilySheet(f, settings.merge)), [data, settings.merge]);
  const title = sheets.length === 1 ? sheets[0].title_code : `${sheets.length} รุ่น`;
  const fileName = docFileName(isTrack ? "ใบติดตามงานผลิต" : "ใบสั่งผลิตรวมทั้งรุ่น", title);

  // ตรวจข้อมูล: ปัญหา + ธงบนเอกสาร (เฉพาะพรีวิวบนจอ — ไฟล์ที่พิมพ์/บันทึก PDF ไม่มีธง)
  const issues = useMemo(() => (data?.families ?? []).flatMap(familyIssues), [data]);
  const flags = useMemo(() => issueFlags(issues), [issues]);

  const build = (withFlags: boolean) => {
    if (!sheets.length || !data) return "";
    const printed = new Date().toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Bangkok" });
    // เส้น/ตัวอักษรจากตั้งค่าใบสั่งงาน + ขนาดแต่ละจุดของใบรวมทั้งรุ่น (ต่อท้าย = ชนะกฎเดิม)
    const style = woStyleCss(cols?.style ?? WO_DEFAULT_STYLE) + familySizeCss(settings.sizes);
    if (isTrack) {
      const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);   // วันนี้เวลาไทย (นับวันค้าง)
      const opt: TrackOptions = { extras, blank, printed, today, barcode: settings.barcode, codes, cols: settings.track_cols };
      const tracks = data.families.map((f) => buildFamilyTrack(f, today));
      const kinds = sheet === "track" ? (["route", "status"] as const) : ([sheet] as const);
      const pages = tracks.flatMap((t) => kinds.map((k) => familyTrackHtmlData(t, k, opt)));
      // ใบติดตามงานคอลัมน์เยอะ → แนวนอนเป็นค่าเริ่ม
      return buildReportHtmlMulti(buildFamilyTemplate(paper === "auto" ? "landscape" : paper, TRACK_CSS + style), pages, fileName);
    }
    const opt: FamilyPrintOptions = { ...FAMILY_DEFAULT_OPTIONS, buy: sections !== "cut", cut: sections !== "buy", only_to_buy: onlyToBuy, printed, settings, codes, flags: withFlags ? flags : undefined };
    const orientation = paper === "auto" ? familyOrientation(sheets) : paper;
    return buildReportHtmlMulti(buildFamilyTemplate(orientation, style), sheets.map((s) => familyHtmlData(s, opt)), fileName);
  };
  const deps = [sheets, data, isTrack, sheet, extras, blank, sections, onlyToBuy, paper, cols, fileName, settings, codes, flags];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => build(false), deps);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const previewHtml = useMemo(() => (isTrack ? html : build(true)), [...deps, html]);
  // แบบ B: กดแถว/การ์ดกรอบเหลืองในพรีวิว → เปิดแผงตรวจข้อมูลที่การ์ดนั้น
  const onDocLoad = (doc: Document) => {
    doc.addEventListener("click", (e) => {
      const el = (e.target as Element | null)?.closest?.("[data-fix]");
      if (!el) return;
      setActiveIssue(el.getAttribute("data-fix"));
      setCheckOpen(true);
    });
  };

  const summary = sheets.length === 1
    ? `${sheets[0].title_code} · ${sheets[0].stats.skus} สี · ${sheets[0].stats.mos} ใบสั่งผลิต · ${sheets[0].stats.qty.toLocaleString("th-TH")} ชิ้น`
    : `${sheets.length} รุ่น · ${sheets.reduce((n, s) => n + s.stats.mos, 0)} ใบสั่งผลิต`;

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="no-print sticky top-0 z-10 flex flex-col gap-2 border-b border-slate-200 bg-slate-100 px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => router.back()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-600 hover:bg-slate-50">
            <Icon name="back" /> กลับ
          </button>
          <span className="text-sm text-slate-600">พิมพ์รวมทั้งรุ่น {data && <b className="text-slate-800">{summary}</b>}</span>
          <Seg value={sheet} onChange={setSheet} options={[
            { v: "buy", label: "ซื้อ-ตัด (ของ × สี)" }, { v: "route", label: "ติดตามงาน A" }, { v: "status", label: "ตามสถานะ D" }, { v: "track", label: "A + D" },
          ]} />
          <div className="flex-1" />
          <PrintDocLinkButton html={html} fileName={fileName}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700">
            <Icon name="print" /> พิมพ์ / บันทึก PDF
          </PrintDocLinkButton>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isTrack ? (
            <>
              <Seg value={blank ? "blank" : "sys"} onChange={(v) => setBlank(v === "blank")} options={[{ v: "sys", label: "เติมจากระบบ + ช่องเขียน" }, { v: "blank", label: "ฟอร์มเปล่า" }]} />
              {sheet !== "status" && (
                <span className="flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
                  ช่องเสริม (แบบ A):
                  {TRACK_EXTRAS.map((e) => (
                    <button key={e.key} type="button" onClick={() => toggleExtra(e.key)}
                      className={`h-8 rounded-lg border px-2.5 text-sm ${extras[e.key] ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                      {extras[e.key] && <Icon name="done" />} {e.label}
                    </button>
                  ))}
                </span>
              )}
            </>
          ) : (
            <>
              <Seg value={sections} onChange={setSections} options={[{ v: "both", label: "ซื้อ + ตัด" }, { v: "buy", label: "เฉพาะซื้อ" }, { v: "cut", label: "เฉพาะตัด" }]} />
              <label className={`inline-flex items-center gap-1.5 text-sm ${sections === "cut" ? "text-slate-300" : "text-slate-600"}`}>
                <input type="checkbox" checked={onlyToBuy} disabled={sections === "cut"} onChange={(e) => setOnlyToBuy(e.target.checked)} /> เฉพาะที่ยังต้องซื้อ
              </label>
            </>
          )}
          <Seg value={paper} onChange={setPaper} options={[{ v: "auto", label: "กระดาษอัตโนมัติ" }, { v: "landscape", label: "แนวนอน" }, { v: "portrait", label: "แนวตั้ง" }]} />
          <FamilyPrintSettingsButton current={savedSettings} onPreview={setPreviewSettings} onSaved={reloadSettings} extras={extras} />
          <FamilyDataCheck issues={issues} options={data?.options ?? { uoms: [], types: [] }} open={checkOpen}
            onOpenChange={(o) => { setCheckOpen(o); if (!o) setActiveIssue(null); }} active={activeIssue}
            onFixed={() => setReloadKey((k) => k + 1)} />
        </div>
      </div>
      <div className="px-4 py-6">
        {error ? <div className="py-20 text-center text-red-500"><Icon name="warning" /> {error}</div>
          : data === null ? <div className="py-20 text-center text-slate-400">กำลังรวมข้อมูลทั้งรุ่น…</div>
          : sheets.length === 0 ? <div className="py-20 text-center text-slate-400">ไม่มีใบสั่งผลิตที่ยังเปิดอยู่ในรุ่นนี้</div>
          : <PrintFrame html={previewHtml} fileName={fileName} maxWidth={1180} onDocLoad={onDocLoad} onPrint={() => html && printReportHtmlInNewWindow(html)} />}
      </div>
    </div>
  );
}

export default function FamilyPrintPage() {
  return <Suspense fallback={<div className="py-20 text-center text-slate-400">กำลังโหลด…</div>}><FamilyPrintInner /></Suspense>;
}
