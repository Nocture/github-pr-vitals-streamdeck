import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import { execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import url from "node:url";

const isWatching = !!process.env.ROLLUP_WATCH;
const sdPlugin = "com.nocture.prvitals.sdPlugin";
const BUILD_PLACEHOLDER = "__PR_VITALS_BUILD_LABEL__";
const UNKNOWN_COMMIT = "unknown";
const NOTICES_FILE = "THIRD-PARTY-NOTICES.txt";
const NOTICES_INTRODUCTION = "plugin.js holds code of the packages below. Each package has its own license.\n";
const NOTICE_SEPARATOR = `\n${"-".repeat(80)}\n\n`;
// The folder of the package that a module comes from. In a nested path, the last node_modules counts.
const PACKAGE_FOLDER = /^.*[\\/]node_modules[\\/](?:@[^\\/]+[\\/])?[^\\/]+/;
const LICENSE_FILE = /^licen[cs]e/i;
const VIRTUAL_MODULE_PREFIX = /^\0/;
const buildLabel = commitDescription() + " · " + new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";

// The tag of a tagged commit, else the short commit id. A source folder without .git has neither.
function commitDescription() {
	try {
		return execSync("git describe --tags --always --dirty", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
	} catch {
		return UNKNOWN_COMMIT;
	}
}

// Only a package with code in the bundle counts. Tree shaking can remove a whole package.
function bundledPackageFolders(bundle) {
	const folders = new Set();
	for (const chunk of Object.values(bundle)) {
		if (chunk.type !== "chunk") continue;
		for (const [moduleId, { renderedLength }] of Object.entries(chunk.modules)) {
			const folder = moduleId.replace(VIRTUAL_MODULE_PREFIX, "").match(PACKAGE_FOLDER)?.[0];
			if (folder && renderedLength > 0) folders.add(folder);
		}
	}
	return [...folders];
}

function noticeOf(packageFolder) {
	const { name, version, license } = JSON.parse(readFileSync(path.join(packageFolder, "package.json"), "utf8"));
	const licenseFile = readdirSync(packageFolder).find((file) => LICENSE_FILE.test(file));
	if (!licenseFile) throw new Error(`${name} has no license file, so ${NOTICES_FILE} cannot hold its notice.`);
	const licenseText = readFileSync(path.join(packageFolder, licenseFile), "utf8").trim();
	return { name, text: `${name} ${version} (${license})\n\n${licenseText}\n` };
}

/**
 * @type {import('rollup').RollupOptions}
 */
const config = {
	input: "src/plugin.ts",
	output: {
		file: `${sdPlugin}/bin/plugin.js`,
		sourcemap: isWatching,
		sourcemapPathTransform: (relativeSourcePath, sourcemapPath) => {
			return url.pathToFileURL(path.resolve(path.dirname(sourcemapPath), relativeSourcePath)).href;
		}
	},
	plugins: [
		{
			name: "watch-externals",
			buildStart: function () {
				this.addWatchFile(`${sdPlugin}/manifest.json`);
			},
		},
		typescript({
			mapRoot: isWatching ? "./" : undefined
		}),
		{
			name: "build-label",
			// A tag name can hold a quote. So the label replaces the whole string literal, written as JSON.
			transform(code) {
				return code.includes(BUILD_PLACEHOLDER) ? code.replaceAll(JSON.stringify(BUILD_PLACEHOLDER), JSON.stringify(buildLabel)) : null;
			}
		},
		nodeResolve({
			browser: false,
			exportConditions: ["node"],
			preferBuiltins: true
		}),
		commonjs(),
		!isWatching && terser(),
		{
			name: "third-party-notices",
			generateBundle(_options, bundle) {
				const notices = bundledPackageFolders(bundle)
					.map(noticeOf)
					.sort((first, second) => first.name.localeCompare(second.name));
				const source = [NOTICES_INTRODUCTION, ...notices.map((notice) => notice.text)].join(NOTICE_SEPARATOR);
				this.emitFile({ fileName: NOTICES_FILE, source, type: "asset" });
			}
		},
		{
			name: "emit-module-package-file",
			generateBundle() {
				this.emitFile({ fileName: "package.json", source: `{ "type": "module" }`, type: "asset" });
			}
		}
	]
};

export default config;
