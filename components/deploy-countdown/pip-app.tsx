"use client";

/**
 * ตัวนับถอยหลังขึ้นเว็บแบบ "ลอยค้างข้ามหน้า" — เปิดจากเมนูโปรไฟล์ (เจ้าของขอ 2026-11-11 "อยากให้เปิดจาก profile menu ได้")
 *   ต่างจากปุ่มในหน้า /admin/deploy (ผูกกับหน้า ออกจากหน้า = ปิด): ที่นี่วาด React แยกลงหน้าต่างลอยเอง (createRoot)
 *   → เปลี่ยนหน้าในแท็บเดียวกันได้ หน้าต่างยังอยู่ · ปิดเมื่อกดปิด/ปิดแท็บ/รีเฟรช
 *   ไฟล์นี้โหลดตอนกดเท่านั้น (import() จากเมนู) — ไม่เพิ่มน้ำหนักทุกหน้า
 */
import { createRoot } from "react-dom/client";
import { DeployMiniPanel, useDeployStatus, useNow } from "@/components/deploy-countdown";

function DeployPipApp({ win }: { win: Window }) {
  const { status, error, reload } = useDeployStatus(true, win);
  const now = useNow(1000, win);
  return <DeployMiniPanel status={status} error={error} now={now} win={win} onDeployed={() => void reload()} />;
}

/** วาดตัวนับถอยหลังลงหน้าต่างลอยที่เปิดไว้แล้ว (openPipWindow) */
export function mountDeployCountdownPip(win: Window) {
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  root.render(<DeployPipApp win={win} />);
  win.addEventListener("pagehide", () => root.unmount(), { once: true });
}
