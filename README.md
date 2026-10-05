# Dolphin DAP for Visual Studio Code

Launch or attach to Dolphin's DAP server from Visual Studio Code or Code - OSS.
Managed launches handle startup, connection retries, logging, and shutdown on
Linux and Windows.

# Pre-requisites

- Visual Studio Code or Code - OSS 1.80 or newer.
- A current [Dolphin DAP build](https://github.com/LiveMindIO/dolphin-dap/blob/master/Tools/dap/README.md).
  Standard Dolphin does not provide this DAP server. Managed launches use the
  current `ELFFile` and `ReplaceDiscExecutable` settings, not legacy launch flags.
- Your game's executable or legally obtained disc image.
- For source debugging: a debug ELF with symbols and DWARF, plus its source files.
  Build without optimization for reliable stepping and local-variable inspection.
- Your project's build tools if you want to build before debugging.

Dolphin runs on the VS Code extension host. Remote workspaces need Dolphin and
the game files on that host. Managed launches require a trusted workspace.

# Installation

Install `dolphin-dap-client-0.3.0.vsix` using **Extensions → Install from VSIX**,
or run:

```sh
code --install-extension dolphin-dap-client-0.3.0.vsix
```

Use `code-oss` instead of `code` for Code - OSS.

To build the VSIX from this repository, install Node.js 20 or newer and npm, then run:

```sh
npm ci
npx @vscode/vsce package
```

# Configuration

## Launch Dolphin

Create `.vscode/launch.json` in your game workspace:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug game",
      "type": "dolphin",
      "request": "launch",
      "dolphin": "/path/to/dolphin-emu-nogui",
      "program": "${workspaceFolder}/game.iso",
      "elfFile": "${workspaceFolder}/build/GPVE01/main.elf",
      "sourcePaths": ["${workspaceFolder}/src", "${workspaceFolder}/include"],
      "stopOnEntry": true
    }
  ]
}
```

Replace the Dolphin, game, ELF, and source paths for your workspace. On Windows,
use a path such as `C:/tools/dolphin-dap/dolphin-emu-nogui.exe`. Paths containing
spaces are supported; do not add shell quoting inside the JSON values.

Open **Run and Debug**, select **Debug game**, and start debugging. No launch script,
stop task, socket path, or PID file is needed. Dolphin output appears in
**Output → Dolphin DAP**. Ending the session stops the Dolphin process started by
that session.

| Setting | Purpose / default |
| --- | --- |
| `dolphin` | Required executable path. |
| `program` | Required ISO, ELF, or DOL to boot. |
| `elfFile` | Debug ELF supplying symbols and DWARF. |
| `replaceDiscExecutable` | Defaults to `true`. Set `false` explicitly for metadata-only debugging; ELF addresses must match the running disc executable. |
| `sourcePaths` | Ordered source roots used by Dolphin to resolve DWARF paths. |
| `platform` | NoGUI defaults to `x11` on Linux and `win32` on Windows. Override for another supported backend or `headless`. Omitted by default for Qt executables. |
| `cwd` | Working directory; defaults to the workspace folder. |
| `startupTimeout` | DAP connection timeout in milliseconds; defaults to `30000`. |
| `stopOnEntry` | Pause when the debugger connects; defaults to `true`. |

Managed launches always enable `DebugModeEnabled=True`. Source lookup is handled
by Dolphin; no client-side source mapping is required.

## Build before launching

Add `"preLaunchTask": "Build game"` to the launch configuration, then define that
task in `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Build game",
      "type": "process",
      "command": "ninja",
      "options": { "cwd": "${workspaceFolder}" },
      "problemMatcher": []
    }
  ]
}
```

Use your project's command and arguments: Ninja, Make, CMake, or another build
system. Chain configuration and build tasks using `dependsOn` and
`dependsOrder: "sequence"`. VS Code runs `preLaunchTask` before Dolphin starts.
Omit it to debug an existing build.

Examples:
- [Pikmin 2 launch and build tasks](examples/pikmin2/.vscode): `build/GPVE01/main.elf`.
- [Melee managed launch](examples/melee/launch-managed.json): `build/GALE01/main.elf`,
  with source roots `src` and `extern/dolphin/src`. Build Melee with
  `python configure.py --debug` followed by `ninja`.

## Attach to running Dolphin

Existing task-based configurations remain supported. Use `request: "attach"`
with `host` and `port`, or `socket` for a Unix-domain socket:

```json
{
  "name": "Attach to Dolphin",
  "type": "dolphin",
  "request": "attach",
  "host": "127.0.0.1",
  "port": 5678,
  "stopOnEntry": true
}
```

Start Dolphin separately with core debugging enabled and a matching DAP endpoint.
Attach does not start or stop Dolphin. If `socket` is set, it takes priority over
`host` and `port`. Custom task-based launches can use `preLaunchTask` and
`postDebugTask` for their own lifecycle, including legacy forks or Flatpak host
launches. The [task-based Melee example](examples/melee/.vscode) requires Linux,
Bash, and X11; it is not needed for managed launches.

## Development checks

The extension uses strict TypeScript with additional compiler safety checks.
Run `npm run check` for type checking and `npm test` for regression tests.
Packaging compiles `src/` into `out/` automatically.
