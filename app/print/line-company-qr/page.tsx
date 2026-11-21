"use client";

/**
 * หน้าพิมพ์โปสเตอร์ QR ไลน์บริษัท (A4 · 1 แผ่นต่อ QR) — เปิดจากศูนย์ LINE › ไลน์บริษัท › QR
 *   /print/line-company-qr?kind=staff|customer|admin   QR โปสเตอร์
 *   /print/line-company-qr?shop=<partner_id>            QR รายร้าน (ให้ร้านนั้นเท่านั้น)
 * ลิงก์ QR มาจาก /api/admin/line-company (สิทธิ์ admin.users) · เปลี่ยน QR ในศูนย์ LINE แล้วแผ่นเก่าใช้ไม่ได้ ต้องพิมพ์ใหม่
 */
import { LoadingState } from "@/components/state-views";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { PrintToolbar } from "@/components/report";
import { apiFetch } from "@/lib/api";
import { docFileName } from "@/lib/print-filename";

type Poster = { kind: string; link: string; shop_name?: string | null };

const COPY: Record<string, { title: string; sub: string; steps: string[]; foot: string }> = {
  staff: {
    title: "พนักงาน · ผูกไลน์บริษัท",
    sub: "ดูเงินเดือน ใบเตือน และงานเหมาของคุณในไลน์",
    steps: ["เปิดแอป LINE แล้วสแกน QR นี้", "กดเพิ่มเพื่อนไลน์บริษัท", "กรอกรหัสพนักงาน + เบอร์โทร", "แจ้งฝ่ายบุคคลให้ยืนยัน แล้วปุ่มเงินเดือนจะเปิด"],
    foot: "ห้ามผูกไลน์แทนคนอื่น · ถ้ามีบัตร QR ส่วนตัวจาก HR ใช้บัตรนั้นได้เลย",
  },
  customer: {
    title: "ลูกค้า · เพิ่มเพื่อนไลน์บริษัท",
    sub: "เช็คสถานะงาน และดูตารางส่งงานได้เองในไลน์",
    steps: ["เปิดแอป LINE แล้วสแกน QR นี้", "กดเพิ่มเพื่อนไลน์บริษัท", "พิมพ์ชื่อร้านของคุณ", "รอพนักงานยืนยัน แล้วเมนูลูกค้าจะขึ้น"],
    foot: "สงสัยอะไร พิมพ์ถามในแชตได้เลย พนักงานจะตอบกลับ",
  },
  admin: {
    title: "แอดมิน · ผูกไลน์บริษัท",
    sub: "เฉพาะผู้ที่มีบัญชี ERP สิทธิ์แอดมิน",
    steps: ["เปิดแอป LINE แล้วสแกน QR นี้", "กดเพิ่มเพื่อนไลน์บริษัท", "เข้าสู่ระบบบัญชี ERP ของคุณ", "เมนูแอดมิน (มีแท็บ) จะขึ้นเอง"],
    foot: "อย่าติดที่สาธารณะ · ไม่มีบัญชี ERP สิทธิ์แอดมิน = สแกนแล้วใช้ไม่ได้",
  },
  shop: {
    title: "ผูกไลน์กับร้านของคุณ",
    sub: "สแกนแล้วดูสถานะงานและตารางส่งงานของร้านได้ทันที",
    steps: ["เปิดแอป LINE แล้วสแกน QR นี้", "กดเพิ่มเพื่อนไลน์บริษัท", "ตรวจชื่อร้านแล้วกดยืนยัน"],
    foot: "QR นี้สำหรับร้านนี้เท่านั้น · อย่าส่งต่อให้คนนอกร้าน",
  },
};

function QrPosterPrint() {
  const params = useSearchParams();
  const kind = params.get("kind") ?? "";
  const shop = params.get("shop") ?? "";
  const [poster, setPoster] = useState<Poster | null>(null);
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let p: Poster;
        if (shop) {
          const r = await apiFetch("/api/admin/line-company", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shop_qr: shop }) });
          const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || "สร้าง QR ไม่สำเร็จ");
          p = { kind: "shop", link: j.link, shop_name: j.shop_name };
        } else {
          const r = await apiFetch("/api/admin/line-company"); const j = await r.json();
          if (!r.ok || j.error) throw new Error(j.error || "โหลดไม่สำเร็จ");
          const q = (j.qr ?? {})[kind] as { link?: string } | undefined;
          if (!q?.link) throw new Error("ไม่รู้จัก QR แบบนี้ — เปิดจากศูนย์ LINE อีกครั้ง");
          p = { kind, link: q.link };
        }
        const data = await QRCode.toDataURL(p.link, { errorCorrectionLevel: "M", margin: 1, width: 900 });
        if (alive) { setPoster(p); setQr(data); }
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
    })();
    return () => { alive = false; };
  }, [kind, shop]);

  if (error) return <div className="p-8 text-sm text-red-600">{error}</div>;
  if (!poster) return <div className="p-8 text-sm text-slate-500">กำลังสร้าง QR...</div>;
  const c = COPY[poster.kind] ?? COPY.customer;

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <PrintToolbar fileName={docFileName("QR ไลน์บริษัท", poster.shop_name || c.title)} />
      <div className="sheet">
        <div className="title">{c.title}</div>
        {poster.shop_name && <div className="shop">{poster.shop_name}</div>}
        <div className="sub">{c.sub}</div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="qr" src={qr} alt="QR ไลน์บริษัท" />
        <ol>{c.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        <div className="foot">{c.foot}</div>
      </div>
      <style>{`
        .sheet { width: 210mm; min-height: 297mm; margin: 12px auto; background: #fff; padding: 18mm 16mm; box-sizing: border-box;
          display: flex; flex-direction: column; align-items: center; color: #111; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
        .sheet .title { font-size: 30pt; font-weight: 700; text-align: center; line-height: 1.2; }
        .sheet .shop { margin-top: 3mm; font-size: 24pt; font-weight: 700; color: #06c755; text-align: center; }
        .sheet .sub { margin-top: 3mm; font-size: 15pt; color: #444; text-align: center; }
        .sheet .qr { margin-top: 10mm; width: 120mm; height: 120mm; }
        .sheet ol { margin: 10mm 0 0; padding-left: 8mm; font-size: 15pt; line-height: 1.7; align-self: stretch; }
        .sheet .foot { margin-top: auto; font-size: 11pt; color: #555; text-align: center; }
        @page { size: A4 portrait; margin: 0; }
        @media print { .no-print { display: none !important; } .sheet { margin: 0; box-shadow: none; } }
      `}</style>
    </div>
  );
}

export default function LineCompanyQrPrintPage() {
  return (
    <Suspense fallback={<LoadingState label="กำลังโหลดหน้าพิมพ์..." boxClassName="p-8 text-sm text-slate-500" />}>
      <QrPosterPrint />
    </Suspense>
  );
}
