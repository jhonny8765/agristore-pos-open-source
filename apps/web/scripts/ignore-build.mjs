// Git commits may create previews; production promotion is a separate pilot decision.
if (process.env.VERCEL_ENV === "production") {
  console.log(
    "Production remains gated until the store pilot and recovery checks are approved.",
  );
  process.exit(0);
}
process.exit(1);
