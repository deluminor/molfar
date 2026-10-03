import { useCallback, useEffect, useState } from "react";
import { searchConfluence } from "../../model/confluence/api";
import type { ConfluenceNode } from "../../model/confluence/types";
import { errorText } from "./error-text";
import type { SetError } from "./types";

const SEARCH_DEBOUNCE_MS = 280;

export type ConfluenceSearchApi = {
  searchInput: string;
  setSearchInput: (value: string) => void;
  searchHits: ConfluenceNode[] | null;
  searching: boolean;
  clearSearch: () => void;
};

export function useConfluenceSearch(
  spaceKey: string | undefined,
  setError: SetError,
): ConfluenceSearchApi {
  const [searchInput, setSearchInput] = useState("");
  const [searchHits, setSearchHits] = useState<ConfluenceNode[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const query = searchInput.trim();
    if (!query) {
      setSearchHits(null);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);

    const handle = window.setTimeout(() => {
      void searchConfluence({ query, spaceKey, limit: 30 })
        .then((hits) => {
          if (!cancelled) setSearchHits(hits);
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setSearchHits([]);
            setError(errorText(err));
          }
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [spaceKey, searchInput, setError]);

  const clearSearch = useCallback(() => setSearchHits(null), []);

  return { searchInput, setSearchInput, searchHits, searching, clearSearch };
}
