#!/usr/bin/env bun
/** Screenshot the playable concept mockup. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { join } from "path";

const dir = import.meta.dir;
const html = join(dir, "concepts/12f-specter-mon-playable.html");
const pngDir = join(dir, "pngs");
mkdirSync(pngDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`file://${html}`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
const out = join(pngDir, "12f-specter-mon-playable.png");
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(out);
