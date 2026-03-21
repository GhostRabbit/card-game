#!/usr/bin/env node

const net = require("net");

const CLIENT_PORT = Number(process.env.VITE_PORT || 5173);
const SERVER_PORT = Number(process.env.PORT || process.env.VITE_API_PORT || 3000);

function checkPort(port, host = "127.0.0.1", timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (isOpen, detail) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ isOpen, detail });
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true, "accepting connections"));
    socket.once("timeout", () => finish(false, "timeout"));
    socket.once("error", (err) => finish(false, err.code || "connection error"));

    socket.connect(port, host);
  });
}

function formatStatus(name, status, url) {
  const icon = status.isOpen ? "RUNNING" : "STOPPED";
  const detail = status.isOpen ? "" : ` (${status.detail})`;
  return `${name.padEnd(8)} ${icon.padEnd(8)} ${url}${detail}`;
}

async function main() {
  const [client, server] = await Promise.all([
    checkPort(CLIENT_PORT),
    checkPort(SERVER_PORT),
  ]);

  console.log("\nCompile Game Dev Server Status");
  console.log("------------------------------");
  console.log(formatStatus("Client", client, `http://localhost:${CLIENT_PORT}`));
  console.log(formatStatus("Server", server, `http://localhost:${SERVER_PORT}`));

  if (!client.isOpen || !server.isOpen) {
    console.log("\nStart missing services:");
    if (!server.isOpen) console.log("  npm run dev:server");
    if (!client.isOpen) console.log("  npm run dev:client");
  } else {
    console.log("\nAll required services are up.");
  }

  console.log("");
}

main().catch((err) => {
  console.error("Failed to check dev server status:", err);
  process.exit(1);
});
