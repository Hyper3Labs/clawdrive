# ClawDrive CLI MVP

## Thesis

The CLI should feel like a normal shell over shared pots, not a custom storage admin tool.

Its job is simple:

local files and links -> pot -> inspect -> search -> share

A pot is the collaboration unit.
Think of a pot as a shared folder with better retrieval and access control.

## Commands

### `cdrive pot create <name>`

Create a pot for a project, client, or agent task.

### `cdrive pot add <pot> <path-or-url...>`

Add local files, folders, or links to a pot. Sorting is automatic.

### `cdrive search <query> [--pot <pot>]`

Semantic search across everything, or narrow to one pot.

### `cdrive get <ref>`

Resolve a file ref or share ref to content.

### `cdrive share pot <pot> [--link | --to <principal>] [--role read|write] [--expires 24h]`

Share the pot with a human or agent.

### `cdrive share inbox`

Show pending access requests and approvals.

### `cdrive share approve <request-id>`

Approve access without chat back-and-forth.

### `cdrive share revoke <grant-id>`

Revoke access quickly.

### `cdrive serve`

Launch the UI, approval inbox, and human review layer.

## Next Commands To Add

### `cdrive ls <pot-or-ref>`

List what is in a pot. Agents need deterministic inspection, not just search.

### `cdrive stat <ref>`

Show metadata and access info.

### `cdrive overview <ref>`

Show a cheap summary before loading full content.

## Non-Goals

- No broad admin surface
- No `cd` or `pwd` shell clone
- No manual folder babysitting as the main workflow
- No mount, WebDAV, or FUSE in MVP
- No file-by-file sharing as the default mental model

## Example

```bash
cdrive pot create acme-dd
cdrive pot add acme-dd ./context ./contracts/nda.pdf https://docs.google.com/...
cdrive search "the nda we sent acme" --pot acme-dd
cdrive share pot acme-dd --to claude-code --role read --expires 24h
cdrive serve
```