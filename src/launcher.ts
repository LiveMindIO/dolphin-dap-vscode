import * as net from "node:net";
import * as fs from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";

export interface LaunchConfig {
  dolphin: string;
  program: string;
  elfFile?: string;
  replaceDiscExecutable?: boolean;
  sourcePaths?: string[];
  platform?: string;
  cwd?: string;
  startupTimeout?: number;
}

export interface ManagedLaunch {
  port: number;
  stop(): void;
}

export function launchArguments(config: LaunchConfig, port: number): string[] {
  const args = ["-C", "Dolphin.Interface.DebugModeEnabled=True",
    "-C", `Dolphin.General.DAPPort=${port}`];
  if (config.elfFile) args.push("-C", `Dolphin.Debug.ELFFile=${config.elfFile}`);
  args.push("-C", `Dolphin.Debug.ReplaceDiscExecutable=${config.replaceDiscExecutable !== false}`);
  if (config.sourcePaths?.length) args.push("-C", `Dolphin.Debug.SourcePaths=${config.sourcePaths.join(";")}`);
  args.push("--exec", config.program);
  const platform = config.platform || (/-nogui(?:\.exe)?$/i.test(config.dolphin || "")
    ? (process.platform === "win32" ? "win32" : "x11") : undefined);
  if (platform) args.push("--platform", platform);
  return args;
}

function listen(server: net.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("Could not allocate a loopback TCP port."));
        return;
      }
      resolve(address.port);
    });
  });
}

// Forward the real client's connection, rather than consuming a DAP connection
// with a readiness probe. Dolphin may not listen until disc bootstrap finishes.
export async function startLaunch(
  config: LaunchConfig,
  output: (text: string) => void,
  onError: (error: Error) => void,
  spawnProcess: typeof spawn = spawn,
): Promise<ManagedLaunch> {
  for (const [label, file] of [["Dolphin executable", config.dolphin], ["program", config.program], ["debug ELF", config.elfFile]] as const) {
    if (!file && label === "debug ELF") continue;
    if (!file || !fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`${label} not found: ${file || "(not configured)"}`);
    }
  }
  const reservation = net.createServer();
  const port = await listen(reservation);
  const clients = new Set<net.Socket>();
  const timers = new Set<NodeJS.Timeout>();
  let child: ChildProcess | undefined;
  let stopped = false;
  const proxy = net.createServer(client => {
    clients.add(client);
    client.pause();
    client.on("error", () => {});
    client.on("close", () => clients.delete(client));
    const deadline = Date.now() + (config.startupTimeout || 30000);
    const connect = () => {
      if (stopped || client.destroyed) return;
      const upstream = net.createConnection({ host: "127.0.0.1", port });
      clients.add(upstream);
      upstream.once("close", () => clients.delete(upstream));
      upstream.once("connect", () => {
        upstream.removeListener("error", retry);
        upstream.on("error", () => client.destroy());
        client.once("close", () => upstream.destroy());
        upstream.once("close", () => client.destroy());
        client.pipe(upstream);
        upstream.pipe(client);
        client.resume();
      });
      const retry = (error: NodeJS.ErrnoException): void => {
        upstream.destroy();
        if (stopped || client.destroyed) return;
        if (Date.now() >= deadline || error.code !== "ECONNREFUSED") {
          fail(new Error(`Dolphin DAP connection failed: ${error.message}. See Dolphin DAP output.`));
          return;
        }
        const timer = setTimeout(() => { timers.delete(timer); connect(); }, 100);
        timers.add(timer);
      };
      upstream.once("error", retry);
    };
    connect();
  });
  const stop = () => {
    if (stopped) return;
    stopped = true;
    for (const timer of timers) clearTimeout(timer);
    for (const client of clients) client.destroy();
    proxy.close();
    if (child && child.exitCode === null && child.signalCode === null) {
      const ownedChild = child;
      ownedChild.kill();
      // Windows terminates directly; on Linux, bound graceful shutdown so a
      // stalled emulator cannot remain running after the session is disposed.
      const forceStop = setTimeout(() => {
        if (ownedChild.exitCode === null && ownedChild.signalCode === null) ownedChild.kill("SIGKILL");
      }, 3000);
      forceStop.unref();
      ownedChild.once("exit", () => clearTimeout(forceStop));
    }
  };
  const fail = (error: Error): void => { if (!stopped) { stop(); onError(error); } };
  let proxyPort: number;
  try {
    proxyPort = await listen(proxy);
  } finally {
    // Keep the Dolphin port reserved until the proxy has its own distinct port.
    await new Promise<void>(resolve => reservation.close(() => resolve()));
  }
  proxy.on("error", fail);
  try {
    child = spawnProcess(config.dolphin, launchArguments(config, port), {
      ...(config.cwd === undefined ? {} : { cwd: config.cwd }), windowsHide: true, shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (data: Buffer) => output(data.toString()));
    child.stderr?.on("data", (data: Buffer) => output(data.toString()));
    child.once("error", fail);
    child.once("exit", (code, signal) => {
      if (!stopped) fail(new Error(`Dolphin exited (${signal || code}). See Dolphin DAP output.`));
    });
  } catch (error) { stop(); throw error; }
  return { port: proxyPort, stop };
}
