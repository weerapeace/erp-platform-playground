"use client";

// Endpoint ของ LIFF (/a) — ?cq= = สแกน QR ไลน์บริษัท · ?join= = สมัครรับสลิปด้วยบัตร QR · นอกนั้น = หน้าอนุมัติเล็ก (อ่าน token จาก ?token= หรือ liff.state)
import { useEffect, useState } from "react";
import { liffParam } from "@/lib/liff-client";
import { ApproveView } from "./approve-view";
import { CompanyQrView } from "./company-qr-view";
import { JoinView } from "./join-view";

export default function ApprovePage() {
  const [p, setP] = useState<{ join: string; cq: string } | null>(null);
  useEffect(() => { setP({ join: liffParam("join"), cq: liffParam("cq") }); }, []);
  if (p === null) return null;
  if (p.cq) return <CompanyQrView code={p.cq} />;
  return p.join ? <JoinView token={p.join} /> : <ApproveView />;
}
