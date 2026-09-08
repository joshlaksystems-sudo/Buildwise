import { createHash } from "node:crypto";

export type MaskingRole = "ADMIN" | "STAFF_DETAILER" | "CLIENT" | "ENGINEER_TRAINEE";

function maskMiddle(value: string, visibleStart: number, visibleEnd: number, replacement = "*") {
  if (value.length <= visibleStart + visibleEnd) return replacement.repeat(Math.max(1, value.length - visibleStart));
  return `${value.slice(0, visibleStart)}${replacement.repeat(Math.max(3, value.length - visibleStart - visibleEnd))}${visibleEnd ? value.slice(-visibleEnd) : ""}`;
}

export function maskEmail(email: string | null | undefined, role: MaskingRole) {
  if (!email || role === "ADMIN") return email ?? null;
  const [local, domain = ""] = email.split("@");
  if (role === "STAFF_DETAILER") return `${maskMiddle(local, 1, 1)}@${domain}`;
  return `${local.slice(0, 1)}*****@******.com`;
}

export function maskPhone(phone: string | null | undefined, role: MaskingRole) {
  if (!phone || role === "ADMIN") return phone ?? null;
  if (role === "STAFF_DETAILER") return maskMiddle(phone, 4, 4);
  return `${phone.slice(0, 3)}********`;
}

export function maskLicenseKey(key: string | null | undefined, role: MaskingRole) {
  if (!key || role === "ADMIN") return key ?? null;
  if (role === "STAFF_DETAILER") {
    const segments = key.split("-");
    return segments.length >= 2 ? `${segments[0]}-${segments[1]}-****-****` : "****-****";
  }
  return createHash("sha256").update(key).digest("hex").slice(0, 16).toUpperCase();
}

export function maskUser(user: { id: string; name: string; email?: string | null; phone?: string | null }, role: MaskingRole) {
  return {
    id: user.id,
    name: user.name,
    email: maskEmail(user.email, role),
    phone: maskPhone(user.phone, role),
  };
}
