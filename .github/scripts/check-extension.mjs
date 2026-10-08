// Sanity-checks a packaged extension directory before it is zipped and published:
// the manifest parses, its version is Chrome-compatible, every file it (or an HTML
// page) references is present, and every script has valid syntax.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] ?? ".";
const errors = [];

const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));

if (!/^\d{1,5}(\.\d{1,5}){0,3}$/.test(manifest.version ?? "")) {
  errors.push(`manifest.version "${manifest.version}" is not 1-4 dot-separated integers`);
}

const icons = value => (typeof value === "string" ? [value] : Object.values(value ?? {}));
const referenced = [
  ...(manifest.content_scripts ?? []).flatMap(script => [...(script.js ?? []), ...(script.css ?? [])]),
  manifest.action?.default_popup,
  ...icons(manifest.action?.default_icon),
  ...icons(manifest.icons),
  manifest.background?.service_worker,
  manifest.options_page,
  manifest.options_ui?.page
].filter(Boolean);

for (const file of referenced) {
  if (!existsSync(join(root, file))) errors.push(`manifest.json references missing file ${file}`);
}

const files = readdirSync(root, { recursive: true }).map(String);

for (const page of files.filter(file => file.endsWith(".html"))) {
  const html = readFileSync(join(root, page), "utf8");
  for (const [, ref] of html.matchAll(/\b(?:src|href)="([^"#?]+)/g)) {
    if (/^[a-z]+:|^\/\//i.test(ref)) continue;
    if (!existsSync(join(root, page, "..", ref))) errors.push(`${page} references missing file ${ref}`);
  }
}

for (const script of files.filter(file => file.endsWith(".js"))) {
  try {
    execFileSync(process.execPath, ["--check", join(root, script)], { stdio: "pipe" });
  } catch (error) {
    console.error(String(error.stderr));
    errors.push(`${script} has a syntax error`);
  }
}

if (errors.length) {
  for (const error of errors) console.error(`::error::${error}`);
  process.exit(1);
}
console.log(`${manifest.name} ${manifest.version}: ${files.length} files OK`);
