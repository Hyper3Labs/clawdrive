import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import type { Command } from "commander";
import { approveShare, createPotShare, listShareInbox, revokeShare } from "@clawdrive/core";
import { formatJson } from "../formatters/json.js";
import { getGlobalOptions, setupContext, setupWorkspaceContext } from "../helpers.js";
import { ensurePotForImport, importSourceToPot, summarizeImportResults, type PotImportResult } from "../pot-import.js";
import { fetchPublicShareManifest, formatBytes, selectPublicShareItems, type PublicShareManifestItem } from "../public-share.js";

function parseDuration(raw: string): number {
  const match = raw.trim().match(/^(\d+)([smhdw])$/i);
  if (!match) {
    throw new Error(`Invalid duration: ${raw}`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
  };

  return value * multipliers[unit];
}

function formatExpiry(expiresAt: number | null): string {
  return expiresAt == null ? "never" : new Date(expiresAt).toISOString();
}

function collectOptionValues(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function renderShareItems(items: PublicShareManifestItem[], includeTldr: boolean): string {
  return items
    .map((item) => {
      const summary = includeTldr && item.tldr ? `\n  ${item.tldr}` : "";
      return `${item.id} ${item.original_name} (${item.content_type}, ${formatBytes(item.file_size)})${summary}`;
    })
    .join("\n");
}

async function downloadShareItem(url: URL, destinationPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    const message = response.body == null
      ? `${response.status} ${response.statusText}`
      : `${response.status} ${response.statusText}: ${await response.text()}`;
    throw new Error(`Failed to download shared item: ${message}`);
  }

  await pipeline(
    Readable.fromWeb(response.body as unknown as NodeReadableStream),
    createWriteStream(destinationPath),
  );
}

export function registerShareCommand(program: Command) {
  const share = program
    .command("share")
    .description("Create, inspect, download, approve, and revoke pot shares");

  share
    .command("info <url>")
    .description("Show public share metadata and file-level TL;DRs")
    .action(async (url: string, _cmdOpts, cmd) => {
      const globalOpts = getGlobalOptions(cmd);

      try {
        const loaded = await fetchPublicShareManifest(url);
        const payload = {
          share_url: loaded.shareUrl,
          manifest_url: loaded.manifestUrl,
          ...loaded.manifest,
        };

        if (globalOpts.json) {
          console.log(formatJson(payload));
          return;
        }

        console.log(`Share: ${loaded.shareUrl}`);
        console.log(`Manifest: ${loaded.manifestUrl}`);
        console.log(`Pot: ${loaded.manifest.pot.name} (${loaded.manifest.pot.slug})`);
        console.log(`Items: ${loaded.manifest.total}`);
        console.log(`Role: ${loaded.manifest.share.role}`);
        console.log(`Status: ${loaded.manifest.share.status}`);
        console.log(`Expires: ${formatExpiry(loaded.manifest.share.expires_at)}`);
        if (loaded.manifest.pot.description) {
          console.log(`Description: ${loaded.manifest.pot.description}`);
        }

        if (loaded.manifest.items.length === 0) {
          console.log("\nNo shared items.");
          return;
        }

        console.log("");
        console.log(renderShareItems(loaded.manifest.items, true));
      } catch (err) {
        console.error(`Error loading public share: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  share
    .command("ls <url>")
    .description("List the items in a public share")
    .action(async (url: string, _cmdOpts, cmd) => {
      const globalOpts = getGlobalOptions(cmd);

      try {
        const loaded = await fetchPublicShareManifest(url);
        const payload = {
          share_url: loaded.shareUrl,
          manifest_url: loaded.manifestUrl,
          pot: loaded.manifest.pot,
          total: loaded.manifest.total,
          items: loaded.manifest.items,
        };

        if (globalOpts.json) {
          console.log(formatJson(payload));
          return;
        }

        console.log(`Share: ${loaded.shareUrl}`);
        console.log(`Pot: ${loaded.manifest.pot.name} (${loaded.manifest.total} items)`);
        if (loaded.manifest.items.length === 0) {
          console.log("No shared items.");
          return;
        }

        console.log("");
        console.log(renderShareItems(loaded.manifest.items, false));
      } catch (err) {
        console.error(`Error listing public share: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  share
    .command("download <url>")
    .description("Download a public share into a local pot")
    .option("--item <id>", "Download only a selected shared item", collectOptionValues, [] as string[])
    .option("--pot <pot>", "Target local pot name or slug")
    .action(async (url: string, cmdOpts, cmd) => {
      const globalOpts = getGlobalOptions(cmd);
      const ctx = await setupContext(globalOpts);
      const tempDir = await mkdtemp(join(tmpdir(), "cdrive-share-"));

      try {
        const loaded = await fetchPublicShareManifest(url);
        const selectedItems = selectPublicShareItems(loaded.manifest, cmdOpts.item as string[]);
        if (selectedItems.length === 0) {
          if (globalOpts.json) {
            console.log(formatJson({
              share_url: loaded.shareUrl,
              manifest_url: loaded.manifestUrl,
              total: 0,
              results: [],
            }));
            return;
          }

          console.log("Share has no items to download.");
          return;
        }

        const ensuredPot = await ensurePotForImport(
          cmdOpts.pot,
          {
            name: loaded.manifest.pot.name,
            description: loaded.manifest.pot.description,
          },
          { wsPath: ctx.wsPath },
        );

        const results: PotImportResult[] = [];

        for (const item of selectedItems) {
          const safeName = basename(item.original_name) || item.id;
          const itemDir = join(tempDir, item.id);
          const destinationPath = join(itemDir, safeName);

          try {
            await mkdir(itemDir, { recursive: true });
            await downloadShareItem(new URL(item.content_url, loaded.manifestUrl), destinationPath);
            const result = await importSourceToPot(
              {
                source: `${item.id} ${item.original_name}`,
                path: destinationPath,
                sourceUrl: item.source_url,
                tldr: item.tldr ?? undefined,
              },
              ensuredPot.pot.slug,
              { wsPath: ctx.wsPath, embedder: ctx.embedder },
            );
            results.push(result);
          } catch (err) {
            results.push({
              source: `${item.id} ${item.original_name}`,
              status: "error",
              error: (err as Error).message,
            });
          }
        }

        const summary = summarizeImportResults(results);

        if (globalOpts.json) {
          console.log(formatJson({
            share_url: loaded.shareUrl,
            manifest_url: loaded.manifestUrl,
            source_pot: loaded.manifest.pot,
            target_pot: ensuredPot.pot,
            pot_created: ensuredPot.created,
            selected_item_ids: selectedItems.map((item) => item.id),
            total: selectedItems.length,
            ...summary,
            results,
          }));
          return;
        }

        console.log(`${ensuredPot.created ? "Created" : "Using"} local pot ${ensuredPot.pot.slug}`);
        console.log(`Downloaded ${selectedItems.length} item${selectedItems.length === 1 ? "" : "s"} from ${loaded.shareUrl}`);
        console.log(`Pot ${ensuredPot.pot.slug}: ${summary.stored} stored, ${summary.attached} attached, ${summary.existing} already present, ${summary.failed} failed`);
        for (const result of results) {
          if (result.status === "error") {
            console.log(`- ${result.status} ${result.source}: ${result.error}`);
          } else {
            console.log(`- ${result.status} ${result.source} -> ${result.id}`);
          }
        }

        if (summary.failed > 0) {
          process.exitCode = 1;
        }
      } catch (err) {
        console.error(`Error downloading public share: ${(err as Error).message}`);
        process.exit(1);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });

  share
    .command("pot <pot>")
    .description("Create a share for a pot")
    .option("--link", "Create a pending link share")
    .option("--to <principal>", "Grant direct access to a human or agent")
    .option("--role <role>", "Access role: read or write", "read")
    .option("--expires <duration>", "Expiry like 30m, 24h, or 7d")
    .action(async (potRef: string, cmdOpts, cmd) => {
      const globalOpts = getGlobalOptions(cmd);
      const ctx = await setupWorkspaceContext(globalOpts);

      try {
        if (!cmdOpts.link && !cmdOpts.to) {
          throw new Error("Choose --link or --to <principal>");
        }
        if (cmdOpts.link && cmdOpts.to) {
          throw new Error("Use either --link or --to, not both");
        }

        const shareRecord = await createPotShare(
          {
            pot: potRef,
            kind: cmdOpts.to ? "principal" : "link",
            principal: cmdOpts.to,
            role: cmdOpts.role === "write" ? "write" : "read",
            expiresAt: cmdOpts.expires ? Date.now() + parseDuration(cmdOpts.expires) : undefined,
          },
          { wsPath: ctx.wsPath },
        );

        if (globalOpts.json) {
          console.log(formatJson(shareRecord));
          return;
        }

        console.log(`Created ${shareRecord.kind} share ${shareRecord.id}`);
        console.log(`Status: ${shareRecord.status}`);
        console.log(`Role: ${shareRecord.role}`);
        console.log(`Expires: ${formatExpiry(shareRecord.expires_at)}`);
        if (shareRecord.principal) {
          console.log(`Principal: ${shareRecord.principal}`);
        }
        if (shareRecord.status === "pending") {
          console.log(`Approve with: cdrive share approve ${shareRecord.id}`);
        }
      } catch (err) {
        console.error(`Error creating share: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  share
    .command("inbox")
    .description("Show pending link approvals")
    .action(async (_cmdOpts, cmd) => {
      const globalOpts = getGlobalOptions(cmd);
      const ctx = await setupWorkspaceContext(globalOpts);

      try {
        const items = await listShareInbox({ wsPath: ctx.wsPath });
        if (globalOpts.json) {
          console.log(formatJson(items));
          return;
        }

        if (items.length === 0) {
          console.log("No pending share requests.");
          return;
        }

        for (const item of items) {
          console.log(`${item.id} pot=${item.pot_slug} role=${item.role} expires=${formatExpiry(item.expires_at)}`);
        }
      } catch (err) {
        console.error(`Error loading inbox: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  share
    .command("approve <ref>")
    .description("Approve a pending link share")
    .action(async (ref: string, _cmdOpts, cmd) => {
      const globalOpts = getGlobalOptions(cmd);
      const ctx = await setupWorkspaceContext(globalOpts);

      try {
        const approved = await approveShare(ref, { wsPath: ctx.wsPath });
        if (globalOpts.json) {
          console.log(formatJson(approved));
          return;
        }

        console.log(`Approved share ${approved.id}`);
        if (approved.token) {
          console.log(`Token: ${approved.token}`);
        }
      } catch (err) {
        console.error(`Error approving share: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  share
    .command("revoke <ref>")
    .description("Revoke an active or pending share")
    .action(async (ref: string, _cmdOpts, cmd) => {
      const globalOpts = getGlobalOptions(cmd);
      const ctx = await setupWorkspaceContext(globalOpts);

      try {
        const revoked = await revokeShare(ref, { wsPath: ctx.wsPath });
        if (globalOpts.json) {
          console.log(formatJson(revoked));
          return;
        }

        console.log(`Revoked share ${revoked.id}`);
      } catch (err) {
        console.error(`Error revoking share: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}