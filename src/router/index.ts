import { createRouter, createWebHistory } from "vue-router";
import { useSessionStore } from "../stores/session";

declare module "vue-router" {
  interface RouteMeta {
    public?: boolean;
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", component: () => import("../views/LoginView.vue"), meta: { public: true } },
    { path: "/setup", component: () => import("../views/SetupView.vue"), meta: { public: true } },
    { path: "/", redirect: "/budget" },
    { path: "/budget/:month(\\d{4}-\\d{2})?", component: () => import("../views/BudgetView.vue") },
    { path: "/transactions", component: () => import("../views/TransactionsView.vue") },
    { path: "/accounts", component: () => import("../views/AccountsView.vue") },
    { path: "/agents", component: () => import("../views/AgentsView.vue") },
    { path: "/settings", component: () => import("../views/SettingsView.vue") },
    { path: "/:pathMatch(.*)*", redirect: "/budget" },
  ],
});

router.beforeEach(async (to) => {
  const session = useSessionStore();
  await session.load();
  if (session.needsSetup) return to.path === "/setup" ? true : "/setup";
  if (!session.user) return to.meta.public && to.path === "/login" ? true : "/login";
  if (to.meta.public) return "/budget";
  return true;
});
