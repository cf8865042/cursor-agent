import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { runCursorAgent } from "./runner.js";
import type { CursorAgentConfig } from "./types.js";

const PLUGIN_ID = "cursor-agent";

const DEFAULT_TIMEOUT_SEC = 600;
const DEFAULT_NO_OUTPUT_TIMEOUT_SEC = 120;
const DEFAULT_ENABLE_MCP = true;
const DEFAULT_MODE = "ask" as const;

/** 自动检测 agent 命令路径 */
function detectAgentPath(): string | null {
  try {
    const cmd = process.platform === "win32" ? "where agent" : "which agent";
    const result = execSync(cmd, { encoding: "utf-8", timeout: 5000 }).trim();
    const first = result.split(/\r?\n/)[0]?.trim();
    if (first && existsSync(first)) return first;
  } catch { /* 忽略 */ }

  // Windows 默认安装路径
  if (process.platform === "win32") {
    const home = process.env.USERPROFILE || "";
    const defaultPath = resolve(home, "AppData/Local/cursor-agent/agent.cmd");
    if (existsSync(defaultPath)) return defaultPath;
  }

  return null;
}

/** 构建项目列表描述（注入到工具 description 中） */
function buildProjectListDesc(projects?: Record<string, string>): string {
  if (!projects || Object.keys(projects).length === 0) {
    return "无预配置项目，需传入完整的项目路径。";
  }
  return "可用项目: " + Object.keys(projects).join(", ") + "。";
}

export default {
  id: PLUGIN_ID,
  configSchema: { type: "object" as const },

  register(api: any) {
    // pluginConfig 包含 plugins.entries.<id>.config 中的插件专属配置
    const cfg: CursorAgentConfig = api.pluginConfig ?? {};

    const agentPath = cfg.agentPath || detectAgentPath();
    if (!agentPath) {
      console.warn(`[${PLUGIN_ID}] Cursor Agent CLI not found, plugin disabled`);
      return;
    }

    const projects = cfg.projects ?? {};
    const projectListDesc = buildProjectListDesc(projects);
    const projectNames = Object.keys(projects);

    api.registerTool({
      name: "cursor_agent",
      label: "Cursor Agent",
      description:
        `调用本机 Cursor Agent 对项目进行深度代码分析和排查。` +
        `Cursor Agent 能利用项目的 .cursor/rules、AGENTS.md 以及 MCP 服务器（GitLab、数据库、监控等）进行全链路分析。` +
        `适用于需要深入理解项目代码、排查 bug、分析架构、审查安全性等场景。` +
        `执行时间通常在 30 秒到 5 分钟之间。` +
        projectListDesc,

      parameters: {
        type: "object",
        required: ["project", "prompt"],
        properties: {
          project: {
            type: "string",
            description:
              projectNames.length > 0
                ? `项目名称（${projectNames.join(" / ")}）或项目的绝对路径`
                : "项目的绝对路径",
          },
          prompt: {
            type: "string",
            description: "分析任务的详细描述。应包含背景信息、具体症状和期望的分析方向",
          },
          mode: {
            type: "string",
            enum: ["ask", "plan", "agent"],
            description: "运行模式：ask=只读分析（默认），plan=出方案，agent=可修改文件（慎用）",
          },
          timeoutSec: {
            type: "number",
            description: `超时时间（秒），默认 ${cfg.defaultTimeoutSec ?? DEFAULT_TIMEOUT_SEC}`,
          },
        },
      },

      async execute(
        _toolCallId: string,
        params: Record<string, unknown>,
        signal?: AbortSignal,
      ) {
        const projectKey = String(params.project ?? "").trim();
        const prompt = String(params.prompt ?? "").trim();
        const mode = (params.mode as "ask" | "plan" | "agent") || DEFAULT_MODE;
        const timeoutSec = Number(params.timeoutSec) || cfg.defaultTimeoutSec || DEFAULT_TIMEOUT_SEC;

        if (!projectKey) {
          return { content: [{ type: "text" as const, text: "错误: 缺少 project 参数" }] };
        }
        if (!prompt) {
          return { content: [{ type: "text" as const, text: "错误: 缺少 prompt 参数" }] };
        }

        // 解析项目路径：先从映射表查，查不到视为绝对路径
        let projectPath = projects[projectKey];
        if (!projectPath) {
          const lowerKey = projectKey.toLowerCase();
          for (const [name, path] of Object.entries(projects)) {
            if (name.toLowerCase() === lowerKey) {
              projectPath = path;
              break;
            }
          }
        }
        if (!projectPath) {
          projectPath = projectKey;
        }

        if (!existsSync(projectPath)) {
          return {
            content: [{
              type: "text" as const,
              text: `错误: 项目路径不存在 - ${projectPath}\n可用项目: ${projectNames.join(", ") || "无"}`,
            }],
          };
        }

        const result = await runCursorAgent({
          agentPath: agentPath!,
          projectPath,
          prompt,
          mode,
          timeoutSec,
          noOutputTimeoutSec: cfg.noOutputTimeoutSec || DEFAULT_NO_OUTPUT_TIMEOUT_SEC,
          enableMcp: cfg.enableMcp ?? DEFAULT_ENABLE_MCP,
          model: cfg.model,
          signal,
        });

        const meta = [
          `项目: ${projectKey}`,
          `模式: ${mode}`,
          `耗时: ${(result.durationMs / 1000).toFixed(1)}s`,
          `工具调用: ${result.toolCallCount}`,
        ];
        if (result.usage) {
          meta.push(`tokens: ${result.usage.inputTokens}in/${result.usage.outputTokens}out`);
        }
        if (result.error) {
          meta.push(`错误: ${result.error}`);
        }

        const output = `${result.resultText}\n\n---\n_${meta.join(" | ")}_`;

        return {
          content: [{ type: "text" as const, text: output }],
          details: {
            success: result.success,
            project: projectKey,
            sessionId: result.sessionId,
            durationMs: result.durationMs,
            toolCallCount: result.toolCallCount,
            error: result.error,
          },
        };
      },
    });

    console.log(`[${PLUGIN_ID}] registered cursor_agent tool (agent: ${agentPath}, projects: ${projectNames.join(", ") || "none"})`);
  },
};
