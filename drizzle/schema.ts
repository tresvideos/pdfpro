import { boolean, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  country: varchar("country", { length: 64 }),
  phone: varchar("phone", { length: 32 }),
  language: varchar("language", { length: 16 }).default("es"),
  timezone: varchar("timezone", { length: 64 }).default("Europe/Madrid"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  // Own auth fields (email+password and Google OAuth)
  passwordHash: text("passwordHash"),
  googleId: varchar("googleId", { length: 128 }),
  resetToken: varchar("resetToken", { length: 256 }),
  resetTokenExpiry: timestamp("resetTokenExpiry"),
  emailVerified: boolean("emailVerified").default(false).notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Subscriptions table — tracks Paddle (and legacy Stripe) subscriptions per user.
 */
export const subscriptions = mysqlTable("subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  // Legacy Stripe fields (kept for historical data)
  stripeCustomerId: varchar("stripeCustomerId", { length: 128 }),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 128 }),
  stripePriceId: varchar("stripePriceId", { length: 128 }),
  stripeSessionId: varchar("stripeSessionId", { length: 256 }),
  // Paddle fields (legacy)
  paddleCustomerId: varchar("paddleCustomerId", { length: 128 }),
  paddleSubscriptionId: varchar("paddleSubscriptionId", { length: 128 }),
  paddleTransactionId: varchar("paddleTransactionId", { length: 128 }),
  // Mollie fields
  mollieCustomerId: varchar("mollieCustomerId", { length: 128 }),
  molliePaymentId: varchar("molliePaymentId", { length: 128 }),
  mollieSubscriptionId: varchar("mollieSubscriptionId", { length: 128 }),
  mollieMandateId: varchar("mollieMandateId", { length: 128 }),
  plan: mysqlEnum("plan", ["trial", "monthly", "annual"]).default("trial").notNull(),
  status: mysqlEnum("status", ["active", "canceled", "past_due", "trialing", "incomplete"]).default("incomplete").notNull(),
  currentPeriodStart: timestamp("currentPeriodStart"),
  currentPeriodEnd: timestamp("currentPeriodEnd"),
  cancelAtPeriodEnd: boolean("cancelAtPeriodEnd").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;

/**
 * Documents — user PDF documents stored in S3.
 */
export const documents = mysqlTable("documents", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 512 }).notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileSize: int("fileSize").default(0).notNull(),
  folderId: int("folderId"),
  /** Payment status: pending = saved but not yet paid, paid = user has active subscription */
  paymentStatus: mysqlEnum("paymentStatus", ["pending", "paid"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;

/**
 * Folders — document organization for users.
 */
export const folders = mysqlTable("folders", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 256 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Folder = typeof folders.$inferSelect;
export type InsertFolder = typeof folders.$inferInsert;

/**
 * Team invitations — users can invite team members.
 */
export const teamInvitations = mysqlTable("team_invitations", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(),
  inviteeEmail: varchar("inviteeEmail", { length: 320 }).notNull(),
  inviteeId: int("inviteeId"),
  role: mysqlEnum("role", ["editor", "viewer", "admin"]).default("editor").notNull(),
  status: mysqlEnum("status", ["pending", "accepted", "rejected"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TeamInvitation = typeof teamInvitations.$inferSelect;
export type InsertTeamInvitation = typeof teamInvitations.$inferInsert;

/**
 * Legal pages — editable content for Terms, Privacy, Refund, Cookies, etc.
 */
export const legalPages = mysqlTable("legal_pages", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  title: varchar("title", { length: 256 }).notNull(),
  content: text("content").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LegalPage = typeof legalPages.$inferSelect;
export type InsertLegalPage = typeof legalPages.$inferInsert;

/**
 * Contact messages — submitted via the contact form.
 */
export const contactMessages = mysqlTable("contact_messages", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  name: varchar("name", { length: 128 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  reason: varchar("reason", { length: 128 }),
  subject: varchar("subject", { length: 256 }).notNull(),
  message: text("message").notNull(),
  read: boolean("read").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ContactMessage = typeof contactMessages.$inferSelect;
export type InsertContactMessage = typeof contactMessages.$inferInsert;

/**
 * Site settings — key/value store for admin-configurable settings (Stripe keys, etc.)
 */
export const siteSettings = mysqlTable("site_settings", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 128 }).notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SiteSetting = typeof siteSettings.$inferSelect;
export type InsertSiteSetting = typeof siteSettings.$inferInsert;

/**
 * Blog posts — SEO/GEO-optimized articles for the blog section.
 */
export const blogPosts = mysqlTable("blog_posts", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 256 }).notNull().unique(),
  title: varchar("title", { length: 512 }).notNull(),
  excerpt: text("excerpt").notNull(),
  content: text("content").notNull(),
  metaTitle: varchar("metaTitle", { length: 512 }),
  metaDescription: text("metaDescription"),
  category: varchar("category", { length: 128 }).default("guides").notNull(),
  tags: text("tags"),
  readTime: int("readTime").default(5).notNull(),
  published: boolean("published").default(true).notNull(),
  publishedAt: timestamp("publishedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BlogPost = typeof blogPosts.$inferSelect;
export type InsertBlogPost = typeof blogPosts.$inferInsert;
