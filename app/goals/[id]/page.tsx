// /goals/[id] — ตัวหน้าอยู่ใน view.tsx · ไฟล์นี้ผูก manifest ของแอป "เป้าหมาย" (ดู ../pwa-metadata.ts)
import { goalsPageMetadata } from "../pwa-metadata";
import GoalDetailPage from "./view";

export const metadata = goalsPageMetadata;

export default function Page() {
  return <GoalDetailPage />;
}
