const { test } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

test("configuration defaults, workspace trust, and existing attach descriptors", async () => {
  let provider;
  let factory;
  const disposable = { dispose() {} };
  const vscode = {
    workspace: { isTrusted: true },
    window: {
      createOutputChannel: () => ({ ...disposable, append() {}, appendLine() {} }),
      showErrorMessage() {},
    },
    debug: {
      onDidTerminateDebugSession: () => disposable,
      registerDebugConfigurationProvider: (_, value) => { provider = value; return disposable; },
      registerDebugAdapterDescriptorFactory: (_, value) => { factory = value; return disposable; },
    },
    DebugAdapterServer: class { constructor(port, host) { this.port = port; this.host = host; } },
    DebugAdapterNamedPipeServer: class { constructor(socket) { this.socket = socket; } },
  };
  const original = Module._load;
  Module._load = function(name, ...args) {
    return name === "vscode" ? vscode : original.call(this, name, ...args);
  };
  let extension;
  try { extension = require("../out/extension"); } finally { Module._load = original; }
  const context = { subscriptions: [] };
  extension.activate(context);
  try {
    const config = { request: "launch", dolphin: "/dolphin", program: "/game.iso" };
    const resolved = provider.resolveDebugConfigurationWithSubstitutedVariables({ uri: { fsPath: "/workspace" } }, config);
    assert.equal(resolved.replaceDiscExecutable, true);
    assert.equal(resolved.cwd, "/workspace");
    const explicit = provider.resolveDebugConfigurationWithSubstitutedVariables(undefined, { ...config, replaceDiscExecutable: false });
    assert.equal(explicit.replaceDiscExecutable, false);
    vscode.workspace.isTrusted = false;
    assert.equal(provider.resolveDebugConfiguration(undefined, config), undefined);
    const attach = { request: "attach", port: 1234, host: "example.com" };
    assert.equal(provider.resolveDebugConfiguration(undefined, attach), attach);
    const descriptor = await factory.createDebugAdapterDescriptor({ configuration: attach });
    assert.equal(descriptor.port, 1234);
    assert.equal(descriptor.host, "example.com");
    const pipe = await factory.createDebugAdapterDescriptor({ configuration: { request: "attach", socket: "/dap.sock" } });
    assert.equal(pipe.socket, "/dap.sock");
  } finally { for (const item of context.subscriptions) item.dispose(); }
});
