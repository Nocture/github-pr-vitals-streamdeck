import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { bundledProfileFiles, type PluginManifest } from "../src/profile-files";

const PLUGIN_FOLDER = new URL("../com.nocture.prvitals.sdPlugin/", import.meta.url);

const manifest: PluginManifest = JSON.parse(readFileSync(new URL("manifest.json", PLUGIN_FOLDER), "utf8"));

for (const { path, zip } of bundledProfileFiles(manifest)) {
  const target = new URL(path, PLUGIN_FOLDER);
  mkdirSync(dirname(fileURLToPath(target)), { recursive: true });
  writeFileSync(target, zip);
  console.log(fileURLToPath(target));
}
