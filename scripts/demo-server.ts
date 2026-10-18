// Keep the demo alive after this terminal/chat closes; manage only the PID created by this script.
import "dotenv/config";
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync, closeSync, unlinkSync } from "node:fs";
import path from "node:path";

const command = process.argv[2] ?? "start";
if (!["start", "stop", "restart", "status"].includes(command)) throw new Error("Usage: npm run demo:server -- start|stop|restart|status");
const script = path.resolve("src/server.ts");
const dir = path.resolve("out/demo");
const pidFile = path.join(dir, "server.pid");
const logFile = path.join(dir, "server.log");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function trackedPid(): number | undefined {
  if (!existsSync(pidFile)) return;
  const pid = Number(readFileSync(pidFile, "utf8").trim());
  if (!Number.isInteger(pid) || pid <= 1) return;
  try {
    const cmd = execFileSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" });
    return cmd.includes(script) ? pid : undefined;
  } catch { return; }
}
async function health(): Promise<boolean> {
  try { return (await fetch(`http://localhost:${process.env.PORT ?? "3000"}/health`, { signal: AbortSignal.timeout(1000) })).ok; }
  catch { return false; }
}
let pid = trackedPid();
if (command === "status") {
  console.log(`Tracked process: ${pid ?? "none"}; Photon/server health: ${await health() ? "ready" : "not ready"}`);
  console.log(`Log: ${logFile}`);
} else {
  if (command === "stop" || command === "restart") {
    if (pid) {
      process.kill(pid, "SIGTERM");
      for (let n = 0; n < 50 && trackedPid(); n++) await sleep(100);
      if (trackedPid()) throw new Error("Server did not stop; inspect its log before retrying");
    }
    if (existsSync(pidFile)) unlinkSync(pidFile);
    pid = undefined;
  }
  if (command !== "stop") {
    if (pid) console.log(`Demo server already running (PID ${pid})`);
    else {
      if (await health()) throw new Error("Another server is running on this port. Stop it before starting the managed demo process.");
      mkdirSync(dir, { recursive: true });
      const log = openSync(logFile, "a", 0o600);
      const child = spawn(process.execPath, ["--import", "tsx", script], { cwd: process.cwd(), detached: true, stdio: ["ignore", log, log] });
      child.unref();
      closeSync(log);
      if (!child.pid) throw new Error("Could not start the demo server");
      writeFileSync(pidFile, String(child.pid), { mode: 0o600 });
      let ready = false;
      for (let n = 0; n < 30; n++) {
        if (await health()) { ready = true; break; }
        await sleep(500);
      }
      if (!ready) throw new Error(`Server is not ready; inspect ${logFile}`);
      console.log(`Demo server ready (PID ${child.pid}). Log: ${logFile}`);
    }
  } else console.log("Managed demo server stopped");
}
