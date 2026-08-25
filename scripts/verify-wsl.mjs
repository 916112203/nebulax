/** WSL 部署全链路验证：Windows 浏览器 → localhost:80（WSL nginx）→ 127.0.0.1:8080（WSL 后端） */
import puppeteer from "puppeteer-core";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--no-proxy-server"] });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("[页面异常]", String(e).slice(0, 300)));
await page.goto("http://127.0.0.1/", { waitUntil: "networkidle0", timeout: 30000 });
await new Promise((r) => setTimeout(r, 2000));
const loginPanel = await page.$(".login-panel");
console.log("1. 登录页:", loginPanel ? "✓ 渲染正常" : "✗ 未渲染");
if (loginPanel) {
	await page.type('input[placeholder="用户名"]', "admin");
	await page.type('input[placeholder="密码"]', "admin123");
	await page.click(".login-panel button.el-button--primary");
	await new Promise((r) => setTimeout(r, 4000));
	const cards = await page.$$(".sp-stat-card");
	console.log("2. 登录+大屏 KPI:", cards.length === 8 ? "✓ 8/8" : `✗ ${cards.length}/8`);
	await page.evaluate(() => { location.hash = "#/map"; });
	await new Promise((r) => setTimeout(r, 6500));
	const canvas = await page.$("#map canvas");
	console.log("3. 一张图地图:", canvas ? "✓ canvas 渲染" : "✗ 未渲染");
	await page.evaluate(() => { location.hash = "#/dashboard"; });
	await new Promise((r) => setTimeout(r, 4500));
	const ws = await page.evaluate(() => document.querySelector(".ws-status")?.textContent || "");
	console.log("4. WebSocket 实时通道:", ws.includes("已连接") ? "✓ " + ws.trim() : "✗ " + ws.trim());
	await page.evaluate(() => { location.hash = "#/alarms"; });
	await new Promise((r) => setTimeout(r, 2500));
	const alarmRows = await page.$$(".sp-card .el-table__row");
	console.log("5. 告警列表:", alarmRows.length > 0 ? `✓ ${alarmRows.length} 行` : "✗ 空");
	await page.evaluate(() => { location.hash = "#/workorders"; });
	await new Promise((r) => setTimeout(r, 2000));
	const woRows = await page.$$(".sp-card .el-table__row");
	console.log("6. 工单列表:", woRows.length > 0 ? `✓ ${woRows.length} 行` : "✗ 空");
}
await browser.close();
console.log("✅ WSL 部署全链路验证完成");
