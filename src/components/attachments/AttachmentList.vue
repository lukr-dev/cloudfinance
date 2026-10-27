<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  ATTACHMENT_CONTENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_NOTE_LENGTH,
} from "../../../shared/attachments";
import type { Attachment, AttachmentList as AttachmentPage } from "../../../shared/schemas";
import { api, upload } from "../../api/http";
import { useErrorToast } from "../../composables/errors";
import { attachmentUrl, formatBytes } from "../../composables/files";
import { formatDateTime } from "../../composables/time";
import { useToasts } from "../../composables/toasts";
import AppIcon from "../ui/AppIcon.vue";
import IconButton from "../ui/IconButton.vue";

/**
 * Documents on a category or a transaction. Without a parent id (a transaction that
 * isn't saved yet) files are only queued in `pending`; the dialog uploads them on save.
 */
const props = defineProps<{ categoryId?: string | null; transactionId?: string | null }>();
const pending = defineModel<File[]>("pending", { default: () => [] });
const emit = defineEmits<{ changed: [] }>();

const { t, locale } = useI18n();
const showError = useErrorToast();
const { push } = useToasts();

const ACCEPT = [...ATTACHMENT_CONTENT_TYPES, ".pdf", ".heic", ".heif"].join(",");
const parent = computed(() =>
  props.categoryId
    ? { category_id: props.categoryId }
    : props.transactionId
      ? { transaction_id: props.transactionId }
      : null,
);

const items = ref<Attachment[]>([]);
const uploading = ref<{ key: number; name: string }[]>([]);
const loaded = ref(false);
const dragging = ref(false);
const confirmId = ref<string | null>(null);
const editingId = ref<string | null>(null);
const draft = ref("");
const brokenThumbs = reactive(new Set<string>());
const noteInput = ref<HTMLTextAreaElement[]>([]);
let uploadKey = 0;

watch(
  parent,
  async (value) => {
    items.value = [];
    loaded.value = false;
    confirmId.value = editingId.value = null;
    if (!value) return;
    try {
      const all: Attachment[] = [];
      let cursor: string | null = null;
      do {
        const page: AttachmentPage = await api<AttachmentPage>("GET", "/attachments", {
          query: { ...value, cursor, limit: 100 },
        });
        all.push(...page.attachments);
        cursor = page.next_cursor;
      } while (cursor && parent.value === value);
      if (parent.value !== value) return;
      // Keep uploads that finished while the list was loading.
      const known = new Set(all.map((a) => a.id));
      items.value = [...items.value.filter((a) => !known.has(a.id)), ...all];
    } catch (e) {
      showError(e);
    } finally {
      loaded.value = true;
    }
  },
  { immediate: true },
);

const isImage = (type: string) => type.startsWith("image/");
const isPdf = (file: File) => file.type === "application/pdf" || /\.pdf$/i.test(file.name);

/** Cheap client-side screen; the server checks the real file signature. */
function accepted(files: File[]): File[] {
  return files.filter((file) => {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      push(t("attachments.tooLarge", { name: file.name }), "error");
      return false;
    }
    if (!isPdf(file) && !file.type.startsWith("image/") && !/\.hei[cf]$/i.test(file.name)) {
      push(t("attachments.unsupported", { name: file.name }), "error");
      return false;
    }
    return true;
  });
}

async function add(files: File[]) {
  const ok = accepted(files);
  if (!ok.length) return;
  const target = parent.value;
  if (!target) {
    pending.value = [...pending.value, ...ok];
    return;
  }
  let added = 0;
  await Promise.all(
    ok.map(async (file) => {
      const entry = { key: ++uploadKey, name: file.name };
      uploading.value.push(entry);
      try {
        const form = new FormData();
        form.set("file", file);
        for (const [key, id] of Object.entries(target)) form.set(key, id);
        const created = await upload<Attachment>("/attachments", form);
        if (parent.value === target) items.value.unshift(created);
        added++;
      } catch (e) {
        showError(e);
      } finally {
        uploading.value = uploading.value.filter((u) => u.key !== entry.key);
      }
    }),
  );
  if (added) emit("changed");
}

function pick(event: Event) {
  const input = event.target as HTMLInputElement;
  void add([...(input.files ?? [])]);
  input.value = "";
}

function drop(event: DragEvent) {
  dragging.value = false;
  void add([...(event.dataTransfer?.files ?? [])]);
}

async function editNote(item: Attachment) {
  confirmId.value = null;
  editingId.value = item.id;
  draft.value = item.note ?? "";
  await nextTick();
  noteInput.value[0]?.focus();
}

async function saveNote(item: Attachment) {
  if (editingId.value !== item.id) return;
  editingId.value = null;
  const note = draft.value.trim() || null;
  if (note === item.note) return;
  try {
    const updated = await api<Attachment>("PATCH", `/attachments/${item.id}`, { body: { note } });
    items.value = items.value.map((a) => (a.id === item.id ? updated : a));
  } catch (e) {
    showError(e);
  }
}

async function remove(item: Attachment) {
  if (confirmId.value !== item.id) {
    confirmId.value = item.id;
    return;
  }
  confirmId.value = null;
  try {
    await api("DELETE", `/attachments/${item.id}`);
    items.value = items.value.filter((a) => a.id !== item.id);
    emit("changed");
  } catch (e) {
    showError(e);
  }
}

function download(item: Attachment) {
  // Content-Disposition: attachment keeps the page where it is.
  location.assign(attachmentUrl(item.id, true));
}
</script>

<template>
  <div class="attachments">
    <ul v-if="items.length || uploading.length || pending.length" class="att-list">
      <li v-for="item in items" :key="item.id" class="att">
        <a
          class="att__thumb"
          :href="attachmentUrl(item.id)"
          target="_blank"
          rel="noopener"
          :aria-label="t('attachments.open', { name: item.file_name })"
          tabindex="-1"
        >
          <img
            v-if="isImage(item.content_type) && !brokenThumbs.has(item.id)"
            :src="attachmentUrl(item.id)"
            alt=""
            loading="lazy"
            @error="brokenThumbs.add(item.id)"
          />
          <span v-else class="att__type">{{
            item.content_type === "application/pdf" ? "PDF" : "IMG"
          }}</span>
        </a>
        <div class="att__main">
          <a class="att__name" :href="attachmentUrl(item.id)" target="_blank" rel="noopener">
            {{ item.file_name }}
          </a>
          <span class="att__meta">
            {{ formatBytes(item.size_bytes, locale) }} ·
            {{ formatDateTime(item.created_at, locale) }}
          </span>
          <textarea
            v-if="editingId === item.id"
            ref="noteInput"
            v-model="draft"
            class="input att__note-input"
            rows="2"
            :maxlength="MAX_ATTACHMENT_NOTE_LENGTH"
            :placeholder="t('attachments.notePlaceholder')"
            @blur="saveNote(item)"
            @keydown.esc.stop.prevent="editingId = null"
            @keydown.enter.meta.prevent="saveNote(item)"
            @keydown.enter.ctrl.prevent="saveNote(item)"
          />
          <button v-else-if="item.note" type="button" class="att__note" @click="editNote(item)">
            {{ item.note }}
          </button>
          <button v-else type="button" class="att__add-note" @click="editNote(item)">
            {{ t("attachments.addNote") }}
          </button>
        </div>
        <div class="att__actions">
          <button
            v-if="confirmId === item.id"
            type="button"
            class="att__confirm"
            @click="remove(item)"
            @blur="confirmId = null"
          >
            {{ t("common.delete") }}
          </button>
          <template v-else>
            <IconButton
              icon="download"
              :label="t('attachments.download')"
              @click="download(item)"
            />
            <IconButton icon="trash" :label="t('attachments.delete')" @click="remove(item)" />
          </template>
        </div>
      </li>

      <li v-for="entry in uploading" :key="entry.key" class="att att--busy" aria-live="polite">
        <span class="att__thumb"><span class="spinner" aria-hidden="true" /></span>
        <div class="att__main">
          <span class="att__name">{{ entry.name }}</span>
          <span class="att__meta">{{ t("attachments.uploading") }}</span>
        </div>
      </li>

      <li v-for="(file, index) in pending" :key="`${file.name}-${index}`" class="att">
        <span class="att__thumb"
          ><span class="att__type">{{ isPdf(file) ? "PDF" : "IMG" }}</span></span
        >
        <div class="att__main">
          <span class="att__name">{{ file.name }}</span>
          <span class="att__meta"
            >{{ formatBytes(file.size, locale) }} · {{ t("attachments.uploadsOnSave") }}</span
          >
        </div>
        <div class="att__actions">
          <IconButton
            icon="close"
            :label="t('attachments.remove')"
            @click="pending = pending.filter((_, i) => i !== index)"
          />
        </div>
      </li>
    </ul>
    <p v-else-if="parent && !loaded" class="att-empty">{{ t("common.loading") }}</p>

    <label
      class="drop"
      :class="{ 'drop--over': dragging }"
      @dragenter.prevent="dragging = true"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="drop"
    >
      <input type="file" class="sr-only" multiple :accept="ACCEPT" @change="pick" />
      <AppIcon name="paperclip" :size="16" :stroke-width="2" />
      <span>
        <span class="drop__title">{{ t("attachments.attach") }}</span>
        <span class="drop__hint">{{ t("attachments.hint") }}</span>
      </span>
    </label>
  </div>
</template>

<style scoped>
.attachments {
  display: grid;
  gap: var(--space-2);
}
.att-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-1);
}
.att {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  align-items: start;
  gap: var(--space-3);
  padding: var(--space-2);
  margin: 0 calc(-1 * var(--space-2));
  border-radius: var(--radius-md);
}
.att:hover {
  background: var(--surface-hover);
}
.att__thumb {
  width: 40px;
  height: 48px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface-raised);
}
.att__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.att__type {
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--negative);
}
.att__main {
  display: grid;
  gap: 2px;
  min-width: 0;
  padding-top: 2px;
}
.att__name {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
a.att__name:hover {
  color: var(--accent);
  text-decoration: underline;
}
.att__meta {
  font-size: var(--text-xs);
  color: var(--text-faint);
}
.att__note,
.att__add-note {
  margin-top: 2px;
  padding: 0;
  border: 0;
  background: none;
  text-align: left;
  font-size: var(--text-sm);
  cursor: text;
}
.att__note {
  color: var(--text-muted);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.att__add-note {
  justify-self: start;
  color: var(--text-faint);
  cursor: pointer;
}
.att__add-note:hover {
  color: var(--accent);
}
.att__note-input {
  margin-top: var(--space-1);
  min-height: 56px;
  font-size: var(--text-sm);
}
.att__actions {
  display: flex;
  align-items: center;
  opacity: 0.6;
  transition: opacity var(--duration-fast) var(--ease-out);
}
.att:hover .att__actions,
.att__actions:focus-within {
  opacity: 1;
}
.att__confirm {
  height: 32px;
  padding: 0 var(--space-3);
  border: 0;
  border-radius: var(--radius-md);
  background: var(--negative-soft);
  color: var(--negative);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
}
.att--busy .att__thumb {
  border-style: dashed;
  color: var(--text-faint);
}
.spinner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid currentColor;
  border-right-color: transparent;
  animation: spin 700ms linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.att-empty {
  font-size: var(--text-sm);
  color: var(--text-faint);
}
.drop {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
  color: var(--text-muted);
  cursor: pointer;
  transition:
    border-color var(--duration-fast) var(--ease-out),
    background var(--duration-fast) var(--ease-out);
}
.drop:hover,
.drop:focus-within,
.drop--over {
  border-color: var(--accent);
  color: var(--accent);
}
.drop:focus-within {
  box-shadow: var(--focus-ring);
}
.drop--over {
  background: var(--accent-soft);
}
.drop > span {
  display: grid;
  gap: 1px;
}
.drop__title {
  font-size: var(--text-sm);
  font-weight: 500;
}
.drop__hint {
  font-size: var(--text-xs);
  color: var(--text-faint);
}
@media (hover: none) {
  .att__actions {
    opacity: 1;
  }
}
</style>
