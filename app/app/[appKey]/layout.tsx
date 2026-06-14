/**
 * Layout ต่อแอป (standalone) — /app/<appKey>
 *
 * ตั้ง "แบรนด์ต่อแอป" ฝั่ง server: ชื่อแท็บ + ไอคอน favicon/apple + สีธีม + ผูก manifest
 * ของแอปนั้น เพื่อให้ติดตั้งเป็นแอปเดี่ยว (PWA) มีไอคอน/ชื่อของตัวเอง
 */
import type { Metadata, Viewport } from "next";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const SAFE_KEY = /^[a-zA-Z0-9._/-]+$/;

async function loadApp(appKey: string) {
  if (!/^[a-z][a-z0-9_-]{0,30}$/.test(appKey)) return null;
  const { data } = await supabaseAdmin()
    .from("erp_app_groups")
    .select("key, label, icon_url, theme_color")
    .eq("key", appKey)
    .maybeSingle();
  return data as { key: string; label: string; icon_url: string | null; theme_color: string | null } | null;
}

export async function generateViewport({ params }: { params: Promise<{ appKey: string }> }): Promise<Viewport> {
  const { appKey } = await params;
  const app = await loadApp(appKey);
  return { themeColor: app?.theme_color || "#2563eb" };
}

export async function generateMetadata({ params }: { params: Promise<{ appKey: string }> }): Promise<Metadata> {
  const { appKey } = await params;
  const app = await loadApp(appKey);
  const iconSrc =
    app?.icon_url && SAFE_KEY.test(app.icon_url)
      ? `/api/r2-image?key=${encodeURIComponent(app.icon_url)}`
      : "/icon-192.png";
  return {
    title: app?.label || "ERP",
    manifest: `/api/app-manifest/${appKey}`,
    icons: { icon: iconSrc, shortcut: iconSrc, apple: iconSrc },
    appleWebApp: { capable: true, statusBarStyle: "default", title: app?.label || "ERP" },
  };
}

export default function AppKeyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
