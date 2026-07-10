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
  getPreset, autoCodeMetrics, DEFAULT_CUSTOM, LABEL_PRESETS, PRINT_PAYLOAD_KEY, MAX_LABELS,
  type PrintPayload, type PrintItem, type PrintOpts, type CustomLayout,
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

  // สร้าง QR ใหม่เฉพาะเมื่อค่าที่เกี่ยว QR เปลี่ยน (ปรับ layout/จูนตำแหน่ง จะไม่ต้อง regen)
  const qrDepKey = payload
    ? [payload.opts.showQR, payload.opts.logoMode, payload.opts.logo, payload.opts.codeColor,
       ...payload.items.map((i) => `${i.barcode || i.code}~${i.brandLogo ?? ""}`)].join("|")
    : "";
  useEffect(() => {
    if (!payload || !payload.opts.showQR) return;
    const o = payload.opts;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrDepKey]);

  // จำค่าที่แก้ (เผื่อ refresh) — เขียนกลับ sessionStorage
  useEffect(() => {
    if (payload) { try { sessionStorage.setItem(PRINT_PAYLOAD_KEY, JSON.stringify(payload)); } catch { /* ignore */ } }
  }, [payload]);

  const [showSettings, setShowSettings] = useState(false);
  const updateOpts = (patch: Partial<PrintOpts>) => setPayload((p) => (p ? { ...p, opts: { ...p.opts, ...patch } } : p));
  const updateCustom = (patch: Partial<CustomLayout>) =>
    setPayload((p) => (p ? { ...p, opts: { ...p.opts, custom: { ...(p.opts.custom ?? DEFAULT_CUSTOM), ...patch } } } : p));

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
    const offX = custom.offsetX ?? 0;   // จูนตำแหน่ง (mm) +ขวา -ซ้าย
    const offY = custom.offsetY ?? 0;   // +ลง -ขึ้น
    if (custom.mode === "roll" && (custom.rollSplit ?? "row") === "row") {
      // Roll แยกทีละแถว — แต่ละแถว (cols ดวง) = 1 หน้า สูง = "ระยะพิทช์" (labelH + ช่องไฟแนวตั้ง)
      // = ระยะเลื่อนกระดาษ 1 ดวงพอดี → ไม่มีดริฟต์สะสม, ตรงรอยตัดทุกดวง
      const pitchY = custom.labelH + custom.gapY;
      pageCss = `@page { size: ${custom.rollWidth}mm ${pitchY}mm; margin: 0; }`;
      const rowsArr: PrintItem[][] = [];
      for (let i = 0; i < labels.length; i += cols) rowsArr.push(labels.slice(i, i + cols));
      sheetCount = rowsArr.length;
      body = <>{rowsArr.map((row, ri) => (
        <div key={ri} className="rollpage" style={{ width: `${custom.rollWidth}mm`, height: `${pitchY}mm`, overflow: "hidden",
          paddingLeft: `${custom.mLeft + offX}mm`, paddingTop: `${custom.mTop + offY}mm`, boxSizing: "border-box" }}>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, ${custom.labelW}mm)`, height: `${custom.labelH}mm`,
            columnGap: `${custom.gapX}mm`, justifyContent: "start" }}>
            {row.map((it, li) => <Label key={li} it={it} opts={opts} codeH={codeH} font={font} qr={qrOf(it)} />)}
          </div>
        </div>
      ))}</>;
    } else if (custom.mode === "roll") {
      // Roll หน้าเดียวต่อเนื่อง — กว้าง = rollWidth, สูง = พอดีเนื้อหา
      // ⚠️ ต้องระบุความสูงเป็นตัวเลขจริง (ไม่ใช่ auto) ไม่งั้น Chrome ทิ้ง @page แล้วเด้งเป็น A4 (กว้างเกิน + เกินหน้า)
      const nRows = Math.ceil(labels.length / cols) || 1;
      const totalH = custom.mTop + custom.mBottom + nRows * custom.labelH + Math.max(0, nRows - 1) * custom.gapY;
      pageCss = `@page { size: ${custom.rollWidth}mm ${totalH}mm; margin: 0; }`;
      body = (
        <div className="rollsheet" style={{ width: `${custom.rollWidth}mm`, height: `${totalH}mm`, overflow: "hidden",
          paddingLeft: `${custom.mLeft + offX}mm`, paddingRight: `${custom.mRight}mm`, paddingTop: `${custom.mTop + offY}mm`, paddingBottom: `${custom.mBottom}mm`,
          boxSizing: "border-box" }}>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, ${custom.labelW}mm)`,
            gridAutoRows: `${custom.labelH}mm`, columnGap: `${custom.gapX}mm`, rowGap: `${custom.gapY}mm`, justifyContent: "start" }}>
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
          paddingTop: `${custom.mTop + offY}mm`, paddingBottom: `${custom.mBottom}mm`, paddingLeft: `${custom.mLeft + offX}mm`, paddingRight: `${custom.mRight}mm`,
          boxSizing: "border-box" }}>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, ${custom.labelW}mm)`,
            gridAutoRows: `${custom.labelH}mm`, columnGap: `${custom.gapX}mm`, rowGap: `${custom.gapY}mm`, justifyContent: "start" }}>
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

  // ── ตัวช่วย UI ของ panel ตั้งค่า (inline style ให้เข้ากับหน้าพิมพ์) ──
  const inputStyle = { height: 30, padding: "0 8px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13, width: 88 } as const;
  const numF = (label: string, value: number, on: (v: number) => void, hi?: boolean) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12 }}>
      <span style={{ color: hi ? "#4f46e5" : "#64748b", fontWeight: hi ? 600 : 400 }}>{label}</span>
      <input type="number" step={0.5} value={value} onChange={(e) => on(Number(e.target.value))} style={inputStyle} />
    </label>
  );
  const chkF = (label: string, val: boolean, on: (v: boolean) => void) => (
    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#334155", cursor: "pointer" }}>
      <input type="checkbox" checked={val} onChange={(e) => on(e.target.checked)} /> {label}
    </label>
  );
  const segStyle = (active: boolean) => ({ height: 28, padding: "0 10px", fontSize: 12, borderRadius: 6,
    border: "1px solid #e2e8f0", background: active ? "#eef2ff" : "#fff", color: active ? "#4338ca" : "#64748b", cursor: "pointer" } as const);

  return (
    <div>
      <style>{`
        ${pageCss}
        @media print {
          .no-print { display: none !important; }
          .sheet { page-break-after: always; }          /* A4 หลายแผ่น = ขึ้นหน้าใหม่ */
          .rollpage { page-break-after: always; }        /* Roll แยกทีละแถว = แต่ละแถวขึ้นหน้าใหม่ */
          .rollsheet { page-break-after: avoid; }        /* Roll ต่อเนื่อง = หน้าเดียว */
        }
        html, body { background: #f1f5f9; }
        .sheet, .rollsheet, .rollpage { background: #fff; margin: 0 auto 8mm; box-shadow: 0 1px 6px rgba(0,0,0,.12); }
        @media print {
          html, body { background: #fff; }
          .sheet, .rollsheet, .rollpage { box-shadow: none; margin: 0; }
        }
      `}</style>

      <div className="no-print" style={{ position: "sticky", top: 0, zIndex: 10, background: "#fff", borderBottom: "1px solid #e2e8f0",
        padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 15 }}>🏷️ พิมพ์บาร์โค้ด</strong>
        <span style={{ color: "#64748b", fontSize: 13 }}>
          {labels.length.toLocaleString("th-TH")} ดวง · {custom?.mode === "roll"
            ? ((custom.rollSplit ?? "row") === "row" ? `${sheetCount} แถว (Roll)` : "Roll ต่อเนื่อง (1 หน้ายาว)")
            : `${sheetCount} แผ่น`}
        </span>
        {capped && <span style={{ color: "#b45309", fontSize: 12 }}>⚠️ เกิน {MAX_LABELS} ดวง — พิมพ์แค่ {MAX_LABELS} ดวงแรก</span>}
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowSettings((s) => !s)} style={{ height: 34, padding: "0 14px",
          background: showSettings ? "#eef2ff" : "#fff", color: showSettings ? "#4338ca" : "#475569",
          border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 14, cursor: "pointer" }}>⚙️ ตั้งค่า</button>
        <button onClick={() => window.print()} style={{ height: 34, padding: "0 16px", background: "#4f46e5", color: "#fff",
          border: "none", borderRadius: 8, fontSize: 14, cursor: "pointer" }}>🖨️ พิมพ์ / บันทึก PDF</button>
      </div>

      {showSettings && (
        <div className="no-print" style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "12px 16px",
          display: "flex", flexDirection: "column", gap: 12 }}>
          {/* แสดงอะไร + สี */}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <strong style={{ fontSize: 12, color: "#94a3b8" }}>แสดง</strong>
            {chkF("QR", opts.showQR, (v) => updateOpts({ showQR: v }))}
            {chkF("บาร์โค้ด", opts.showBarcode, (v) => updateOpts({ showBarcode: v }))}
            {chkF("รหัส", opts.showCode, (v) => updateOpts({ showCode: v }))}
            {chkF("ชื่อ", opts.showName, (v) => updateOpts({ showName: v }))}
            {chkF("ราคา", opts.showPrice, (v) => updateOpts({ showPrice: v }))}
            {chkF("เส้นตัด", opts.showBorder, (v) => updateOpts({ showBorder: v }))}
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#334155" }}>สีโค้ด
              <input type="color" value={opts.codeColor} onChange={(e) => updateOpts({ codeColor: e.target.value })} style={{ width: 34, height: 26, cursor: "pointer" }} />
            </label>
          </div>
          {custom ? (
            <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                {numF("กว้าง (mm)", custom.labelW, (v) => updateCustom({ labelW: v }))}
                {numF("สูง (mm)", custom.labelH, (v) => updateCustom({ labelH: v }))}
                {numF("ต่อแถว", custom.cols, (v) => updateCustom({ cols: Math.max(1, Math.floor(v)) }))}
                {numF("ช่องไฟ นอน", custom.gapX, (v) => updateCustom({ gapX: v }))}
                {numF("ช่องไฟ ตั้ง", custom.gapY, (v) => updateCustom({ gapY: v }))}
                {numF("ขอบซ้าย", custom.mLeft, (v) => updateCustom({ mLeft: v }))}
                {numF("ขอบบน", custom.mTop, (v) => updateCustom({ mTop: v }))}
                {custom.mode === "roll" && numF("กว้าง Roll", custom.rollWidth, (v) => updateCustom({ rollWidth: v }))}
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                {numF("🎯 เลื่อน X (+ขวา −ซ้าย)", custom.offsetX ?? 0, (v) => updateCustom({ offsetX: v }), true)}
                {numF("🎯 เลื่อน Y (+ลง −ขึ้น)", custom.offsetY ?? 0, (v) => updateCustom({ offsetY: v }), true)}
                {custom.mode === "roll" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 12, color: "#64748b" }}>พิมพ์แบบ</span>
                    <button onClick={() => updateCustom({ rollSplit: "row" })} style={segStyle((custom.rollSplit ?? "row") === "row")}>แยกทีละแถว</button>
                    <button onClick={() => updateCustom({ rollSplit: "continuous" })} style={segStyle(custom.rollSplit === "continuous")}>ต่อเนื่อง</button>
                  </div>
                )}
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>💡 แก้แล้วพรีวิวเปลี่ยนทันที · ปรับ 🎯 จูนตำแหน่ง ทีละ 0.5–1mm ให้ตรงรอยตัด แล้วกดพิมพ์</div>
            </>
          ) : (
            <label style={{ fontSize: 13, color: "#334155", display: "flex", alignItems: "center", gap: 8 }}>เลย์เอาต์
              <select value={opts.preset} onChange={(e) => updateOpts({ preset: e.target.value })} style={{ ...inputStyle, width: "auto" }}>
                {LABEL_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </label>
          )}
        </div>
      )}

      <div style={{ padding: "12px 0" }}>{body}</div>
    </div>
  );
}
