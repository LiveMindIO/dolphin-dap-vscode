import type { LaunchConfig } from "./launcher";

// VS Code's configuration API is dynamically typed. Validate it at the boundary
// rather than asserting that arbitrary workspace JSON is a LaunchConfig.
export function parseLaunchConfig(input: Readonly<Record<string, unknown>>): LaunchConfig {
  const requiredString = (key: string): string => {
    const value = input[key];
    if (typeof value !== "string" || value.length === 0) throw new Error(`Dolphin launch requires a non-empty ${key} path.`);
    return value;
  };
  const config: LaunchConfig = { dolphin: requiredString("dolphin"), program: requiredString("program") };
  for (const key of ["elfFile", "cwd", "platform"] as const) {
    const value = input[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || value.length === 0) throw new Error(`${key} must be a non-empty string.`);
    config[key] = value;
  }
  const replace = input["replaceDiscExecutable"];
  if (replace !== undefined && typeof replace !== "boolean") throw new Error("replaceDiscExecutable must be a boolean.");
  config.replaceDiscExecutable = replace ?? true;
  const timeout = input["startupTimeout"];
  if (timeout !== undefined) {
    if (typeof timeout !== "number" || !Number.isInteger(timeout) || timeout < 100) throw new Error("startupTimeout must be an integer of at least 100 milliseconds.");
    config.startupTimeout = timeout;
  }
  const paths = input["sourcePaths"];
  if (paths !== undefined) {
    if (!Array.isArray(paths)) throw new Error("sourcePaths must be an array of strings.");
    config.sourcePaths = paths.map((value: unknown) => {
      if (typeof value !== "string" || value.length === 0) throw new Error("sourcePaths must contain non-empty strings.");
      return value;
    });
  }
  return config;
}
