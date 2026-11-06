/**
 * แอปหน้าเดียว /solo/<path> — ตั้งชื่อแท็บ + ไอคอน + สีธีม + ผูก manifest ของหน้านั้น (ติดตั้งเป็นแอปแยกได้)
 * กติกา lib/solo-page.ts · เชลล์ ./solo-shell.tsx
 */
import type { Metadata, Viewport } from "next";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { pagePathFromSegments } from "@/lib/solo-page";
import { loadSoloPageInfo } from "@/lib/solo-page-server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ path: string[] }> };

async function info(path: string[]) {
  const pagePath = pagePathFromSegments(path);
  if (!pagePath) return null;
  try { return { pagePath, ...(await loadSoloPageInfo(supabaseAdmin(), pagePath)) }; } catch { return null; }
}

export async function generateViewport({ params }: Params): Promise<Viewport> {
  const i = await info((await params).path);
  return { themeColor: i?.theme ?? "#2563eb" };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const i = await info((await params).path);
  if (!i) return { title: "ERP" };
  const v = i.version ? `&v=${encodeURIComponent(i.version)}` : "";   // ไอคอนที่ตั้งเอง: เปลี่ยนแล้วที่อยู่รูปเปลี่ยน
  const icon = `/api/page-icon${i.pagePath}?s=192${v}`;
  return {
    title: i.label,
    manifest: `/api/page-manifest${i.pagePath}`,
    icons: { icon, shortcut: icon, apple: `/api/page-icon${i.pagePath}?s=512${v}` },
    appleWebApp: { capable: true, statusBarStyle: "default", title: i.label },
  };
}

export default function SoloLayout({ children }: { children: React.ReactNode }) {
  return children;
}
