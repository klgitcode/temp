export type DashboardView =
  | "newfund-hkd"
  | "newfund-usd"
  | "newfund-rmb"
  | "newfund-aud"
  | "fx-tmd"
  | "detail-data";

export type RateView = "New Fund" | "FX TMD" | "Existing Fund" | "Special Offer";
export type HeatmapView = Exclude<RateView, "Existing Fund">;
export type DimensionMode = "tenor" | "tenor-currency";

export type TmdNavItem = {
  key: DashboardView;
  label: string;
};

export type NewFundPageConfig = TmdNavItem & {
  key: Extract<DashboardView, "newfund-hkd" | "newfund-usd" | "newfund-rmb" | "newfund-aud">;
  currency: "HKD" | "USD" | "RMB" | "AUD";
};

export const DEFAULT_TMD_PAGE: DashboardView = "newfund-hkd";

export const newFundPageConfigs = [
  { key: "newfund-hkd", label: "HKD New Fund", currency: "HKD" },
  { key: "newfund-usd", label: "USD New Fund", currency: "USD" },
  { key: "newfund-rmb", label: "RMB New Fund", currency: "RMB" },
  { key: "newfund-aud", label: "AUD New Fund", currency: "AUD" },
] as const satisfies readonly NewFundPageConfig[];

export const fxTmdPageConfig = { key: "fx-tmd", label: "FX + TMD" } as const satisfies TmdNavItem;

export const tmdNavItems = [
  ...newFundPageConfigs.map((page) => ({ key: page.key, label: page.label })),
  { key: fxTmdPageConfig.key, label: fxTmdPageConfig.label },
  { key: "detail-data", label: "Detail Data" },
] as const satisfies readonly TmdNavItem[];
