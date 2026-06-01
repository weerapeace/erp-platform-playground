"use client";

/**
 * Admin Schema Sync — page entry (client-only wrapper)
 *
 * F20: โหลด SchemaSyncClient ผ่าน next/dynamic ssr:false
 * → Worker ไม่ต้อง SSR หน้าหนัก (dnd-kit + 60 fields + condition editor)
 * → กัน Error 1102 (Worker exceeded resource limits ตอน render)
 */

import dynamic from "next/dynamic";

const SchemaSyncClient = dynamic(
  () => import("./schema-sync-client").then((m) => m.SchemaSyncClient),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

export default function SchemaSyncAdminPage() {
  return <SchemaSyncClient />;
}
