import type { Command } from "commander";
import { approveShare, createPotShare, listShareInbox, revokeShare } from "@clawdrive/core";
import { formatJson } from "../formatters/json.js";
import { getGlobalOptions, setupWorkspaceContext } from "../helpers.js";

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

export function registerShareCommand(program: Command) {
  const share = program
    .command("share")
    .description("Create, approve, and revoke pot shares");

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