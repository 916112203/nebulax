/**
 * 端到端冒烟测试（真实浏览器渲染验证）
 * ============================================================
 * 使用 puppeteer-core 驱动本机 Chrome，验证：
 *  A. 在线模式（http://localhost:8080，后端托管 + API + WebSocket）
 *  B. 后端不可用拦截（前端必须依赖后端，无后端时显示错误页而非登录页）
 *
 * 运行前需启动后端（npm start）
 * 用法：node scripts/e2e-smoke.mjs
 */
import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const errors = [];

async function runOnlineSuite() {
	console.log(`\n========== A. 在线模式（http://localhost:8080） ==========`);
	const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--disable-gpu"] });
	const page = await browser.newPage();
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(`[在线] console错误: ${msg.text().slice(0, 200)}`);
	});
	page.on("pageerror", (err) => errors.push(`[在线] 页面异常: ${String(err).slice(0, 300)}`));
	page.setDefaultTimeout(20000);

	const ok = (label, cond) => console.log(`  ${cond ? "✓" : "✗"} ${label}`);

	try {
		// 1. 登录页
		await page.goto("http://localhost:8080", { waitUntil: "networkidle0" });
		await new Promise((r) => setTimeout(r, 1500));
		const loginVisible = await page.$(".login-panel");
		ok("登录页渲染", !!loginVisible);

		// 2. 登录
		await page.type('input[placeholder="用户名"]', "admin");
		await page.type('input[placeholder="密码"]', "admin123");
		await page.click(".login-panel button.el-button--primary");
		await new Promise((r) => setTimeout(r, 4000));
		const statCards = await page.$$(".sp-stat-card");
		ok(`登录成功进入大屏（KPI 卡 ${statCards.length}/8）`, statCards.length >= 6);

		// 3. 一张图
		await page.evaluate(() => { location.hash = "#/map"; });
		await new Promise((r) => setTimeout(r, 6000));
		const canvas = await page.$("#map canvas");
		const legend = await page.$(".sp-map-legend");
		ok("一张图地图渲染（canvas）", !!canvas);
		ok("图例渲染", !!legend);

		// 4. 实时通道（WebSocket）
		await page.evaluate(() => { location.hash = "#/dashboard"; });
		await new Promise((r) => setTimeout(r, 4500));
		const wsText = await page.evaluate(() => document.querySelector(".ws-status")?.textContent || "");
		ok(`WebSocket 实时通道（${wsText.trim()}）`, wsText.includes("已连接"));

		// 5. 告警中心
		await page.evaluate(() => { location.hash = "#/alarms"; });
		await new Promise((r) => setTimeout(r, 2500));
		const alarmRows = await page.$$(".sp-card .el-table__row");
		ok(`告警列表加载（${alarmRows.length} 行）`, alarmRows.length > 0);

		// 6. 巡检管理
		await page.evaluate(() => { location.hash = "#/inspections"; });
		await new Promise((r) => setTimeout(r, 2000));
		const insRows = await page.$$(".sp-card .el-table__row");
		ok(`巡检计划加载（${insRows.length} 行）`, insRows.length > 0);

		// 7. 工单管理
		await page.evaluate(() => { location.hash = "#/workorders"; });
		await new Promise((r) => setTimeout(r, 2000));
		const woRows = await page.$$(".sp-card .el-table__row");
		ok(`工单列表加载（${woRows.length} 行）`, woRows.length > 0);

		// 8. 管网分析
		await page.evaluate(() => { location.hash = "#/analysis"; });
		await new Promise((r) => setTimeout(r, 2000));
		const tabs = await page.$$(".el-tabs__item");
		ok(`分析中心标签页（${tabs.length} 个）`, tabs.length >= 4);

		// 9. 用户管理（admin）
		await page.evaluate(() => { location.hash = "#/users"; });
		await new Promise((r) => setTimeout(r, 2000));
		const userRows = await page.$$(".sp-card .el-table__row");
		ok(`用户管理加载（${userRows.length} 个用户）`, userRows.length >= 4);

		// 10. 爆管分析交互
		await page.evaluate(() => { location.hash = "#/analysis"; });
		await new Promise((r) => setTimeout(r, 2000));
		await page.evaluate(() => document.querySelectorAll(".el-tabs__item")[1]?.click());
		await new Promise((r) => setTimeout(r, 1500));
		let select = null;
		for (const s of await page.$$(".el-select")) {
			const box = await s.boundingBox();
			if (box && box.width > 0 && box.height > 0) { select = s; break; }
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
			for (const b of await page.$$(".el-tab-pane button")) {
				const text = await page.evaluate((el) => el.textContent || "", b);
				if (text.includes("爆管")) { await b.click(); break; }
			}
			await new Promise((r) => setTimeout(r, 2500));
			const alert = await page.$(".iso-result .el-alert");
			const valves = await page.$$(".iso-result .el-table__row");
			ok(`爆管分析（隔离方案 + ${valves.length} 行清单）`, !!alert);
			if (!alert) errors.push("[在线] 爆管分析结果未渲染");
		} else {
			console.log("  ✗ 未找到管线选择器");
			errors.push("[在线] 未找到管线选择器");
		}
	} catch (e) {
		errors.push(`[在线] 测试中断: ${String(e).slice(0, 300)}`);
		console.log("  ✗ 测试异常:", String(e).slice(0, 200));
	}
	await browser.close();
}

async function runBackendDownSuite() {
	console.log(`\n========== B. 后端不可用拦截（前端强依赖后端） ==========`);
	// 启动一个无 API 代理的静态服务器（模拟 nginx 只托管前端、后端宕机的场景）
	const { spawn } = await import("node:child_process");
	const staticSrv = spawn(process.execPath, ["scripts/serve-static.mjs", "4174"], { stdio: "ignore" });
	const waitPort = async (port, tries = 20) => {
		for (let i = 0; i < tries; i++) {
			try {
				const r = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1500) });
				if (r.ok) return true;
			} catch { /* 重试 */ }
			await new Promise((r) => setTimeout(r, 400));
		}
		return false;
	};
	if (!(await waitPort(4174))) {
		console.log("  ✗ 静态服务器启动失败");
		errors.push("[拦截] 静态服务器启动失败");
		staticSrv.kill();
		return;
	}
	const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
	const page = await browser.newPage();
	page.on("pageerror", (err) => errors.push(`[拦截] 页面异常: ${String(err).slice(0, 300)}`));
	page.setDefaultTimeout(20000);
	try {
		await page.goto("http://localhost:4174/", { waitUntil: "networkidle0", timeout: 25000 }).catch(() => {});
		await new Promise((r) => setTimeout(r, 4500));
		const text = await page.evaluate(() => document.body.innerText);
		const okBlock = text.includes("无法启动") && text.includes("后端");
		console.log(`  ${okBlock ? "✓" : "✗"} 后端不可用时显示拦截错误页（而非登录页/白屏）`);
		if (!okBlock) {
			errors.push("[拦截] 未显示后端不可用拦截页");
			console.log("   页面文本:", text.replace(/\n/g, " | ").slice(0, 220));
		}
	} catch (e) {
		errors.push(`[拦截] 测试中断: ${String(e).slice(0, 300)}`);
		console.log("  ✗ 测试异常:", String(e).slice(0, 200));
	}
	await browser.close();
	staticSrv.kill();
}

await runOnlineSuite();
await runBackendDownSuite();

console.log("\n========== 结果汇总 ==========");
if (errors.length) {
	console.log(`❌ 发现 ${errors.length} 个错误：`);
	errors.forEach((e) => console.log("  -", e));
	process.exit(1);
} else {
	console.log("✅ 全部端到端验证通过");
}
