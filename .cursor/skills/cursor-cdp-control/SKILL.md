---
name: cursor-cdp-control
description: Control Cursor IDE via opencli + CDP from the terminal. Send prompts, read chat, switch models, browse history, take screenshots, create new agents, switch projects. Auto-compatible with Cursor 3 Agent standalone window and traditional Editor embedded chat. Use when users need to control Cursor from the command line, send prompts, read conversations, switch models, view history, take screenshots, create new agent tabs, switch projects, or mention keywords like cursor cdp, cursor control, cursor screenshot, cursor model switch, opencli cursor.
---

# Cursor CDP Control

Control Cursor IDE via `opencli cursor` commands using Chrome DevTools Protocol (CDP).

All commands auto-detect window type:

- **Agent window** - Cursor 3 standalone Agent window (title = "Cursor Agents")
- **Editor window** - Traditional editor with embedded Chat panel

## Prerequisites

### 1. Launch Cursor with CDP port enabled

Close all Cursor instances first, then relaunch:

```bash
# Windows
"C:\Program Files\cursor\Cursor.exe" --remote-debugging-port=9226

# macOS
/Applications/Cursor.app/Contents/MacOS/Cursor --remote-debugging-port=9226
```

**Notes:**
- Must close all Cursor windows before launching (Electron single-instance lock)
- Default port is `9226`; customize with `--port` argument
- Do not use the `cursor` CLI tool (it invokes cli.js, not the GUI)

### 2. Install plugin dependencies

```bash
cd ~/.opencli/plugins/ksh-plugin-cursor && npm install
```

### 3. Verify connection

```bash
opencli cursor status
```

## Command Reference

| Command | Description | Example |
|---|---|---|
| `cursor status` | CDP connection status | `opencli cursor status` |
| `cursor list` | List all windows (Agent/Editor) | `opencli cursor list` |
| `cursor new-chat` | Open a new Agent/Chat tab | `opencli cursor new-chat` |
| `cursor project` | List available projects (Agent only) | `opencli cursor project` |
| `cursor project-switch` | Switch project by fuzzy match (Agent only) | `opencli cursor project-switch "llm-wiki"` |
| `cursor send` | Send prompt and wait for reply | `opencli cursor send "refactor this code"` |
| `cursor read` | Read current Chat content | `opencli cursor read --limit 10` |
| `cursor history` | Browse chat history sessions | `opencli cursor history "test"` |
| `cursor model` | List available models | `opencli cursor model` |
| `cursor model-switch` | Switch model by fuzzy match | `opencli cursor model-switch "sonnet"` |
| `cursor screenshot` | Capture screenshot | `opencli cursor screenshot chat` |

See [references/commands.md](references/commands.md) for detailed parameters.

## Window Type Differences

All commands auto-detect, no manual specification needed:

| Component | Agent Window | Editor Window |
|---|---|---|
| Input box | TipTap ProseMirror | aislash-editor |
| History | Sidebar, grouped by project, always visible | Click button to show popup panel |
| Chat area | `.agent-panel` | composer container |
| Model picker | Shared `.ui-model-picker__trigger` | Shared |
| Project picker | Supported (`.ui-select-trigger`) | Not supported |

Use `--window N` to target a specific window (N matches `cursor list` idx, 1-based). Default 0 auto-selects Agent window.

## Typical Usage

```bash
# List all windows
opencli cursor list

# Open a new Agent tab
opencli cursor new-chat

# Send to a specific project (auto-finds window by project name, works in both Agent & Editor)
opencli cursor send "analyze this code" --project "mcd"

# Switch project in Agent window (Agent only)
opencli cursor project-switch "llm-wiki"

# Send a prompt (auto-selects Agent window)
opencli cursor send "analyze this code"

# Browse Editor window history
opencli cursor history "refactor" --window 3

# Switch model and take screenshot
opencli cursor model-switch "sonnet"
opencli cursor screenshot chat
```

## Technical Details

Uses CDP HTTP API to discover window targets, then communicates via WebSocket:
- `Runtime.evaluate` - DOM queries and data extraction
- `Input.insertText` / `Input.dispatchMouseEvent` / `Input.dispatchKeyEvent` - Simulated user interaction
- `Page.captureScreenshot` - Headless screenshot to file

Auto-detects window type by target title, applies type-specific DOM selectors. Non-invasive, no native hooks.
