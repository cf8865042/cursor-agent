# Command Reference

## cursor status

Check CDP connection status.

```bash
opencli cursor status [--port 9226]
```

Output: `status`, `browser`, `electron`

---

## cursor list

List all Cursor windows with type annotation.

```bash
opencli cursor list [--port 9226]
```

Output: `idx`, `type` (Agent/Editor), `title`, `id`

Window type detection: title "Cursor Agents" = Agent, otherwise Editor.

---

## cursor new-chat

Open a new Agent/Chat tab. Uses Ctrl+N shortcut, works for both window types.

```bash
opencli cursor new-chat [--port 9226] [--window 0]
```

Output: `status`, `detail`

---

## cursor project

List available projects/workspaces in the Agent window. **Agent window only.**

```bash
opencli cursor project [--port 9226] [--window 0]
```

Internal workflow:
1. Click `.ui-select-trigger` (project dropdown)
2. Read `.ui-menu__row` items from `.project-selector-menu`
3. Close menu

List includes:
- `Home` (no project context)
- Recently opened local project paths
- Remote connections (SSH, Dev Container, Cursor Cloud)

Output: `idx`, `name`, `current` (checkmark for active project)

---

## cursor project-switch

Switch project/workspace in Agent window with fuzzy matching. **Agent window only.**

```bash
opencli cursor project-switch <name> [--port 9226] [--window 0]
```

| Param | Type | Default | Description |
|---|---|---|---|
| `name` | str | (required) | Target project name (fuzzy match on path tail) |

Match priority: exact path > tail folder name > path contains > tail contains

Examples: `"llm-wiki"` matches `D:\llm-wiki`, `"mcd"` matches `D:\workspace\gitlib\mcd-backend\mcd`, `"Home"` matches Home

Output: `status`, `project`

---

## cursor send

Send a prompt and wait for AI reply. Auto-adapts input box and send button per window type.

```bash
opencli cursor send <prompt> [--port 9226] [--window 0] [--timeout 60]
```

| Param | Type | Default | Description |
|---|---|---|---|
| `prompt` | str | (required) | Prompt content (positional) |
| `--timeout` | int | 60 | Wait timeout in seconds |
| `--window` | int | 0 | Target window index |

Selectors:
- **Agent**: input `.ui-prompt-input-editor__input`, send `.ui-prompt-input-submit-button`
- **Editor**: input `.aislash-editor-input`, send `.send-with-mode .anysphere-icon-button`

Output: `role`, `content`

---

## cursor read

Read current Chat conversation content.

```bash
opencli cursor read [--port 9226] [--window 0] [--limit 20]
```

| Param | Type | Default | Description |
|---|---|---|---|
| `--limit` | int | 20 | Max number of messages to return |

Output: `idx`, `role`, `content`

---

## cursor history

List chat history sessions. Agent window reads from sidebar (grouped by project), Editor window reads from popup panel (grouped by time).

```bash
opencli cursor history [keyword] [--port 9226] [--window 0]
```

| Param | Type | Default | Description |
|---|---|---|---|
| `keyword` | str | (optional) | Search keyword (positional) |

Agent window selectors:
- Groups: `.ui-sidebar-group` + `.ui-sidebar-group-label`
- Session items: `.glass-sidebar-agent-menu-btn` label elements

Editor window selectors:
- Open panel: click `codicon-history` button
- Groups: `.ui-menu__section` + `.ui-menu__section-title`
- Session items: `.compact-agent-history-react-menu-label`
- Search box: `.compact-agent-history-search-input`

Output: `idx`, `group`, `name`

---

## cursor model

List available models and current selection. Shared across both window types (`.ui-model-picker__trigger`).

```bash
opencli cursor model [--port 9226] [--window 0]
```

Output: `idx`, `name`, `tier`, `current` (checkmark)

---

## cursor model-switch

Switch model with fuzzy matching.

```bash
opencli cursor model-switch <name> [--port 9226] [--window 0]
```

Match priority: exact > contains > all keywords match

Examples: `"sonnet"` -> Sonnet 4.6, `"opus 4.6"` -> Opus 4.6 High, `"codex"` -> Codex 5.3

Output: `status`, `model`

---

## cursor screenshot

Take a screenshot, auto-selects Chat area container.

```bash
opencli cursor screenshot [area] [--output path] [--img-format png] [--quality 90] [--port 9226] [--window 0]
```

| Param | Type | Default | Description |
|---|---|---|---|
| `area` | str | `chat` | `full` / `chat` / `selector:CSS` |
| `--output` | str | (auto) | Output file path |
| `--img-format` | str | `png` | png / jpeg / webp |

Chat area container:
- **Agent**: `.agent-panel`
- **Editor**: `[class*="composer"][class*="container"]`

Output: `status`, `file`, `size`

---

## Common Parameters

All commands share:
- `--port` (int, default 9226) - CDP port
- `--window` (int, default 0) - Target window index (1-based, matches `cursor list` idx). 0 = auto-select (prefers Agent window)
