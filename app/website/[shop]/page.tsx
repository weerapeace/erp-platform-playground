import { ShopManager } from "./manager-client";

/** /website/<slug> — หน้าจัดการเว็บของร้านนั้นโดยเฉพาะ */
export default async function ShopWebsitePage({ params }: { params: Promise<{ shop: string }> }) {
  const { shop } = await params;
  return <ShopManager shopSlug={shop} />;
}
