export type ApplicationType = "IBIM" | "YARDLOGIC";

export function setApplicationPreference(application: ApplicationType) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem("applicationPreference", application);
  }
}

export function clearAuthSession(options: { preserveApplicationPreference?: boolean } = {}) {
  if (typeof window === "undefined") return;
  const { preserveApplicationPreference = true } = options;
  window.localStorage.removeItem("token");
  window.localStorage.removeItem("businessId");
  window.localStorage.removeItem("businesses");
  if (!preserveApplicationPreference) {
    window.localStorage.removeItem("applicationPreference");
  }
}

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

export function isAuthenticatedForSelectedApplication(): boolean {
  const app = readApplicationPreference();
  if (!app) return false;
  const token = typeof window !== "undefined" ? window.localStorage.getItem("token") : null;
  const businessId = typeof window !== "undefined" ? window.localStorage.getItem("businessId") : null;
  if (!token || !businessId) return false;
  return businessMatchesSelectedApplication(app, businessId);
}
