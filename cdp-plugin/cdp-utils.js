import WebSocket from "ws";
const CDP_PORT = 9226;
function detectWindowKind(title) {
  return title === "Cursor Agents" ? "agent" : "editor";
}
async function listPages(port) {
  const resp = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!resp.ok) throw new Error("CDP not connected. Launch Cursor with --remote-debugging-port");
  const targets = await resp.json();
  return targets.filter((t) => t.type === "page");
}
async function connectTarget(port, windowIdx = 0) {
  const pages = await listPages(port);
  if (pages.length === 0) throw new Error("No Cursor windows found");
  let target;
  if (windowIdx > 0) {
    const realIdx = windowIdx - 1;
    target = pages[Math.min(realIdx, pages.length - 1)];
  } else {
    target = pages.find((p) => p.title === "Cursor Agents") ?? pages[0];
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
  });
  return { ws, kind: detectWindowKind(target.title) };
}
async function cdpCall(ws, method, params, id) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 15e3);
    const handler = (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id === id) {
        ws.off("message", handler);
        clearTimeout(timeout);
        resolve(msg);
      }
    };
    ws.on("message", handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(ws, expression, id) {
  const resp = await cdpCall(ws, "Runtime.evaluate", { expression, returnByValue: true }, id);
  if (resp.error) throw new Error(resp.error.message);
  return resp.result?.result?.value;
}
async function dispatchMouse(ws, type, x, y, id) {
  await cdpCall(ws, "Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 }, id);
}
async function click(ws, x, y, startId) {
  await dispatchMouse(ws, "mousePressed", x, y, startId);
  await dispatchMouse(ws, "mouseReleased", x, y, startId + 1);
  return startId + 2;
}
async function pressEscape(ws, id) {
  await cdpCall(ws, "Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, id);
  await cdpCall(ws, "Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, id + 1);
  return id + 2;
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
export {
  CDP_PORT,
  cdpCall,
  click,
  connectTarget,
  detectWindowKind,
  dispatchMouse,
  evaluate,
  listPages,
  pressEscape,
  sleep
};
