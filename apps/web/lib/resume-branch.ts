import type { Branch, Membership, Snapshot } from "@agristore/domain";

/** Select the downloaded branch, not an arbitrary first branch. This grants no shift. */
export function resumeBranch(
  member: Membership | undefined,
  branches: Branch[],
  scope: Snapshot["localScope"],
): string | undefined {
  if (!member || !scope || member.organizationId !== scope.organizationId)
    return undefined;
  if (member.role !== "owner" && member.branchId !== scope.branchId)
    return undefined;
  return branches.some(branch => branch.id === scope.branchId)
    ? scope.branchId : undefined;
}
