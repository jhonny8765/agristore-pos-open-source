# Security

Do not post credentials, recovery exports, real receipts or staff/customer records in public issues. Use synthetic data in reproductions. Report suspected vulnerabilities through this repository's private vulnerability reporting interface when available.

Do not open a public issue containing exploit details against a live installation. Reproduce in an isolated local Supabase database with no production data. Privileged keys must remain outside the browser and source control.

The test workflows use disposable local databases and synthetic accounts. The local PGlite harness simulates Auth and must never be deployed. Passing tests is not an audit of a real installation or a promise of secure unattended operation.
