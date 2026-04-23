import { cli, Strategy } from "./_registry.js";
import { CDP_PORT, connectTarget, evaluate, click, pressEscape, sleep } from "./cdp-utils.js";
async function readAgentHistory(ws, keyword) {
  const hasKeyword = keyword && keyword !== "undefined";
  const result = await evaluate(ws, `
    (() => {
      const groups = document.querySelectorAll('.ui-sidebar-group');
      const result = [];
      let idx = 0;
      const kw = ${JSON.stringify(hasKeyword ? keyword.toLowerCase() : "")};
      for (const g of groups) {
        const labelEl = g.querySelector('.ui-sidebar-group-label, [class*="group-label"]');
        const group = labelEl ? labelEl.textContent.trim() : '';
        if (!group) continue;
        const items = g.querySelectorAll('.ui-sidebar-menu-item');
        for (const item of items) {
          const btn = item.querySelector('.glass-sidebar-agent-menu-btn');
          if (!btn) continue;
          const nameEl = btn.querySelector('[class*="label"], [class*="title"], [class*="name"]');
          const name = nameEl ? nameEl.textContent.trim() : btn.textContent.trim();
          if (!name || name === 'More') continue;
          if (kw && !name.toLowerCase().includes(kw) && !group.toLowerCase().includes(kw)) continue;
          idx++;
          result.push({ idx, group, name });
        }
      }
      return result;
    })()
  `, 1);
  return result;
}
async function readEditorHistory(ws, keyword) {
  const hasKeyword = keyword && keyword !== "undefined";
  let msgId = 1;
  const btnPos = await evaluate(ws, `
    (() => {
      const btn = document.querySelector('[class*="codicon-history"]');
      if (!btn) return null;
      const clickable = btn.closest('a, button, [role="button"], .action-label') || btn;
      const rect = clickable.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })()
  `, msgId++);
  if (!btnPos) return [{ idx: 0, group: "ERROR", name: "History button not found" }];
  msgId = await click(ws, btnPos.x, btnPos.y, msgId);
  await sleep(600);
  const panelReady = await evaluate(ws, `
    !!document.querySelector('.compact-agent-history-react-menu-content')
  `, msgId++);
  if (!panelReady) return [{ idx: 0, group: "ERROR", name: "History panel did not open" }];
  if (hasKeyword) {
    await evaluate(ws, `
      (() => {
        const input = document.querySelector('.compact-agent-history-search-input');
        if (input) {
          input.focus();
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(input, ${JSON.stringify(keyword)});
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()
    `, msgId++);
    await sleep(500);
  }
  const sessions = await evaluate(ws, `
    (() => {
      const result = [];
      let idx = 0;
      const sections = document.querySelectorAll('.compact-agent-history-react-menu-content > .ui-menu__section');
      for (const sec of sections) {
        const titleEl = sec.querySelector('.ui-menu__section-title');
        const group = titleEl ? titleEl.textContent.trim() : '';
        if (!group) continue;
        const rows = sec.querySelectorAll('.ui-menu__row');
        for (const row of rows) {
          const label = row.querySelector('.compact-agent-history-react-menu-label');
          if (label) {
            idx++;
            result.push({ idx, group, name: label.textContent.trim() });
          }
        }
      }
      return result;
    })()
  `, msgId++);
  await pressEscape(ws, msgId);
  return sessions;
}
const historyCommand = cli({
  site: "cursor",
  name: "history",
  description: "List chat history sessions (Agent: by project, Editor: by time)",
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    { name: "keyword", type: "str", positional: true, help: "Search keyword" },
    { name: "port", type: "int", default: CDP_PORT, help: "Cursor CDP port" },
    { name: "window", type: "int", default: 0, help: "Target window index (0=auto)" }
  ],
  columns: ["idx", "group", "name"],
  func: async (_page, args) => {
    const port = Number(args.port) || CDP_PORT;
    const windowIdx = Number(args.window) || 0;
    const keyword = String(args.keyword || "").trim();
    let ws, kind;
    try {
      ({ ws, kind } = await connectTarget(port, windowIdx));
    } catch (e) {
      return [{ idx: 0, group: "ERROR", name: e.message }];
    }
    try {
      const sessions = kind === "agent" ? await readAgentHistory(ws, keyword) : await readEditorHistory(ws, keyword);
      const hasKeyword = keyword && keyword !== "undefined";
      return sessions && sessions.length > 0 ? sessions : [{ idx: 0, group: "-", name: hasKeyword ? `No sessions matching "${keyword}"` : "No history sessions" }];
    } finally {
      ws.close();
    }
  }
});
export {
  historyCommand
};
