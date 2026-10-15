import { checkImageLoads, lineIsFilled, type ScriptLine } from "./chat-scripts";
import { voiceToken } from "@/lib/voice-chat";

export type ScriptLineAction = "insert" | "sent" | "failed" | "skipped";

/**
 * Handle exactly ONE script line. Text lines are never sent here — they go to
 * `onInsertText` so the admin reviews them and presses the chat's Send button.
 * Voice and image lines are sent immediately via the chat's unchanged send callback.
 */
export async function handleScriptLine(line: ScriptLine, options: {
  onSend: (text: string, imageUrl?: string | null) => Promise<unknown>;
  onInsertText: (text: string) => void;
}): Promise<ScriptLineAction> {
  if (!lineIsFilled(line)) return "skipped";
  if (line.type === "text") { options.onInsertText(line.text); return "insert"; }
  let result: unknown;
  if (line.type === "voice") result = await options.onSend(voiceToken(line.storage_path, line.duration));
  else { await checkImageLoads(line.url); result = await options.onSend("", line.url.trim()); }
  return result === false ? "failed" : "sent";
}
