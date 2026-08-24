export type DeleteClickEvent = {
  preventDefault: () => void;
  stopPropagation: () => void;
};

export function preventPvpMatchDeleteNavigation(event: DeleteClickEvent) {
  // 此按鈕位於詳情 Link 的同層，但仍主動阻止事件，以免未來結構調整造成點刪除後導覽。
  event.preventDefault();
  event.stopPropagation();
}

export function handlePvpMatchDeleteClick(
  event: DeleteClickEvent,
  id: number,
  confirmDelete: () => boolean,
  mutate: (input: { id: number }) => void,
) {
  preventPvpMatchDeleteNavigation(event);
  if (confirmDelete()) mutate({ id });
}

export async function refreshAfterPvpMatchDelete({
  invalidateList,
  invalidateDashboard,
  notifySuccess,
}: {
  invalidateList: () => Promise<unknown>;
  invalidateDashboard: () => Promise<unknown>;
  notifySuccess: () => void;
}) {
  await invalidateList();
  await invalidateDashboard();
  notifySuccess();
}
