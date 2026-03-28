# ClawDrive CLI

```
cdrive <command> [options]
```

Agent-native local file sharing and retrieval.

All commands accept `--json` for machine-readable output.

## Concepts

**Pot** — a named collection of files and links. Files can optionally belong to one or more pots for organization and sharing. You reference a pot by its slug (e.g. `acme-dd`).

**File name** — the canonical name for a stored file. File names are unique. If an imported name would collide, cdrive assigns a suffix like `README (2).md`.

---

## Adding files

Files are stored directly. You can leave them unfiled or attach them to a pot during ingest.

### `cdrive add <sources...>`

Add local files, directories, or HTTP URLs. Directories are walked recursively. URLs become `.url.md` stub files.

| Option | Description |
|---|---|
| `--pot <pot>` | Also attach imported files to a pot |

### `cdrive pot create <name>`

Create a new pot.

| Option | Description |
|---|---|
| `--desc <text>` | Pot description |

### `cdrive pot add <pot> <sources...>`

Compatibility alias for `cdrive add --pot <pot> <sources...>`.

---

## Search and inspection

### `cdrive search <query>`

Vector search across all files or a single pot.

| Option | Description | Default |
|---|---|---|
| `--pot <pot>` | Limit to a pot | all |
| `--image <path>` | Image file as query input | — |
| `--type <mime>` | Filter by MIME type | — |
| `--limit <n>` | Max results | `10` |
| `--min-score <n>` | Minimum similarity threshold | — |
| `--after <date>` | Created after (ISO 8601) | — |
| `--before <date>` | Created before (ISO 8601) | — |

### `cdrive get <target>`

Read a file by its canonical name. Text files are streamed to stdout; binary files print the local blob path. If `<target>` is a share id or token, lists the pot and its files instead.

This is the "cat" primitive — how an agent reads file content without knowing where blobs live on disk.

### `cdrive todo`

List files missing agent-authored metadata (`tldr`, `transcript`, `caption`, `digest`, and/or `display_name`).

| Option | Description | Default |
|---|---|---|
| `--kind <kinds>` | Comma-separated: `tldr`, `transcript`, `caption`, `digest`, `display_name` | all |
| `--limit <n>` | Max items | `50` |
| `--cursor <id>` | Resume after a previous item id | — |

---

## Metadata

### `cdrive tldr <file>`

Show or update the short TL;DR for a file. Alias: `abstract`.

| Option | Description |
|---|---|
| `--set <text>` | Set the TL;DR |
| `--clear` | Clear the TL;DR |

Reports word count and whether it falls within the recommended range.

### `cdrive digest <file>`

Show or update the structured markdown digest for a file.

| Option | Description |
|---|---|
| `--set <text>` | Set the digest |
| `--clear` | Clear the digest |

### `cdrive transcript <file>`

Show or update the transcript for an audio or video file.

| Option | Description |
|---|---|
| `--set <text>` | Set the transcript text |
| `--set-file <path>` | Load the transcript from a text file |
| `--clear` | Clear the transcript |

### `cdrive caption <file>`

Show or update the caption for an image file.

| Option | Description |
| --- | --- |
| `--set <text>` | Set the caption text |
| `--set-file <path>` | Load the caption from a text file |
| `--clear` | Clear the caption |

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

| Option | Description | Default |
|---|---|---|
| `--port <port>` | Port number | `7432` |
| `--host <host>` | Bind host | `127.0.0.1` |
| `--public-port <port>` | Share-only public surface port | — |
| `--public-host <host>` | Share-only public surface host | — |
| `--demo <dataset>` | Seed a curated demo dataset (e.g. `nasa`) | — |
| `--open` | Open browser after starting | — |

---

## Quick start

```bash
cdrive pot create acme-dd
cdrive add --pot acme-dd ./contracts ./docs https://docs.google.com/...
cdrive search "the nda we sent acme" --pot acme-dd
cdrive share pot acme-dd --to claude-code --role read --expires 24h
cdrive serve
```