import { cli, Strategy } from "./_registry.js";
import { CDP_PORT, CDP_HOST, connectTarget, evaluate, click, pressEscape, sleep } from "./cdp-utils.js";

export const modelCommand = cli({
  site: "cursor",
  name: "model",
  description: "List available Cursor models and current selection",
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    { name: "port", type: "int", default: CDP_PORT, help: "Cursor CDP port" },
    { name: "host", type: "str", default: CDP_HOST, help: "Cursor CDP host (IP or hostname)" },
    { name: "window", type: "int", default: 0, help: "Target window index" },
  ],
  columns: ["idx", "name", "tier", "current"],

  func: async (_page: unknown, args: Record<string, unknown>) => {
    const port = Number(args.port) || CDP_PORT;
    const host = String(args.host || CDP_HOST);
    const windowIdx = Number(args.window) || 0;

    let ws: import("ws").default;
    try {
      ({ ws } = await connectTarget(port, windowIdx, host));
    } catch (e: unknown) {
      return [{ idx: 0, name: "ERROR", tier: "", current: (e as Error).message }];
    }

    let msgId = 1;
    try {
      const currentModel = (await evaluate(ws, `
        (() => {
          const trigger = document.querySelector('.ui-model-picker__trigger-text');
          return trigger ? trigger.textContent.trim() : '';
        })()
      `, msgId++)) as string;

      const btnPos = (await evaluate(ws, `
        (() => {
          const btn = document.querySelector('.ui-model-picker__trigger');
          if (!btn) return null;
          const r = btn.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        })()
      `, msgId++)) as { x: number; y: number } | null;

      if (!btnPos) return [{ idx: 0, name: "ERROR", tier: "", current: "Model picker not found" }];

      msgId = await click(ws, btnPos.x, btnPos.y, msgId);
      await sleep(500);

      const models = (await evaluate(ws, `
        (() => {
          const rows = document.querySelectorAll('.ui-model-picker__menu .ui-menu__row');
          const result = [];
          let idx = 0;
          rows.forEach(row => {
            const nameEl = row.querySelector('.ui-model-picker__item-content-name');
            if (!nameEl) return;
            const fullText = nameEl.textContent.trim();
            const tierMatch = fullText.match(/\\s+(Fast|Medium|High|Low)$/i);
            const tier = tierMatch ? tierMatch[1] : '';
            const name = tier ? fullText.replace(/\\s+(Fast|Medium|High|Low)$/i, '').trim() : fullText;
            idx++;
            result.push({ idx, name, tier });
          });
          return result;
        })()
      `, msgId++)) as Array<{ idx: number; name: string; tier: string }>;

      msgId = await pressEscape(ws, msgId);

      return (models || []).map((m) => {
        const isMatch = currentModel && (
          currentModel === m.name ||
          currentModel === `${m.name}  ${m.tier}`.trim() ||
          currentModel === `${m.name} ${m.tier}`.trim() ||
          currentModel.replace(/\s+/g, " ") === `${m.name} ${m.tier}`.trim()
        );
        return { ...m, current: isMatch ? "\u2713" : "" };
      });
    } finally {
      ws.close();
    }
  },
});

export const modelSwitchCommand = cli({
  site: "cursor",
  name: "model-switch",
  description: "Switch Cursor model by fuzzy match",
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    { name: "name", type: "str", required: true, positional: true, help: "Target model name (fuzzy match)" },
    { name: "port", type: "int", default: CDP_PORT, help: "Cursor CDP port" },
    { name: "host", type: "str", default: CDP_HOST, help: "Cursor CDP host (IP or hostname)" },
    { name: "window", type: "int", default: 0, help: "Target window index" },
  ],
  columns: ["status", "model"],

  func: async (_page: unknown, args: Record<string, unknown>) => {
    const port = Number(args.port) || CDP_PORT;
    const host = String(args.host || CDP_HOST);
    const windowIdx = Number(args.window) || 0;
    const targetName = String(args.name).toLowerCase().trim();

    let ws: import("ws").default;
    try {
      ({ ws } = await connectTarget(port, windowIdx, host));
    } catch (e: unknown) {
      return [{ status: "ERROR", model: (e as Error).message }];
    }

    let msgId = 1;
    try {
      const btnPos = (await evaluate(ws, `
        (() => {
          const btn = document.querySelector('.ui-model-picker__trigger');
          if (!btn) return null;
          const r = btn.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        })()
      `, msgId++)) as { x: number; y: number } | null;

      if (!btnPos) return [{ status: "ERROR", model: "Model picker not found" }];

      msgId = await click(ws, btnPos.x, btnPos.y, msgId);
      await sleep(500);

      const matchResult = (await evaluate(ws, `
        (() => {
          const target = ${JSON.stringify(targetName)};
          const rows = document.querySelectorAll('.ui-model-picker__menu .ui-menu__row');
          let bestMatch = null;
          let bestScore = 0;
          rows.forEach(row => {
            const nameEl = row.querySelector('.ui-model-picker__item-content-name');
            if (!nameEl) return;
            const text = nameEl.textContent.trim().toLowerCase();
            if (text === target) { bestMatch = row; bestScore = 100; return; }
            if (text.includes(target) || target.includes(text)) {
              const score = 50 + (text.length > target.length ? 0 : 10);
              if (score > bestScore) { bestMatch = row; bestScore = score; }
              return;
            }
            const words = target.split(/\\s+/);
            if (words.every(w => text.includes(w)) && words.length > 0) {
              const score = 30 + words.length * 5;
              if (score > bestScore) { bestMatch = row; bestScore = score; }
            }
          });
          if (bestMatch && bestScore > 0) {
            const n = bestMatch.querySelector('.ui-model-picker__item-content-name');
            const r = bestMatch.getBoundingClientRect();
            return { found: true, name: n ? n.textContent.trim() : '', x: r.x + r.width/2, y: r.y + r.height/2 };
          }
          const available = [];
          rows.forEach(row => { const n = row.querySelector('.ui-model-picker__item-content-name'); if (n) available.push(n.textContent.trim()); });
          return { found: false, available };
        })()
      `, msgId++)) as { found: boolean; name?: string; x?: number; y?: number; available?: string[] };

      if (!matchResult.found) {
        await pressEscape(ws, msgId);
        const avail = matchResult.available?.join(", ") || "";
        return [{ status: "NOT FOUND", model: `"${targetName}" not matched. Available: ${avail}` }];
      }

      msgId = await click(ws, matchResult.x!, matchResult.y!, msgId);
      await sleep(300);

      const newModel = (await evaluate(ws, `
        (() => {
          const trigger = document.querySelector('.ui-model-picker__trigger-text');
          return trigger ? trigger.textContent.trim() : '';
        })()
      `, msgId++)) as string;

      return [{ status: "OK", model: newModel || matchResult.name || "" }];
    } finally {
      ws.close();
    }
  },
});
