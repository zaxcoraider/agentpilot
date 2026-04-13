import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * Run an onchainos CLI command and return parsed JSON output.
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
    const error = err as { stdout?: string; stderr?: string; message?: string };
    const raw = error.stdout?.trim() || error.stderr?.trim() || "";
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error(`onchainos error: ${raw || error.message}`);
    }
  }
}
