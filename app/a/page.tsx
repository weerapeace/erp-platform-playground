"use client";

// Endpoint ของ LIFF (/a) — ?me= = หน้าเล็กพนักงาน (payslip/warning/piecework) หรือลูกค้า (orders/schedule) · ?cq= = สแกน QR ไลน์บริษัท · ?join= = สมัครรับสลิปด้วยบัตร QR · นอกนั้น = หน้าอนุมัติเล็ก (อ่าน token จาก ?token= หรือ liff.state)
import { useEffect, useState } from "react";
import { liffParam } from "@/lib/liff-client";
import { isLineSelfPage } from "@/lib/line-self-view";
import { isLineCustomerPage } from "@/lib/line-customer-view";
import { ApproveView } from "./approve-view";
import { CompanyQrView } from "./company-qr-view";
import { CustomerView } from "./customer-view";
import { JoinView } from "./join-view";
import { SelfView } from "./self-view";

export default function ApprovePage() {
  const [p, setP] = useState<{ join: string; cq: string; me: string } | null>(null);
  useEffect(() => { setP({ join: liffParam("join"), cq: liffParam("cq"), me: liffParam("me") }); }, []);
  if (p === null) return null;
  if (isLineSelfPage(p.me)) return <SelfView initial={p.me} />;
  if (isLineCustomerPage(p.me)) return <CustomerView initial={p.me} />;
  if (p.cq) return <CompanyQrView code={p.cq} />;
  return p.join ? <JoinView token={p.join} /> : <ApproveView />;
}
