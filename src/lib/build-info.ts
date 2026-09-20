import { execFileSync } from "node:child_process";

// Module scope keeps the timestamp consistent and runs Git once per build,
// rather than spawning a process for every generated page.
const buildDate = new Date();
let commitHash = process.env.CF_PAGES_COMMIT_SHA?.slice(0, 7);
if (!commitHash) {
  try {
    commitHash = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    console.warn("Build revision unavailable; footer will show 'unknown'.", error);
    commitHash = "unknown";
  }
}

const parts = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).formatToParts(buildDate);
const part = (type: Intl.DateTimeFormatPartTypes) =>
  parts.find((value) => value.type === type)?.value;
const date = `${part("year")}.${part("month")}.${part("day")}`;
const time = buildDate.toLocaleTimeString("en-US", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

export const buildVersion = `v${date}-${commitHash} (${time} ET)`;
