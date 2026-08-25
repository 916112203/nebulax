/** HTTP 封装：统一请求、鉴权头、错误处理、实时通道 */

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

/** 启动时探测后端可用性（应用启动前置校验，2.5s 超时） */
export async function probeHealth(): Promise<boolean> {
	try {
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), 2500);
		const res = await fetch(`${API_BASE}/overview/health`, { signal: ctrl.signal });
		clearTimeout(timer);
		if (!res.ok) return false;
		const data = await res.json();
		return data?.status === "ok";
	} catch {
		return false;
	}
}

/** WebSocket 连接（实时遥测/告警事件） */
export function connectWS(onMessage: (msg: any) => void, onStatus: (ok: boolean) => void): () => void {
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
