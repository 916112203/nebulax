/** dev 模式在线联调验证：5173（vite dev）+ 8080（后端） */
import puppeteer from "puppeteer-core";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("[页面异常]", String(e).slice(0, 300)));
await page.goto("http://localhost:5173/", { waitUntil: "networkidle0", timeout: 30000 });
await new Promise((r) => setTimeout(r, 2000));
const loginPanel = await page.$(".login-panel");
console.log("dev 页面登录框:", loginPanel ? "✓ 渲染正常" : "✗ 未渲染");
if (loginPanel) {
	await page.type('input[placeholder="用户名"]', "admin");
	await page.type('input[placeholder="密码"]', "admin123");
	await page.click(".login-panel button.el-button--primary");
	await new Promise((r) => setTimeout(r, 4000));
	const cards = await page.$$(".sp-stat-card");
	const mode = await page.evaluate(() => document.body.innerText.includes("在线模式"));
	console.log("登录后大屏 KPI:", cards.length + "/8", "| 运行模式:", mode ? "✓ 在线模式（已连后端）" : "演示模式");
	// 地图页
	await page.evaluate(() => { location.hash = "#/map"; });
	await new Promise((r) => setTimeout(r, 6000));
	const canvas = await page.$("#map canvas");
	console.log("一张图地图 canvas:", canvas ? "✓ 渲染正常" : "✗ 未渲染");
	// WebSocket 实时通道验证（在线模式下遥测 3s 推送）
	await page.evaluate(() => { location.hash = "#/dashboard"; });
	await new Promise((r) => setTimeout(r, 4500));
	const wsStatus = await page.evaluate(() => {
		const el = document.querySelector(".ws-status");
		return el ? el.textContent.trim() : "";
	});
	console.log("实时通道状态:", wsStatus.includes("已连接") ? "✓ " + wsStatus : "✗ " + wsStatus);
}
await browser.close();
