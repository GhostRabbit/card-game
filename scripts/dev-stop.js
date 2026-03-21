#!/usr/bin/env node

const { exec } = require("child_process");

const PORTS = [
  Number(process.env.PORT || 3000),
  Number(process.env.VITE_PORT || 5173),
];

function execAsync(command) {
  return new Promise((resolve) => {
    exec(command, { windowsHide: true }, (error, stdout, stderr) => {
      resolve({ error, stdout: stdout || "", stderr: stderr || "" });
    });
  });
}

function parsePidsForPort(netstatOutput, port) {
  const pids = new Set();
  const lines = netstatOutput.split(/\r?\n/);
  const suffix = `:${port}`;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (!line.startsWith("TCP") && !line.startsWith("UDP")) continue;
    if (!line.includes(suffix)) continue;

    const parts = line.split(/\s+/);
    const pid = parts[parts.length - 1];
    if (/^\d+$/.test(pid) && pid !== "0") {
      pids.add(pid);
    }
  }

  return [...pids];
}

async function getPidsByPort(port) {
  const { stdout } = await execAsync("netstat -ano -p tcp");
  return parsePidsForPort(stdout, port);
}

async function killPid(pid) {
  const { error } = await execAsync(`taskkill /PID ${pid} /F`);
  return !error;
}

async function main() {
  const killed = [];
  const skipped = [];

  console.log("\nCompile Game Dev Stop");
  console.log("---------------------");

  for (const port of PORTS) {
    const pids = await getPidsByPort(port);
    if (pids.length === 0) {
      console.log(`Port ${port}: no process found`);
      continue;
    }

    for (const pid of pids) {
      const ok = await killPid(pid);
      if (ok) {
        killed.push({ port, pid });
        console.log(`Port ${port}: stopped PID ${pid}`);
      } else {
        skipped.push({ port, pid });
        console.log(`Port ${port}: failed to stop PID ${pid}`);
      }
    }
  }

  if (killed.length === 0 && skipped.length === 0) {
    console.log("Nothing was running on dev ports.");
  }

  if (skipped.length > 0) {
    process.exitCode = 1;
  }

  console.log("");
}

main().catch((err) => {
  console.error("Failed to stop dev servers:", err);
  process.exit(1);
});
