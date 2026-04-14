import { execFile } from "child_process";
import { promisify } from "util";
import { runHttp } from "./okxApi";

const execFileAsync = promisify(execFile);

/**
 * Run an onchainos CLI command and return parsed JSON output.
 * Falls back to direct OKX HTTP API when CLI is not available (e.g. Linux/Railway).
 * e.g. run(["token", "search", "--query", "OKB", "--chain", "xlayer"])
 */
export async function run(args: string[]): Promise<unknown> {
  try {
    const { stdout, stderr } = await execFileAsync("onchainos", args, {
      timeout: 30000,
      env: process.env,
    });

    const output = stdout.trim() || stderr.trim();
    return JSON.parse(output);
  } catch (err: unknown) {
    const error = err as { code?: string; stdout?: string; stderr?: string; message?: string };

    // CLI not installed (Linux/Railway) — use direct HTTP API
    if (error.code === "ENOENT") {
      return runHttp(args);
    }

    const raw = error.stdout?.trim() || error.stderr?.trim() || "";
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error(`onchainos error: ${raw || error.message}`);
    }
  }
}
