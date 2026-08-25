/** 生成 README 展示截图（演示模式环境） */
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.argv[2] || "http://localhost:4173";
const OUT = "images";
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--window-size=1440,900"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
page.setDefaultTimeout(30000);

const shot = async (name) => {
	await page.screenshot({ path: `${OUT}/${name}.png` });
	console.log(`✓ ${name}.png`);
};

// 1. 登录页
await page.goto(BASE, { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 2000));
await shot("login");

// 2. 登录 → 大屏
await page.type('input[placeholder="用户名"]', "admin");
await page.type('input[placeholder="密码"]', "admin123");
await page.click(".login-panel button.el-button--primary");
await new Promise((r) => setTimeout(r, 5000));
await shot("dashboard");

// 3. 一张图
await page.evaluate(() => { location.hash = "#/map"; });
await new Promise((r) => setTimeout(r, 7000));
await shot("map");

// 4. 爆管分析
await page.evaluate(() => { location.hash = "#/analysis"; });
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => {
	const tabs = document.querySelectorAll(".el-tabs__item");
	tabs[1]?.click();
});
await new Promise((r) => setTimeout(r, 1500));
let select = null;
for (const s of await page.$$(".el-select")) {
	const box = await s.boundingBox();
	if (box && box.width > 0) { select = s; break; }
}
if (select) {
	await select.click();
	await new Promise((r) => setTimeout(r, 1000));
	await page.keyboard.type("GS-DN");
	await new Promise((r) => setTimeout(r, 1400));
	for (const item of await page.$$(".el-select-dropdown__item")) {
		const box = await item.boundingBox();
		const text = await page.evaluate((el) => el.textContent || "", item);
		if (box && box.width > 0 && text.includes("GS-")) { await item.click(); break; }
	}
	await new Promise((r) => setTimeout(r, 600));
	const btns = await page.$$(".el-tab-pane button");
	for (const b of btns) {
		const text = await page.evaluate((el) => el.textContent || "", b);
		if (text.includes("爆管")) { await b.click(); break; }
	}
	await new Promise((r) => setTimeout(r, 2500));
}
await shot("analysis");

// 5. 告警中心
await page.evaluate(() => { location.hash = "#/alarms"; });
await new Promise((r) => setTimeout(r, 2500));
await shot("alarms");

await browser.close();
console.log("✅ 截图完成 → images/");
