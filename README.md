# Cursor Agent — OpenClaw 插件

通过 OpenClaw 聊天对话调用本机 Cursor Agent CLI，对项目进行深度代码分析、排查和诊断。

## 核心能力

- 自动加载项目的 `.cursor/rules`、`AGENTS.md` 等上下文
- 支持启用项目配置的 MCP 服务器（GitLab、数据库、监控等）
- 三种运行模式：`ask`（只读分析）、`plan`（出方案）、`agent`（可修改文件）
- 多项目映射表，按名称快速切换分析目标
- 完善的超时控制和进程管理

## 前置要求

| 依赖 | 说明 |
|------|------|
| Cursor Agent CLI | 需在本机安装 `agent` 命令（见下方安装步骤） |
| Cursor 订阅 | CLI 使用 Cursor 订阅中的模型额度 |
| OpenClaw Gateway | v2026.2.24+ |

## 安装 Cursor Agent CLI

### Linux / macOS

```bash
curl https://cursor.com/install -fsSL | bash
```

安装完成后，可能需要将 `$HOME/.local/bin` 加入 PATH：

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

### Windows

在 PowerShell 中运行：

```powershell
irm https://cursor.com/install | iex
```

安装后默认路径为 `%LOCALAPPDATA%\cursor-agent\agent.cmd`。

### 验证安装

```bash
agent --version
```

### 认证登录

首次使用需要登录 Cursor 账号：

```bash
agent login
```

或通过环境变量设置 API Key：

```bash
export CURSOR_API_KEY="your-api-key"
```

## 安装插件

### 方式一：源码路径加载（开发模式）

在 `~/.openclaw/openclaw.json` 的 `plugins.load.paths` 中添加插件源码路径：

```json
{
  "plugins": {
    "load": {
      "paths": ["D:\\workspace\\gitlib\\kskillhub\\plugins\\cursor-agent"]
    }
  }
}
```

### 方式二：tgz 包安装

```bash
# 构建打包
cd plugins/cursor-agent
npm ci && npm run build && npm pack

# 通过 OpenClaw CLI 安装
openclaw plugin install cursor-agent-0.1.0.tgz
```

## 配置

在 `~/.openclaw/openclaw.json` 中配置插件：

```json
{
  "plugins": {
    "entries": {
      "cursor-agent": {
        "enabled": true,
        "config": {
          "projects": {
            "kskillhub": "D:\\workspace\\gitlib\\kskillhub",
            "another-project": "/home/user/projects/another"
          },
          "defaultTimeoutSec": 600,
          "noOutputTimeoutSec": 120,
          "enableMcp": true
        }
      }
    }
  }
}
```

### 配置项

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `projects` | `object` | `{}` | 项目名称到本地绝对路径的映射表 |
| `agentPath` | `string` | 自动检测 | Cursor Agent CLI 的完整路径 |
| `defaultTimeoutSec` | `number` | `600` | 单次调用最大执行时间（秒） |
| `noOutputTimeoutSec` | `number` | `120` | 无输出超时（秒），连续无输出超过此时间判定挂死 |
| `model` | `string` | CLI 默认 | 指定 Cursor Agent 使用的模型 |
| `enableMcp` | `boolean` | `true` | 是否启用 MCP 服务器（`--approve-mcps`） |

> **提示**：建议将 `agents.defaults.timeoutSeconds` 调高到 `900`，避免主 Agent 在 Cursor Agent 执行完成前超时。

## 使用

配置完成并重启 Gateway 后，在 OpenClaw 对话中即可使用：

```
请使用 cursor_agent 分析 kskillhub 项目的认证模块实现
```

Pi Agent 会自动调用 `cursor_agent` 工具，参数包括：

| 参数 | 必填 | 说明 |
|------|------|------|
| `project` | 是 | 项目名称（映射表中的 key）或绝对路径 |
| `prompt` | 是 | 分析任务描述 |
| `mode` | 否 | `ask`（默认）/ `plan` / `agent` |
| `timeoutSec` | 否 | 本次调用的超时时间 |

## 开发

```bash
cd plugins/cursor-agent

# 安装依赖
npm install

# 开发模式（watch）
npm run dev

# 构建
npm run build

# 打包
npm pack
```

## 架构

```
src/
├── index.ts    # 插件入口，注册 cursor_agent 工具
├── types.ts    # 类型定义
├── parser.ts   # Cursor Agent stream-json 输出解析
└── runner.ts   # CLI 进程管理、超时控制、结果收集
```

执行流程：

1. OpenClaw Pi Agent 调用 `cursor_agent` 工具
2. 插件从配置的项目映射表解析项目路径
3. 通过 `runner.ts` 启动 Cursor Agent CLI 子进程
4. 实时解析 `--output-format stream-json` 输出
5. 收集 `type=result` 事件后返回分析结果
6. 超时或完成后确保子进程终止
