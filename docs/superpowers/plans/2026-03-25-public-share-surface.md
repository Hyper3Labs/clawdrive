# ClawDrive Public Share Surface

Status: proposed

## Problem

- Public sharing currently works only if the whole server is exposed to the internet.
- The server mounts both the generic file APIs and the share APIs on the same Express app (`packages/server/src/index.ts`).
- The current share route returns pot metadata plus file records (`packages/server/src/routes/shares.ts`), but raw bytes are still downloadable from the generic file route by internal file ID (`packages/server/src/routes/files.ts`).
- Result: the share token gates discovery, not bytes. If Tailscale Funnel or another tunnel points at the current app root, the public hostname exposes much more than the intended share.
- Constraint: pots are pointers to existing files. The solution must not copy bytes, and it should stay easy for another person's agent to consume without asking the human to create an account.

## Plan

1. Introduce a dedicated public share surface under `/s/:token` instead of using `/api/shares/:token` as the user-facing link.
2. Add share-scoped public endpoints:
   - `GET /s/:token`
   - `GET /s/:token/manifest.json`
   - `GET /s/:token/items/:shareItemId/content`
   - `GET /s/:token/items/:shareItemId/preview`
3. Add share-item records, for example in `share-items.json`, that snapshot pot membership as pointers to existing files (`share_id`, `file_id`, minimal generic metadata) without copying bytes.
4. Re-authorize every public request against share status, expiry, and item membership.
5. Keep the raw internal APIs (`/api/files`, `/api/search`, `/api/pots`, and similar routes) private.
6. Publish only the share surface through Tailscale Funnel, ideally from a separate share-only listener or port.

## Why This Solves It

- The public link becomes a capability URL: possession of the link grants access only to that share.
- Internal file IDs stop being the public security boundary.
- Every byte request is checked against the share, so the token gates bytes rather than only metadata discovery.
- The public manifest stays honest about sparse real-world files instead of assuming curated descriptions, thematic labels, or other demo-specific metadata.
- The storage model stays pointer-based. Shares reference existing files and do not create copies.
- A manifest endpoint keeps the flow simple for agents while `/s/:token` remains browser-friendly for humans.

## Similar Products

### Google Drive

- Google Drive models sharing as permissions on the original item. The Drive API supports permission types including `anyone`, and folder permissions propagate to children.
- Google also documents resource keys for link-shared files, which is another layer on top of the public link model.
- Similarity: public access is attached to the original object, not a copied export.
- Difference: Drive leans on object ACLs and inheritance, so folder sharing is live by default rather than a snapshot of membership.

Sources:

- https://support.google.com/drive/answer/2494822
- https://developers.google.com/workspace/drive/api/guides/manage-sharing
- https://developers.google.com/workspace/drive/api/guides/resource-keys

### Dropbox

- Dropbox supports view-only shared links that recipients can open without creating an account.
- Dropbox documents link-specific behaviors like `dl=1` for forced download and `raw=1` for direct render, and it treats link settings such as passwords and expiration as properties of the link path rather than of direct collaborator access.
- Similarity: one public capability link, optional link-specific policy, no file copying.
- Difference: ClawDrive should not let its generic internal file routes double as public download routes.

Sources:

- https://help.dropbox.com/share/create-and-share-link
- https://help.dropbox.com/share/force-download

### Box

- Box exposes shared links as URLs that people can open in a browser, and it also documents API access to shared items through the shared-link context.
- For downloads, Box resolves the shared item first and then downloads it through the shared-link-aware flow.
- Similarity: this is close to the proposed `manifest + share item download` pattern.

Sources:

- https://developer.box.com/guides/shared-links/
- https://developer.box.com/guides/downloads/shared-link/

### OneDrive / SharePoint

- Microsoft documents `Anyone` links as transferrable, revocable secret keys that do not require sign-in.
- Microsoft also distinguishes `Anyone` links from authenticated `Specific people` links and emphasizes that public links are capability-style secrets.
- Similarity: this is the clearest statement of the model ClawDrive should adopt for public shares.

Sources:

- https://support.microsoft.com/en-us/office/share-a-document-with-no-sign-in-necessary-8d0dc009-4207-4a91-b051-356948579732
- https://learn.microsoft.com/en-us/sharepoint/shareable-links-anyone-specific-people-organization

### Nextcloud

- Nextcloud public link shares use a dedicated tokenized path such as `/s/<token>`.
- Public links can be read-only, upload-only, password-protected, expiring, or hidden behind multiple distinct links with different rights.
- Similarity: this is the closest shape to the proposed ClawDrive design. The recommended `/s/:token` surface maps directly onto the way Nextcloud exposes public shares.
- Difference: mainstream folder-sharing products often expose live folder membership. For safety, ClawDrive should start with snapshot membership for public pot shares and add live membership later as an explicit mode.

Sources:

- https://docs.nextcloud.com/server/latest/user_manual/en/files/sharing.html
- https://docs.nextcloud.com/server/stable/admin_manual/configuration_files/file_sharing_configuration.html

## Bottom Line

- The proposed plan is aligned with the standard pattern used by mainstream products: a revocable capability URL, share-scoped access checks, and no byte copying.
- The closest open-source analogue is Nextcloud's `/s/<token>` public share surface.
- The main deliberate deviation is using snapshot membership for public pot shares first, which is stricter than the live-folder behavior common in Drive, Dropbox, and Nextcloud.
- Tailscale Funnel is a reasonable transport once it exposes only the dedicated public share surface and no longer publishes the whole internal API.