---
name: AgriStore POS
description: Cash checkout and inventory for agricultural supply stores.
colors:
  forest: "#173e32"
  green: "#31604c"
  lime: "#dfebce"
  paper: "#f6f7f2"
  white: "#fff"
  ink: "#23352b"
  muted: "#667468"
  line: "#e3e7dd"
  soft: "#edf1e7"
  danger: "#a3312b"
  focus: "#507c39"
  control-line: "#7a8873"
  primary-hover: "#285441"
  outline-line: "#d6ddcf"
typography:
  display:
    fontFamily: '"Manrope Variable", sans-serif'
    fontSize: "clamp(36px, 3.4vw, 52px)"
    fontWeight: 650
    lineHeight: 1.17
    letterSpacing: "-0.035em"
  title:
    fontFamily: '"Manrope Variable", sans-serif'
    fontSize: "27px"
    fontWeight: 750
    letterSpacing: "-0.025em"
  body:
    fontFamily: '"DM Sans Variable", sans-serif'
    fontSize: "14px"
    lineHeight: 1.5
  label:
    fontFamily: '"DM Sans Variable", sans-serif'
    fontSize: "12px"
    fontWeight: 650
rounded:
  field: "7px"
  button: "8px"
  panel: "12px"
spacing:
  field-gap: "6px"
  field-bottom: "15px"
components:
  button-primary:
    backgroundColor: "{colors.forest}"
    textColor: "{colors.white}"
    rounded: "{rounded.button}"
    padding: "10px 17px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-outline:
    backgroundColor: "{colors.white}"
    textColor: "{colors.forest}"
    rounded: "{rounded.button}"
    padding: "10px 17px"
  button-outline-hover:
    backgroundColor: "{colors.soft}"
  input:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "11px 12px"
---

# Design System: AgriStore POS

## Overview

**Creative North Star: "The Cooperative Stock Book"**

The existing cooperative stock book is the visual authority. Preserve its operational composition, forest ink, warm paper, white ruled panels and compact controls. This source edition uses the original AgriStore SVG mark and no third-party business photography.

This document preserves the existing application guidance and captures the implemented generic sign-in identity. The sign-in observations do not certify business workflows or backend behavior.

**Key Characteristics:**

- Forest identity surfaces and warm paper workspaces.
- Compact, labeled controls and ruled records.
- Original project artwork and generic agricultural-store copy.

## Colors

Forest is the primary identity and action color; working green and lime support the existing interface. Paper, white, ink, muted text and thin rules establish the stock-book surface. Danger marks errors; focus and control-line keep keyboard focus and field boundaries visible. The frontmatter records the source values.

## Typography

Manrope is the heading and wordmark family; DM Sans is the body/control family. Both are self-hosted package fonts. Body numbers use tabular figures. The display role is the desktop sign-in statement; the title role is the sign-in form heading, reduced to 24px on mobile. Field labels use the label role.

## Layout

Checkout retains searchable product tiles and its adjacent cash receipt. Owner forms retain clear labels, exact base-unit quantities, local errors and visible completion states. Records wrap or scroll within named keyboard-accessible regions. Mobile layout preserves actions and focus outlines. Blind count entry hides comparisons; sealed review places evidence and approval beside the same record.

Sign-in uses equal desktop columns with a full-height forest story panel and a paper form area. The story uses 48px vertical and 9% horizontal padding; the form uses 50px 30px padding and an inner width of `min(100%, 365px)`. At 730px and below, the story is hidden, the form becomes a full-height single column with 35px 25px padding, and the compact project identity appears above the form. The practice entry follows a thin rule with 36px top margin and 26px top padding.

## Elevation & Depth

Sign-in has no card shadow or floating logo backing. Tonal separation, field strokes and the practice-entry rule provide depth. Preserve the existing stock-book panels elsewhere.

## Shapes

Fields and buttons use gently rounded corners, with a one-pixel field stroke. The logo image wrapper has a transparent background and a 4px radius; the SVG itself owns its forest rounded-square silhouette. Do not add a white backing behind it.

## Components

**Project identity.** `apps/web/components/store-brand.tsx` renders the original `apps/web/public/icon.svg` followed by “AgriStore” and a separate “POINT OF SALE” descriptor. The image has empty alternative text because the adjacent wordmark names the project. Its intrinsic dimensions are 192 × 192; rendered dimensions are 72 × 72 in the desktop story, 64 × 64 in the mobile identity, and 42 × 42 by default. Keep `object-fit: contain`, a non-shrinking image and the transparent wrapper. Desktop wordmark type is 24px with an 11px gap; mobile type is 22px with an 8px gap. The descriptor uses DM Sans at 10px, weight 550 and 0.08em tracking.

**Sign-in content.** The desktop statement is “Cash checkout.” / “Traceable stock.” Supporting text names AgriStore POS and agricultural supply stores; the ruled proof row reads “Cash checkout · Stock records · Your branches.” The footer reads “Open-source POS and inventory.” The form starts with “Welcome to your store.” and “Sign in to open your shift and get started.” Account creation changes the heading and helper copy within the same composition. No company photography or business-specific identity appears.

**Controls.** Email and password have persistent labels. Primary and outline buttons share a 43px minimum height, weight 650 and 1.3 line height; authentication actions span the form width with a trailing arrow. Hover changes the background. Disabled buttons use half opacity and a not-allowed cursor. Keyboard focus uses a 3px focus-color outline with 3px offset. The account switch is an underlined text button. Practice checkout uses the outline variant and keeps its sample-data explanation visible. Background/color transitions last 0.16s with `ease`; reduced-motion preference removes transitions and animation.

**Metadata.** `apps/web/app/layout.tsx` uses “AgriStore POS” for the page and installed-app title, a generic agricultural-store description, English document language and forest browser theme color.

Source evidence: `apps/web/app/globals.css` and the authentication section of `apps/web/components/store-app.tsx`. Built sign-in references: `.impeccable/review/open-source-auth-1440.png` and `.impeccable/review/open-source-auth-390.png`.

## Do's and Don'ts

- **Do** preserve the incumbent stock-book composition, palette and self-hosted type pairing.
- **Do** reuse the original SVG and adjacent text identity at the implemented desktop and mobile sizes.
- **Do** preserve visible labels, keyboard focus and the compact mobile form.
- **Don't** introduce company photography, company logos or business-specific identity copy into the public edition.
- **Don't** add a white logo backing or use a raster replacement for the original mark.
- **Don't** treat this sign-in branding capture as a new palette, illustration system or identity redesign.

## Stock reminder worklists
Use the existing Inventory panels, ruled tables and responsive stock-control rows. Keep lot, expiry, exact base quantities and separately held goods together. Show the snapshot time, online refresh action, totals and bounded-page continuation. Missing expiry is an inspection warning. Responsible employee, due/overdue status, assignment instructions and latest progress belong beside the source evidence. Use native labelled controls and inline approval forms; keep manager assignment separate from owner-only resolution. Preserve entered/pending work on failed writes, and keep recorded success distinct from refresh failures. Dropdown accessible names reference their visible labels explicitly; refresh controls wrap at narrow widths.
