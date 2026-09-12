const fs = require("fs");
const net = require("net");
const path = require("path");

const sourcePathCache = new Map();

function isFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function findByBasename(root, basename, matches) {
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const candidate = path.join(root, entry.name);
    if (entry.isFile() && entry.name === basename) {
      matches.add(candidate);
      if (matches.size > 1) {
        return;
      }
    } else if (entry.isDirectory()) {
      findByBasename(candidate, basename, matches);
      if (matches.size > 1) {
        return;
      }
    }
  }
}

function resolveSourcePath(sourcePath, sourcePaths) {
  if (!sourcePath || isFile(sourcePath)) {
    return sourcePath;
  }

  const cacheKey = `${sourcePaths.join("\0")}\0${sourcePath}`;
  if (sourcePathCache.has(cacheKey)) {
    return sourcePathCache.get(cacheKey);
  }

  const cache = (resolved) => {
    sourcePathCache.set(cacheKey, resolved);
    return resolved;
  };

  const relative = sourcePath.replace(/^[/\\]+/, "");
  const parts = relative.split(/[\\/]+/).filter(Boolean);
  const qualifiedMatches = new Map();
  for (const root of sourcePaths) {
    for (let index = 0; index < parts.length; index += 1) {
      const candidate = path.resolve(root, ...parts.slice(index));
      const relativeToRoot = path.relative(root, candidate);
      if (!relativeToRoot.startsWith("..") && !path.isAbsolute(relativeToRoot) && isFile(candidate)) {
        qualifiedMatches.set(
          candidate,
          Math.max(qualifiedMatches.get(candidate) || 0, parts.length - index)
        );
      }
    }
  }

  if (parts.length > 1 && qualifiedMatches.size > 0) {
    const bestQuality = Math.max(...qualifiedMatches.values());
    const bestMatches = [...qualifiedMatches].filter(([, quality]) => quality === bestQuality);
    return cache(bestMatches.length === 1 ? bestMatches[0][0] : sourcePath);
  }

  const matches = new Set();
  for (const root of sourcePaths) {
    findByBasename(root, path.basename(relative), matches);
    if (matches.size > 1) {
      return cache(sourcePath);
    }
  }
  if (matches.size === 1) {
    return cache(matches.values().next().value);
  }
  return cache(sourcePath);
}

function transformMessage(message, sourcePaths) {
  const sources = [];
  if (message.type === "response" && message.command === "stackTrace") {
    for (const frame of message.body?.stackFrames || []) {
      if (frame.source) {
        sources.push(frame.source);
      }
    }
  } else if (message.type === "response" && message.command === "loadedSources") {
    sources.push(...(message.body?.sources || []));
  }

  for (const source of sources) {
    if (source.path) {
      source.path = resolveSourcePath(source.path, sourcePaths);
    }
  }
  return message;
}

class DapMessageParser {
  constructor(onMessage) {
    this.buffer = Buffer.alloc(0);
    this.onMessage = onMessage;
  }

  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) {
        return;
      }
      const header = this.buffer.subarray(0, headerEnd).toString("ascii");
      const match = /(?:^|\r\n)Content-Length: (\d+)(?:\r\n|$)/i.exec(header);
      if (!match) {
        throw new Error("Dolphin sent a DAP message without Content-Length");
      }
      const contentLength = Number.parseInt(match[1], 10);
      const messageEnd = headerEnd + 4 + contentLength;
      if (this.buffer.length < messageEnd) {
        return;
      }
      const content = this.buffer.subarray(headerEnd + 4, messageEnd);
      this.buffer = this.buffer.subarray(messageEnd);
      this.onMessage(JSON.parse(content.toString("utf8")));
    }
  }
}

function writeMessage(stream, message) {
  const content = Buffer.from(JSON.stringify(message), "utf8");
  stream.write(`Content-Length: ${content.length}\r\n\r\n`);
  stream.write(content);
}

function main() {
  const options = JSON.parse(process.argv[2] || "{}");
  const socket = options.socket
    ? net.createConnection(options.socket)
    : net.createConnection(options.port || 5678, options.host || "127.0.0.1");
  const parser = new DapMessageParser((message) =>
    writeMessage(process.stdout, transformMessage(message, options.sourcePaths || []))
  );

  process.stdin.pipe(socket);
  socket.on("data", (chunk) => {
    try {
      parser.push(chunk);
    } catch (error) {
      console.error(error.message);
      socket.destroy();
    }
  });
  socket.on("error", (error) => console.error(`Dolphin DAP connection failed: ${error.message}`));
  socket.on("close", () => process.exit());
}

if (require.main === module) {
  main();
}

module.exports = { DapMessageParser, resolveSourcePath, transformMessage, writeMessage };
