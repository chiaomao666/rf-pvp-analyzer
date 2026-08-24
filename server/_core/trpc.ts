import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import * as db from "../db";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

const ANONYMOUS_DEVICE_HEADER = "x-rf-pvp-device";
const ANONYMOUS_DEVICE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * PVP 資料可免登入使用，但每個瀏覽器有獨立 UUID。若已有 Manus 工作階段，
 * 一律沿用帳戶原始資料範圍，避免匿名識別取得既有私有紀錄。
 */
export const pvpOwnerProcedure = t.procedure.use(async ({ ctx, next }) => {
  const header = ctx.req.headers[ANONYMOUS_DEVICE_HEADER];
  const deviceId = Array.isArray(header) ? header[0] : header;

  const owner = ctx.user ?? (
    typeof deviceId === "string" && ANONYMOUS_DEVICE_ID_PATTERN.test(deviceId)
      ? await db.getOrCreateAnonymousDeviceUser(deviceId)
      : null
  );

  if (!owner) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "無法建立本機資料範圍，請重新整理後再試。",
    });
  }

  return next({ ctx: { ...ctx, pvpOwner: owner } });
});

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
