import { DEFAULT_OFFER_COLS } from "@/lib/offer-columns";
import type { LineColumnConfig } from "@/components/line-item-columns";

export type OfferLayoutConfig = LineColumnConfig;

const cleanStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export const normalizeOfferLayoutConfig = (value: unknown): OfferLayoutConfig | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<OfferLayoutConfig>;
  const order = cleanStringArray(raw.order);
  return {
    order: order.length ? order : DEFAULT_OFFER_COLS.order,
    hidden: cleanStringArray(raw.hidden),
    groupBy: typeof raw.groupBy === "string" && raw.groupBy ? raw.groupBy : null,
  };
};

export const resolveOfferLayoutConfig = (
  sheetConfig: unknown,
  fallbackConfig: unknown = null,
): OfferLayoutConfig => {
  return (
    normalizeOfferLayoutConfig(sheetConfig) ??
    normalizeOfferLayoutConfig(fallbackConfig) ??
    DEFAULT_OFFER_COLS
  );
};
