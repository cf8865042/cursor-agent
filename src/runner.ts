import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { parseStreamLine } from "./parser.js";
import type {
  RunOptions,
  RunResult,
  AssistantEvent,
  ResultEvent,
  ToolCallEvent,
  SystemInitEvent,
} from "./types.js";

/** 强制终止进程树 */
function killProcess(proc: ChildProcess): void {
  if (!proc.pid) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/F", "/T", "/PID", String(proc.pid)], { stdio: "ignore" });
    } else {
      process.kill(-proc.pid, "SIGKILL");
    }
  } catch {
    try { proc.kill("SIGKILL"); } catch { /* 忽略 */ }
  }
}

/** 构建 PowerShell 命令（Windows）或 bash 命令（Linux/macOS） */
function buildCommand(opts: RunOptions): { cmd: string; args: string[] } {
  const agentArgs: string[] = [
    "-p", "--trust",
    "--output-format", "stream-json",
    "--mode", opts.mode,
  ];

  if (opts.enableMcp) {
    agentArgs.push("--approve-mcps");
  }
  if (opts.model) {
    agentArgs.push("--model", opts.model);
  }

  agentArgs.push(opts.prompt);

  if (process.platform === "win32") {
    // Windows: 通过 PowerShell 调用 agent.cmd
    const escaped = opts.prompt.replace(/'/g, "''");
    const agentLine = [
      "agent", "-p", "--trust",
      "--output-format", "stream-json",
      "--mode", opts.mode,
      ...(opts.enableMcp ? ["--approve-mcps"] : []),
      ...(opts.model ? ["--model", `'${opts.model}'`] : []),
      `'${escaped}'`,
    ].join(" ");

    const psCommand = `Set-Location '${opts.projectPath}'; ${agentLine}`;
    return { cmd: "powershell.exe", args: ["-NoProfile", "-Command", psCommand] };
  }

  // Linux/macOS: 直接调用 agent
  return { cmd: opts.agentPath, args: agentArgs };
}

/** 执行 Cursor Agent CLI，返回分析结果 */
export async function runCursorAgent(opts: RunOptions): Promise<RunResult> {
  const startTime = Date.now();
  const { cmd, args } = buildCommand(opts);

  const proc = spawn(cmd, args, {
    cwd: process.platform === "win32" ? undefined : opts.projectPath,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let sessionId: string | undefined;
  let resultText = "";
  const assistantTexts: string[] = [];
  let toolCallCount = 0;
  let completed = false;
  let error: string | undefined;
  let usage: ResultEvent["usage"];
  let lastOutputTime = Date.now();

  // 总超时
  const totalTimeout = setTimeout(() => {
    if (!completed) {
      error = `total timeout (${opts.timeoutSec}s)`;
      killProcess(proc);
    }
  }, opts.timeoutSec * 1000);

  // 无输出超时检查（每 5 秒检查一次）
  const noOutputCheck = setInterval(() => {
    if (Date.now() - lastOutputTime > opts.noOutputTimeoutSec * 1000) {
      if (!completed) {
        error = `no output timeout (${opts.noOutputTimeoutSec}s)`;
        killProcess(proc);
      }
    }
  }, 5000);

  // 外部取消信号
  const onAbort = () => {
    if (!completed) {
      error = "aborted";
      killProcess(proc);
    }
  };
  opts.signal?.addEventListener("abort", onAbort, { once: true });

  return new Promise<RunResult>((resolve) => {
    const rl = createInterface({ input: proc.stdout!, crlfDelay: Infinity });

    rl.on("line", (line) => {
      lastOutputTime = Date.now();
      const event = parseStreamLine(line);
      if (!event) return;

      switch (event.type) {
        case "system":
          if (event.subtype === "init") {
            sessionId = (event as SystemInitEvent).session_id;
          }
          break;

        case "assistant": {
          const ae = event as AssistantEvent;
          const text = ae.message?.content?.[0]?.text;
          if (text) assistantTexts.push(text);
          break;
        }

        case "tool_call": {
          const tc = event as ToolCallEvent;
          if (tc.subtype === "started") {
            toolCallCount++;
          }
          break;
        }

        case "result": {
          const re = event as ResultEvent;
          resultText = re.result ?? assistantTexts.join("\n");
          usage = re.usage;
          completed = true;
          break;
        }
      }
    });

    const cleanup = () => {
      clearTimeout(totalTimeout);
      clearInterval(noOutputCheck);
      opts.signal?.removeEventListener("abort", onAbort);

      // 完成后延迟 kill（应对进程不退出的已知 bug）
      setTimeout(() => killProcess(proc), 3000);

      const durationMs = Date.now() - startTime;
      const finalText = resultText || assistantTexts.join("\n");

      resolve({
        success: !error && completed,
        resultText: finalText || (error ? `Cursor Agent 执行失败: ${error}` : "未获取到分析结果"),
        sessionId,
        durationMs,
        toolCallCount,
        error,
        usage,
      });
    };

    proc.on("close", cleanup);
    proc.on("error", (err) => {
      error = err.message;
      cleanup();
    });
  });
}
