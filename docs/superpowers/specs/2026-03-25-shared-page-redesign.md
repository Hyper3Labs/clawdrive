# Shared Page UI Redesign

## Goal

Rework the public share page (`/s/:token`) so its visual design is consistent with the main ClawDrive UI. The page remains server-rendered HTML — no React, no JS bundle — but adopts the exact same design tokens, typography, spacing, and card patterns used in the authenticated app.

## Current State

The share page is rendered by `renderSharePage()` in `packages/server/src/routes/public-shares.ts`. It produces a self-contained HTML document with inline `<style>` tags. Key differences from the main UI:

| Property | Current share page | Main UI |
|---|---|---|
| Background | `#0b1220` | `#061018` |
| Font | System sans-serif | Manrope |
| Border radius | 18-22px | 4-8px |
| Link color | `#9dc1ff` | `#6EE7FF` |
| Card style | Large rounded list items | Compact cards with thumbnails |
| File display | Name + type + size + links | Thumbnail + modality badge + name + size |
| Layout | Single column list | 4-column masonry grid |
| Branding | None | TopBar with logo |

## Design

### 1. Top Bar

A thin sticky header matching the main UI's `TopBar.tsx`:
- Left: "ClawDrive" logo text (font-weight 700, font-size 15px, color `#E6F0F7`)
- Right: "Public Share" badge pill (uppercase, font-size 11px, background `rgba(110, 231, 255, 0.12)`, color `#6EE7FF`, border-radius 6px)
- Background: `linear-gradient(180deg, rgba(8,21,31,0.95) 0%, rgba(6,16,24,0.95) 100%)`
- Bottom border: `1px solid #1F3647`
- Padding: `12px 20px`

### 2. Pot Info Section

Below the top bar, a panel containing the share's metadata:
- Container: background `rgba(14, 26, 36, 0.6)`, border `1px solid #1F3647`, border-radius `8px`, padding `20px 24px`
- Pot name: font-size 22px, font-weight 700
- Pot description: font-size 13px, color `#6B8A9E`, line-height 1.5
- Stat pills row: flex, gap 8px
  - Item count pill: accent style (background `rgba(110, 231, 255, 0.08)`, color `#6EE7FF`)
  - Role pill: muted style (background `rgba(255,255,255,0.05)`, color `#6B8A9E`)
  - Expiry pill: muted style
- `manifest.json` link: right-aligned, monospace font, font-size 11px, color `#6EE7FF`, opacity 0.6 (1.0 on hover)

### 3. File Grid

Masonry layout matching `FileGrid.tsx`:
- CSS `column-count: 4`, `column-gap: 12px`
- Responsive breakpoints: 3 columns at 900px, 2 at 640px, 1 at 400px
- Section label above grid: "FILES" — uppercase, font-size 10px, letter-spacing 1.5px, color `#6B8A9E`

### 4. File Cards

Each card mirrors the main UI's file card pattern:

**Container:**
- `break-inside: avoid`, margin-bottom 12px
- Background: `rgba(255,255,255,0.03)`, border `1px solid rgba(255,255,255,0.07)`, border-radius 8px
- Hover: background `rgba(255,255,255,0.06)`, border-color `rgba(255,255,255,0.14)`, transform `translateY(-2px)`
- Transition: `background 0.15s, border-color 0.15s, transform 0.15s`

**Thumbnail area:**
- Full-width `<img>` tag pointing to a new thumbnail endpoint: `/s/:token/items/:shareItemId/thumbnail`
- This endpoint calls `getThumbnail()` from `@clawdrive/core` (the same function used by the authenticated `/api/files/:id/thumbnail` route) to generate JPEG thumbnails for all file types
- The existing `/preview` endpoint streams the original file, which is unsuitable for `<img>` tags on non-image files
- Fallback: if `getThumbnail()` returns null (generation failed) or for unsupported types, the `<img>` `onerror` handler hides it and a CSS gradient placeholder with the modality label is shown instead
- `loading="lazy"` attribute for deferred loading

**Modality badge (overlaid top-left of thumbnail):**
- Pill shape: `border-radius: 999px`, padding `2px 8px`, font-size 10px, font-weight 600
- Colors from `MODALITY_COLORS` in `theme.ts`:
  - IMG: color `#7BD389`, border `rgba(123,211,137,0.4)`, background `rgba(123,211,137,0.12)`
  - PDF: color `#8AB4FF`, border `rgba(138,180,255,0.4)`, background `rgba(138,180,255,0.12)`
  - VID: color `#C792EA`, border `rgba(199,146,234,0.4)`, background `rgba(199,146,234,0.12)`
  - AUD: color `#F6C177`, border `rgba(246,193,119,0.4)`, background `rgba(246,193,119,0.12)`
  - TXT: color `#9AD1FF`, border `rgba(154,209,255,0.4)`, background `rgba(154,209,255,0.12)`

**Card body (below thumbnail):**
- Padding: `10px 12px`
- File name: font-size 12px, font-weight 600, color `#E6F0F7`, word-break
- File meta: font-size 11px, color `#6B8A9E` (content type + formatted size)
- TLDR (when available): font-size 11px, color `rgba(230,240,247,0.55)`, line-height 1.45, margin-top 6px
- Download button: inline-flex, padding `4px 10px`, border-radius 6px, font-size 11px, background `rgba(110,231,255,0.08)`, color `#6EE7FF`, border `1px solid rgba(110,231,255,0.2)`. Hover: background `rgba(110,231,255,0.16)`. Includes a down-arrow icon.

### 5. Status/Error Pages

`renderStatusPage()` also gets aligned to the same tokens:
- Background: `#061018`
- Font: Manrope
- Card: same panel style as pot-info (border-radius 8px, `#1F3647` border)
- Includes the top bar for brand consistency

### 6. Design Tokens Reference

All values come from the main UI's `theme.ts` and `globals.css`:

```
background:       #061018
panel:            #0E1A24
border:           #1F3647
text:             #E6F0F7
textMuted:        #6B8A9E
accentPrimary:    #6EE7FF
accentSecondary:  #7BD389
accentWarm:       #FFB84D
font-family:      "Manrope", "Avenir Next", "Segoe UI", sans-serif
font-mono:        "SF Mono", "Fira Code", monospace
```

## Scope

### In scope
- Rework `renderSharePage()` HTML and CSS in `public-shares.ts`
- Rework `renderStatusPage()` HTML and CSS in `public-shares.ts`
- Add a new `/s/:token/items/:shareItemId/thumbnail` route that calls `getThumbnail()` from `@clawdrive/core` to serve JPEG thumbnails (mirrors the authenticated thumbnail route pattern)
- Add thumbnail `<img>` tags to file cards pointing to the new thumbnail endpoint
- Add modality badge logic (derive from content_type, same logic as `getModalityLabel()` in `theme.ts`)
- Responsive breakpoints for the masonry grid
- Load Manrope font via Google Fonts `<link>`

### Out of scope
- React/SPA conversion
- Client-side interactivity (search, sort, filter)
- JavaScript beyond the existing URL-resolution script
- Changes to the manifest.json endpoint or data model
- Changes to the main authenticated UI

## Files Modified

- `packages/server/src/routes/public-shares.ts` — the only file that changes

## Testing

- Visual verification: create a test share and load `/s/:token` in a browser
- Existing tests in `packages/server/tests/public-shares.test.ts` should continue to pass (they test route behavior and manifest structure, not HTML content)
- Verify responsive behavior at 400px, 640px, 900px, and 1200px+ widths
