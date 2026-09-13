# Dolphin DAP for Visual Studio Code

This extension registers the `dolphin` debugger type and connects Visual Studio Code
directly to Dolphin's DAP server.

## Install

```bash
npx @vscode/vsce package
code --install-extension dolphin-dap-client-0.2.0.vsix
```

Code - OSS users should replace `code` with `code-oss`.

## Configure Melee

Use [`examples/melee/.vscode/launch.json`](examples/melee/.vscode/launch.json) and
[`examples/melee/.vscode/tasks.json`](examples/melee/.vscode/tasks.json) in the Melee
workspace. In `tasks.json`, set:

- The path to `dolphin-emu-nogui`.
- The path to the Melee ISO.
- The build command if your Melee configuration differs.

The example uses `${workspaceFolder}` for the debug ELF and source roots. It runs on
Linux with Bash, X11, and a Unix socket. Melee's `--debug` option enables symbols and
disables optimization for reliable source stepping and local-variable inspection.

## Use

Open **Run and Debug** and select:

- **Build and Debug** to configure and build Melee before starting Dolphin.
- **Debug** to start Dolphin with the existing `build/GALE01/main.elf`.

Both configurations execute the debug ELF while mounting the ISO for disc data. The
launch task starts Dolphin with these source roots:

```bash
-C 'Dolphin.Debug.SourcePaths=${workspaceFolder}/src;${workspaceFolder}/extern/dolphin/src'
```

Dolphin resolves DWARF source names and returns full paths through DAP. Do not add source
mapping fields to `launch.json`. When the debug session ends, `postDebugTask` stops the
Dolphin process recorded by the launch task and removes its PID file and DAP socket.

See the [Dolphin DAP server documentation](https://github.com/LiveMindIO/dolphin-dap/blob/master/Tools/dap/README.md)
for build requirements, TCP attachment, and server settings.
