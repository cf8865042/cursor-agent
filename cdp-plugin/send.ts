import { cli, Strategy } from "./_registry.js";
import { CDP_PORT, connectTarget, cdpCall, evaluate, click, sleep, type WindowKind } from "./cdp-utils.js";

const POLL_INTERVAL_MS = 3000;

function selectors(kind: WindowKind) {
  if (kind === "agent") {
    return {
      inputFocus: `.ui-prompt-input-editor__input`,
      sendBtn: `.ui-prompt-input-submit-button`,
      userMsgs: `.user-message, [class*="human-message"], [data-role="user"]`,
      aiMsgs: `[class*="assistant-message"], [class*="rendered-message"], [data-role="assistant"]`,
      streaming: `[class*="streaming"], [class*="loading"], .stop-button, [class*="generating"]`,
    };
  }
  return {
    inputFocus: `.aislash-editor-input:not(.aislash-editor-input-readonly)`,
    sendBtn: `.send-with-mode .anysphere-icon-button`,
    userMsgs: `.aislash-editor-input-readonly`,
    aiMsgs: `[class*="composer-rendered-message"]`,
    streaming: `[class*="streaming"], [class*="loading-indicator"], .stop-button`,
  };
}

export const sendCommand = cli({
  site: "cursor",
  name: "send",
  description: "Send a prompt to Cursor Chat and wait for AI reply (Agent & Editor)",
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    { name: "prompt", type: "str", required: true, positional: true, help: "Prompt text to send" },
    { name: "port", type: "int", default: CDP_PORT, help: "Cursor CDP port" },
    { name: "window", type: "int", default: 0, help: "Target window index (0=auto)" },
    { name: "timeout", type: "int", default: 60, help: "Timeout seconds for AI reply" },
  ],
  columns: ["role", "content"],

  func: async (_page: unknown, args: Record<string, unknown>) => {
    const prompt = String(args.prompt);
    const port = Number(args.port) || CDP_PORT;
    const windowIdx = Number(args.window) || 0;
    const timeoutMs = (Number(args.timeout) || 60) * 1000;

    let ws, kind: WindowKind;
    try {
      ({ ws, kind } = await connectTarget(port, windowIdx));
    } catch (e: unknown) {
      return [{ role: "error", content: (e as Error).message }];
    }

    const sel = selectors(kind);
    let msgId = 1;

    try {
      const beforeCount = (await evaluate(ws, `
        document.querySelectorAll('${sel.userMsgs}').length
      `, msgId++)) as number;

      await evaluate(ws, `
        (() => {
          const input = document.querySelector('${sel.inputFocus}');
          if (input) { input.focus(); input.click && input.click(); }
          return !!input;
        })()
      `, msgId++);
      await sleep(300);

      await cdpCall(ws, "Input.insertText", { text: prompt }, msgId++);
      await sleep(500);

      const btnPos = (await evaluate(ws, `
        (() => {
          const btn = document.querySelector('${sel.sendBtn}');
          if (!btn) return null;
          const rect = btn.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        })()
      `, msgId++)) as { x: number; y: number } | null;

      if (!btnPos) return [{ role: "error", content: `Send button not found (${kind} window). Ensure Chat panel is visible` }];

      msgId = await click(ws, btnPos.x, btnPos.y, msgId);

      const startTime = Date.now();
      let aiReply = "";

      while (Date.now() - startTime < timeoutMs) {
        await sleep(POLL_INTERVAL_MS);

        const state = (await evaluate(ws, `
          (() => {
            const userMsgs = document.querySelectorAll('${sel.userMsgs}');
            const rendered = document.querySelectorAll('${sel.aiMsgs}');
            const lastRendered = rendered.length > 0 ? rendered[rendered.length - 1].textContent.trim() : '';
            const isStreaming = !!document.querySelector('${sel.streaming}');
            return {
              userCount: userMsgs.length,
              lastRendered: lastRendered.substring(0, 2000),
              isStreaming,
            };
          })()
        `, msgId++)) as { userCount: number; lastRendered: string; isStreaming: boolean };

        if (state.userCount > beforeCount && state.lastRendered && !state.isStreaming) {
          aiReply = state.lastRendered;
          break;
        }
        if (state.userCount > beforeCount && state.isStreaming) continue;
      }

      if (!aiReply) {
        const finalState = (await evaluate(ws, `
          (() => {
            const rendered = document.querySelectorAll('${sel.aiMsgs}');
            return rendered.length > 0 ? rendered[rendered.length - 1].textContent.substring(0, 3000) : '';
          })()
        `, msgId++)) as string;
        aiReply = finalState || "(AI reply timed out)";
      }

      return [
        { role: "user", content: prompt },
        { role: "assistant", content: aiReply },
      ];
    } finally {
      ws.close();
    }
  },
});
