/** HTTP 封装：统一请求、鉴权头、错误处理 */

export const API_BASE: string = (import.meta.env.VITE_API_BASE ?? "/api").replace(/\/$/, "");

export class ApiError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

const getToken = () => localStorage.getItem("sp_token") || "";

export async function http<T = any>(method: string, path: string, body?: unknown): Promise<T> {
	const res = await fetch(`${API_BASE}${path}`, {
		method,
		headers: {
			"Content-Type": "application/json",
			...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
		},
		body: body !== undefined ? JSON.stringify(body) : undefined,
	});
	if (!res.ok) {
		let msg = `请求失败 (${res.status})`;
		try {
			const data = await res.json();
			if (data?.error) msg = data.error;
		} catch { /* 非 JSON 响应 */ }
		throw new ApiError(res.status, msg);
	}
	return res.json() as Promise<T>;
}

/** 探测后端是否可用（启动时调用，2.5s 超时）
 *  - API_BASE 非空：探测 `${API_BASE}/overview/health`（VM 全栈部署 / nginx 反代）
 *  - API_BASE 为空：探测同源 `/api/overview/health`（GitHub Pages 下 404 → 回退演示模式）
 *  同一份构建产物即可适配两种部署形态。 */
export async function probeHealth(): Promise<boolean> {
	const target = API_BASE === "" ? "/api/overview/health" : `${API_BASE}/overview/health`;
	try {
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), 2500);
		const res = await fetch(target, { signal: ctrl.signal });
		clearTimeout(timer);
		if (!res.ok) return false;
		// 防御 SPA fallback（vite preview/nginx try_files 会对未知路径返回 index.html 200）：
		// 必须确认为真实 API 的 JSON 响应
		const data = await res.json();
		return data?.status === "ok";
	} catch {
		return false;
	}
}

/** WebSocket 连接（在线模式实时遥测） */
export function connectWS(onMessage: (msg: any) => void, onStatus: (ok: boolean) => void): () => void {
	if (API_BASE === "") {
		onStatus(false);
		return () => {};
	}
	const proto = location.protocol === "https:" ? "wss" : "ws";
	const url = `${proto}://${location.host}${API_BASE}/ws`;
	let ws: WebSocket | null = null;
	let closed = false;
	let retryTimer: ReturnType<typeof setTimeout> | null = null;

	const connect = () => {
		if (closed) return;
		try {
			ws = new WebSocket(url);
		} catch {
			onStatus(false);
			return;
		}
		ws.onopen = () => onStatus(true);
		ws.onmessage = (ev) => {
			try { onMessage(JSON.parse(ev.data)); } catch { /* 忽略 */ }
		};
		ws.onclose = () => {
			onStatus(false);
			if (!closed) retryTimer = setTimeout(connect, 5000);
		};
		ws.onerror = () => ws?.close();
	};
	connect();
	return () => {
		closed = true;
		if (retryTimer) clearTimeout(retryTimer);
		ws?.close();
	};
}
