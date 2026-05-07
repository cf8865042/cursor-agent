import { cli, Strategy } from "./_registry.js";
import { CDP_PORT, CDP_HOST, listPages } from "./cdp-utils.js";

export const listCommand = cli({
  site: "cursor",
  name: "list",
  description: "List all Cursor windows with type annotation (Agent / Editor)",
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    { name: "port", type: "int", default: CDP_PORT, help: "Cursor CDP port" },
    { name: "host", type: "str", default: CDP_HOST, help: "Cursor CDP host (IP or hostname)" },
  ],
  columns: ["idx", "type", "title", "id"],

  func: async (_page: unknown, args: Record<string, unknown>) => {
    const port = Number(args.port) || CDP_PORT;
    const host = String(args.host || CDP_HOST);

    let pages;
    try {
      pages = await listPages(port, host);
    } catch {
      return [{ idx: 0, type: "ERROR", title: "CDP not connected", id: "" }];
    }

    if (pages.length === 0) return [{ idx: 0, type: "ERROR", title: "No windows found", id: "" }];

    return pages.map((p, i) => ({
      idx: i + 1,
      type: p.title === "Cursor Agents" ? "Agent" : "Editor",
      title: p.title.replace(/ - Cursor \[.*\]$/, "").substring(0, 60),
      id: p.id.substring(0, 16),
    }));
  },
});
