import { can, type Role } from "@/lib/permissions";

export type FloorArrangementDecision = {
  allowed: boolean;
  reason: "owner" | "role-denied" | "member-denied" | "role-default" | "member-allowed";
};

/** Permission layer only. Caller must establish tenant scope and commercial access first. */
export function arrangementDecision(
  roles: readonly Role[],
  memberOverride: boolean | null,
): FloorArrangementDecision {
  if (roles.some(role => role === "OWNER" || role === "SUPER_ADMIN"))
    return { allowed: true, reason: "owner" };
  if (!can(roles, "floor")) return { allowed: false, reason: "role-denied" };
  if (memberOverride === false) return { allowed: false, reason: "member-denied" };
  return { allowed: true, reason: memberOverride === true ? "member-allowed" : "role-default" };
}

/** Observation must not substitute for the historical authorization decision. */
export function compareArrangement(roles: readonly Role[], memberOverride: boolean | null, legacy: boolean) {
  const proposed = arrangementDecision(roles, memberOverride);
  return { legacy, proposed: proposed.allowed, reason: proposed.reason, matches: legacy === proposed.allowed };
}

export type StaffFloorCapability = "floor.view" | "floor.status" | "table-booking.manage";

/** Staff projection rules; public booking must retain its separate public access controls. */
export function staffFloorDecision(capability: StaffFloorCapability, roles: readonly Role[]) {
  switch (capability) {
    case "floor.view": return can(roles, "orders") || can(roles, "reservations");
    case "floor.status": return can(roles, "orders");
    case "table-booking.manage": return can(roles, "reservations");
    default: return false;
  }
}

export function observeStaffFloor(capability: StaffFloorCapability, roles: readonly Role[], legacy: boolean) {
  if (process.env.STUDIO_OS_ENTITLEMENTS_SHADOW === "true" && staffFloorDecision(capability, roles) !== legacy)
    console.warn("[studio-os] floor permission mismatch", { capability });
  return legacy;
}
