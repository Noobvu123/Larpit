import { spawn } from "node:child_process";
// sites-preview passes Vite flags; the native app uses Metro for its web check.
const args = process.argv.slice(2);
const pos = args.indexOf("--port");
const port = pos < 0 ? "4173" : args[pos + 1];
const p = spawn(
  "npx",
  ["expo", "start", "--web", "--host", "lan", "--port", port],
  {
    stdio: "inherit",
    env: { ...process.env, EXPO_NO_TELEMETRY: "1", CI: "false" },
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => p.kill(signal));
p.on("exit", (code) => process.exit(code ?? 1));
