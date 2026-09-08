export type ApplicationType = "IBIM" | "YARDLOGIC";

export function readApplicationPreference(): ApplicationType | "" {
  const value = typeof window !== "undefined" ? localStorage.getItem("applicationPreference") : null;
  return value === "IBIM" || value === "YARDLOGIC" ? value : "";
}

export function readStoredBusinesses(): Array<Record<string, any>> {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem("businesses");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function resolveBusinessForApplication(
  businesses: Array<Record<string, any>>,
  application: ApplicationType,
): string {
  const match = businesses.find((entry) => {
    const business = entry?.business ?? entry;
    return business?.applicationId === application && !!business?.id;
  });
  const business = match?.business ?? match;
  return business?.id ?? "";
}

export function getSelectedBusinessForApplication(application: ApplicationType): string {
  const businesses = readStoredBusinesses();
  return resolveBusinessForApplication(businesses, application);
}

export function businessMatchesSelectedApplication(application: string, businessIdValue: string) {
  if (!application || !businessIdValue) return false;
  const normalized = application === "IBIM" || application === "YARDLOGIC" ? application : "";
  if (!normalized) return false;
  const businesses = readStoredBusinesses();
  return businesses.some((entry) => {
    const business = entry?.business ?? entry;
    return business?.id === businessIdValue && business?.applicationId === normalized;
  });
}

export function isAppRouteAllowed(
  selectedApplication: string,
  requiredApplication: ApplicationType,
  isAuthenticated: boolean,
  hasBusiness: boolean,
): boolean {
  return isAuthenticated && hasBusiness && selectedApplication === requiredApplication;
}
