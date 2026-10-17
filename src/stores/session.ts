import { defineStore } from "pinia";
import { ref } from "vue";
import { getSetupStatus } from "../api";
import { auth } from "../api/auth";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export const useSessionStore = defineStore("session", () => {
  const user = ref<SessionUser | null>(null);
  const needsSetup = ref<boolean | null>(null);
  let loaded = false;

  async function load(force = false) {
    if (loaded && !force) return;
    // Setup can only go from "needed" to "done", so stop asking once it's done.
    if (needsSetup.value !== false) needsSetup.value = (await getSetupStatus()).needsSetup;
    if (needsSetup.value) {
      user.value = null;
    } else {
      const { data, error } = await auth.getSession();
      if (error) throw new Error("Could not load session.");
      user.value = data ? { id: data.user.id, email: data.user.email, name: data.user.name } : null;
    }
    loaded = true;
  }

  async function signOut() {
    await auth.signOut();
    user.value = null;
  }

  function markSignedIn(next: SessionUser) {
    needsSetup.value = false;
    user.value = next;
    loaded = true;
  }

  return { user, needsSetup, load, signOut, markSignedIn };
});
