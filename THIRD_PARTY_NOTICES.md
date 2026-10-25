# Source references and dependencies

All application source in this repository was written for this implementation. No source files were copied from the following reference projects:

- OpenPOS: https://github.com/getSono/OpenPOS — its LICENSE file is GPL-3.0, despite an MIT statement in the README.
- Offline-first sync queue: https://github.com/IndexGrid/offline-first-sync-queue — MIT. Reviewed for queue states and retries; its mutable server upsert and content-based short-window deduplication were not reused.
- Kompass POS: https://github.com/vincemat01/POSSystem — no repository license file was found; used as a workflow reference only.

Dependencies retain their published package licenses and notices. Versions and integrity hashes are recorded in package-lock.json. UI button conventions follow the documented shadcn/ui composition pattern, using Radix Slot and class-variance-authority. Application icons use Lucide; the AgriStore mark is an original SVG, with PNG installation icons rendered from that vector. Fonts are self-hosted DM Sans and Manrope packages.
