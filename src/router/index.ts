import { createRouter, createWebHistory } from "vue-router";
import { getSetupStatus } from "../api";
import { auth } from "../api/auth";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", component: () => import("../views/LoginView.vue") },
    { path: "/setup", component: () => import("../views/SetupView.vue") },
    { path: "/", component: () => import("../views/HomeView.vue") },
  ],
});

router.beforeEach(async (to) => {
  const { needsSetup } = await getSetupStatus();
  if (needsSetup) return to.path === "/setup" ? true : "/setup";
  const { data, error } = await auth.getSession();
  if (error) throw new Error("Could not load session.");
  if (!data) return to.path === "/login" ? true : "/login";
  if (to.path === "/login" || to.path === "/setup") return "/";
  return true;
});
