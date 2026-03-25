# TL;DR + Digest Plan

**Answer:** align ClawDrive to OpenViking's layer semantics.

- `tldr` follows OpenViking `abstract`
- `digest` follows OpenViking `overview`

## Layer Contract

### `tldr`

Purpose:

- fast relevance check
- cheap enough to show in search results

Shape:

- plain text only
- 1 to 2 sentences
- no headings
- no bullets
- no navigation instructions

Recommended size:

- 20 to 45 words

Rule:

- `tldr` should read like the opening prose you would extract from a good `digest`

### `digest`

Purpose:

- structured orientation before full read
- answer both "what is here?" and "where should I look?"

Shape:

- markdown
- title at the top
- short opening paragraph
- `## Quick Navigation`
- `## Detailed Description`

Expected content:

- the opening paragraph explains what the file is about
- quick navigation points to the most important sections, pages, timestamps, scenes, or chunks
- detailed description expands the important parts in a structured way

Guidance:

- for text files, navigation can point to sections or arguments
- for PDFs, it can point to page ranges
- for audio/video, it can point to timestamps or segments
- for images, it can point to notable regions, elements, or visible themes when useful

## Practical Difference

- `tldr` says what the file is and why it matters
- `digest` gives a structured map of what is inside and where to inspect next

## CLI Surface

- `cdrive search <query>`
- `cdrive tldr <id>`
- `cdrive digest <id>`
- `cdrive read <id>`

Store-time input:

- `cdrive store <file> --tldr "..." --digest "..."`
- both fields are optional

## Storage Plan

- keep `tldr` in the existing `description` slot for now
- store `digest` separately without a DB migration
- both layers remain optional and agent-provided for this phase

## Retrieval Workflow

1. Search.
2. Use `tldr` to shortlist.
3. Use `digest` to navigate the shortlist.
4. Read the source.

## Initial Implementation Scope

- keep the current `tldr` behavior
- add first-class `digest` storage and retrieval
- add `cdrive digest`
- allow `digest` on store and update paths
- expose `digest` in direct file metadata reads, but not in search result summaries