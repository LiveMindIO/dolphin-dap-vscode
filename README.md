# Dolphin DAP for Visual Studio Code

Launch or attach to Dolphin's DAP server from Visual Studio Code or Code - OSS.
Managed launches handle startup, connection retries, logging, and shutdown on
Linux and Windows.

# Pre-requisites

- Visual Studio Code or Code - OSS 1.80 or newer.
- A current [Dolphin DAP build](https://github.com/LiveMindIO/dolphin-dap/blob/master/Tools/dap/README.md).
- Your game's executable or legally obtained disc image.
- For typed source debugging: your game's source code and build tools producing
  a debug ELF with MWCC/CodeWarrior DWARF 1.1. An arbitrary GCC/Clang ELF with modern
  DWARF is not a substitute. See the [debug-information limits](https://github.com/LiveMindIO/dolphin-dap/blob/master/Tools/dap/README.md#debug-information-limits).
  Disable optimization in the files you need to step through or inspect.

Dolphin runs on the VS Code extension host. Remote workspaces need Dolphin and
the game files on that host. Managed launches require a trusted workspace.

# Installation

You need a local VSIX file before installing. To build version 0.3.0 from source,
install Git, Node.js 20 or newer, and npm, then run:

```sh
git clone https://github.com/LiveMindIO/dolphin-dap-vscode.git
cd dolphin-dap-vscode
npm ci
npx @vscode/vsce package
```

Install the generated `dolphin-dap-client-0.3.0.vsix` using
**Extensions → Install from VSIX**, or run from that directory:

```sh
code --install-extension dolphin-dap-client-0.3.0.vsix
```

Use `code-oss` instead of `code` for Code - OSS.

If you already have a packaged VSIX, skip the build and install that file instead.
Use its actual filename if the version differs from this example.

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
      "replaceDiscExecutable": true,
      "sourcePaths": ["${workspaceFolder}/src", "${workspaceFolder}/include"],
      "stopOnEntry": true
    }
  ]
}
```

Replace the Dolphin, game, ELF, and source paths for your workspace. On Windows,
use your built `DolphinNoGUI.exe`, for example
`C:/tools/dolphin-dap/DolphinNoGUI.exe`, and add `"platform": "win32"` to the
configuration. The launcher cannot infer NoGUI from that filename. Paths containing
spaces are supported; do not add shell quoting inside the JSON values.
Use absolute paths or `${workspaceFolder}` paths, not paths relative to `cwd`.

Open **Run and Debug**, select **Debug game**, and start debugging. No launch script,
stop task, socket path, or PID file is needed. Dolphin output appears in
**Output → Dolphin DAP**. Ending the session stops the Dolphin process started by
that session.

### First source breakpoint

1. Open a source file from the checkout used to build the ELF. Click beside an
   executable line number to set a breakpoint.
2. Start **Debug game**. An initial stop may show startup disassembly rather than
   your chosen source file; that alone is not a source-lookup failure.
3. Click **Continue** and perform the in-game action that reaches your breakpoint.
4. When it stops, use **Step Over** or **Step Into** and inspect **Variables** and
   **Call Stack**. Locals are available for the top frame only.
5. Click **Stop** to end the managed launch. For attach sessions, disconnecting
   leaves the separately started Dolphin process running.

If a breakpoint is unverified, choose a line with executable code and check that
the ELF was built from this checkout with debug information enabled.

| Setting | Purpose / default |
| --- | --- |
| `dolphin` | Required executable path. |
| `program` | Required ISO, ELF, or DOL to boot. |
| `elfFile` | Debug ELF supplying symbols and DWARF. |
| `replaceDiscExecutable` | Defaults to `true`. Set `false` explicitly for metadata-only debugging; ELF addresses must match the running disc executable. |
| `sourcePaths` | Ordered source roots used by Dolphin to resolve DWARF paths. |
| `platform` | Executables named `dolphin-emu-nogui` (with optional `.exe`) default to `x11` on Linux and `win32` on Windows. Set `win32` explicitly for `DolphinNoGUI.exe`; use `headless` for no window. Omit for Qt executables. |
| `cwd` | Working directory; defaults to the workspace folder. |
| `startupTimeout` | DAP connection timeout in milliseconds; defaults to `30000`. |
| `stopOnEntry` | Pause when the debugger connects; defaults to `true`. |

Managed launches always enable `DebugModeEnabled=True`. Source lookup is handled
by Dolphin; no client-side source mapping is required.

They use local TCP on an automatically allocated port and clear a saved `DAPSocket`
setting. Launch options `host`, `port`, and `socket` are for **attach**, not managed
launches. `elfFile`, `replaceDiscExecutable`, and `sourcePaths` become
`Dolphin.Debug.ELFFile`, `Dolphin.Debug.ReplaceDiscExecutable`, and
`Dolphin.Debug.SourcePaths`; the overrides are not persisted. With replacement
enabled and an ISO as `program`, Dolphin runs the disc bootstrap before loading
the ELF as the game executable. Set replacement to `false` only when the ELF's
addresses already match the executable you are running.

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
  with source roots `src` and `libs/dolphin/src`. Older checkouts may use
  `extern/dolphin/src`; match the checkout used to build the ELF. Build current
  Melee with `python3 configure.py --debug` followed by `ninja` (`python` on Windows).

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
Configure the ELF, replacement mode, and source roots in Dolphin or its launch
command; an attach configuration does not apply managed-launch settings to an
already-running process. For a Linux NoGUI TCP launch, for example:

```sh
/path/to/dolphin-emu-nogui \
  -C Dolphin.Interface.DebugModeEnabled=True \
  -C Dolphin.General.DAPSocket= \
  -C Dolphin.General.DAPPort=5678 \
  -C Dolphin.Debug.ELFFile=/path/to/main.elf \
  -C Dolphin.Debug.ReplaceDiscExecutable=true \
  -C 'Dolphin.Debug.SourcePaths=/path/to/src;/path/to/sdk/src' \
  --exec /path/to/game.iso --platform x11
```

Replace all placeholder paths, including both source roots. This multiline command
uses POSIX shell syntax; on Windows use `DolphinNoGUI.exe` with `--platform win32`
and put the arguments on one line. Omit `--platform` for Qt Dolphin. For a Unix
socket, set `Dolphin.General.DAPSocket` to the same path as the attach configuration.

Attach does not start or stop Dolphin. If `socket` is set, it takes priority over
`host` and `port`. Custom task-based launches can use `preLaunchTask` and
`postDebugTask` for their own lifecycle, including legacy forks or Flatpak host
launches. The [task-based Melee example](examples/melee/.vscode) requires Linux,
Bash, X11, Python 3, and Ninja; it is not needed for managed launches.
To use it, copy **both** `launch.json` and `tasks.json` from that example directory
into your Melee checkout's `.vscode` directory, merging with any existing files.
In `tasks.json`, replace the Dolphin executable and ISO arguments currently set to
`${env:HOME}/projects/dolphin-dap/build/Binaries/dolphin-emu-nogui` and
`${env:HOME}/games/melee.iso`. Check the ELF path and source roots against your
checkout, then select **Build and Debug** or **Debug** in Run and Debug.

## Troubleshooting

- **Dolphin does not start:** check the executable, ISO, and ELF paths. Inspect
  **Output → Dolphin DAP** for errors from Dolphin.
- **No game window:** check `platform` against your Dolphin build and display
  backend. `headless` intentionally has no window. Omit `platform` for Qt Dolphin.
- **Connection times out:** check Dolphin's output first. If it boots successfully
  but needs longer, increase `startupTimeout`.
- **Source files cannot be found:** check `sourcePaths` and that the ELF was built
  from those sources. Use narrower source roots if multiple files share a name.
- **Stepping or local variables are unreliable:** rebuild the ELF without
  optimization and with debug information enabled.

## Development checks

The extension uses strict TypeScript with additional compiler safety checks.
Run `npm run check` for type checking and `npm test` for regression tests.
Packaging compiles `src/` into `out/` automatically.
