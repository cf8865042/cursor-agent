import { cli, Strategy } from "./_registry.js";
const CDP_PORT = 9226;
const listCommand = cli({
  site: "cursor",
  name: "list",
  description: "List all Cursor windows with type annotation (Agent / Editor)",
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    { name: "port", type: "int", default: CDP_PORT, help: "Cursor CDP port" }
  ],
  columns: ["idx", "type", "title", "id"],
  func: async (_page, args) => {
    const port = Number(args.port) || CDP_PORT;
    const resp = await fetch(`http://127.0.0.1:${port}/json/list`);
    if (!resp.ok) return [{ idx: 0, type: "ERROR", title: "CDP not connected", id: "" }];
    const targets = await resp.json();
    const pages = targets.filter((t) => t.type === "page");
    if (pages.length === 0) return [{ idx: 0, type: "ERROR", title: "No windows found", id: "" }];
    return pages.map((p, i) => ({
      idx: i + 1,
      type: p.title === "Cursor Agents" ? "Agent" : "Editor",
      title: p.title.replace(/ - Cursor \[.*\]$/, "").substring(0, 60),
      id: p.id.substring(0, 16)
    }));
  }
});
export {
  listCommand
};
