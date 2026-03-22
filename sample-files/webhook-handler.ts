import { createHmac } from "crypto";

interface WebhookPayload {
  event: string;
  file_id: string;
  agent_id: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export function verifySignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const expected = createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  return expected === signature;
}

export async function handleWebhook(payload: WebhookPayload): Promise<void> {
  switch (payload.event) {
    case "file.ingested":
      console.log(`File ${payload.file_id} ingested by ${payload.agent_id}`);
      break;
    case "file.searched":
      console.log(`Search performed by ${payload.agent_id}`);
      break;
    case "file.shared":
      console.log(`File ${payload.file_id} shared by ${payload.agent_id}`);
      break;
    default:
      console.warn(`Unknown event: ${payload.event}`);
  }
}
