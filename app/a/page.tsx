"use client";

// Endpoint ของ LIFF (/a) — ?join= = สมัครรับสลิปด้วยบัตร QR · นอกนั้น = หน้าอนุมัติเล็ก (อ่าน token จาก ?token= หรือ liff.state)
import { useEffect, useState } from "react";
import { liffParam } from "@/lib/liff-client";
import { ApproveView } from "./approve-view";
import { JoinView } from "./join-view";

export default function ApprovePage() {
  const [join, setJoin] = useState<string | null>(null);
  useEffect(() => { setJoin(liffParam("join")); }, []);
  if (join === null) return null;
  return join ? <JoinView token={join} /> : <ApproveView />;
}
