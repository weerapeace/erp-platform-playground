"use client";

/**
 * พิมพ์ใบสั่งผลิตรวมทั้งรุ่น — /print/work-order/family
 *   ?mo=<id>        จากใบเดียว → รวมทุกใบที่ยังเปิดของรุ่นเดียวกัน
 *   ?parent=<code>  จากรหัสสินค้าแม่ (หัวกลุ่มบนบอร์ด)
 *   ?ids=a,b,c      ใบที่ติ๊กเลือก → แยกรุ่นละ 1 แผ่น
 * ตาราง "ของ × สี": ของที่ต้องซื้อ + บล็อกตัด ของทุกสีในแผ่นเดียว (lib/family-print) · ใช้ระบบพิมพ์กลาง + เส้น/ตัวอักษรจาก "ตั้งค่าใบพิมพ์" ใบสั่งงาน
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { PrintFrame, PrintDocLinkButton, printReportHtmlInNewWindow } from "@/components/report";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import { docFileName } from "@/lib/print-filename";
import { buildReportHtmlMulti } from "@/lib/template";
import { WO_DEFAULT_STYLE, woStyleCss } from "@/lib/work-order-print";
import { useWoPrintColumns } from "@/components/wo-print-columns";
import {
  FAMILY_DEFAULT_OPTIONS, buildFamilySheet, buildFamilyTemplate, familyHtmlData, familyOrientation,
  type FamilyPrintOptions, type FamilyPrintResponse,
} from "@/lib/family-print";

type Sections = "both" | "buy" | "cut";
type Paper = "auto" | "landscape" | "portrait";

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
  const [sections, setSections] = useState<Sections>("both");
  const [onlyToBuy, setOnlyToBuy] = useState(false);
  const [paper, setPaper] = useState<Paper>("auto");
  const { cols } = useWoPrintColumns();   // เส้นตาราง/ขนาดตัวอักษร = ค่ากลางเดียวกับใบสั่งงาน

  useEffect(() => {
    if (!query) { setError("ไม่ได้เลือกใบสั่งผลิตหรือรุ่น"); return; }
    let on = true;
    setData(null); setError(null);
    apiFetch(`/api/mo/family-print?${query}`).then((r) => r.json())
      .then((j: { data: FamilyPrintResponse | null; error: string | null }) => {
        if (!on) return;
        if (j.error || !j.data) setError(j.error || "โหลดข้อมูลไม่สำเร็จ");
        else setData(j.data);
      })
      .catch(() => { if (on) setError("โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่"); });
    return () => { on = false; };
  }, [query]);

  const sheets = useMemo(() => (data?.families ?? []).map(buildFamilySheet), [data]);
  const title = sheets.length === 1 ? sheets[0].title_code : `${sheets.length} รุ่น`;
  const fileName = docFileName("ใบสั่งผลิตรวมทั้งรุ่น", title);

  const html = useMemo(() => {
    if (!sheets.length) return "";
    const opt: FamilyPrintOptions = {
      ...FAMILY_DEFAULT_OPTIONS, buy: sections !== "cut", cut: sections !== "buy", only_to_buy: onlyToBuy,
      printed: new Date().toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Bangkok" }),
    };
    const orientation = paper === "auto" ? familyOrientation(sheets) : paper;
    return buildReportHtmlMulti(buildFamilyTemplate(orientation, woStyleCss(cols?.style ?? WO_DEFAULT_STYLE)), sheets.map((s) => familyHtmlData(s, opt)), fileName);
  }, [sheets, sections, onlyToBuy, paper, cols, fileName]);

  const summary = sheets.length === 1
    ? `${sheets[0].title_code} · ${sheets[0].stats.skus} สี · ${sheets[0].stats.mos} ใบสั่งผลิต · ${sheets[0].stats.qty.toLocaleString("th-TH")} ชิ้น`
    : `${sheets.length} รุ่น · ${sheets.reduce((n, s) => n + s.stats.mos, 0)} ใบสั่งผลิต`;

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-100 px-6 py-3">
        <button type="button" onClick={() => router.back()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-600 hover:bg-slate-50">
          <Icon name="back" /> กลับ
        </button>
        <span className="text-sm text-slate-600">พิมพ์ใบสั่งผลิตรวมทั้งรุ่น {data && <b className="text-slate-800">{summary}</b>}</span>
        <Seg value={sections} onChange={setSections} options={[{ v: "both", label: "ซื้อ + ตัด" }, { v: "buy", label: "เฉพาะซื้อ" }, { v: "cut", label: "เฉพาะตัด" }]} />
        <label className={`inline-flex items-center gap-1.5 text-sm ${sections === "cut" ? "text-slate-300" : "text-slate-600"}`}>
          <input type="checkbox" checked={onlyToBuy} disabled={sections === "cut"} onChange={(e) => setOnlyToBuy(e.target.checked)} /> เฉพาะที่ยังต้องซื้อ
        </label>
        <Seg value={paper} onChange={setPaper} options={[{ v: "auto", label: "กระดาษอัตโนมัติ" }, { v: "landscape", label: "แนวนอน" }, { v: "portrait", label: "แนวตั้ง" }]} />
        <div className="flex-1" />
        <PrintDocLinkButton html={html} fileName={fileName}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700">
          <Icon name="print" /> พิมพ์ / บันทึก PDF
        </PrintDocLinkButton>
      </div>
      <div className="px-4 py-6">
        {error ? <div className="py-20 text-center text-red-500"><Icon name="warning" /> {error}</div>
          : data === null ? <div className="py-20 text-center text-slate-400">กำลังรวมข้อมูลทั้งรุ่น…</div>
          : sheets.length === 0 ? <div className="py-20 text-center text-slate-400">ไม่มีใบสั่งผลิตที่ยังเปิดอยู่ในรุ่นนี้</div>
          : <PrintFrame html={html} fileName={fileName} maxWidth={1180} onPrint={() => html && printReportHtmlInNewWindow(html)} />}
      </div>
    </div>
  );
}

export default function FamilyPrintPage() {
  return <Suspense fallback={<div className="py-20 text-center text-slate-400">กำลังโหลด…</div>}><FamilyPrintInner /></Suspense>;
}
