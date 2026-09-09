import { type DeckId, isArkhamDBIdentity } from "@arkham-build/shared";
import {
  DownloadIcon,
  EllipsisIcon,
  ListChecksIcon,
  PlusIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Virtuoso } from "react-virtuoso";
import { Link, useLocation } from "wouter";
import {
  useDeleteDeck,
  useDuplicateDeck,
} from "@/components/deck-display/hooks";
import {
  DeckSummary,
  DeckSummaryQuickActions,
} from "@/components/deck-summary/deck-summary";
import { Button } from "@/components/ui/button";
import {
  DropdownButton,
  DropdownItem,
  DropdownMenu,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Scroller } from "@/components/ui/scroller";
import { useToast } from "@/components/ui/toast.hooks";
import {
  useDeleteAllDecksMutation,
  useImportFromFilesMutation,
} from "@/queries/mutations/decks";
import { useStore } from "@/store";
import { formatDeckShare } from "@/store/lib/deck-io";
import { serializeDeckTransfer } from "@/store/lib/deck-transfer";
import type { DeckSummary as DeckSummaryType } from "@/store/lib/types";
import { selectDecksDisplayList } from "@/store/selectors/deck-collection";
import { appPath } from "@/utils/app-path";
import { ARKHAMDB_WARNING_VISIBLE } from "@/utils/constants";
import { download } from "@/utils/download";
import { useHotkey } from "@/utils/use-hotkey";
import { Checkbox } from "../ui/checkbox";
import { FileInput } from "../ui/file-input";
import { Notice } from "../ui/notice";
import css from "./deck-collection.module.css";
import { DeckCollectionFilters } from "./deck-collection-filters";
import { DeckCollectionFolder } from "./deck-collection-folder";
import { DeckCollectionImport } from "./deck-collection-import";

export function DeckCollection() {
  const { t } = useTranslation();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selectedDeckIds, setSelectedDeckIds] = useState<Set<DeckId>>(
    () => new Set(),
  );

  const [scrollParent, setScrollParent] = useState<HTMLElement | undefined>();

  const [, navigate] = useLocation();
  const toast = useToast();

  const deckCollection = useStore(selectDecksDisplayList);
  const decks = useStore((state) => state.data.decks);

  const visibleDeckIds = useMemo(
    () =>
      deckCollection.entries.flatMap((entry) =>
        entry.type === "deck" ? [entry.deck.id] : [],
      ),
    [deckCollection.entries],
  );

  const importDecksMutation = useImportFromFilesMutation();
  const deleteAllDecksMutation = useDeleteAllDecksMutation();

  const hasConnections = useStore(
    (state) => state.auth.status === "authenticated",
  );

  const hasArkhamDBConnection = useStore(
    (state) =>
      state.auth.status === "authenticated" &&
      !!state.auth.session?.identities.some(isArkhamDBIdentity),
  );

  const onAddFiles = useCallback(
    (evt: React.ChangeEvent<HTMLInputElement>) => {
      const files = evt.target.files;
      if (files?.length) {
        importDecksMutation.mutate(files);
        setPopoverOpen(false);
      }
    },
    [importDecksMutation],
  );

  const onDeleteAll = useCallback(async () => {
    const confirmed = confirm(t("deck_collection.delete_all_confirm"));

    if (confirmed) {
      setPopoverOpen(false);

      const toastId = toast.show({
        children: t("deck_collection.delete_all_loading"),
        variant: "loading",
      });
      try {
        await deleteAllDecksMutation.mutateAsync();
        toast.dismiss(toastId);
      } catch (err) {
        toast.dismiss(toastId);
        toast.show({
          children: t("deck_collection.delete_all_error", {
            error: (err as Error)?.message,
          }),
          variant: "error",
        });
      }
    }
  }, [deleteAllDecksMutation, toast, t]);

  const onToggleDeck = useCallback((id: DeckId, checked: boolean) => {
    setSelectedDeckIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const onToggleSelectAll = useCallback(() => {
    setSelectedDeckIds((current) =>
      visibleDeckIds.every((id) => current.has(id))
        ? new Set()
        : new Set(visibleDeckIds),
    );
  }, [visibleDeckIds]);

  const onCloseSelection = useCallback(() => {
    setSelecting(false);
    setSelectedDeckIds(new Set());
  }, []);

  const onExportSelected = useCallback(() => {
    const selected = Array.from(selectedDeckIds)
      .map((id) => decks[id])
      .filter((deck) => deck != null)
      .map((deck) => formatDeckShare(deck));

    if (!selected.length) return;

    const date = new Date().toISOString().slice(0, 10);
    const fileName =
      selected.length === 1
        ? `arkhambuild-${selected[0].id}.json`
        : `arkhambuild-decks-${date}.json`;

    download(serializeDeckTransfer(selected), fileName, "application/json");
  }, [decks, selectedDeckIds]);

  const deleteDeck = useDeleteDeck();
  const duplicateDeck = useDuplicateDeck();

  const onNewDeck = useCallback(() => {
    navigate(appPath("/deck/create"));
  }, [navigate]);

  useHotkey("n", onNewDeck);

  return (
    <div className={css["container"]}>
      {ARKHAMDB_WARNING_VISIBLE && hasArkhamDBConnection && (
        <Notice className={css["banner"]} variant="warning">
          {t("deck_collection.arkhamdb_response_time_banner")}
        </Notice>
      )}
      <header className={css["header"]}>
        <h2 className={css["title"]}>{t("deck_collection.title")}</h2>
        <div className={css["actions"]}>
          {selecting ? (
            <div className={css["selection-actions"]}>
              <Button onClick={onToggleSelectAll} size="sm" variant="bare">
                <ListChecksIcon />
                {t("deck_collection.select_all")}
              </Button>
              <Button
                disabled={selectedDeckIds.size === 0}
                onClick={onExportSelected}
                size="sm"
              >
                <DownloadIcon />
                {t("deck_collection.export_selected", {
                  count: selectedDeckIds.size,
                })}
              </Button>
              <Button
                aria-label={t("deck_collection.cancel_selection")}
                onClick={onCloseSelection}
                size="sm"
                variant="bare"
              >
                <XIcon />
              </Button>
            </div>
          ) : (
            <Button onClick={() => setSelecting(true)} size="sm" variant="bare">
              <ListChecksIcon />
              {t("deck_collection.export_select")}
            </Button>
          )}
          {!hasConnections && (
            <Popover>
              <DeckCollectionImport />
            </Popover>
          )}
          <Popover onOpenChange={setPopoverOpen} open={popoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="bare"
                data-testid="collection-more-actions"
                aria-label={t("common.more_actions")}
              >
                <EllipsisIcon />
              </Button>
            </PopoverTrigger>
            <PopoverContent>
              <DropdownMenu>
                <DropdownItem>
                  <FileInput
                    accept="application/json"
                    id="collection-import"
                    multiple
                    onChange={onAddFiles}
                    size="full"
                    variant="bare"
                  >
                    <UploadIcon /> {t("deck_collection.import_json")}
                  </FileInput>
                </DropdownItem>
                <DropdownButton
                  data-testid="collection-delete-all"
                  onClick={onDeleteAll}
                  size="full"
                  variant="bare"
                >
                  <Trash2Icon /> {t("deck_collection.delete_all")}
                </DropdownButton>
              </DropdownMenu>
            </PopoverContent>
          </Popover>
        </div>
      </header>
      <div className={css["cta"]}>
        <Link asChild href={appPath("/deck/create")}>
          <Button as="a" data-testid="collection-create-deck" size="sm">
            <PlusIcon />
            {t("deck.actions.create")}
          </Button>
        </Link>
      </div>

      {deckCollection.total > 1 && (
        <div className={css["filters"]}>
          <DeckCollectionFilters
            filteredCount={deckCollection.deckCount}
            totalCount={deckCollection.total}
          />
        </div>
      )}
      {deckCollection.total ? (
        <Scroller
          className={css["scroller"]}
          padded
          ref={
            setScrollParent as unknown as React.RefObject<HTMLDivElement | null>
          }
          type="hover"
        >
          <Virtuoso
            customScrollParent={scrollParent}
            data={deckCollection.entries}
            overscan={5}
            totalCount={deckCollection.total}
            skipAnimationFrameInResizeObserver
            itemContent={(_, entry) => (
              <div
                key={entry.type === "deck" ? entry.deck.id : entry.folder.id}
                className={css["collection-entry"]}
                style={
                  {
                    "--depth": entry.depth,
                    "--folder-color": entry.folder?.color,
                  } as React.CSSProperties
                }
              >
                {entry.type === "folder" && (
                  <DeckCollectionFolder
                    count={entry.count}
                    expanded={entry.expanded}
                    folder={entry.folder}
                  />
                )}
                {entry.type === "deck" && (
                  <DeckCollectionDeckEntry
                    deck={entry.deck}
                    deleteDeck={deleteDeck}
                    depth={entry.depth}
                    duplicateDeck={duplicateDeck}
                    onSelect={onToggleDeck}
                    selected={selectedDeckIds.has(entry.deck.id)}
                    selecting={selecting}
                  />
                )}
              </div>
            )}
          />
        </Scroller>
      ) : (
        <div className={css["placeholder-container"]}>
          <figure className={css["placeholder"]}>
            <i className="icon-deck" />
            <figcaption className={css["placeholder-caption"]}>
              {t("deck_collection.collection_empty")}
              <nav className={css["placeholder-actions"]}>
                <Link href={appPath("/deck/create")} asChild>
                  <Button variant="bare">
                    <PlusIcon />
                    {t("deck.actions.create")}
                  </Button>
                </Link>
                <Link href="/settings" asChild>
                  <Button variant="bare">
                    <i className="icon-elder_sign" />
                    {t("deck_collection.connect_arkhamdb")}
                  </Button>
                </Link>
              </nav>
            </figcaption>
          </figure>
        </div>
      )}
    </div>
  );
}

function DeckCollectionDeckEntry({
  deck,
  deleteDeck,
  depth,
  duplicateDeck,
  onSelect,
  selected,
  selecting,
}: {
  deck: DeckSummaryType;
  deleteDeck: (id: DeckId) => Promise<void>;
  depth: number;
  duplicateDeck: (id: DeckId) => void;
  onSelect: (id: DeckId, checked: boolean) => void;
  selected: boolean;
  selecting: boolean;
}) {
  const { t } = useTranslation();
  const hasSyncConflict = useStore(
    (state) => state.sync.decks.items[deck.id]?.status === "conflict",
  );

  return (
    <div
      className={`${css["deck"]} ${selecting ? css["deck-selecting"] : ""}`}
      data-testid={`collection-deck-${deck.name}`}
      style={{ "--depth": depth } as React.CSSProperties}
    >
      {selecting && (
        <div className={css["deck-select"]}>
          <Checkbox
            checked={selected}
            hideLabel
            label={t("deck_collection.select_deck", { name: deck.name })}
            onCheckedChange={(checked) => onSelect(deck.id, checked)}
          />
        </div>
      )}
      <DeckSummary
        data-testid="collection-deck"
        deck={deck}
        hasSyncConflict={hasSyncConflict}
        interactive
        showThumbnail
        size="sm"
        validation={deck.problem}
      >
        <DeckSummaryQuickActions
          deck={deck}
          onDeleteDeck={deleteDeck}
          onDuplicateDeck={duplicateDeck}
        />
      </DeckSummary>
    </div>
  );
}
