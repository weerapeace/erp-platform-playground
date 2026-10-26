// /goals — ตัวหน้าอยู่ใน view.tsx · ไฟล์นี้ผูก manifest ของแอป "เป้าหมาย" (ดู pwa-metadata.ts)
import { goalsPageMetadata } from "./pwa-metadata";
import GoalsListPage from "./view";

export const metadata = goalsPageMetadata;

export default function Page() {
  return <GoalsListPage />;
}
