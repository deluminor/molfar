import { useSyncExternalStore } from "react";
import { readFlag, writeFlag } from "./storageFlags";

const SHOW_REMAINING_USAGE_KEY = "molfar.showRemainingUsage";
const MASK_EMAILS_KEY = "molfar.maskEmails";
const COMPOSER_AUTOCORRECT_KEY = "molfar.composerAutocorrect";
const RAIL_FAMILIARS_PINNED_KEY = "molfar.railFamiliarsPinned";

export const SHOW_REMAINING_USAGE_DEFAULT = false;
export const MASK_EMAILS_DEFAULT = true;
export const COMPOSER_AUTOCORRECT_DEFAULT = true;
export const RAIL_FAMILIARS_PINNED_DEFAULT = false;

/** Fired on `window` whenever the usage meter direction flips (detail: boolean). */
export const SHOW_REMAINING_USAGE_CHANGE_EVENT =
  "molfar:showremainingusagechange";
/** Fired on `window` whenever email masking flips (detail: boolean). */
export const MASK_EMAILS_CHANGE_EVENT = "molfar:maskemailschange";
/** Fired on `window` whenever composer autocorrect flips (detail: boolean). */
export const COMPOSER_AUTOCORRECT_CHANGE_EVENT =
  "molfar:composerautocorrectchange";
/** Fired on `window` whenever Familiars are pinned to or unpinned from the icon rail (detail: boolean). */
export const RAIL_FAMILIARS_PINNED_CHANGE_EVENT = "molfar:railfamiliarspinnedchange";

function flagStore(key: string, fallback: boolean, event: string) {
  // Holds a saved value only while storage failed to keep it, so the switch
  // still flips for this window when localStorage is unavailable.
  let unsaved: boolean | null = null;
  const load = () => unsaved ?? readFlag(key) ?? fallback;
  const save = (value: boolean) => {
    writeFlag(key, value);
    unsaved = readFlag(key) === value ? null : value;
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent<boolean>(event, { detail: value }));
  };
  const subscribe = (onStoreChange: () => void) => {
    if (typeof window === "undefined") return () => {};
    // Other windows write the same localStorage; `storage` reports their saves.
    const onStorage = (storage: StorageEvent) => {
      if (storage.key !== key && storage.key !== null) return;
      unsaved = null;
      onStoreChange();
    };
    window.addEventListener(event, onStoreChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(event, onStoreChange);
      window.removeEventListener("storage", onStorage);
    };
  };
  const useFlag = () => useSyncExternalStore(subscribe, load, () => fallback);
  return { load, save, subscribe, useFlag };
}

const showRemainingUsage = flagStore(
  SHOW_REMAINING_USAGE_KEY,
  SHOW_REMAINING_USAGE_DEFAULT,
  SHOW_REMAINING_USAGE_CHANGE_EVENT,
);
const maskEmails = flagStore(
  MASK_EMAILS_KEY,
  MASK_EMAILS_DEFAULT,
  MASK_EMAILS_CHANGE_EVENT,
);
const composerAutocorrect = flagStore(
  COMPOSER_AUTOCORRECT_KEY,
  COMPOSER_AUTOCORRECT_DEFAULT,
  COMPOSER_AUTOCORRECT_CHANGE_EVENT,
);
const railFamiliarsPinned = flagStore(
  RAIL_FAMILIARS_PINNED_KEY,
  RAIL_FAMILIARS_PINNED_DEFAULT,
  RAIL_FAMILIARS_PINNED_CHANGE_EVENT,
);

/** Usage meters fill with what is left instead of what is used. */
export const loadShowRemainingUsage = showRemainingUsage.load;
export const saveShowRemainingUsage = showRemainingUsage.save;
export const subscribeShowRemainingUsage = showRemainingUsage.subscribe;
export const useShowRemainingUsage = showRemainingUsage.useFlag;

/** Account emails stay blurred until clicked. */
export const loadMaskEmails = maskEmails.load;
export const saveMaskEmails = maskEmails.save;
export const subscribeMaskEmails = maskEmails.subscribe;
export const useMaskEmails = maskEmails.useFlag;

/** Session and familiar composers spell check and autocorrect what you type. */
export const loadComposerAutocorrect = composerAutocorrect.load;
export const saveComposerAutocorrect = composerAutocorrect.save;
export const subscribeComposerAutocorrect = composerAutocorrect.subscribe;
export const useComposerAutocorrect = composerAutocorrect.useFlag;

/** Familiars sit at the top of the icon rail instead of inside the project picker. */
export const loadRailFamiliarsPinned = railFamiliarsPinned.load;
export const saveRailFamiliarsPinned = railFamiliarsPinned.save;
export const subscribeRailFamiliarsPinned = railFamiliarsPinned.subscribe;
export const useRailFamiliarsPinned = railFamiliarsPinned.useFlag;
