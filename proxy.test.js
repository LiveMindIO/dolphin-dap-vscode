const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");

const { DapMessageParser, resolveSourcePath, transformMessage } = require("./proxy");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dolphin-dap-source-"));
  fs.mkdirSync(path.join(root, "extern", "dolphin", "os", "init"), { recursive: true });
  fs.mkdirSync(path.join(root, "src", "melee", "mn"), { recursive: true });
  fs.writeFileSync(path.join(root, "extern", "dolphin", "os", "init", "__start.c"), "");
  fs.writeFileSync(path.join(root, "src", "melee", "mn", "mnevent.c"), "");
  return root;
}

test("resolves basename-only and relative DWARF paths", (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const sdkRoot = path.join(root, "extern", "dolphin");
  const meleeRoot = path.join(root, "src");
  assert.strictEqual(
    resolveSourcePath("__start.c", [sdkRoot]),
    path.join(sdkRoot, "os", "init", "__start.c")
  );
  assert.strictEqual(
    resolveSourcePath("src/melee/mn/mnevent.c", [meleeRoot]),
    path.join(meleeRoot, "melee", "mn", "mnevent.c")
  );
});

test("leaves ambiguous basenames unresolved", (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "other"), { recursive: true });
  fs.writeFileSync(path.join(root, "other", "mnevent.c"), "");

  assert.strictEqual(resolveSourcePath("mnevent.c", [root]), "mnevent.c");
});

test("does not use source root order to guess between duplicate basenames", (t) => {
  const firstRoot = fixture();
  const secondRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dolphin-dap-source-"));
  t.after(() => fs.rmSync(firstRoot, { recursive: true, force: true }));
  t.after(() => fs.rmSync(secondRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(secondRoot, "other"), { recursive: true });
  fs.writeFileSync(path.join(secondRoot, "other", "mnevent.c"), "");

  assert.strictEqual(
    resolveSourcePath("mnevent.c", [path.join(firstRoot, "src"), secondRoot]),
    "mnevent.c"
  );
});

test("rewrites stack trace and loaded source responses", (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourcePaths = [path.join(root, "src"), path.join(root, "extern", "dolphin")];

  const stackTrace = transformMessage(
    {
      type: "response",
      command: "stackTrace",
      body: { stackFrames: [{ source: { path: "__start.c" } }] },
    },
    sourcePaths
  );
  assert.strictEqual(
    stackTrace.body.stackFrames[0].source.path,
    path.join(root, "extern", "dolphin", "os", "init", "__start.c")
  );

  const loadedSources = transformMessage(
    {
      type: "response",
      command: "loadedSources",
      body: { sources: [{ path: "mnevent.c" }] },
    },
    sourcePaths
  );
  assert.strictEqual(
    loadedSources.body.sources[0].path,
    path.join(root, "src", "melee", "mn", "mnevent.c")
  );
});

test("parses fragmented and consecutive DAP messages", () => {
  const messages = [];
  const parser = new DapMessageParser((message) => messages.push(message));
  const frame = (message) => {
    const content = Buffer.from(JSON.stringify(message));
    return Buffer.concat([
      Buffer.from(`Content-Length: ${content.length}\r\n\r\n`),
      content,
    ]);
  };
  const input = Buffer.concat([frame({ seq: 1, value: "Melee" }), frame({ seq: 2 })]);

  parser.push(input.subarray(0, 17));
  parser.push(input.subarray(17));

  assert.deepStrictEqual(messages, [{ seq: 1, value: "Melee" }, { seq: 2 }]);
});
