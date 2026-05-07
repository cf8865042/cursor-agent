import { cli, Strategy } from "./_registry.js";
import { CDP_PORT, CDP_HOST, connectTarget, connectTargetByProject, cdpCall, evaluate, click, sleep } from "./cdp-utils.js";
const POLL_INTERVAL_MS = 3e3;
function selectors(kind) {
  if (kind === "agent") {
    return {
      inputFocus: `.ui-prompt-input-editor__input`,
      sendBtn: `.ui-prompt-input-submit-button`,
      userMsgs: `.user-message, [class*="human-message"], [data-role="user"]`,
      aiMsgs: `[class*="assistant-message"], [class*="rendered-message"], [data-role="assistant"]`,
      streaming: `[class*="streaming"], [class*="loading"], .stop-button, [class*="generating"]`
    };
  }
  return {
    inputFocus: `.aislash-editor-input:not(.aislash-editor-input-readonly)`,
    sendBtn: `.send-with-mode .anysphere-icon-button`,
    userMsgs: `.aislash-editor-input-readonly`,
    aiMsgs: `[class*="composer-rendered-message"]`,
    streaming: `[class*="streaming"], [class*="loading-indicator"], .stop-button`
  };
}
const sendCommand = cli({
  site: "cursor",
  name: "send",
  description: "Send a prompt to Cursor Chat and wait for AI reply (Agent & Editor)",
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    { name: "prompt", type: "str", required: true, positional: true, help: "Prompt text to send" },
    { name: "port", type: "int", default: CDP_PORT, help: "Cursor CDP port" },
    { name: "host", type: "str", default: CDP_HOST, help: "Cursor CDP host (IP or hostname)" },
    { name: "window", type: "int", default: 0, help: "Target window index (0=auto)" },
    { name: "timeout", type: "int", default: 60, help: "Timeout seconds for AI reply" },
    { name: "project", type: "str", default: "", help: "Expected project name (fuzzy). If set, verify before sending" }
  ],
  columns: ["role", "content"],
  func: async (_page, args) => {
    const prompt = String(args.prompt);
    const port = Number(args.port) || CDP_PORT;
    const host = String(args.host || CDP_HOST);
    const windowIdx = Number(args.window) || 0;
    const timeoutMs = (Number(args.timeout) || 60) * 1e3;
    const expectedProject = String(args.project || "").trim();
    let ws, kind;
    try {
      if (expectedProject && windowIdx === 0) {
        ({ ws, kind } = await connectTargetByProject(port, expectedProject, host));
      } else {
        ({ ws, kind } = await connectTarget(port, windowIdx, host));
      }
    } catch (e) {
      return [{ role: "error", content: e.message }];
    }
    const sel = selectors(kind);
    let msgId = 1;
    try {
      if (expectedProject && kind === "agent") {
        const currentProject = await evaluate(ws, `
          (() => {
            const trigger = document.querySelector('.ui-select-trigger');
            return trigger ? trigger.textContent.trim() : '';
          })()
        `, msgId++);
        const current = currentProject.toLowerCase();
        const expected = expectedProject.toLowerCase();
        if (!current.includes(expected) && !expected.includes(current)) {
          const parts = currentProject.replace(/\\/g, "/").split("/");
          const lastName = parts[parts.length - 1].toLowerCase();
          if (lastName !== expected && !lastName.includes(expected)) {
            return [{ role: "error", content: `Project mismatch: current="${currentProject}", expected contains "${expectedProject}". Run project-switch first.` }];
          }
        }
      }
      const beforeCount = await evaluate(ws, `
        document.querySelectorAll('${sel.userMsgs}').length
      `, msgId++);
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
      const btnPos = await evaluate(ws, `
        (() => {
          const btn = document.querySelector('${sel.sendBtn}');
          if (!btn) return null;
          const rect = btn.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        })()
      `, msgId++);
      if (!btnPos) return [{ role: "error", content: `Send button not found (${kind} window). Ensure Chat panel is visible` }];
      msgId = await click(ws, btnPos.x, btnPos.y, msgId);
      const startTime = Date.now();
      let aiReply = "";
      while (Date.now() - startTime < timeoutMs) {
        await sleep(POLL_INTERVAL_MS);
        const state = await evaluate(ws, `
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
        `, msgId++);
        if (state.userCount > beforeCount && state.lastRendered && !state.isStreaming) {
          aiReply = state.lastRendered;
          break;
        }
        if (state.userCount > beforeCount && state.isStreaming) continue;
      }
      if (!aiReply) {
        const finalState = await evaluate(ws, `
          (() => {
            const rendered = document.querySelectorAll('${sel.aiMsgs}');
            return rendered.length > 0 ? rendered[rendered.length - 1].textContent.substring(0, 3000) : '';
          })()
        `, msgId++);
        aiReply = finalState || "(AI reply timed out)";
      }
      return [
        { role: "user", content: prompt },
        { role: "assistant", content: aiReply }
      ];
    } finally {
      ws.close();
    }
  }
});
export {
  sendCommand
};
