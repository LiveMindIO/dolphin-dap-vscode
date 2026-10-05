import * as vscode from "vscode";
import { startLaunch, type ManagedLaunch } from "./launcher";
import { parseLaunchConfig } from "./configuration";

export function activate(context: vscode.ExtensionContext): void {
  const launches = new Map<string, Pick<ManagedLaunch, "stop">>();
  const output = vscode.window.createOutputChannel("Dolphin DAP");
  context.subscriptions.push(output, { dispose() {
    for (const launch of launches.values()) launch.stop();
    launches.clear();
  } });
  context.subscriptions.push(vscode.debug.onDidTerminateDebugSession(session => {
    launches.get(session.id)?.stop();
    launches.delete(session.id);
  }));
  context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider("dolphin", {
    resolveDebugConfiguration(_folder, config) {
      if (config.request === "launch" && !vscode.workspace.isTrusted) {
        vscode.window.showErrorMessage("Trust this workspace before launching Dolphin.");
        return undefined;
      }
      return config;
    },
    resolveDebugConfigurationWithSubstitutedVariables(folder, config) {
      if (config.request === "launch") {
        if (config["cwd"] === undefined && folder !== undefined) config["cwd"] = folder.uri.fsPath;
        config["replaceDiscExecutable"] ??= true;
        config["stopOnEntry"] ??= true;
        try { parseLaunchConfig(config); } catch (error) {
          vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
          return undefined;
        }
      }
      return config;
    },
  }));
  const factory: vscode.DebugAdapterDescriptorFactory = {
    async createDebugAdapterDescriptor(session) {
      const config = session.configuration;
      if (config.request === "launch") {
        let launch: ManagedLaunch | undefined;
        let cancelled = false;
        launches.set(session.id, { stop() { cancelled = true; launch?.stop(); } });
        try {
          launch = await startLaunch(parseLaunchConfig(config), text => output.append(text), error => {
            output.appendLine(error.message);
            vscode.window.showErrorMessage(error.message);
            vscode.debug.stopDebugging(session);
          });
          if (cancelled) {
            launch.stop();
            throw new Error("Dolphin launch cancelled.");
          }
          return new vscode.DebugAdapterServer(launch.port, "127.0.0.1");
        } catch (error) {
          launches.delete(session.id);
          throw error;
        }
      }
      const socket: unknown = config["socket"];
      if (typeof socket === "string" && socket.length > 0) {
        return new vscode.DebugAdapterNamedPipeServer(socket);
      }

      const port: unknown = config["port"];
      const host: unknown = config["host"];
      return new vscode.DebugAdapterServer(typeof port === "number" ? port : 5678,
        typeof host === "string" ? host : "127.0.0.1");
    },
  };

  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory("dolphin", factory)
  );
}
