const vscode = require("vscode");

function activate(context) {
  const factory = {
    createDebugAdapterDescriptor(session) {
      const config = session.configuration;
      if (config.socket) {
        return new vscode.DebugAdapterNamedPipeServer(config.socket);
      }

      return new vscode.DebugAdapterServer(config.port || 5678, config.host || "127.0.0.1");
    },
  };

  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory("dolphin", factory)
  );
}

module.exports = { activate };
