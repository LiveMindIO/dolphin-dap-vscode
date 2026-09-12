const vscode = require("vscode");
const path = require("path");

function expandSourcePath(sourcePath, workspaceFolder) {
  let expanded = sourcePath;
  if (workspaceFolder) {
    expanded = expanded.replaceAll("${workspaceFolder}", workspaceFolder);
  }
  if (expanded === "~" || expanded.startsWith(`~${path.sep}`)) {
    expanded = path.join(process.env.HOME || "", expanded.slice(1));
  }
  return path.resolve(expanded);
}

function activate(context) {
  const factory = {
    createDebugAdapterDescriptor(session) {
      const config = session.configuration;
      const workspaceFolder = session.workspaceFolder?.uri.fsPath;
      const options = {
        host: config.host || "127.0.0.1",
        port: config.port || 5678,
        socket: config.socket,
        sourcePaths: (config.sourcePaths || []).map((sourcePath) =>
          expandSourcePath(sourcePath, workspaceFolder)
        ),
      };
      return new vscode.DebugAdapterExecutable(
        process.execPath,
        [context.asAbsolutePath("proxy.js"), JSON.stringify(options)],
        { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } }
      );
    },
  };

  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory("dolphin", factory)
  );
}

module.exports = { activate };
