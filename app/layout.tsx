import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth";
import { ToastProvider } from "@/components/toast";
import { LanguageProvider } from "@/components/i18n";
import { NavProgress } from "@/components/nav-progress";
import { NavTrailRecorder } from "@/components/nav-trail-recorder";
import { PageViewRecorder } from "@/components/page-view-recorder";
import { BackgroundTasksHost } from "@/components/background-tasks-host";
import { DatePickerOnClick } from "@/components/date-input/auto-picker";
import { WorkPopupHostLazy } from "@/components/work-popup/lazy-host";
import { SilentBoundary } from "@/components/silent-boundary";
import { AppLockGate } from "@/components/app-access-gate";
import { BRAND } from "@/components/brand";
import { SplitScreenHost } from "@/components/split-screen";

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
        <NavProgress />
        <NavTrailRecorder />
        <PageViewRecorder />
        <AuthProvider><LanguageProvider><ToastProvider><SplitScreenHost><AppLockGate>{children}</AppLockGate></SplitScreenHost><SilentBoundary name="work-popup"><WorkPopupHostLazy /></SilentBoundary></ToastProvider></LanguageProvider></AuthProvider>
        <BackgroundTasksHost />
        <DatePickerOnClick />
      </body>
    </html>
  );
}
