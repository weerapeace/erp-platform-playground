/**
 * Web App Manifest ต่อแอป (PWA) — /api/app-manifest/<appKey>
 *
 * คืน manifest เฉพาะของ "โมดูลใหญ่ (App)" หนึ่งตัว เพื่อให้ติดตั้งเป็นแอปเดี่ยวบนเครื่อง
 * (มีไอคอน/ชื่อ/สีของตัวเอง · เปิดเข้า /app/<appKey> แบบ standalone เห็นแค่โมดูลนั้น)
 *
 * - สาธารณะ (ไม่ต้อง auth) — เบราว์เซอร์/OS ต้องดึง manifest + ไอคอนได้ตอนติดตั้ง
 * - ไอคอนรูปจริงเก็บใน R2 (erp_app_groups.icon_url = r2_key) เสิร์ฟผ่าน /api/r2-image
 * - ไม่มีไอคอน/สี → ใช้ค่า default (ไอคอนรวมของระบบ)
 * - แอปเดี่ยวที่มีหน้าของตัวเอง (lib/app-branding STANDALONE_APPS เช่น notify) → ชื่อ/ที่อยู่จากทะเบียน
 *   ไอคอนจาก /api/app-icon/<key> (เปลี่ยนได้ด้วย AppIconEditButton)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { STANDALONE_APPS, appIconUrl } from "@/lib/app-branding";
import { getAppBranding } from "@/lib/app-branding-server";

const MANIFEST_HEADERS = { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "public, max-age=60" };

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_THEME = "#2563eb";
const SAFE_KEY = /^[a-zA-Z0-9._/-]+$/;

function iconType(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "svg") return "image/svg+xml";
  return "image/png";
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ appKey: string }> },
): Promise<NextResponse> {
  const { appKey } = await params;
  if (!appKey || !/^[a-z][a-z0-9_-]{0,30}$/.test(appKey)) {
    return NextResponse.json({ error: "invalid appKey" }, { status: 400 });
  }

  const standalone = STANDALONE_APPS[appKey];
  if (standalone) {
    const { version } = await getAppBranding(supabaseAdmin(), appKey);
    return new NextResponse(JSON.stringify({
      id: standalone.startUrl,
      name: standalone.name,
      short_name: standalone.shortName,
      description: standalone.description,
      start_url: standalone.startUrl,
      scope: standalone.scope,
      display: "standalone",
      orientation: "portrait",
      background_color: "#f8fafc",
      theme_color: standalone.themeColor,
      icons: [
        { src: appIconUrl(appKey, 192, version), sizes: "192x192", type: "image/png", purpose: "any" },
        { src: appIconUrl(appKey, 512, version), sizes: "512x512", type: "image/png", purpose: "any" },
        { src: `${appIconUrl(appKey, 512, version)}&m=1`, sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    }), { status: 200, headers: MANIFEST_HEADERS });
  }

  const { data: app } = await supabaseAdmin()
    .from("erp_app_groups")
    .select("key, label, icon, icon_url, theme_color, is_active")
    .eq("key", appKey)
    .maybeSingle();

  const label = (app?.label as string) || "ERP";
  const theme = (app?.theme_color as string) || DEFAULT_THEME;
  const iconUrl = app?.icon_url as string | null;

  // ไอคอน: รูปจริงจาก R2 ถ้ามี ไม่งั้นใช้ไอคอนรวมของระบบ
  // หมายเหตุ: รูปอัปโหลดมีขนาดอิสระ → ประกาศ sizes="any" (ถ้าฟิกซ์เป็น 192/512 แล้วไฟล์จริงไม่ตรง Chrome จะปฏิเสธไอคอน → ตกไปใช้ตัวอักษร)
  const iconSrc = iconUrl ? `/api/r2-image?key=${encodeURIComponent(iconUrl)}` : "";
  const icons =
    iconUrl && SAFE_KEY.test(iconUrl)
      ? [
          { src: iconSrc, sizes: "any", type: iconType(iconUrl), purpose: "any" },
          { src: iconSrc, sizes: "any", type: iconType(iconUrl), purpose: "maskable" },
        ]
      : [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ];

  const manifest = {
    id: `/app/${appKey}`,            // แยกตัวตนแต่ละแอป → ติดตั้งหลายแอปบนเครื่องเดียวได้
    name: label,
    short_name: label.length > 12 ? label.slice(0, 12) : label,
    start_url: `/app/${appKey}`,
    scope: `/app/${appKey}`,
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: theme,
    icons,
  };

  return new NextResponse(JSON.stringify(manifest), {
    status: 200,
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=60",
    },
  });
}
