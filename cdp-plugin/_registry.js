import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
const home = homedir();
const candidates = [
  join(home, ".opencli", "registry.js"),
  join(home, ".ksh-cli", "registry.js")
];
const shimPath = candidates.find((p) => existsSync(p));
if (!shimPath) throw new Error("opencli/ksh-cli registry not found. Install opencli first.");
const mod = await import(pathToFileURL(shimPath).href);
const cli = mod.cli;
const Strategy = mod.Strategy;
export {
  Strategy,
  cli
};
