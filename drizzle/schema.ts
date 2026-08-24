import {
  bigint,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export type TeamMember = {
  name: string;
  level?: number;
  power?: number;
  role?: string;
  rarity?: string;
  raw?: Record<string, unknown>;
};

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const pvpMode = mysqlEnum("pvpMode", ["1v1", "3v3"]);
export const pvpOutcome = mysqlEnum("pvpOutcome", ["win", "loss", "draw", "unknown"]);
export const pvpRecordSource = mysqlEnum("pvpRecordSource", ["manual", "import"]);

export const pvpImportBatches = mysqlTable(
  "pvpImportBatches",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 120 }).notNull(),
    receivedAt: bigint("receivedAt", { mode: "number" }).notNull(),
    recognizedCount: int("recognizedCount").notNull().default(0),
    rejectedCount: int("rejectedCount").notNull().default(0),
    warnings: json("warnings").$type<string[]>().notNull(),
    rawPayload: json("rawPayload").$type<unknown>().notNull(),
  },
  table => [index("pvpImportBatches_user_received_idx").on(table.userId, table.receivedAt)],
);

export const pvpMatches = mysqlTable(
  "pvpMatches",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    importBatchId: varchar("importBatchId", { length: 64 }).references(() => pvpImportBatches.id, {
      onDelete: "set null",
    }),
    battleAt: bigint("battleAt", { mode: "number" }).notNull(),
    mode: pvpMode.notNull(),
    outcome: pvpOutcome.notNull().default("unknown"),
    playerTeam: json("playerTeam").$type<TeamMember[]>().notNull(),
    opponentTeam: json("opponentTeam").$type<TeamMember[]>().notNull(),
    opponentName: varchar("opponentName", { length: 120 }),
    rankBefore: int("rankBefore"),
    rankAfter: int("rankAfter"),
    notes: text("notes"),
    source: pvpRecordSource.notNull().default("manual"),
    rawPayload: json("rawPayload").$type<unknown>(),
    unrecognizedFields: json("unrecognizedFields").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("pvpMatches_user_battle_idx").on(table.userId, table.battleAt),
    index("pvpMatches_user_mode_idx").on(table.userId, table.mode),
    index("pvpMatches_import_idx").on(table.importBatchId),
  ],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type PvpMatch = typeof pvpMatches.$inferSelect;
export type InsertPvpMatch = typeof pvpMatches.$inferInsert;
export type PvpImportBatch = typeof pvpImportBatches.$inferSelect;
