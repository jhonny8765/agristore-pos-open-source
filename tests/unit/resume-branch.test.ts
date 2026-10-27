import { expect, it } from "vitest";
import type { Branch, Membership } from "@agristore/domain";
import { resumeBranch } from "../../apps/web/lib/resume-branch";
import { uuid } from "./fixtures";

const owner: Membership = { organizationId: uuid(1), organizationName: "TEST", userId: uuid(4), branchId: null, name: "TEST owner", role: "owner" };
const branches: Branch[] = [{ id: uuid(2), name: "First", code: "B01" }, { id: uuid(3), name: "Second", code: "B02" }];
const scope = { organizationId: owner.organizationId, branchId: branches[1].id };

it("resumes the downloaded second branch rather than assuming the first", () => {
  expect(resumeBranch(owner, branches, scope)).toBe(branches[1].id);
});
it("does not guess a branch for a legacy cache without scope metadata", () => {
  expect(resumeBranch(owner, branches, undefined)).toBeUndefined();
});
it("does not reuse a different business's scope", () => {
  expect(resumeBranch(owner, branches, { ...scope, organizationId: uuid(99) })).toBeUndefined();
});
it("does not select a removed branch", () => {
  expect(resumeBranch(owner, branches.slice(0, 1), scope)).toBeUndefined();
});
it.each(["cashier", "manager", "stock_staff"] as const)("respects the %s member's assigned branch", role => {
  const member = { ...owner, role, branchId: branches[0].id };
  expect(resumeBranch(member, branches, scope)).toBeUndefined();
  expect(resumeBranch(member, branches, { ...scope, branchId: member.branchId })).toBe(member.branchId);
});
it("requires a cached membership", () => {
  expect(resumeBranch(undefined, branches, scope)).toBeUndefined();
});
