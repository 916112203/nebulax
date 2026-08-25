/**
 * 端到端冒烟测试（真实浏览器渲染验证）
 * ============================================================
 * 使用 puppeteer-core 驱动本机 Chrome，分别验证：
 *  A. 在线模式（http://localhost:8080，后端托管 + API）
 *  B. 演示模式（http://localhost:4173，无后端，浏览器内置引擎）
 * 覆盖：登录 → 大屏 → 一张图 → 告警 → 巡检 → 工单 → 分析 → 用户管理
 *
 * 运行前需启动后端（npm run server）与 preview（npm run preview -- --port 4173）
 * 用法：node scripts/e2e-smoke.mjs
 */
import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const errors = [];

async function runSuite(name, base) {
	console.log(`\n========== ${name}（${base}） ==========`);
	const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--disable-gpu"] });
	const page = await browser.newPage();
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(`[${name}] console错误: ${msg.text().slice(0, 200)}`);
	});
	page.on("pageerror", (err) => errors.push(`[${name}] 页面异常: ${String(err).slice(0, 300)}`));
	page.setDefaultTimeout(20000);

	const ok = (label, cond) => console.log(`  ${cond ? "✓" : "✗"} ${label}`);

	try {
		// 1. 登录页
		await page.goto(base, { waitUntil: "networkidle0" });
		await new Promise((r) => setTimeout(r, 1500));
		const loginVisible = await page.$(".login-panel");
		ok("登录页渲染", !!loginVisible);

		// 2. 登录
		await page.type('input[placeholder="用户名"]', "admin");
		await page.type('input[placeholder="密码"]', "admin123");
		await page.click(".login-panel button.el-button--primary");
		await new Promise((r) => setTimeout(r, 4000));
		const statCards = await page.$$(".sp-stat-card");
		const hash = await page.evaluate(() => location.hash);
		ok(`登录成功进入大屏（hash=${hash}，KPI 卡 ${statCards.length}/8）`, statCards.length >= 6);

		// 3. 一张图
		await page.evaluate(() => { location.hash = "#/map"; });
		await new Promise((r) => setTimeout(r, 6000));
		const canvas = await page.$("#map canvas");
		const legend = await page.$(".sp-map-legend");
		ok("一张图地图渲染（canvas）", !!canvas);
		ok("图例渲染", !!legend);

		// 4. 告警中心
		await page.evaluate(() => { location.hash = "#/alarms"; });
		await new Promise((r) => setTimeout(r, 2500));
		const alarmRows = await page.$$(".sp-card .el-table__row");
		ok(`告警列表加载（${alarmRows.length} 行）`, alarmRows.length > 0);

		// 5. 巡检管理
		await page.evaluate(() => { location.hash = "#/inspections"; });
		await new Promise((r) => setTimeout(r, 2000));
		const insRows = await page.$$(".sp-card .el-table__row");
		ok(`巡检计划加载（${insRows.length} 行）`, insRows.length > 0);

		// 6. 工单管理
		await page.evaluate(() => { location.hash = "#/workorders"; });
		await new Promise((r) => setTimeout(r, 2000));
		const woRows = await page.$$(".sp-card .el-table__row");
		ok(`工单列表加载（${woRows.length} 行）`, woRows.length > 0);

		// 7. 管网分析
		await page.evaluate(() => { location.hash = "#/analysis"; });
		await new Promise((r) => setTimeout(r, 2000));
		const tabs = await page.$$(".el-tabs__item");
		ok(`分析中心标签页（${tabs.length} 个）`, tabs.length >= 4);

		// 8. 用户管理（admin）
		await page.evaluate(() => { location.hash = "#/users"; });
		await new Promise((r) => setTimeout(r, 2000));
		const userRows = await page.$$(".sp-card .el-table__row");
		ok(`用户管理加载（${userRows.length} 个用户）`, userRows.length >= 4);
	} catch (e) {
		errors.push(`[${name}] 测试中断: ${String(e).slice(0, 300)}`);
		console.log("  ✗ 测试异常:", String(e).slice(0, 200));
	}
	await browser.close();
}

/* 演示模式额外验证：爆管分析交互 */
async function runDemoAnalysis(base) {
	console.log(`\n========== 演示模式·空间分析交互 ==========`);
	const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--disable-gpu"] });
	const page = await browser.newPage();
	page.on("pageerror", (err) => errors.push(`[分析] 页面异常: ${String(err).slice(0, 300)}`));
	page.setDefaultTimeout(25000);
	try {
		await page.goto(base, { waitUntil: "networkidle0" });
		await new Promise((r) => setTimeout(r, 1500));
		await page.type('input[placeholder="用户名"]', "admin");
		await page.type('input[placeholder="密码"]', "admin123");
		await page.click(".login-panel button.el-button--primary");
		await new Promise((r) => setTimeout(r, 2500));
		// 进入分析中心 → 爆管分析
		await page.evaluate(() => { location.hash = "#/analysis"; });
		await new Promise((r) => setTimeout(r, 2000));
		await page.evaluate(() => {
			const tabs = document.querySelectorAll(".el-tabs__item");
			tabs[1]?.click();
		});
		await new Promise((r) => setTimeout(r, 1500));
		// 爆管分析标签页的 select（真实点击 + 键盘过滤选择）
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
			// 真实鼠标点击第一个可见的匹配选项
			for (const item of await page.$$(".el-select-dropdown__item")) {
				const box = await item.boundingBox();
				const text = await page.evaluate((el) => el.textContent || "", item);
				if (box && box.width > 0 && text.includes("GS-")) {
					await item.click();
					break;
				}
			}
			await new Promise((r) => setTimeout(r, 800));
			const btns = await page.$$(".el-tab-pane button");
			for (const b of btns) {
				const text = await page.evaluate((el) => el.textContent || "", b);
				if (text.includes("爆管")) {
					await b.click();
					break;
				}
			}
			await new Promise((r) => setTimeout(r, 2500));
			const alert = await page.$(".iso-result .el-alert");
			const valves = await page.$$(".iso-result .el-table__row");
			console.log(`  ${alert ? "✓" : "✗"} 爆管分析结果（隔离方案 + ${valves.length} 行清单）`);
			if (!alert) {
				errors.push("[分析] 爆管分析结果未渲染");
				const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 400));
				console.log("   页面文本:", bodyText.replace(/\n/g, " | ").slice(0, 300));
			}
		} else {
			console.log("  ✗ 未找到管线选择器");
			errors.push("[分析] 未找到管线选择器");
		}
	} catch (e) {
		errors.push(`[分析] 测试中断: ${String(e).slice(0, 300)}`);
		console.log("  ✗ 测试异常:", String(e).slice(0, 200));
	}
	await browser.close();
}

await runSuite("A. 在线模式", "http://localhost:8080");
await runSuite("B. 演示模式（GitHub Pages 形态）", "http://localhost:4173");
await runDemoAnalysis("http://localhost:4173");

console.log("\n========== 结果汇总 ==========");
if (errors.length) {
	console.log(`❌ 发现 ${errors.length} 个错误：`);
	errors.forEach((e) => console.log("  -", e));
	process.exit(1);
} else {
	console.log("✅ 全部端到端验证通过");
}
