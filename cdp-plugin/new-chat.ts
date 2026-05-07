import { cli, Strategy } from "./_registry.js";
import { CDP_PORT, CDP_HOST, connectTarget, cdpCall, evaluate, sleep, type WindowKind } from "./cdp-utils.js";

export const newChatCommand = cli({
  site: "cursor",
  name: "new-chat",
  description: "Open a new Agent/Chat tab in Cursor",
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    { name: "port", type: "int", default: CDP_PORT, help: "Cursor CDP port" },
    { name: "host", type: "str", default: CDP_HOST, help: "Cursor CDP host (IP or hostname)" },
    { name: "window", type: "int", default: 0, help: "Target window index (0=auto)" },
  ],
  columns: ["status", "detail"],

  func: async (_page: unknown, args: Record<string, unknown>) => {
    const port = Number(args.port) || CDP_PORT;
    const host = String(args.host || CDP_HOST);
    const windowIdx = Number(args.window) || 0;

    let ws: import("ws").default, kind: WindowKind;
    try {
      ({ ws, kind } = await connectTarget(port, windowIdx, host));
    } catch (e: unknown) {
      return [{ status: "ERROR", detail: (e as Error).message }];
    }

    let msgId = 1;
    try {
      await cdpCall(ws, "Input.dispatchKeyEvent", {
        type: "keyDown", key: "n", code: "KeyN",
        windowsVirtualKeyCode: 78, modifiers: 2,
      }, msgId++);
      await cdpCall(ws, "Input.dispatchKeyEvent", {
        type: "keyUp", key: "n", code: "KeyN",
        windowsVirtualKeyCode: 78, modifiers: 2,
      }, msgId++);

      await sleep(800);

      const ready = (await evaluate(ws, `
        (() => {
          const agentInput = document.querySelector('.ui-prompt-input-editor__input');
          const editorInput = document.querySelector('.aislash-editor-input:not(.aislash-editor-input-readonly)');
          return !!(agentInput || editorInput);
        })()
      `, msgId++)) as boolean;

      const label = kind === "agent" ? "Agent" : "Chat";
      return [{ status: ready ? "OK" : "PENDING", detail: `New ${label} tab opened` }];
    } finally {
      ws.close();
    }
  },
});
