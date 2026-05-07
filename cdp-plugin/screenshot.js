import { cli, Strategy } from "./_registry.js";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CDP_PORT, CDP_HOST, connectTarget, cdpCall, evaluate } from "./cdp-utils.js";
function getOutputPath(dir, prefix, format) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const ts = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").substring(0, 19);
  return join(dir, `${prefix}-${ts}.${format}`);
}
function chatSelector(kind) {
  return kind === "agent" ? ".agent-panel" : '[class*="composer"][class*="container"]';
}
const screenshotCommand = cli({
  site: "cursor",
  name: "screenshot",
  description: "Capture Cursor window screenshot (Agent & Editor)",
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    { name: "area", type: "str", positional: true, default: "chat", help: "Area: full / chat / selector:CSS" },
    { name: "output", type: "str", help: "Output file path" },
    { name: "img-format", type: "str", default: "png", help: "Image format: png, jpeg, webp" },
    { name: "quality", type: "int", default: 90, help: "JPEG/WebP quality (0-100)" },
    { name: "port", type: "int", default: CDP_PORT, help: "Cursor CDP port" },
    { name: "host", type: "str", default: CDP_HOST, help: "Cursor CDP host (IP or hostname)" },
    { name: "window", type: "int", default: 0, help: "Target window index" }
  ],
  columns: ["status", "file", "size"],
  func: async (_page, args) => {
    const port = Number(args.port) || CDP_PORT;
    const host = String(args.host || CDP_HOST);
    const windowIdx = Number(args.window) || 0;
    const area = String(args.area || "chat").trim();
    const format = String(args["img-format"] || "png");
    const quality = Number(args.quality) || 90;
    let ws, kind;
    try {
      ({ ws, kind } = await connectTarget(port, windowIdx, host));
    } catch (e) {
      return [{ status: "ERROR", file: e.message, size: "" }];
    }
    let msgId = 1;
    try {
      let clip;
      if (area !== "full") {
        let selector;
        if (area === "chat") {
          selector = chatSelector(kind);
        } else if (area.startsWith("selector:")) {
          selector = area.substring("selector:".length);
        } else {
          selector = chatSelector(kind);
        }
        const rect = await evaluate(ws, `
          (() => {
            const el = document.querySelector(${JSON.stringify(selector)});
            if (!el || el.offsetWidth === 0) return null;
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          })()
        `, msgId++);
        if (rect) {
          clip = { ...rect, scale: 1 };
        } else if (area !== "chat") {
          return [{ status: "ERROR", file: `Element not found: ${selector}`, size: "" }];
        }
      }
      const captureParams = { format };
      if (format !== "png") captureParams.quality = quality;
      if (clip) captureParams.clip = clip;
      const resp = await cdpCall(ws, "Page.captureScreenshot", captureParams, msgId++);
      if (resp.error || !resp.result?.data) {
        return [{ status: "ERROR", file: resp.error?.message || "Screenshot failed", size: "" }];
      }
      const imgBuffer = Buffer.from(resp.result.data, "base64");
      const outputArg = args.output ? String(args.output) : "";
      let outputPath;
      if (outputArg) {
        outputPath = outputArg;
      } else {
        const prefix = area === "full" ? "cursor-full" : area === "chat" ? "cursor-chat" : "cursor-area";
        outputPath = getOutputPath(process.cwd(), prefix, format);
      }
      writeFileSync(outputPath, imgBuffer);
      const sizeKB = (imgBuffer.length / 1024).toFixed(1);
      const dims = clip ? `${clip.width}x${clip.height}` : "full";
      return [{ status: "OK", file: outputPath, size: `${sizeKB}KB (${dims})` }];
    } finally {
      ws.close();
    }
  }
});
export {
  screenshotCommand
};
