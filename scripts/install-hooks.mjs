import { existsSync, chmodSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

// Dependency-only deployments and source archives do not need Git hooks.
if (!process.env.CI && existsSync(new URL("../.git", import.meta.url))) {
  const current = spawnSync("git", ["config", "--get", "core.hooksPath"], {
    cwd: root,
    encoding: "utf8",
  });
  if (current.error || (current.status !== 0 && current.status !== 1)) {
    throw new Error("Unable to inspect Git hooks configuration.");
  }
  const hooksPath = current.stdout.trim();
  if (hooksPath && hooksPath !== ".githooks") {
    throw new Error(`Existing hooksPath (${hooksPath}) must be reconciled before installing Spark hooks.`);
  }
  chmodSync(new URL("../.githooks/pre-commit", import.meta.url), 0o755);
  execFileSync("git", ["config", "--local", "core.hooksPath", ".githooks"], {
    cwd: root,
    stdio: "inherit",
  });
  console.log("Spark pre-commit hook installed.");
}
