/** 认证状态：用户信息 / token（localStorage 持久化） */
import { reactive } from "vue";
import { apiAuth } from "../api";
import type { User } from "../types";

const TOKEN_KEY = "sp_token";
const USER_KEY = "sp_user";

const state = reactive({
	user: JSON.parse(localStorage.getItem(USER_KEY) || "null") as User | null,
	token: localStorage.getItem(TOKEN_KEY) || "",
});

export const authStore = {
	state,
	get isLoggedIn() {
		return !!state.token;
	},
	/** 角色等级：viewer 0 < inspector 1 < operator 2 < admin 3 */
	roleLevel(): number {
		if (!state.user) return -1;
		return { viewer: 0, inspector: 1, operator: 2, admin: 3 }[state.user.role] ?? -1;
	},
	hasRole(min: "viewer" | "inspector" | "operator" | "admin"): boolean {
		const level = { viewer: 0, inspector: 1, operator: 2, admin: 3 };
		return this.roleLevel() >= level[min];
	},
	async login(username: string, password: string): Promise<User> {
		const { token, user } = await apiAuth.login(username, password);
		state.token = token;
		state.user = user;
		localStorage.setItem(TOKEN_KEY, token);
		localStorage.setItem(USER_KEY, JSON.stringify(user));
		return user;
	},
	logout() {
		apiAuth.logout();
		state.token = "";
		state.user = null;
		localStorage.removeItem(TOKEN_KEY);
		localStorage.removeItem(USER_KEY);
	},
};
