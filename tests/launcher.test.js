const { test } = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { launchArguments, startLaunch } = require("../out/launcher");
const { parseLaunchConfig } = require("../out/configuration");

test("workspace JSON is validated before crossing into typed launch code", () => {
  const base = { dolphin: process.execPath, program: __filename };
  assert.equal(parseLaunchConfig(base).replaceDiscExecutable, true);
  assert.equal(parseLaunchConfig({ ...base, replaceDiscExecutable: false }).replaceDiscExecutable, false);
  for (const malformed of [
    { dolphin: 123 }, { sourcePaths: [123] }, { replaceDiscExecutable: "false" },
    { startupTimeout: -1 }, { startupTimeout: Infinity }, { elfFile: "" },
  ]) assert.throws(() => parseLaunchConfig({ ...base, ...malformed }));
});

test("launch arguments default to replacement and support Windows paths without shell quoting", () => {
  const config = { program: "C:\\My Games\\game.iso", elfFile: "C:\\Debug Build\\main.elf", sourcePaths: ["C:\\Source One", "C:\\Source Two"] };
  const args = launchArguments(config, 5678);
  assert(args.includes("Dolphin.Interface.DebugModeEnabled=True"));
  assert(args.includes("Dolphin.Debug.ReplaceDiscExecutable=true"));
  assert(args.includes(config.program));
  assert(args.includes(`Dolphin.Debug.ELFFile=${config.elfFile}`));
  assert(args.includes("Dolphin.Debug.SourcePaths=C:\\Source One;C:\\Source Two"));
  assert(launchArguments({ ...config, replaceDiscExecutable: false }, 5678).includes("Dolphin.Debug.ReplaceDiscExecutable=false"));
});

test("managed launch retries readiness, forwards traffic, and stops its child", async () => {
  let child;
  const errors = [];
  const launch = await startLaunch({ dolphin: process.execPath, program: __filename }, () => {}, error => errors.push(error), (_, args, options) => {
    assert.equal(options.shell, false);
    const port = Number(args.find(arg => arg.startsWith("Dolphin.General.DAPPort=")).split("=")[1]);
    child = spawn(process.execPath, ["-e", `setTimeout(() => require('net').createServer(s => s.pipe(s)).listen(${port}, '127.0.0.1'), 250)`], options);
    return child;
  });
  try {
    const reply = await new Promise((resolve, reject) => {
      const client = net.createConnection({ host: "127.0.0.1", port: launch.port }, () => client.write("DAP traffic"));
      client.setTimeout(5000, () => client.destroy(new Error("test timed out")));
      client.once("error", reject);
      client.once("data", data => { resolve(data.toString()); client.destroy(); });
    });
    assert.equal(reply, "DAP traffic");
    assert.deepEqual(errors, []);
  } finally { launch.stop(); }
  assert(child.killed);
});

test("missing input fails before spawning", async () => {
  await assert.rejects(startLaunch({ dolphin: "/missing/dolphin", program: __filename }, () => {}, () => {}), /not found/);
});

test("startup timeout reports failure and terminates the owned process", async () => {
  let child;
  let report;
  const failed = new Promise(resolve => { report = resolve; });
  const launch = await startLaunch({ dolphin: process.execPath, program: __filename, startupTimeout: 100 }, () => {}, report, (_, args, options) => {
    child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], options);
    return child;
  });
  const client = net.createConnection({ host: "127.0.0.1", port: launch.port });
  client.on("error", () => {});
  try {
    const error = await failed;
    assert.match(error.message, /connection failed/);
    assert(child.killed);
  } finally { client.destroy(); launch.stop(); }
});

test("a spawn error reports failure and cleans up", async () => {
  let report;
  const failed = new Promise(resolve => { report = resolve; });
  const launch = await startLaunch({ dolphin: process.execPath, program: __filename }, () => {}, report, (_, args, options) =>
    spawn("dolphin-nonexistent-test-executable", [], options));
  try {
    assert.match((await failed).message, /ENOENT/);
  } finally { launch.stop(); }
});
