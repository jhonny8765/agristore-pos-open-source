import {expect,it} from "vitest";
import {commandError,isDatabaseRejection} from "../../apps/web/lib/command-error";

it("explains a second-PC refusal without changing the server rejection or authorizing a replacement",()=>{
  const error=commandError({code:"23505",message:'duplicate key value violates unique constraint "one_active_device_per_branch"'},409);
  expect(error.message).toContain("Settings > Registered cashier PCs");
  expect(error.message).toContain("Synchronize or export");
  expect(error.message).toContain("Keep the old browser profile and site data");
  expect(error.message).not.toContain("duplicate key");
  expect(error.code).toBe("23505");expect(error.status).toBe(409);
  expect(error.authenticationRequired).toBe(false);expect(isDatabaseRejection(error)).toBe(true);
});
it.each([{code:"23505",message:'duplicate key value violates unique constraint "different_record"'},{message:"Network failure mentioning one_active_device_per_branch"}])("preserves unrelated duplicate/network errors",input=>{
  expect(commandError(input).message).toBe(input.message);
});
