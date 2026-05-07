# Cursor CDP Plugin

Control Cursor IDE via Chrome DevTools Protocol (CDP) — send prompts, read chat, switch models, browse history, take screenshots, manage projects.

## Prerequisites

Launch Cursor with CDP debugging enabled:

```bash
cursor --remote-debugging-port=9226
```

## Installation

This plugin requires [OpenClaw/ksh-cli](https://github.com/nicepkg/openclaw) to be installed.

## Commands

All commands support the following common arguments:

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--port` | int | 9226 | Cursor CDP port |
| `--host` | str | 127.0.0.1 | Cursor CDP host (IP or hostname for remote connection) |
| `--window` | int | 0 | Target window index (0=auto-select) |

### status

Check Cursor CDP connection status.

```bash
opencli cursor status
opencli cursor status --host 192.168.1.100  # Remote Cursor
```

### list

List all Cursor windows with type annotation (Agent / Editor).

```bash
opencli cursor list
opencli cursor list --host 192.168.1.100
```

### send

Send a prompt to Cursor Chat and wait for AI reply.

```bash
opencli cursor send "Explain this code"
opencli cursor send "Fix the bug" --timeout 120
opencli cursor send "Hello" --host 192.168.1.100  # Remote Cursor
```

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--timeout` | int | 60 | Timeout seconds for AI reply |
| `--project` | str | | Expected project name (fuzzy match) |

### read

Read current Chat conversation content.

```bash
opencli cursor read
opencli cursor read --limit 10
opencli cursor read --host 192.168.1.100
```

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--limit` | int | 20 | Max number of messages to return |

### history

List chat history sessions.

```bash
opencli cursor history
opencli cursor history "search keyword"
opencli cursor history --host 192.168.1.100
```

### model / model-switch

List available models or switch to a different model.

```bash
opencli cursor model
opencli cursor model-switch "claude"
opencli cursor model-switch "gpt-4" --host 192.168.1.100
```

### screenshot

Capture Cursor window screenshot.

```bash
opencli cursor screenshot              # Chat area only
opencli cursor screenshot full         # Full window
opencli cursor screenshot --output ./my-screenshot.png
opencli cursor screenshot --host 192.168.1.100
```

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `area` | str | chat | Area: full / chat / selector:CSS |
| `--output` | str | auto | Output file path |
| `--img-format` | str | png | Image format: png, jpeg, webp |
| `--quality` | int | 90 | JPEG/WebP quality (0-100) |

### new-chat

Open a new Agent/Chat tab.

```bash
opencli cursor new-chat
opencli cursor new-chat --host 192.168.1.100
```

### project / project-switch

List available projects or switch to a different project (Agent window only).

```bash
opencli cursor project
opencli cursor project-switch "my-project"
opencli cursor project-switch "my-project" --host 192.168.1.100
```

## Remote CDP Connection

To control a Cursor instance running on a remote machine:

1. On the remote machine, launch Cursor with CDP enabled and bind to all interfaces:
   ```bash
   cursor --remote-debugging-port=9226 --remote-debugging-address=0.0.0.0
   ```

2. From your local machine, use the `--host` argument:
   ```bash
   opencli cursor list --host 192.168.1.100
   opencli cursor send "Hello" --host 192.168.1.100
   ```

> **Security Note**: Exposing CDP over the network allows remote control of Cursor. Ensure proper firewall rules and network security when using remote connections.

## Development

```bash
cd cdp-plugin
npm install
npm run build
```

## License

[Apache-2.0](../LICENSE)
