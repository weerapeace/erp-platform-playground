"use client";
import { Suspense } from "react";
import { RecipeCompare } from "@/components/design-library/compare";

// 📚 Design Library — เทียบ 2 สูตรข้างกัน (?a=<สูตร>&b=<สูตร>)
export default function Page() {
  return <Suspense fallback={null}><RecipeCompare /></Suspense>;
}
