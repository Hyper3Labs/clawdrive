# ClawDrive CLI

```
cdrive <command> [options]
```

Agent-native local file sharing and retrieval.

Global options:

- `--json` output machine-readable JSON
- `-V, --version` print the CLI version
- `-h, --help` show help

## Concepts

**Pot** — a named collection of files and links. Files can optionally belong to one or more pots for organization and sharing. You reference a pot by its slug (e.g. `acme-dd`).

**File name** — the canonical name for a stored file. File names are unique. If an imported name would collide, cdrive assigns a suffix like `README (2).md`.

**Share ref** — a share id or token. Some commands accept a share ref instead of a file name.

---

## Adding Files And Pots

Files are stored directly. You can leave them unfiled or attach them to a pot during ingest.

### `cdrive add <sources...>`

Add local files, directories, or HTTP URLs. Directories are walked recursively. URLs become `.url.md` stub files.

| Option | Description |
|---|---|
| `--pot <pot>` | Also attach imported files to a pot |
| `--tldr <text>` | Set the same TL;DR on imported files |

### `cdrive pot create <name>`

Create a new pot.

| Option | Description |
|---|---|
| `--desc <text>` | Pot description |

### `cdrive pot add <pot> <sources...>`

Add local files, folders, or links directly to a pot.

This is a compatibility command similar to `cdrive add --pot <pot>`, but it does not expose extra ingest options like `--tldr`.

### `cdrive demo install <dataset>`

Install curated sample content into the current workspace and create its pot.

Current curated dataset: `nasa`.

---

## Search And Retrieval

### `cdrive search [query]`

Vector search across all files or a single pot.

You can omit `[query]` when using `--file` or `--image`.

| Option | Description | Default |
|---|---|---|
| `--file <path>` | Image, PDF, audio, or video file to use as query input | — |
| `--pot <pot>` | Limit to a pot | all |
| `--image <path>` | Image file as query input | — |
| `--type <mime>` | Filter by MIME type | — |
| `--tags <tags>` | Comma-separated tag filter | — |
| `--limit <n>` | Max results | `10` |
| `--min-score <n>` | Minimum similarity threshold | — |
| `--after <date>` | Created after (ISO 8601) | — |
| `--before <date>` | Created before (ISO 8601) | — |

### `cdrive get <target>`

Read a file by its canonical name. Text files are streamed to stdout; binary files print the local blob path.

If `<target>` is a share ref, the command prints the shared pot and file list instead.

This is the "cat" primitive — how an agent reads file content without knowing where blobs live on disk.

### `cdrive todo`

List files missing agent-authored metadata (`tldr`, `transcript`, `caption`, `digest`, and/or `display_name`).

| Option | Description | Default |
|---|---|---|
| `--kind <kinds>` | Comma-separated: `tldr`, `transcript`, `caption`, `digest`, `display_name` | all |
| `--limit <n>` | Max items | `50` |
| `--cursor <id>` | Resume after a previous item id | — |

### `cdrive doctor`

Health-check the workspace and report issues.

---

## Metadata

### `cdrive tldr <file>`

Show or update the short TL;DR for a file. Alias: `cdrive abstract <file>`.

| Option | Description |
|---|---|
| `--set <text>` | Set the TL;DR |
| `--clear` | Clear the TL;DR |

Human-mode reads print the stored TL;DR. Updates also print the updated text and word count.

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

### `cdrive rename <file>`

Show or update the canonical name for a stored file.

| Option | Description |
|---|---|
| `--set <name>` | Set the canonical file name |
| `--clear` | Clear the override and fall back to the source name |

---

## Sharing

### `cdrive share pot <pot>`

Create a share for a pot. Requires either `--link` or `--to`.

| Option | Description | Default |
|---|---|---|
| `--link` | Create a pending link share that must be approved before use | — |
| `--to <principal>` | Grant access to a human or agent | — |
| `--role <role>` | `read` or `write` | `read` |
| `--expires <duration>` | Expiry: `30m`, `24h`, `7d`, etc. | never |

### `cdrive share inbox`

List pending link shares waiting for approval.

### `cdrive share approve <share>`

Approve a pending link share. Prints the share token.

### `cdrive share revoke <share>`

Revoke an active or pending share.

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
| `--demo <dataset>` | Prepare and launch a curated demo dataset | — |
| `--read-only` | Block all write operations (read-only mode) | — |
| `--open` | Open browser after starting | — |

Current curated dataset: `nasa`.

---

## Agent Setup

### `cdrive install-skill`

Install the bundled ClawDrive skill for Claude Code, Copilot, or Codex.

If `--agent` is omitted, the command auto-detects supported agents. The default scope is global.

| Option | Description |
|---|---|
| `--agent <name>` | Target agent: `claude`, `copilot`, or `codex` |
| `--global` | Install under the home directory |
| `--project` | Install into the current project directory |

---

## Quick Start

```bash
cdrive pot create apt-search --desc "Berlin apartment hunt"
cdrive add --pot apt-search --tldr "Application materials" ./paystubs ./schufa https://docs.google.com/spreadsheets/d/...
cdrive search "landlord email about pets" --pot apt-search
cdrive search --file ./floorplan-ideal.pdf --pot apt-search
cdrive rename "notes.txt" --set "Viewing questions.txt"
cdrive share pot apt-search --link --expires 24h
cdrive share inbox
cdrive share approve <share>
cdrive demo install nasa
cdrive serve --demo nasa
cdrive serve --demo nasa --read-only   # read-only hosted demo
```