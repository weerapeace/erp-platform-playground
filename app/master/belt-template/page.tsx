"use client";

/**
 * หน้าโหลด "เทมเพลตรูปส่วนประกอบเข็มขัด" — กรอบมาตรฐาน 1000×185 px
 * ใช้วาดรูป ปลายหาง/รูเข็มขัด/โลโก้ บนกรอบเดียวกัน → ซ้อนในใบงานพอดีอัตโนมัติ
 * โหลดได้ทั้ง SVG (แก้ได้) และ PNG (วาดทับ) — PNG เรนเดอร์จาก SVG ฝั่ง client
 */
import { useCallback } from "react";

const W = 1000, H = 185;
const TEMPLATE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect x="1" y="1" width="998" height="183" fill="none" stroke="#e2e8f0" stroke-width="2"/>
  <path d="M40,45 H840 L930,80 Q945,92 930,105 L840,140 H40 Z" fill="none" stroke="#94a3b8" stroke-width="2"/>
  <line x1="520" y1="20" x2="520" y2="165" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="5 5"/>
  <text x="40" y="22" font-family="sans-serif" font-size="12" fill="#94a3b8">เทมเพลตเข็มขัด 1000 × 185 px — วาดทับเส้นไกด์ · พื้นหลังโปร่งใส · export PNG</text>
  <text x="120" y="178" font-family="sans-serif" font-size="11" fill="#cbd5e1">โซนรู / ลายพิมพ์ (ซ้าย)</text>
  <text x="640" y="178" font-family="sans-serif" font-size="11" fill="#cbd5e1">โซนโลโก้ (ขวา)</text>
</svg>`;

function triggerDownload(href: string, name: string) {
  const a = document.createElement("a");
  a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove();
}

export default function BeltTemplatePage() {
  const downloadSvg = useCallback(() => {
    const url = URL.createObjectURL(new Blob([TEMPLATE_SVG], { type: "image/svg+xml" }));
    triggerDownload(url, "belt-template-1000x185.svg");
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);

  const downloadPng = useCallback(() => {
    const svgUrl = URL.createObjectURL(new Blob([TEMPLATE_SVG], { type: "image/svg+xml" }));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.drawImage(img, 0, 0, W, H);
      canvas.toBlob((png) => {
        if (!png) return;
        const url = URL.createObjectURL(png);
        triggerDownload(url, "belt-template-1000x185.png");
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, "image/png");
      URL.revokeObjectURL(svgUrl);
    };
    img.src = svgUrl;
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-xl font-bold text-slate-800">🧷 เทมเพลตรูปส่วนประกอบเข็มขัด</h1>
      <p className="mt-1 text-sm text-slate-500">กรอบมาตรฐาน <b>1000 × 185 px</b> — วาด ปลายหาง / รูเข็มขัด / โลโก้ บนกรอบนี้เหมือนกันหมด → ซ้อนในใบงานพอดีอัตโนมัติ</p>

      <div className="mt-4 flex gap-2">
        <button onClick={downloadPng} className="h-9 rounded-lg bg-amber-600 px-5 text-sm font-medium text-white hover:bg-amber-700">⬇️ ดาวน์โหลด PNG</button>
        <button onClick={downloadSvg} className="h-9 rounded-lg border border-slate-200 bg-white px-5 text-sm font-medium text-slate-700 hover:bg-slate-50">⬇️ ดาวน์โหลด SVG (แก้ได้)</button>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
        <div className="w-full" dangerouslySetInnerHTML={{ __html: TEMPLATE_SVG.replace("width=\"1000\" height=\"185\"", "width=\"100%\"") }} />
      </div>

      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="font-semibold">วิธีใช้ (สำคัญ)</div>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          <li>วาดรูปจริง (เส้นดำ) <b>ทับเส้นไกด์เทา</b> — ปลายหาง=เส้นขอบ+ทรง · รู/ลาย=โซนซ้าย · โลโก้=โซนขวา</li>
          <li><b>พื้นหลังโปร่งใสเสมอ</b> — ห้ามถมขาว / ห้ามทำกรอบทึบรอบ (สาเหตุที่รูปพิมพ์บันไดเพี้ยน)</li>
          <li><b>ลบเส้นไกด์เทา + ตัวหนังสือออกก่อน</b> export (ถ้าใช้ PNG ให้วางเทมเพลตเป็นเลเยอร์อ้างอิง แล้วซ่อน/ลบก่อนเซฟ)</li>
          <li>เซฟเป็น PNG ขนาด 1000×185 พื้นหลังโปร่ง → อัปขึ้นตาราง belt_tails / belt_hole / belt_logo</li>
        </ol>
      </div>
    </div>
  );
}
