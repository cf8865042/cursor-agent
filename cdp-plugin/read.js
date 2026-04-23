import { cli, Strategy } from "./_registry.js";
import { CDP_PORT, connectTarget, evaluate } from "./cdp-utils.js";
const readCommand = cli({
  site: "cursor",
  name: "read",
  description: "Read current Chat conversation content (Agent & Editor)",
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    { name: "port", type: "int", default: CDP_PORT, help: "Cursor CDP port" },
    { name: "window", type: "int", default: 0, help: "Target window index (0=auto)" },
    { name: "limit", type: "int", default: 20, help: "Max number of messages to return" }
  ],
  columns: ["idx", "role", "content"],
  func: async (_page, args) => {
    const port = Number(args.port) || CDP_PORT;
    const windowIdx = Number(args.window) || 0;
    const limit = Number(args.limit) || 20;
    let ws, kind;
    try {
      ({ ws, kind } = await connectTarget(port, windowIdx));
    } catch (e) {
      return [{ idx: 0, role: "error", content: e.message }];
    }
    try {
      const expression = kind === "agent" ? `(() => {
            const result = [];
            const allBlocks = document.querySelectorAll(
              '[class*="human-message"], [class*="user-message"], [data-role="user"], ' +
              '[class*="assistant-message"], [class*="rendered-message"], [data-role="assistant"]'
            );
            if (allBlocks.length > 0) {
              allBlocks.forEach((el, i) => {
                const text = el.textContent.trim();
                if (!text) return;
                const cls = (el.className || '').toLowerCase();
                const role = (cls.includes('human') || cls.includes('user') || el.getAttribute('data-role') === 'user')
                  ? 'user' : 'assistant';
                result.push({ idx: result.length + 1, role, content: text.substring(0, 1500) });
              });
            }
            if (result.length === 0) {
              const turns = document.querySelectorAll('[class*="turn"], [class*="message-block"]');
              turns.forEach((el, i) => {
                const text = el.textContent.trim();
                if (!text) return;
                result.push({ idx: i + 1, role: i % 2 === 0 ? 'user' : 'assistant', content: text.substring(0, 1500) });
              });
            }
            return result;
          })()` : `(() => {
            const result = [];
            const allRendered = document.querySelectorAll('[class*="composer-rendered-message"]');
            allRendered.forEach((el, i) => {
              const text = el.textContent.trim();
              if (!text) return;
              const isUser = el.querySelector('.aislash-editor-input-readonly') !== null;
              result.push({ idx: result.length + 1, role: isUser ? 'user' : 'assistant', content: text.substring(0, 1500) });
            });
            return result;
          })()`;
      const messages = await evaluate(ws, expression, 1);
      return (messages || []).slice(-limit);
    } finally {
      ws.close();
    }
  }
});
export {
  readCommand
};
