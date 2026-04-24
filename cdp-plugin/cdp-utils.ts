import WebSocket from "ws";

export const CDP_PORT = 9226;

export interface CDPResponse {
  id: number;
  result?: { result?: { type?: string; value?: unknown }; data?: string };
  error?: { message: string };
}

export interface PageTarget {
  id: string;
  title: string;
  type: string;
  webSocketDebuggerUrl: string;
}

export type WindowKind = "agent" | "editor";

export function detectWindowKind(title: string): WindowKind {
  return title === "Cursor Agents" ? "agent" : "editor";
}

export async function listPages(port: number): Promise<PageTarget[]> {
  const resp = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!resp.ok) throw new Error("CDP not connected. Launch Cursor with --remote-debugging-port");
  const targets = (await resp.json()) as PageTarget[];
  return targets.filter((t) => t.type === "page");
}

/**
 * windowIdx is 1-based (matching `list` command output).
 * Pass 0 or omit to auto-select: prefers Agent window, falls back to first Editor.
 */
export async function connectTarget(port: number, windowIdx = 0): Promise<{ ws: WebSocket; kind: WindowKind }> {
  const pages = await listPages(port);
  if (pages.length === 0) throw new Error("No Cursor windows found");

  let target: PageTarget;
  if (windowIdx > 0) {
    const realIdx = windowIdx - 1;
    target = pages[Math.min(realIdx, pages.length - 1)];
  } else {
    target = pages.find((p) => p.title === "Cursor Agents") ?? pages[0];
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
  });
  return { ws, kind: detectWindowKind(target.title) };
}

export async function cdpCall(ws: WebSocket, method: string, params: Record<string, unknown>, id: number): Promise<CDPResponse> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 15000);
    const handler = (raw: WebSocket.Data) => {
      const msg = JSON.parse(raw.toString()) as CDPResponse;
      if (msg.id === id) {
        ws.off("message", handler);
        clearTimeout(timeout);
        resolve(msg);
      }
    };
    ws.on("message", handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

export async function evaluate(ws: WebSocket, expression: string, id: number): Promise<unknown> {
  const resp = await cdpCall(ws, "Runtime.evaluate", { expression, returnByValue: true }, id);
  if (resp.error) throw new Error(resp.error.message);
  return resp.result?.result?.value;
}

export async function dispatchMouse(ws: WebSocket, type: string, x: number, y: number, id: number): Promise<void> {
  await cdpCall(ws, "Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 }, id);
}

export async function click(ws: WebSocket, x: number, y: number, startId: number): Promise<number> {
  await dispatchMouse(ws, "mousePressed", x, y, startId);
  await dispatchMouse(ws, "mouseReleased", x, y, startId + 1);
  return startId + 2;
}

export async function pressEscape(ws: WebSocket, id: number): Promise<number> {
  await cdpCall(ws, "Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, id);
  await cdpCall(ws, "Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, id + 1);
  return id + 2;
}

/**
 * CDP 页面标题格式为 "filename - projectName - Cursor [user]"。
 * 先去掉 " - Cursor [...]" 后缀，再取最后一段作为项目名。
 */
function extractProjectFromTitle(title: string): string {
  const stripped = title.replace(/ - Cursor \[.*\]$/, "");
  const sep = stripped.lastIndexOf(" - ");
  return sep > 0 ? stripped.substring(sep + 3).trim() : stripped;
}

/**
 * 按项目名模糊匹配窗口。优先级：精确匹配 > 包含匹配。
 * 同时考虑 Agent 窗口（无法从标题判断项目，会排在最后）。
 */
export async function connectTargetByProject(
  port: number,
  projectName: string,
): Promise<{ ws: WebSocket; kind: WindowKind; matchedTitle: string }> {
  const pages = await listPages(port);
  if (pages.length === 0) throw new Error("No Cursor windows found");

  const target = projectName.toLowerCase();
  let bestPage: PageTarget | null = null;
  let bestScore = 0;

  for (const page of pages) {
    const project = extractProjectFromTitle(page.title).toLowerCase();
    let score = 0;
    if (project === target) {
      score = 100;
    } else if (project.includes(target)) {
      score = 60;
    } else if (target.includes(project)) {
      score = 40;
    }
    if (score > bestScore) {
      bestPage = page;
      bestScore = score;
    }
  }

  if (!bestPage) {
    const available = pages.map((p) => extractProjectFromTitle(p.title)).join(", ");
    throw new Error(`No window matching project "${projectName}". Available: ${available}`);
  }

  const ws = new WebSocket(bestPage.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
  });
  return { ws, kind: detectWindowKind(bestPage.title), matchedTitle: bestPage.title };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
