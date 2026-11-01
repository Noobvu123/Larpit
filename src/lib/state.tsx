import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { initialDraft, type Draft, type PlatformName } from "./flow";
import { references } from "./references";
import { makeShots, parseStoredModel, resumeActiveShot, resumePath } from "../services/model";
import type { CaptionMethods, Captions, Photo, SavedPost, Shot, StoredModel } from "../services/model";
import { getBackend, prepareBackendPhoto, resolveMediaUri } from "../services/backend";
import type { Backend } from "../backend/service";
import type { Draft as BackendDraft } from "../backend/contracts";
import { backendPlatform, combinePosts, freshPreferences, frontendShotId, mapDraft, mapMedia, mapPost, parsePreferences, referenceKeys, toBackendPatch } from "../services/backendBridge";
import type { IntegrationPreferences } from "../services/backendBridge";
import { photoExists, readStoredData, restorePhotoLocation } from "./storage";

export type { Photo, SavedPost, Shot, Captions, CaptionMethods } from "../services/model";
export type BackendPreview = Awaited<ReturnType<Backend["getPreview"]>> & { uiPhotos: Photo[] };
export const GREEN = "#B5FF16";
const SETTINGS_KEY = "larpit.integration.preferences.v1";
const palettes = {
  dark: { background: "#080808", text: "#FFFFFF", muted: "#B5B5BA", card: "#171717", border: "#393939", selected: "#192100" },
  light: { background: "#FFFFFF", text: "#090909", muted: "#62626B", card: "#F3F3F5", border: "#DCDCE1", selected: "#F2FFD9" },
};
function freshModel(): StoredModel {
  return { version: 1, dark: true, hasOnboarded: false, sessionId: "not-started", hasDraft: false,
    draft: { ...initialDraft, platforms: [] }, shots: makeShots(3, "not-started"), activeShot: 0,
    captions: {}, captionMethods: {}, regenerationCount: 0, completedPostId: null, posts: [] };
}
function message(error: unknown): string {
  return error instanceof Error ? error.message : "Your changes could not be saved. Please try again.";
}
function stableLegacyPhoto(photo: Photo): Photo {
  const reference = references.find(r => r.id === photo.assetKey);
  return reference && photo.isDemo ? { ...photo, source: reference.image, unavailable: false } : restorePhotoLocation(photo);
}
async function restoreLegacyPost(post: SavedPost): Promise<SavedPost> {
  return { ...post, photos: await Promise.all(post.photos.map(async original => {
    const photo = stableLegacyPhoto(original);
    return { ...photo, unavailable: !(await photoExists(photo)) };
  })) };
}
export type State = {
  dark: boolean; colors: typeof palettes.dark; toggleTheme: () => void;
  draft: Draft; update: (patch: Partial<Draft>) => Promise<void>; draftRevision: number;
  shots: Shot[]; activeShot: number; setActiveShot: (index: number) => void;
  setReference: (referenceId: string) => Promise<void>; setShotChecks: (checks: boolean[]) => void;
  reviewShot: () => Promise<void>; acceptShot: () => Promise<void>;
  photo: Photo | null; setPhoto: (photo: Photo | null, expectedShotId?: string) => Promise<boolean>;
  captions: Captions; captionMethods: CaptionMethods; regenerationCount: number;
  generateCaptions: () => Promise<void>; regenerateCaptions: () => Promise<void>; setCaption: (platform: PlatformName, text: string) => Promise<void>;
  getPreview: (platform: PlatformName) => Promise<BackendPreview>;
  confirmPreview: (platform: PlatformName, revision: number) => Promise<void>;
  referenceMatches: string[]; referenceMatchStatus: "matched" | "no-match" | "catalog-empty";
  hydrated: boolean; storageError: string | null; clearStorageError: () => void; retryStorage: () => Promise<void>;
  hasOnboarded: boolean; finishOnboarding: () => Promise<void>;
  hasDraft: boolean; resumePath: ReturnType<typeof resumePath>; resumeDraft: () => ReturnType<typeof resumePath>;
  newDraft: () => Promise<void>; reset: () => Promise<void>;
  posts: SavedPost[]; savePost: () => Promise<string>; deletePost: (postId: string) => Promise<void>; isSaving: boolean;
};
const Context = createContext<State | null>(null);

/** SQLite/IndexedDB services own drafts and posts. The former frontend store remains untouched. */
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [model, setModel] = useState<StoredModel>(freshModel);
  const current = useRef(model);
  const prefs = useRef<IntegrationPreferences>(freshPreferences());
  const legacyPosts = useRef<SavedPost[]>([]);
  const activeBackendDraft = useRef<BackendDraft | null>(null);
  const [revision, setRevision] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const ready = useRef(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [matches, setMatches] = useState<string[]>([]);
  const [matchStatus, setMatchStatus] = useState<State["referenceMatchStatus"]>("no-match");
  const operations = useRef<Promise<unknown>>(Promise.resolve());
  const preferenceWrites = useRef<Promise<unknown>>(Promise.resolve());
  const initializing = useRef<Promise<void> | null>(null);
  const mounted = useRef(true);

  const change = useCallback((fn: (previous: StoredModel) => StoredModel) => {
    const next = fn(current.current);
    current.current = next;
    if (mounted.current) setModel(next);
  }, []);
  const savePreferences = useCallback((): Promise<void> => {
    const raw = JSON.stringify(prefs.current);
    const task = preferenceWrites.current.catch(() => undefined).then(() => AsyncStorage.setItem(SETTINGS_KEY, raw));
    preferenceWrites.current = task;
    return task;
  }, []);
  const persistPreferencesSoon = useCallback(() => {
    void savePreferences().catch(error => { if (mounted.current) setStorageError(message(error)); });
  }, [savePreferences]);
  const applyDraft = useCallback(async (draft: BackendDraft) => {
    const mapped = await mapDraft(draft, prefs.current.activeShot, prefs.current.checks, resolveMediaUri);
    activeBackendDraft.current = draft;
    prefs.current.activeDraftId = draft.completedPostId ? null : draft.id;
    prefs.current.activeShot = mapped.activeShot;
    change(previous => ({ ...previous, ...mapped }));
    if (mounted.current) setRevision(draft.revision);
  }, [change]);
  const refreshPosts = useCallback(async (api: Backend) => {
    const posts = await Promise.all((await api.listPosts()).map(post => mapPost(post, resolveMediaUri)));
    change(previous => ({ ...previous, posts: combinePosts(posts, legacyPosts.current, prefs.current.hiddenLegacyPosts) }));
  }, [change]);
  const refreshMatches = useCallback(async (api: Backend, draft: BackendDraft) => {
    const result = await api.matchReferences(draft.id);
    if (mounted.current) { setMatches(result.matches.map(item => item.reference.id)); setMatchStatus(result.status); }
    return result;
  }, []);
  const assignMissingReferences = useCallback(async (api: Backend, initial: BackendDraft) => {
    let draft = initial;
    for (let index = 0; index < draft.shots.length; index++) {
      if (!draft.shots[index].referenceId) draft = await api.setReference(draft.id, draft.shots[index].id, referenceKeys[index % referenceKeys.length]);
    }
    return draft;
  }, []);
  const ensureDraft = useCallback(async (api: Backend): Promise<BackendDraft> => {
    const currentDraft = activeBackendDraft.current;
    if (currentDraft && !currentDraft.completedPostId) return api.getDraft(currentDraft.id);
    const draft = await assignMissingReferences(api, await api.createDraft({ poseBrief: "Tennis portrait" }));
    await applyDraft(draft);
    await savePreferences();
    return draft;
  }, [applyDraft, assignMissingReferences, savePreferences]);
  const enqueue = useCallback(<T,>(work: () => Promise<T>): Promise<T> => {
    const task = operations.current.catch(() => undefined).then(async () => {
      if (!ready.current) throw new Error("Your saved posts are still loading. Please try again.");
      return work();
    });
    operations.current = task;
    return task.catch(error => { if (mounted.current) setStorageError(message(error)); throw error; });
  }, []);

  const load = useCallback(async () => {
    const notices: string[] = [];
    try {
      let settings = await AsyncStorage.getItem(SETTINGS_KEY);
      try { prefs.current = parsePreferences(settings); }
      catch {
        // Keep the unreadable original before using recoverable defaults. Backend data is separate.
        if (settings) await AsyncStorage.setItem(`${SETTINGS_KEY}.recovery`, settings);
        prefs.current = freshPreferences(); settings = null;
        notices.push("Local display settings were reset after keeping a recovery copy. Your posts are stored separately.");
      }
      let legacy: StoredModel | null = null;
      try {
        const { raw, backup } = await readStoredData();
        if (raw || backup) {
          try { legacy = parseStoredModel(raw ?? backup!); }
          catch { if (backup) legacy = parseStoredModel(backup); else throw new Error("Earlier data needs recovery."); }
        }
        if (legacy) {
          legacyPosts.current = await Promise.all(legacy.posts.map(restoreLegacyPost));
          if (!settings) { prefs.current.dark = legacy.dark; prefs.current.hasOnboarded = legacy.hasOnboarded; }
        }
      } catch { notices.push("Earlier frontend data could not be read. Its original copy has been preserved."); }
      change(previous => ({ ...previous, dark: prefs.current.dark, hasOnboarded: prefs.current.hasOnboarded }));
      const api = await getBackend();
      const drafts = await api.listDrafts();
      let selected = drafts.find(draft => draft.id === prefs.current.activeDraftId) ?? drafts[0];
      if (!selected && legacy?.hasDraft && prefs.current.migratedLegacySession !== legacy.sessionId) {
        // Import once. The complete old snapshot remains intact, including unsupported platform drafts.
        if (legacy.draft.platforms.some(platform => platform !== "Instagram" && platform !== "LinkedIn")) {
          notices.push("Your earlier draft is preserved in the previous app data. Start a new Instagram or LinkedIn post in this version.");
          prefs.current.migratedLegacySession = legacy.sessionId;
        } else {
          selected = await assignMissingReferences(api, await api.createDraft(toBackendPatch(legacy.draft)));
          prefs.current.activeDraftId = selected.id;
          prefs.current.migratedLegacySession = legacy.sessionId;
          await savePreferences();
          try {
            for (let index = 0; index < selected.shots.length; index++) {
              const old = legacy.shots[index];
              if (!old) continue;
              selected = await api.setReference(selected.id, selected.shots[index].id, old.referenceId);
              if (old.photo) {
                selected = await api.attachPhoto(selected.id, selected.shots[index].id, await prepareBackendPhoto(stableLegacyPhoto(old.photo)));
                if (old.accepted) selected = await api.acceptPhoto(selected.id, selected.shots[index].id);
              }
              prefs.current.checks[frontendShotId(selected.id, selected.shots[index].id)] = [...old.checks];
            }
            for (const platform of legacy.draft.platforms) {
              const caption = legacy.captions[platform];
              if (caption?.trim() && selected.content !== "photos") selected = await api.editCaption(selected.id, backendPlatform(platform), caption);
            }
            if (legacy.draft.title.trim()) selected = await api.setTitle(selected.id, legacy.draft.title.slice(0, 120));
            notices.push("Your earlier draft was imported. Its original data remains preserved; review the previews before saving.");
          } catch {
            selected = await api.getDraft(selected.id);
            notices.push("Part of your earlier draft was imported. Choose any missing photos again. The complete original data is preserved.");
          }
        }
      }
      if (selected) {
        selected = await assignMissingReferences(api, selected);
        await applyDraft(selected);
        const nextActive = resumeActiveShot(current.current);
        prefs.current.activeShot = nextActive;
        await applyDraft(selected);
        await refreshMatches(api, selected);
      } else {
        activeBackendDraft.current = null;
        change(previous => ({ ...freshModel(), dark: prefs.current.dark, hasOnboarded: prefs.current.hasOnboarded, posts: previous.posts }));
      }
      await refreshPosts(api);
      await savePreferences();
      if (mounted.current) setStorageError(notices.length ? notices.join(" ") : null);
    } catch (error) { if (mounted.current) setStorageError(message(error)); }
    finally { ready.current = true; if (mounted.current) setHydrated(true); }
  }, [applyDraft, assignMissingReferences, change, refreshMatches, refreshPosts, savePreferences]);
  useEffect(() => {
    mounted.current = true;
    if (!initializing.current) initializing.current = load();
    return () => { mounted.current = false; };
  }, [load]);

  const update = useCallback((patch: Partial<Draft>) => enqueue(async () => {
    const backendPatch = toBackendPatch(patch);
    if (!Object.keys(backendPatch).length && patch.referenceIndex === undefined && patch.title === undefined) {
      if (patch.sport !== undefined) change(previous => ({ ...previous, draft: { ...previous.draft, sport: patch.sport! } }));
      return;
    }
    const api = await getBackend();
    let draft = await ensureDraft(api);
    if (Object.keys(backendPatch).length) draft = await api.updateDraft(draft.id, backendPatch);
    draft = await assignMissingReferences(api, draft);
    if (patch.pose !== undefined) {
      const result = await refreshMatches(api, draft);
      const currentShot = draft.shots[prefs.current.activeShot];
      if (currentShot && !currentShot.photo && result.matches[0]) draft = await api.setReference(draft.id, currentShot.id, result.matches[0].reference.id);
      for (const shot of draft.shots) delete prefs.current.checks[frontendShotId(draft.id, shot.id)];
    }
    if (patch.referenceIndex !== undefined && references[patch.referenceIndex] && draft.shots[prefs.current.activeShot]) {
      const shot = draft.shots[prefs.current.activeShot];
      if (shot.referenceId !== references[patch.referenceIndex].id) {
        delete prefs.current.checks[frontendShotId(draft.id, shot.id)];
        draft = await api.setReference(draft.id, shot.id, references[patch.referenceIndex].id);
      }
    }
    if (patch.title !== undefined && patch.title.trim() && patch.title !== draft.title) draft = await api.setTitle(draft.id, patch.title.slice(0, 120));
    await applyDraft(draft);
    await savePreferences();
  }), [applyDraft, assignMissingReferences, change, enqueue, ensureDraft, refreshMatches, savePreferences]);
  const newDraft = useCallback(() => enqueue(async () => {
    const api = await getBackend();
    const previous = activeBackendDraft.current;
    // Create first, so a storage failure cannot remove the existing unfinished post.
    const draft = await assignMissingReferences(api, await api.createDraft({ poseBrief: "Tennis portrait" }));
    prefs.current.activeShot = 0; prefs.current.checks = {};
    await applyDraft(draft);
    await savePreferences();
    if (previous && !previous.completedPostId) { await api.deleteDraft(previous.id); await api.collectGarbage(); }
    await refreshMatches(api, draft);
  }), [applyDraft, assignMissingReferences, enqueue, refreshMatches, savePreferences]);
  const setActiveShot = useCallback((index: number) => {
    const activeShot = Math.max(0, Math.min(current.current.shots.length - 1, Math.trunc(index) || 0));
    prefs.current.activeShot = activeShot;
    change(previous => ({ ...previous, activeShot, draft: { ...previous.draft, referenceIndex: Math.max(0, references.findIndex(r => r.id === previous.shots[activeShot]?.referenceId)) } }));
    persistPreferencesSoon();
  }, [change, persistPreferencesSoon]);
  const setReference = useCallback((referenceId: string) => {
    const requestedId = current.current.shots[current.current.activeShot]?.id;
    return enqueue(async () => {
      if (!references.some(r => r.id === referenceId)) throw new Error("This reference is unavailable.");
      const api = await getBackend(); const draft = await ensureDraft(api);
      const shot = draft.shots[prefs.current.activeShot];
      if (!shot || frontendShotId(draft.id, shot.id) !== requestedId) return;
      if (shot.referenceId === referenceId) return;
      delete prefs.current.checks[requestedId];
      await applyDraft(await api.setReference(draft.id, shot.id, referenceId));
      await savePreferences();
    });
  }, [applyDraft, enqueue, ensureDraft, savePreferences]);
  const setShotChecks = useCallback((checks: boolean[]) => {
    const shot = current.current.shots[current.current.activeShot];
    if (!shot) return;
    const values = Array.from({ length: 3 }, (_, i) => !!checks[i]);
    prefs.current.checks[shot.id] = values;
    change(previous => ({ ...previous, shots: previous.shots.map(item => item.id === shot.id ? { ...item, checks: values } : item) }));
    persistPreferencesSoon();
  }, [change, persistPreferencesSoon]);
  const setPhoto = useCallback((photo: Photo | null, expectedShotId?: string) => {
    const requestedShotId = expectedShotId ?? current.current.shots[current.current.activeShot]?.id;
    return enqueue(async () => {
      const api = await getBackend();
      const draft = await ensureDraft(api);
      const active = draft.shots[prefs.current.activeShot];
      if (!active || frontendShotId(draft.id, active.id) !== requestedShotId) return false;
      const result = photo ? await api.attachPhoto(draft.id, active.id, await prepareBackendPhoto(photo)) : await api.removePhoto(draft.id, active.id);
      delete prefs.current.checks[requestedShotId];
      await applyDraft(result);
      await savePreferences();
      await api.collectGarbage();
      return true;
    });
  }, [applyDraft, enqueue, ensureDraft, savePreferences]);
  const reviewShot = useCallback(() => enqueue(async () => {
    const api = await getBackend(); const draft = await ensureDraft(api); const shot = draft.shots[prefs.current.activeShot];
    if (!shot?.photo) throw new Error("Choose a photo first.");
    // Reopening a completed review does not invalidate an accepted photo.
    if (!shot.assessment) await applyDraft(await api.reviewPhoto(draft.id, shot.id));
  }), [applyDraft, enqueue, ensureDraft]);
  const acceptShot = useCallback(() => enqueue(async () => {
    const api = await getBackend(); let draft = await ensureDraft(api); const shot = draft.shots[prefs.current.activeShot];
    if (!shot) throw new Error("Choose a photo first.");
    if (!shot.assessment) draft = await api.reviewPhoto(draft.id, shot.id);
    await applyDraft(await api.acceptPhoto(draft.id, shot.id));
  }), [applyDraft, enqueue, ensureDraft]);
  const generate = useCallback((regenerate: boolean) => enqueue(async () => {
    const api = await getBackend(); let draft = await ensureDraft(api);
    if (regenerate) {
      // This call follows the explicit UI confirmation before replacing user-edited captions.
      draft = await api.generateCaptions(draft.id, { regenerate: true, replaceEdited: true });
    } else {
      for (const platform of draft.platforms) if (!draft.captions[platform]) draft = await api.generateCaptions(draft.id, { platform });
    }
    await applyDraft(draft);
  }), [applyDraft, enqueue, ensureDraft]);
  const setCaption = useCallback((platform: PlatformName, text: string) => enqueue(async () => {
    const api = await getBackend(); const draft = await ensureDraft(api); const key = backendPlatform(platform);
    if (draft.captions[key]?.text === text.trim()) return;
    await applyDraft(await api.editCaption(draft.id, key, text));
  }), [applyDraft, enqueue, ensureDraft]);
  const getPreview = useCallback((platform: PlatformName) => enqueue(async (): Promise<BackendPreview> => {
    const api = await getBackend(); const draft = await ensureDraft(api);
    const preview = await api.getPreview(draft.id, backendPlatform(platform));
    return { ...preview, uiPhotos: await Promise.all(preview.photos.map(media => mapMedia(media, resolveMediaUri))) };
  }), [enqueue, ensureDraft]);
  const confirmPreview = useCallback((platform: PlatformName, displayedRevision: number) => enqueue(async () => {
    const api = await getBackend(); const draft = await ensureDraft(api);
    await applyDraft(await api.confirmPreview(draft.id, backendPlatform(platform), displayedRevision));
  }), [applyDraft, enqueue, ensureDraft]);
  const savePost = useCallback(() => enqueue(async () => {
    setIsSaving(true);
    try {
      const api = await getBackend();
      const draft = activeBackendDraft.current;
      if (!draft) throw new Error("Start a post before saving.");
      const post = await api.completeDraft(draft.id);
      await applyDraft(await api.getDraft(draft.id));
      await refreshPosts(api);
      await savePreferences();
      setStorageError(null);
      return post.id;
    } finally { if (mounted.current) setIsSaving(false); }
  }), [applyDraft, enqueue, refreshPosts, savePreferences]);
  const deletePost = useCallback((postId: string) => enqueue(async () => {
    setIsSaving(true);
    try {
      const api = await getBackend();
      if (legacyPosts.current.some(post => post.id === postId)) {
        // Keep the previous application's recovery data intact; remove only from this history.
        prefs.current.hiddenLegacyPosts = [...new Set([...prefs.current.hiddenLegacyPosts, postId])];
        await savePreferences();
      } else { await api.deletePost(postId); await api.collectGarbage(); }
      if (activeBackendDraft.current?.completedPostId === postId) activeBackendDraft.current = null;
      await refreshPosts(api);
    } finally { if (mounted.current) setIsSaving(false); }
  }), [enqueue, refreshPosts, savePreferences]);
  const finishOnboarding = useCallback(() => enqueue(async () => {
    prefs.current.hasOnboarded = true;
    await savePreferences();
    change(previous => ({ ...previous, hasOnboarded: true }));
  }), [change, enqueue, savePreferences]);
  const toggleTheme = useCallback(() => {
    prefs.current.dark = !current.current.dark;
    change(previous => ({ ...previous, dark: prefs.current.dark }));
    persistPreferencesSoon();
  }, [change, persistPreferencesSoon]);
  const resumeDraft = useCallback(() => {
    setActiveShot(resumeActiveShot(current.current));
    return resumePath(current.current);
  }, [setActiveShot]);
  const retryStorage = useCallback(async () => {
    await operations.current.catch(() => undefined);
    await load();
  }, [load]);
  const value = useMemo<State>(() => ({
    dark: model.dark, colors: model.dark ? palettes.dark : palettes.light, toggleTheme,
    draft: model.draft, update, draftRevision: revision, shots: model.shots, activeShot: model.activeShot,
    setActiveShot, setReference, setShotChecks, reviewShot, acceptShot, photo: model.shots[model.activeShot]?.photo ?? null, setPhoto,
    captions: model.captions, captionMethods: model.captionMethods, regenerationCount: model.regenerationCount,
    generateCaptions: () => generate(false), regenerateCaptions: () => generate(true), setCaption, getPreview, confirmPreview,
    referenceMatches: matches, referenceMatchStatus: matchStatus,
    hydrated, storageError, clearStorageError: () => setStorageError(null), retryStorage,
    hasOnboarded: model.hasOnboarded, finishOnboarding, hasDraft: model.hasDraft, resumePath: resumePath(model), resumeDraft,
    newDraft, reset: newDraft, posts: model.posts, savePost, deletePost, isSaving,
  }), [model, toggleTheme, update, revision, setActiveShot, setReference, setShotChecks, reviewShot, acceptShot, setPhoto,
    generate, setCaption, getPreview, confirmPreview, matches, matchStatus, hydrated, storageError, retryStorage,
    finishOnboarding, resumeDraft, newDraft, savePost, deletePost, isSaving]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useApp(): State {
  const value = useContext(Context);
  if (!value) throw new Error("AppProvider is required");
  return value;
}
