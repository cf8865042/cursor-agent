import { cli, Strategy } from "./_registry.js";
import { CDP_PORT, CDP_HOST, connectTarget, evaluate, click, pressEscape, sleep, type WindowKind } from "./cdp-utils.js";

export const projectCommand = cli({
  site: "cursor",
  name: "project",
  description: "List available projects/workspaces in Agent window",
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    { name: "port", type: "int", default: CDP_PORT, help: "Cursor CDP port" },
    { name: "host", type: "str", default: CDP_HOST, help: "Cursor CDP host (IP or hostname)" },
    { name: "window", type: "int", default: 0, help: "Target window index" },
  ],
  columns: ["idx", "name", "current"],

  func: async (_page: unknown, args: Record<string, unknown>) => {
    const port = Number(args.port) || CDP_PORT;
    const host = String(args.host || CDP_HOST);
    const windowIdx = Number(args.window) || 0;

    let ws: import("ws").default, kind: WindowKind;
    try {
      ({ ws, kind } = await connectTarget(port, windowIdx, host));
    } catch (e: unknown) {
      return [{ idx: 0, name: (e as Error).message, current: "ERROR" }];
    }

    if (kind !== "agent") {
      ws.close();
      return [{ idx: 0, name: "This command only works in the Agent standalone window", current: "ERROR" }];
    }

    let msgId = 1;
    try {
      const currentProject = (await evaluate(ws, `
        (() => {
          const trigger = document.querySelector('.ui-select-trigger');
          return trigger ? trigger.textContent.trim() : '';
        })()
      `, msgId++)) as string;

      const triggerPos = (await evaluate(ws, `
        (() => {
          const btn = document.querySelector('.ui-select-trigger');
          if (!btn) return null;
          const r = btn.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        })()
      `, msgId++)) as { x: number; y: number } | null;

      if (!triggerPos) {
        return [{ idx: 0, name: "Project picker not found (requires blank New Agent page)", current: "ERROR" }];
      }

      msgId = await click(ws, triggerPos.x, triggerPos.y, msgId);
      await sleep(500);

      const projects = (await evaluate(ws, `
        (() => {
          const menu = document.querySelector('.project-selector-menu');
          if (!menu) return [];
          const rows = menu.querySelectorAll('.ui-menu__row');
          const result = [];
          let idx = 0;
          rows.forEach(row => {
            const text = row.textContent.trim();
            if (!text || text === 'Open Folder' || text === 'Connect SSH') return;
            idx++;
            result.push({ idx, name: text });
          });
          return result;
        })()
      `, msgId++)) as Array<{ idx: number; name: string }>;

      msgId = await pressEscape(ws, msgId);

      return (projects || []).map((p) => ({
        ...p,
        current: p.name === currentProject ? "\u2713" : "",
      }));
    } finally {
      ws.close();
    }
  },
});

export const projectSwitchCommand = cli({
  site: "cursor",
  name: "project-switch",
  description: "Switch project/workspace in Agent window (fuzzy match)",
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    { name: "name", type: "str", required: true, positional: true, help: "Target project name (fuzzy match on path tail)" },
    { name: "port", type: "int", default: CDP_PORT, help: "Cursor CDP port" },
    { name: "host", type: "str", default: CDP_HOST, help: "Cursor CDP host (IP or hostname)" },
    { name: "window", type: "int", default: 0, help: "Target window index" },
  ],
  columns: ["status", "project"],

  func: async (_page: unknown, args: Record<string, unknown>) => {
    const port = Number(args.port) || CDP_PORT;
    const host = String(args.host || CDP_HOST);
    const windowIdx = Number(args.window) || 0;
    const targetName = String(args.name).toLowerCase().trim();

    let ws: import("ws").default, kind: WindowKind;
    try {
      ({ ws, kind } = await connectTarget(port, windowIdx, host));
    } catch (e: unknown) {
      return [{ status: "ERROR", project: (e as Error).message }];
    }

    if (kind !== "agent") {
      ws.close();
      return [{ status: "ERROR", project: "This command only works in the Agent standalone window" }];
    }

    let msgId = 1;
    try {
      const triggerPos = (await evaluate(ws, `
        (() => {
          const btn = document.querySelector('.ui-select-trigger');
          if (!btn) return null;
          const r = btn.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        })()
      `, msgId++)) as { x: number; y: number } | null;

      if (!triggerPos) {
        return [{ status: "ERROR", project: "Project picker not found (requires blank New Agent page)" }];
      }

      msgId = await click(ws, triggerPos.x, triggerPos.y, msgId);
      await sleep(500);

      const matchResult = (await evaluate(ws, `
        (() => {
          const target = ${JSON.stringify(targetName)};
          const menu = document.querySelector('.project-selector-menu');
          if (!menu) return { found: false, available: [] };
          const rows = menu.querySelectorAll('.ui-menu__row');
          let bestMatch = null;
          let bestScore = 0;
          const available = [];

          rows.forEach(row => {
            const text = row.textContent.trim();
            if (!text || text === 'Open Folder' || text === 'Connect SSH') return;
            available.push(text);
            const lower = text.toLowerCase();
            const parts = text.replace(/\\\\/g, '/').split('/');
            const lastName = parts[parts.length - 1].toLowerCase();

            if (lower === target) { bestMatch = row; bestScore = 100; return; }
            if (lastName === target) { bestMatch = row; bestScore = 90; return; }
            if (lower.includes(target)) {
              const score = 50;
              if (score > bestScore) { bestMatch = row; bestScore = score; }
              return;
            }
            if (lastName.includes(target)) {
              const score = 40;
              if (score > bestScore) { bestMatch = row; bestScore = score; }
            }
          });

          if (bestMatch && bestScore > 0) {
            const r = bestMatch.getBoundingClientRect();
            return { found: true, name: bestMatch.textContent.trim(), x: r.x + r.width/2, y: r.y + r.height/2 };
          }
          return { found: false, available };
        })()
      `, msgId++)) as { found: boolean; name?: string; x?: number; y?: number; available?: string[] };

      if (!matchResult.found) {
        msgId = await pressEscape(ws, msgId);
        const avail = matchResult.available?.join(", ") || "";
        return [{ status: "NOT FOUND", project: `"${targetName}" not matched. Available: ${avail}` }];
      }

      const beforeProject = (await evaluate(ws, `
        (() => {
          const trigger = document.querySelector('.ui-select-trigger');
          return trigger ? trigger.textContent.trim() : '';
        })()
      `, msgId++)) as string;

      msgId = await click(ws, matchResult.x!, matchResult.y!, msgId);

      const SWITCH_TIMEOUT_MS = 8000;
      const SWITCH_POLL_MS = 500;
      const switchStart = Date.now();
      let newProject = "";
      let switchReady = false;

      while (Date.now() - switchStart < SWITCH_TIMEOUT_MS) {
        await sleep(SWITCH_POLL_MS);

        const switchState = (await evaluate(ws, `
          (() => {
            const trigger = document.querySelector('.ui-select-trigger');
            const triggerText = trigger ? trigger.textContent.trim() : '';
            const input = document.querySelector('.ui-prompt-input-editor__input');
            const inputReady = !!input && input.getBoundingClientRect().height > 0;
            const menu = document.querySelector('.project-selector-menu');
            const menuDismissed = !menu || menu.getBoundingClientRect().height === 0;
            return { triggerText, inputReady, menuDismissed };
          })()
        `, msgId++)) as { triggerText: string; inputReady: boolean; menuDismissed: boolean };

        newProject = switchState.triggerText;
        const triggerChanged = newProject !== beforeProject;

        if (triggerChanged && switchState.inputReady && switchState.menuDismissed) {
          switchReady = true;
          break;
        }
      }

      if (!switchReady) {
        return [{ status: "TIMEOUT", project: `Switch may not have completed. Current: "${newProject}", Expected: "${matchResult.name}"` }];
      }

      return [{ status: "OK", project: newProject || matchResult.name || "" }];
    } finally {
      ws.close();
    }
  },
});
