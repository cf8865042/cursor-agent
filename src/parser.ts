import type { CursorStreamEvent, ToolCallEvent } from "./types.js";

/**
 * 从 stream-json 行解析事件，每行是一个独立的 JSON 对象
 */
export function parseStreamLine(line: string): CursorStreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as CursorStreamEvent;
  } catch {
    return null;
  }
}

/** 从 tool_call started 事件中提取工具名称 */
export function extractToolName(event: ToolCallEvent): string {
  const tc = event.tool_call;
  if (!tc) return "unknown";
  const keys = Object.keys(tc);
  for (const key of keys) {
    if (key.endsWith("ToolCall")) {
      return key.replace("ToolCall", "");
    }
  }
  return keys[0] ?? "unknown";
}

/** 从 tool_call started 事件中提取工具参数摘要 */
export function extractToolArgs(event: ToolCallEvent): string {
  const tc = event.tool_call;
  if (!tc) return "";
  for (const value of Object.values(tc)) {
    const v = value as Record<string, unknown>;
    if (v?.args) {
      const args = v.args as Record<string, unknown>;
      if (args.path) return String(args.path).split(/[/\\]/).pop() ?? "";
      if (args.pattern) return String(args.pattern);
      if (args.globPattern) return String(args.globPattern);
      if (args.command) {
        const cmd = String(args.command);
        return cmd.length > 40 ? cmd.slice(0, 40) + "..." : cmd;
      }
    }
  }
  return "";
}
