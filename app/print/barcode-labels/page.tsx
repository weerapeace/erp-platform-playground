"use client";

/**
 * หน้าพิมพ์บาร์โค้ด/QR แบบ batch (เฟส 1 + 2)
 * รับ payload จาก sessionStorage (ตั้งค่าจาก modal ในหน้า SKU) → วางลงกระดาษ → กดพิมพ์
 * โค้ด: QR (lib qrcode + โลโก้กลาง) · บาร์โค้ด Code128 (lib jsbarcode)
 * เลย์เอาต์: A4 สำเร็จรูป (preset) หรือ กำหนดเอง (custom: A4/Roll + ขนาด/ต่อแถว/ระยะขอบ)
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";
import {
  getPreset, autoCodeMetrics, PRINT_PAYLOAD_KEY, MAX_LABELS,
  type PrintPayload, type PrintItem, type PrintOpts,
} from "@/components/barcode-print/labels";

const loadImg = (src: string): Promise<HTMLImageElement> =>
  new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });

// โลโก้ที่จะวางกลาง QR ของแต่ละดวง (ตาม logoMode)
function logoForItem(it: PrintItem, o: PrintOpts): string | null {
  if (o.logoMode === "single") return o.logo;
  if (o.logoMode === "brand") return it.brandLogo ? `/api/r2-image?key=${encodeURIComponent(it.brandLogo)}&w=120` : null;
  return null;
}

// สร้าง QR (data URL) — วางโลโก้กลางได้ (error-correction สูงเลยยังสแกนได้) + สีกำหนดได้
async function makeQR(text: string, logo: string | null, color = "#000000", size = 240): Promise<string> {
  const url = await QRCode.toDataURL(text || " ", { errorCorrectionLevel: "H", margin: 1, width: size, color: { dark: color, light: "#ffffff" } });
  if (!logo) return url;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext("2d"); if (!ctx) return url;
    ctx.drawImage(await loadImg(url), 0, 0, size, size);
    const ls = Math.round(size * 0.24);
    const lx = Math.round((size - ls) / 2), ly = Math.round((size - ls) / 2);
    const pad = Math.round(ls * 0.12);
    ctx.fillStyle = "#fff";
    ctx.fillRect(lx - pad, ly - pad, ls + pad * 2, ls + pad * 2);
    ctx.drawImage(await loadImg(logo), lx, ly, ls, ls);
    return canvas.toDataURL("image/png");
  } catch { return url; }
}

function Barcode({ value, heightMm, color = "#000000" }: { value: string; heightMm: number; color?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try { JsBarcode(ref.current, value || " ", { format: "CODE128", displayValue: false, height: heightMm * 3.78, width: 1.3, margin: 0, lineColor: color }); }
    catch { /* ค่าที่ Code128 ไม่รองรับ (หายากมาก) */ }
  }, [value, heightMm, color]);
  return <svg ref={ref} style={{ height: `${heightMm}mm`, maxWidth: "100%" }} />;
}

function Label({ it, opts, codeH, font, qr }: { it: PrintItem; opts: PrintOpts; codeH: number; font: number; qr?: string }) {
  const hasText = opts.showCode || opts.showName || opts.showPrice;
  return (
    <div style={{ border: opts.showBorder ? "0.4px dashed #dcdcdc" : "none", display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", gap: "0.5mm", overflow: "hidden", padding: "1mm", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "1.5mm", maxWidth: "100%" }}>
        {opts.showQR && qr && <img src={qr} alt="" style={{ height: `${codeH}mm`, width: `${codeH}mm` }} />}
        {opts.showBarcode && <Barcode value={it.barcode || it.code} heightMm={codeH * 0.8} color={opts.codeColor} />}
      </div>
      {hasText && (
        <div style={{ textAlign: "center", lineHeight: 1.12, maxWidth: "100%", overflow: "hidden" }}>
          {opts.showCode && (
            <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: `${font}pt`,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.code}</div>
          )}
          {opts.showName && it.name && (
            <div style={{ fontSize: `${font * 0.85}pt`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.name}</div>
          )}
          {opts.showPrice && it.price != null && it.price > 0 && (
            <div style={{ fontSize: `${font}pt`, fontWeight: 600 }}>฿{Number(it.price).toLocaleString("th-TH")}</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function BarcodeLabelsPrintPage() {
  const [payload, setPayload] = useState<PrintPayload | null>(null);
  const [missing, setMissing] = useState(false);
  const [qrMap, setQrMap] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PRINT_PAYLOAD_KEY);
      if (!raw) { setMissing(true); return; }
      setPayload(JSON.parse(raw) as PrintPayload);
    } catch { setMissing(true); }
  }, []);

  useEffect(() => {
    if (!payload || !payload.opts.showQR) return;
    const o = payload.opts;
    // key = ค่า + โลโก้ (โหมดแบรนด์ = โลโก้ต่างกันต่อดวง) — สร้างครั้งเดียวต่อ key
    const jobs = new Map<string, { text: string; logo: string | null }>();
    for (const it of payload.items) {
      const text = it.barcode || it.code;
      const logo = logoForItem(it, o);
      jobs.set(`${text}|${logo ?? ""}`, { text, logo });
    }
    let cancelled = false;
    (async () => {
      const map: Record<string, string> = {};
      for (const [key, j] of jobs) map[key] = await makeQR(j.text, j.logo, o.codeColor);
      if (!cancelled) setQrMap(map);
    })();
    return () => { cancelled = true; };
  }, [payload]);

  const labels = useMemo(() => {
    if (!payload) return [];
    const out: PrintItem[] = [];
    for (const it of payload.items) {
      const q = Math.max(1, Math.min(999, Math.floor(it.qty || 1)));
      for (let i = 0; i < q && out.length < MAX_LABELS; i++) out.push(it);
    }
    return out;
  }, [payload]);

  if (missing) return <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>ไม่พบข้อมูลสำหรับพิมพ์ — กรุณากลับไปเลือกสินค้าแล้วกด “พิมพ์บาร์โค้ด” ใหม่</div>;
  if (!payload) return <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>กำลังเตรียม…</div>;

  const opts = payload.opts;
  const custom = opts.custom;
  const capped = labels.length >= MAX_LABELS;
  const qrOf = (it: PrintItem) => qrMap[`${it.barcode || it.code}|${logoForItem(it, opts) ?? ""}`];

  // ── เลย์เอาต์กำหนดเอง ──
  let body: ReactNode;
  let pageCss: string;
  let sheetCount = 0;

  if (custom) {
    const { codeH, font } = autoCodeMetrics(custom.labelH);
    const cols = Math.max(1, Math.floor(custom.cols));
    if (custom.mode === "roll") {
      // Roll: หน้าเดียวต่อเนื่อง — กว้าง = rollWidth, สูง = พอดีเนื้อหา
      // ⚠️ ต้องระบุความสูงเป็นตัวเลขจริง (ไม่ใช่ auto) ไม่งั้น Chrome ทิ้ง @page แล้วเด้งเป็น A4 (กว้างเกิน + เกินหน้า)
      const nRows = Math.ceil(labels.length / cols) || 1;
      const totalH = custom.mTop + custom.mBottom + nRows * custom.labelH + Math.max(0, nRows - 1) * custom.gapY;
      pageCss = `@page { size: ${custom.rollWidth}mm ${totalH}mm; margin: 0; }`;
      body = (
        <div className="rollsheet" style={{ width: `${custom.rollWidth}mm`, height: `${totalH}mm`, overflow: "hidden",
          paddingTop: `${custom.mTop}mm`, paddingBottom: `${custom.mBottom}mm`, paddingLeft: `${custom.mLeft}mm`, paddingRight: `${custom.mRight}mm`,
          boxSizing: "border-box" }}>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, ${custom.labelW}mm)`,
            gridAutoRows: `${custom.labelH}mm`, columnGap: `${custom.gapX}mm`, rowGap: `${custom.gapY}mm`, justifyContent: "center" }}>
            {labels.map((it, li) => <Label key={li} it={it} opts={opts} codeH={codeH} font={font} qr={qrOf(it)} />)}
          </div>
        </div>
      );
      sheetCount = 1;
    } else {
      // A4 กำหนดขนาดสติ๊กเกอร์เอง — คำนวณจำนวนแถวต่อแผ่นจากพื้นที่ที่เหลือ
      const availH = 297 - custom.mTop - custom.mBottom;
      const rowsPerPage = Math.max(1, Math.floor((availH + custom.gapY) / (custom.labelH + custom.gapY)));
      const perPage = cols * rowsPerPage;
      const pages: PrintItem[][] = [];
      for (let i = 0; i < labels.length; i += perPage) pages.push(labels.slice(i, i + perPage));
      sheetCount = pages.length;
      pageCss = `@page { size: A4; margin: 0; }`;
      body = <>{pages.map((pg, pi) => (
        <div key={pi} className="sheet" style={{ width: "210mm", height: "297mm",
          paddingTop: `${custom.mTop}mm`, paddingBottom: `${custom.mBottom}mm`, paddingLeft: `${custom.mLeft}mm`, paddingRight: `${custom.mRight}mm`,
          boxSizing: "border-box" }}>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, ${custom.labelW}mm)`,
            gridAutoRows: `${custom.labelH}mm`, columnGap: `${custom.gapX}mm`, rowGap: `${custom.gapY}mm`, justifyContent: "center" }}>
            {pg.map((it, li) => <Label key={li} it={it} opts={opts} codeH={codeH} font={font} qr={qrOf(it)} />)}
          </div>
        </div>
      ))}</>;
    }
  } else {
    // ── เลย์เอาต์สำเร็จรูป A4 (เฟส 1) — ช่องเท่า ๆ กัน ──
    const preset = getPreset(opts.preset);
    const perPage = preset.cols * preset.rows;
    const pages: PrintItem[][] = [];
    for (let i = 0; i < labels.length; i += perPage) pages.push(labels.slice(i, i + perPage));
    sheetCount = pages.length;
    pageCss = `@page { size: A4; margin: 0; }`;
    body = <>{pages.map((pg, pi) => (
      <div key={pi} className="sheet" style={{ width: "210mm", height: "297mm", padding: `${preset.margin}mm`, boxSizing: "border-box" }}>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${preset.cols}, 1fr)`, gridTemplateRows: `repeat(${preset.rows}, 1fr)`,
          gap: `${preset.gap}mm`, width: "100%", height: "100%" }}>
          {pg.map((it, li) => <Label key={li} it={it} opts={opts} codeH={preset.codeH} font={preset.font} qr={qrOf(it)} />)}
        </div>
      </div>
    ))}</>;
  }

  return (
    <div>
      <style>{`
        ${pageCss}
        @media print {
          .no-print { display: none !important; }
          .sheet { page-break-after: always; }          /* A4 หลายแผ่น = ขึ้นหน้าใหม่ */
          .rollsheet { page-break-after: avoid; }        /* Roll = หน้าเดียวต่อเนื่อง ไม่ต้องขึ้นหน้าใหม่ */
        }
        html, body { background: #f1f5f9; }
        .sheet, .rollsheet { background: #fff; margin: 0 auto 8mm; box-shadow: 0 1px 6px rgba(0,0,0,.12); }
        @media print {
          html, body { background: #fff; }
          .sheet, .rollsheet { box-shadow: none; margin: 0; }
        }
      `}</style>

      <div className="no-print" style={{ position: "sticky", top: 0, zIndex: 10, background: "#fff", borderBottom: "1px solid #e2e8f0",
        padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 15 }}>🏷️ พิมพ์บาร์โค้ด</strong>
        <span style={{ color: "#64748b", fontSize: 13 }}>
          {labels.length.toLocaleString("th-TH")} ดวง · {custom?.mode === "roll" ? "โหมด Roll (ต่อเนื่อง)" : `${sheetCount} แผ่น`}
        </span>
        {capped && <span style={{ color: "#b45309", fontSize: 12 }}>⚠️ เกิน {MAX_LABELS} ดวง — พิมพ์แค่ {MAX_LABELS} ดวงแรก</span>}
        <div style={{ flex: 1 }} />
        <button onClick={() => window.print()} style={{ height: 34, padding: "0 16px", background: "#4f46e5", color: "#fff",
          border: "none", borderRadius: 8, fontSize: 14, cursor: "pointer" }}>🖨️ พิมพ์ / บันทึก PDF</button>
      </div>

      <div style={{ padding: "12px 0" }}>{body}</div>
    </div>
  );
}
