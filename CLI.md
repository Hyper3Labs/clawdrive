# ClawDrive CLI

```
cdrive <command> [options]
```

Agent-native local file sharing and retrieval.

All commands accept `--json` for machine-readable output.

## Concepts

**Pot** — a named collection of files and links. Every file in ClawDrive lives in a pot. Think of it as a shared folder with semantic search and access control. You reference a pot by its slug (e.g. `acme-dd`).

**Ref** — a file identifier. This is a UUIDv7 assigned when the file is stored (e.g. `018e7a3f-9c2b-7000-8a1d-4e5f6a7b8c9d`). Filenames aren't used as identifiers because the same name can appear in multiple pots. You get refs from `cdrive search`, `cdrive todo`, or the REST API.

**Workspace** — an isolated storage directory (`~/.clawdrive/workspaces/<name>/`) that holds the vector database, blob storage, and pot registry. The default workspace is `default`. You almost never need to switch; `--workspace <name>` exists for multi-tenant setups.

---

## Adding files

Files always go into a pot. This is the primary way to get data into ClawDrive.

### `cdrive pot create <name>`

Create a new pot.

| Option | Description |
|---|---|
| `--desc <text>` | Pot description |

### `cdrive pot add <pot> <sources...>`

Add local files, directories, or HTTP URLs to a pot. Directories are walked recursively. URLs become `.url.md` stub files.

---

## Search and inspection

### `cdrive search <query>`

Vector search across the workspace or a single pot.

| Option | Description | Default |
|---|---|---|
| `--pot <pot>` | Limit to a pot | all |
| `--image <path>` | Image file as query input | — |
| `--type <mime>` | Filter by MIME type | — |
| `--limit <n>` | Max results | `10` |
| `--min-score <n>` | Minimum similarity threshold | — |
| `--after <date>` | Created after (ISO 8601) | — |
| `--before <date>` | Created before (ISO 8601) | — |

### `cdrive get <ref>`

Read a file by its ref. Text files are streamed to stdout; binary files print the local blob path. If `<ref>` is a share token, lists the pot and its files instead.

This is the "cat" primitive — how an agent reads file content without knowing where blobs live on disk.

### `cdrive todo`

List files missing agent-authored metadata (`tldr` and/or `digest`).

| Option | Description | Default |
|---|---|---|
| `--kind <kinds>` | Comma-separated: `tldr`, `digest` | both |
| `--limit <n>` | Max items | `50` |
| `--cursor <id>` | Resume after a previous item id | — |

---

## Metadata

### `cdrive tldr <ref>`

Show or update the short TL;DR for a file. Alias: `abstract`.

| Option | Description |
|---|---|
| `--set <text>` | Set the TL;DR |
| `--clear` | Clear the TL;DR |

Reports word count and whether it falls within the recommended range.

### `cdrive digest <ref>`

Show or update the structured markdown digest for a file.

| Option | Description |
|---|---|
| `--set <text>` | Set the digest |
| `--clear` | Clear the digest |

---

## Sharing — send

### `cdrive share pot <pot>`

Create a share for a pot. Requires either `--link` or `--to`.

| Option | Description | Default |
|---|---|---|
| `--link` | Create a public link share | — |
| `--to <principal>` | Grant access to a human or agent | — |
| `--role <role>` | `read` or `write` | `read` |
| `--expires <duration>` | Expiry: `30m`, `24h`, `7d`, etc. | never |

### `cdrive share inbox`

List pending link shares waiting for approval.

### `cdrive share approve <id>`

Approve a pending link share. Prints the share token.

### `cdrive share revoke <id>`

Revoke an active or pending share.

## Sharing — receive

### `cdrive share info <url>`

Show public share metadata and per-file TL;DRs.

### `cdrive share ls <url>`

List items in a public share (no TL;DRs).

### `cdrive share download <url>`

Download a public share into a local pot. Downloads everything by default.

| Option | Description |
|---|---|
| `--item <id>` | Download only specific items (repeatable) |
| `--pot <pot>` | Target local pot name or slug |

---

## Server

### `cdrive serve`

Start the REST API and web UI.

### `cdrive ui`

Same as `serve`, but also opens the browser.

| Option | Description | Default |
|---|---|---|
| `--port <port>` | Port number | `7432` |
| `--host <host>` | Bind host | `127.0.0.1` |
| `--public-port <port>` | Share-only public surface port | — |
| `--public-host <host>` | Share-only public surface host | — |
| `--demo <dataset>` | Seed a curated demo dataset (e.g. `nasa`) | — |

---

## Quick start

```bash
cdrive pot create acme-dd
cdrive pot add acme-dd ./contracts ./docs https://docs.google.com/...
cdrive search "the nda we sent acme" --pot acme-dd
cdrive share pot acme-dd --to claude-code --role read --expires 24h
cdrive serve
```