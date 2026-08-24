import { describe, expect, it, vi } from "vitest";
import { handlePvpMatchDeleteClick, preventPvpMatchDeleteNavigation, refreshAfterPvpMatchDelete } from "./pvpMatchDeletion";

describe("PVP 歷史列表直接刪除", () => {
  it("開啟頁內確認對話前會阻止列項導覽事件", () => {
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() };

    preventPvpMatchDeleteNavigation(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
  });

  it("垃圾桶點擊會阻止導覽事件，確認後才呼叫刪除 mutation", () => {
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    const mutate = vi.fn();

    handlePvpMatchDeleteClick(event, 91, () => true, mutate);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(mutate).toHaveBeenCalledWith({ id: 91 });
  });

  it("使用者取消確認時仍阻止導覽，但不送出刪除要求", () => {
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    const mutate = vi.fn();

    handlePvpMatchDeleteClick(event, 91, () => false, mutate);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("刪除成功後依序刷新戰績清單與儀表板，最後顯示成功訊息", async () => {
    const callOrder: string[] = [];
    await refreshAfterPvpMatchDelete({
      invalidateList: async () => { callOrder.push("list"); },
      invalidateDashboard: async () => { callOrder.push("dashboard"); },
      notifySuccess: () => { callOrder.push("toast"); },
    });

    expect(callOrder).toEqual(["list", "dashboard", "toast"]);
  });
});
