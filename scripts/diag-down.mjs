import puppeteer from "puppeteer-core";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 400)));
page.on("console", (m) => console.log("[console]", m.type(), m.text().slice(0, 200)));
page.on("response", (r) => {
	if (r.url().includes("health")) console.log("[health响应]", r.status(), r.url());
});
await page.goto("http://localhost:4173/", { waitUntil: "networkidle0", timeout: 25000 }).catch((e) => console.log("goto:", e.message.slice(0, 100)));
await new Promise((r) => setTimeout(r, 5000));
const info = await page.evaluate(() => ({
	text: document.body.innerText.replace(/\s+/g, " ").slice(0, 250),
	htmlLen: document.getElementById("app")?.innerHTML.length,
}));
console.log("app HTML 长度:", info.htmlLen);
console.log("body 文本:", info.text);
await browser.close();
