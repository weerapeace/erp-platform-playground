import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth";
import { ToastProvider } from "@/components/toast";
import { LanguageProvider } from "@/components/i18n";
import { BRAND } from "@/components/brand";

export const metadata: Metadata = {
  title: {
    default:  `${BRAND.name} — Playground`,
    template: `%s · ${BRAND.name}`,
  },
  description: BRAND.description,
  applicationName: BRAND.name,
  keywords: ["ERP", "ระบบบริหารองค์กร", "Purchase Request", "Sales Order", "Inventory", "Workflow"],
  authors: [{ name: BRAND.name }],
  openGraph: {
    title:       BRAND.name,
    description: BRAND.description,
    type:        "website",
    locale:      "th_TH",
    siteName:    BRAND.name,
  },
  robots: {
    index:  false,                  // playground — ไม่ index
    follow: false,
  },
  // PWA — เปิดเต็มจอเมื่อ "Add to Home Screen" บน iOS/Android
  appleWebApp: { capable: true, title: "โอนเงินจีน", statusBarStyle: "default" },
  // icon.tsx จัดการ favicon เอง — ไม่ต้องระบุ icons
};

export const viewport: Viewport = {
  themeColor: BRAND.primary,
  width:      "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className="bg-slate-50 text-slate-900 antialiased">
        <AuthProvider><LanguageProvider><ToastProvider>{children}</ToastProvider></LanguageProvider></AuthProvider>
      </body>
    </html>
  );
}
