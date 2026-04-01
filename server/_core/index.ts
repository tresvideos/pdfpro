import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { Paddle, EventName } from "@paddle/paddle-node-sdk";
import multer from "multer";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerGoogleOAuthRoutes } from "./googleOauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { getUserById, upsertSubscription, getBlogPosts, createDocument, userHasActiveSubscription, markDocumentsPaid } from "../db";
import { storagePut, storageGet } from "../storage";
import { sdk } from "./sdk";
import { convertToPdf, isConvertibleType, ACCEPTED_EXTENSIONS } from "../convertToPdf";
import { sendPaymentConfirmationEmail, sendCancellationEmail } from "../email";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // ── Paddle Webhook (MUST be before express.json) ───────────────────────────────────────────
  const paddle = new Paddle(process.env.PADDLE_API_KEY || "");

  app.post("/api/paddle/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const signature = (req.headers["paddle-signature"] as string) || "";
    const rawBody = req.body.toString();
    const secretKey = process.env.PADDLE_WEBHOOK_NOTIFICATION_ID || "";

    let eventData: any;
    try {
      if (signature && rawBody) {
        eventData = paddle.webhooks.unmarshal(rawBody, secretKey, signature);
      } else {
        console.log("[Paddle Webhook] Missing signature or body");
        res.status(400).json({ error: "Missing signature" });
        return;
      }
    } catch (err) {
      console.error("[Paddle Webhook] Signature verification failed:", err);
      res.status(400).json({ error: "Signature verification failed" });
      return;
    }

    console.log(`[Paddle Webhook] Event: ${eventData.eventType} | ID: ${eventData.eventId}`);

    try {
      const data = eventData.data;
      // Extract userId from custom_data (set during checkout)
      const customData = data.customData || data.custom_data || {};
      const userId = parseInt(customData.userId || customData.user_id || "0");

      if (eventData.eventType === EventName.SubscriptionCreated ||
          eventData.eventType === EventName.SubscriptionActivated ||
          eventData.eventType === EventName.SubscriptionTrialing) {
        if (userId) {
          const billingPeriod = data.currentBillingPeriod || data.current_billing_period;
          const periodStart = billingPeriod?.startsAt || billingPeriod?.starts_at;
          const periodEnd = billingPeriod?.endsAt || billingPeriod?.ends_at;
          const status = data.status === "trialing" ? "trialing" : "active";

          await upsertSubscription({
            userId,
            paddleCustomerId: data.customerId || data.customer_id || undefined,
            paddleSubscriptionId: data.id || undefined,
            paddleTransactionId: data.transactionId || data.transaction_id || undefined,
            plan: data.status === "trialing" ? "trial" : "monthly",
            status,
            currentPeriodStart: periodStart ? new Date(periodStart) : new Date(),
            currentPeriodEnd: periodEnd ? new Date(periodEnd) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            cancelAtPeriodEnd: false,
          });

          // Mark pending documents as paid
          await markDocumentsPaid(userId);

          // Send confirmation email (non-blocking)
          const user = await getUserById(userId);
          if (user?.email && periodEnd) {
            sendPaymentConfirmationEmail({
              to: user.email,
              name: user.name || "Usuario",
              trialEndDate: new Date(periodEnd),
              cancelUrl: "https://cloud-pdf.net/cancelar-suscripcion",
            }).catch((err: unknown) => console.error("[Email] Confirmation email failed:", err));
          }

          console.log(`[Paddle Webhook] Subscription ${status} for user ${userId}, Paddle Sub: ${data.id}`);
        }
      } else if (eventData.eventType === EventName.SubscriptionUpdated) {
        if (userId) {
          const billingPeriod = data.currentBillingPeriod || data.current_billing_period;
          const periodStart = billingPeriod?.startsAt || billingPeriod?.starts_at;
          const periodEnd = billingPeriod?.endsAt || billingPeriod?.ends_at;
          const scheduledChange = data.scheduledChange || data.scheduled_change;
          const cancelAtEnd = scheduledChange?.action === "cancel";

          await upsertSubscription({
            userId,
            paddleCustomerId: data.customerId || data.customer_id || undefined,
            paddleSubscriptionId: data.id || undefined,
            plan: data.status === "trialing" ? "trial" : "monthly",
            status: data.status as "active" | "canceled" | "past_due" | "trialing" | "incomplete",
            currentPeriodStart: periodStart ? new Date(periodStart) : undefined,
            currentPeriodEnd: periodEnd ? new Date(periodEnd) : undefined,
            cancelAtPeriodEnd: cancelAtEnd,
          });
          console.log(`[Paddle Webhook] Subscription updated for user ${userId}, status: ${data.status}`);
        }
      } else if (eventData.eventType === EventName.SubscriptionCanceled) {
        if (userId) {
          await upsertSubscription({
            userId,
            paddleCustomerId: data.customerId || data.customer_id || undefined,
            paddleSubscriptionId: data.id || undefined,
            plan: "monthly",
            status: "canceled",
            currentPeriodStart: undefined,
            currentPeriodEnd: undefined,
            cancelAtPeriodEnd: false,
          });

          // Send cancellation email (non-blocking)
          const user = await getUserById(userId);
          if (user?.email) {
            sendCancellationEmail({
              to: user.email,
              name: user.name || "Usuario",
              accessUntilDate: new Date(),
              reactivateUrl: "https://cloud-pdf.net/es/dashboard?tab=billing",
            }).catch((err: unknown) => console.error("[Email] Cancellation email failed:", err));
          }

          console.log(`[Paddle Webhook] Subscription canceled for user ${userId}`);
        }
      } else if (eventData.eventType === EventName.SubscriptionPastDue) {
        if (userId) {
          await upsertSubscription({
            userId,
            paddleCustomerId: data.customerId || data.customer_id || undefined,
            paddleSubscriptionId: data.id || undefined,
            plan: "monthly",
            status: "past_due",
            cancelAtPeriodEnd: false,
          });
          console.log(`[Paddle Webhook] Subscription past_due for user ${userId}`);
        }
      }
    } catch (err) {
      console.error("[Paddle Webhook] Error processing event:", err);
    }

    res.json({ received: true });
  });

  // Legacy Stripe webhook — keep for backwards compatibility during migration
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), (_req, res) => {
    console.log("[Stripe Webhook] Legacy endpoint hit — Stripe is no longer active");
    res.json({ received: true });
  });

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // ── HTTPS Redirect (production only) ──────────────────────────────────────────
  if (process.env.NODE_ENV === "production") {
    app.use((req, res, next) => {
      if (req.headers["x-forwarded-proto"] === "http") {
        return res.redirect(301, `https://${req.headers.host}${req.url}`);
      }
      next();
    });
  }

  // ── Domain Redirect: pdfup.io → cloud-pdf.net ─────────────────────────────
  // 301 redirect preserving path and query params (for SEO and Google Ads gclid)
  app.use((req, res, next) => {
    const host = (req.headers.host || "").toLowerCase().replace(/:\d+$/, "");
    const xForwardedHost = (req.headers["x-forwarded-host"] || "").toString().toLowerCase();
    console.log(`[Redirect Debug] host=${host} x-forwarded-host=${xForwardedHost} url=${req.originalUrl}`);
    if (host === "pdfup.io" || host === "www.pdfup.io" || xForwardedHost === "pdfup.io" || xForwardedHost === "www.pdfup.io") {
      const target = `https://cloud-pdf.net${req.originalUrl}`;
      console.log(`[Redirect] Redirecting to ${target}`);
      return res.redirect(301, target);
    }
    next();
  });

  // ── Security Headers ─────────────────────────────────────────────────────────
  // Comprehensive security headers to pass Sucuri/Google Ads security scans
  app.use((_req, res, next) => {
    // Prevent clickjacking (both legacy header and CSP frame-ancestors)
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    // Prevent MIME type sniffing
    res.setHeader("X-Content-Type-Options", "nosniff");
    // Enable XSS protection
    res.setHeader("X-XSS-Protection", "1; mode=block");
    // Referrer policy
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    // Permissions policy — disable unnecessary browser features
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(self)");
    // Strict Transport Security (HSTS) — force HTTPS for 1 year
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    // Content Security Policy — comprehensive with frame-ancestors
    res.setHeader("Content-Security-Policy", [
      "default-src 'self'",
      "script-src 'self' 'sha256-k8uGMGTuFJwr6QatJlm0mvafWGxfD6d/sfOnYhlPHRc=' 'sha256-gKuu88qDHbph/6RMqDpEXR89DuZ1cDwPWXuwX3aIfd8=' https://www.googletagmanager.com https://cdn.paddle.com https://*.google-analytics.com https://*.googleadservices.com https://*.googlesyndication.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://d2xsxph8kpxj0f.cloudfront.net https://pub-9115567915bb439c891a63ec2454650a.r2.dev https://www.google-analytics.com https://www.googletagmanager.com https://*.googleadservices.com https://*.googlesyndication.com https://cdn.paddle.com https://lh3.googleusercontent.com",
      "connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://www.googletagmanager.com https://*.googleadservices.com https://api.paddle.com https://*.paddle.com https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com https://d2xsxph8kpxj0f.cloudfront.net https://pub-9115567915bb439c891a63ec2454650a.r2.dev",
      "frame-src 'self' https://cdn.paddle.com https://*.paddle.com https://accounts.google.com",
      "frame-ancestors 'self'",
      "media-src 'self' blob:",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https://accounts.google.com https://*.paddle.com",
    ].join("; "));
    next();
  });
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Google OAuth direct routes: /api/auth/google and /api/auth/google/callback
  registerGoogleOAuthRoutes(app);

  // Sitemap.xml — dynamic, includes blog posts
  app.get("/sitemap.xml", async (_req, res) => {
    try {
      const posts = await getBlogPosts(true);
      const base = "https://cloud-pdf.net";
      const staticUrls: Array<{ loc: string; priority: string; changefreq: string; lastmod?: string }> = [
        { loc: `${base}/es`, priority: "1.0", changefreq: "weekly" },
        { loc: `${base}/en`, priority: "1.0", changefreq: "weekly" },
        { loc: `${base}/es/pricing`, priority: "0.8", changefreq: "monthly" },
        { loc: `${base}/es/blog`, priority: "0.9", changefreq: "weekly" },
        { loc: `${base}/en/blog`, priority: "0.9", changefreq: "weekly" },
        { loc: `${base}/es/tools`, priority: "0.7", changefreq: "monthly" },
      ];
      const blogUrls = (posts as Array<{slug: string; updatedAt: Date}>).flatMap((p) => [
        { loc: `${base}/es/blog/${p.slug}`, priority: "0.8", changefreq: "monthly", lastmod: new Date(p.updatedAt).toISOString().split("T")[0] },
        { loc: `${base}/en/blog/${p.slug}`, priority: "0.8", changefreq: "monthly", lastmod: new Date(p.updatedAt).toISOString().split("T")[0] },
      ]);
      const allUrls = [...staticUrls, ...blogUrls];
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>${u.lastmod ? `
    <lastmod>${u.lastmod}</lastmod>` : ""}
  </url>`).join("\n")}
</urlset>`;
      res.header("Content-Type", "application/xml");
      res.send(xml);
    } catch {
      res.status(500).send("Error generating sitemap");
    }
  });

  // ── REST endpoint for TEMP PDF upload (pre-login, no auth required) ─────────────
  // Stores the edited PDF in S3 under a temp key. The key is returned and stored
  // in sessionStorage (small string, no quota issues). After login + payment,
  // the server moves it to the user's permanent folder.
  const tempUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
  app.post("/api/documents/temp-upload", tempUpload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) { res.status(400).json({ error: "No file" }); return; }
      const name = (req.body.name as string) || file.originalname || "document.pdf";
      // Store under temp/ with a random key — expires conceptually after 24h
      const randomId = Math.random().toString(36).slice(2) + Date.now().toString(36);
      const key = `temp/${randomId}-${name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { url } = await storagePut(key, file.buffer, "application/pdf");
      res.json({ success: true, tempKey: key, tempUrl: url, name });
    } catch (err) {
      console.error("[TempUpload] Error:", err);
      res.status(500).json({ error: "Temp upload failed" });
    }
  });

  // ── REST endpoint for claiming a temp PDF after login + payment ────────────────
  // Moves the temp PDF to the user's permanent folder and creates a DB record.
  app.post("/api/documents/claim-temp", async (req, res) => {
    try {
      let userId: number;
      try {
        const user = await sdk.authenticateRequest(req as any);
        userId = user.id;
      } catch {
        res.status(401).json({ error: "Unauthorized" }); return;
      }
      const { tempKey, name } = req.body as { tempKey: string; name: string };
      if (!tempKey || !name) { res.status(400).json({ error: "Missing tempKey or name" }); return; }
      // Validate tempKey is under temp/ to prevent path traversal
      if (!tempKey.startsWith("temp/")) { res.status(400).json({ error: "Invalid tempKey" }); return; }
      // Re-download from S3 via the temp URL and re-upload under user's folder
      const { url: signedUrl } = await storageGet(tempKey);
      const fileResp = await fetch(signedUrl);
      if (!fileResp.ok) { res.status(404).json({ error: "Temp file not found" }); return; }
      const buffer = Buffer.from(await fileResp.arrayBuffer());
      const permanentKey = `docs/${userId}/${Date.now()}-${name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { url: permanentUrl } = await storagePut(permanentKey, buffer, "application/pdf");
      const paymentStatus = (req.body.paymentStatus === "paid") ? "paid" as const : "pending" as const;
      const doc = await createDocument({
        userId,
        name,
        fileKey: permanentKey,
        fileUrl: permanentUrl,
        fileSize: buffer.length,
        paymentStatus,
      });
      res.json({ success: true, doc });
    } catch (err) {
      console.error("[ClaimTemp] Error:", err);
      res.status(500).json({ error: "Claim failed" });
    }
  });

  // ── REST endpoint for file conversion + upload (any supported type → PDF) ──────
  const convertUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
  app.post("/api/documents/convert-upload", convertUpload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) { res.status(400).json({ error: "No file" }); return; }
      const mimeType = file.mimetype || "application/octet-stream";
      // Also detect type from extension if mimetype is generic
      const ext = (file.originalname || "").split(".").pop()?.toLowerCase() ?? "";
      const extMimeMap: Record<string, string> = {
        doc: "application/msword",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        xls: "application/vnd.ms-excel",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ppt: "application/vnd.ms-powerpoint",
        pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
        gif: "image/gif", webp: "image/webp", bmp: "image/bmp", tiff: "image/tiff",
        html: "text/html", txt: "text/plain",
      };
      const resolvedMime = (mimeType === "application/octet-stream" && extMimeMap[ext]) ? extMimeMap[ext] : mimeType;
      if (!isConvertibleType(resolvedMime)) {
        res.status(415).json({ error: `Unsupported file type: ${resolvedMime}` }); return;
      }
      const { pdfBuffer } = await convertToPdf(file.buffer, resolvedMime, file.originalname);
      // Return the PDF as binary blob — more efficient than base64 JSON (avoids 33% overhead + atob memory issues on mobile)
      const originalName = file.originalname.replace(/\.[^.]+$/, ".pdf");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${originalName}"`);
      res.setHeader("X-Converted-Name", encodeURIComponent(originalName));
      res.send(pdfBuffer);
    } catch (err) {
      console.error("[ConvertUpload] Error:", err);
      res.status(500).json({ error: `Conversion failed: ${(err as Error).message}` });
    }
  });

  // ── REST endpoint for PDF upload (avoids tRPC base64 size limits) ─────────────
  const pdfUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
  app.post("/api/documents/upload", pdfUpload.single("file"), async (req, res) => {
    try {
      // Authenticate via session cookie using the same SDK as tRPC
      let userId: number;
      try {
        const user = await sdk.authenticateRequest(req as any);
        userId = user.id;
      } catch {
        res.status(401).json({ error: "Unauthorized" }); return;
      }
      const file = req.file;
      if (!file) { res.status(400).json({ error: "No file" }); return; }
      const name = (req.body.name as string) || file.originalname || "document.pdf";
      const folderId = req.body.folderId ? parseInt(req.body.folderId) : undefined;
      const key = `docs/${userId}/${Date.now()}-${name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { url } = await storagePut(key, file.buffer, "application/pdf");
      const paymentStatus = (req.body.paymentStatus === "paid") ? "paid" as const : "pending" as const;
      const doc = await createDocument({
        userId,
        name,
        fileKey: key,
        fileUrl: url,
        fileSize: file.size,
        folderId,
        paymentStatus,
      });
      res.json({ success: true, doc });
    } catch (err) {
      console.error("[Upload] Error:", err);
      res.status(500).json({ error: "Upload failed" });
    }
  });

  // ── REST endpoint for auto-saving document on first download click ────────────
  // This saves the document to the user's panel with paymentStatus=pending
  // Called when authenticated user clicks download and doc is not yet saved
  app.post("/api/documents/auto-save", pdfUpload.single("file"), async (req, res) => {
    try {
      let userId: number;
      try {
        const user = await sdk.authenticateRequest(req as any);
        userId = user.id;
      } catch {
        res.status(401).json({ error: "Unauthorized" }); return;
      }
      const file = req.file;
      if (!file) { res.status(400).json({ error: "No file" }); return; }
      const name = (req.body.name as string) || file.originalname || "document.pdf";
      const key = `docs/${userId}/${Date.now()}-${name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { url } = await storagePut(key, file.buffer, "application/pdf");
      // Check if user has active subscription
      const isPremium = await userHasActiveSubscription(userId);
      const doc = await createDocument({
        userId,
        name,
        fileKey: key,
        fileUrl: url,
        fileSize: file.size,
        paymentStatus: isPremium ? "paid" : "pending",
      });
      res.json({ success: true, doc, isPremium });
    } catch (err) {
      console.error("[AutoSave] Error:", err);
      res.status(500).json({ error: "Auto-save failed" });
    }
  });

  // ── REST endpoint for proxying R2 file downloads (avoids CORS) ──────────────
  app.get("/api/documents/proxy", async (req, res) => {
    try {
      const fileUrl = req.query.url as string;
      if (!fileUrl) { res.status(400).json({ error: "Missing url parameter" }); return; }
      // Only allow proxying from our R2 bucket domain for security
      const allowedDomains = [
        "pub-9115567915bb439c891a63ec2454650a.r2.dev",
      ];
      const parsedUrl = new URL(fileUrl);
      if (!allowedDomains.some(d => parsedUrl.hostname === d)) {
        res.status(403).json({ error: "Domain not allowed" }); return;
      }
      const response = await fetch(fileUrl);
      if (!response.ok) { res.status(response.status).json({ error: "Failed to fetch file" }); return; }
      const contentType = response.headers.get("content-type") || "application/octet-stream";
      const contentLength = response.headers.get("content-length");
      res.setHeader("Content-Type", contentType);
      if (contentLength) res.setHeader("Content-Length", contentLength);
      const buffer = Buffer.from(await response.arrayBuffer());
      res.send(buffer);
    } catch (err) {
      console.error("[Proxy] Error:", err);
      res.status(500).json({ error: "Proxy failed" });
    }
  });

  // ── REST endpoint for PDF password protection (uses pikepdf via Python) ────────
  const protectUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
  app.post("/api/documents/protect", protectUpload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) { res.status(400).json({ error: "No file" }); return; }
      const password = req.body.password as string;
      const algo = (req.body.algo as string) || "256-AES";
      if (!password) { res.status(400).json({ error: "Password required" }); return; }

      // Map algorithm to pikepdf R value:
      // R=4 → 128-bit AES, R=6 → 256-bit AES, R=3 → 128-bit RC4 (ARC-FOUR)
      let R: number;
      if (algo === "128-AES") R = 4;
      else if (algo === "256-AES") R = 6;
      else R = 3; // 128-ARC4

      const { execFile } = await import("child_process");
      const { promisify } = await import("util");
      const { tmpdir } = await import("os");
      const { join } = await import("path");
      const { writeFile, readFile, unlink } = await import("fs/promises");
      const execFileAsync = promisify(execFile);

      const tmpIn = join(tmpdir(), `protect_in_${Date.now()}.pdf`);
      const tmpOut = join(tmpdir(), `protect_out_${Date.now()}.pdf`);
      const tmpPy = join(tmpdir(), `protect_${Date.now()}.py`);

      await writeFile(tmpIn, file.buffer);
      await writeFile(tmpPy, [
        "import pikepdf, sys",
        "pdf = pikepdf.open(sys.argv[1])",
        "pdf.save(sys.argv[2], encryption=pikepdf.Encryption(owner=sys.argv[3] + '_owner', user=sys.argv[3], R=int(sys.argv[4])))",
        "pdf.close()",
      ].join("\n"));

      // Build a clean environment without PYTHONHOME/PYTHONPATH so that
      // the system python3 (/usr/bin/python3.11) uses its own site-packages
      // where pikepdf is installed (not the build agent's Python 3.13 venv).
      const cleanEnv = { ...process.env };
      delete cleanEnv.PYTHONHOME;
      delete cleanEnv.PYTHONPATH;
      delete cleanEnv.NUITKA_PYTHONPATH;
      try {
        await execFileAsync("python3", [tmpPy, tmpIn, tmpOut, password, String(R)], { timeout: 30000, env: cleanEnv });
        const protectedBytes = await readFile(tmpOut);
        const originalName = (req.body.filename as string) || file.originalname || "document.pdf";
        const protectedName = originalName.replace(/\.pdf$/i, "") + "_protected.pdf";
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${protectedName}"`);
        res.send(protectedBytes);
      } finally {
        unlink(tmpIn).catch(() => {});
        unlink(tmpOut).catch(() => {});
        unlink(tmpPy).catch(() => {});
      }
    } catch (err) {
      console.error("[Protect] Error:", err);
      res.status(500).json({ error: "Failed to protect PDF" });
    }
  });

  // ── REST endpoint for PDF export (PDF → Word/Excel/PPT) ─────────────────────────
  const exportUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
  app.post("/api/documents/export", exportUpload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) { res.status(400).json({ error: "No file" }); return; }
      const format = (req.body.format as string) || "docx";
      if (!["docx", "xlsx", "pptx"].includes(format)) {
        res.status(400).json({ error: "Unsupported format" }); return;
      }
      const { execFile } = await import("child_process");
      const { promisify } = await import("util");
      const { tmpdir } = await import("os");
      const { join } = await import("path");
      const { writeFile, readFile, unlink } = await import("fs/promises");
      const execFileAsync = promisify(execFile);
      const ts = Date.now();
      const tmpIn = join(tmpdir(), `export_in_${ts}.pdf`);
      const tmpOut = join(tmpdir(), `export_out_${ts}.${format}`);
      const tmpPy = join(tmpdir(), `export_${ts}.py`);
      await writeFile(tmpIn, file.buffer);
      let pyLines: string[];
      if (format === "docx") {
        pyLines = [
          "from pdf2docx import Converter",
          "import sys",
          "cv = Converter(sys.argv[1])",
          "cv.convert(sys.argv[2], start=0, end=None)",
          "cv.close()",
        ];
      } else if (format === "xlsx") {
        pyLines = [
          "import fitz, openpyxl, sys",
          "doc = fitz.open(sys.argv[1])",
          "wb = openpyxl.Workbook()",
          "ws = wb.active",
          "for page_num in range(len(doc)):",
          "    page = doc[page_num]",
          "    tabs = page.find_tables()",
          "    found = False",
          "    for tab in tabs:",
          "        found = True",
          "        for row in tab.extract():",
          "            ws.append([cell if cell else '' for cell in row])",
          "    if not found:",
          "        text = page.get_text()",
          "        for line in text.split('\\n'):",
          "            if line.strip():",
          "                ws.append([line.strip()])",
          "wb.save(sys.argv[2])",
        ];
      } else {
        // pptx via LibreOffice WASM converter
        try {
          const { createWorkerConverter } = await import("@matbee/libreoffice-converter/server");
          const converter = await createWorkerConverter();
          const result = await converter.convert(file.buffer, { outputFormat: "pptx" });
          await converter.destroy();
          const originalName = (req.body.filename as string) || file.originalname || "document.pdf";
          const baseName = originalName.replace(/\.pdf$/i, "");
          res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
          res.setHeader("Content-Disposition", `attachment; filename="${baseName}.pptx"`);
          res.send(Buffer.from(result.data));
          return;
        } catch (wasmErr) {
          console.error("[Export] WASM PPTX conversion failed:", wasmErr);
          res.status(500).json({ error: "PPTX export not available" });
          return;
        }
      }
      await writeFile(tmpPy, pyLines.join("\n"));
      const cleanEnv = { ...process.env };
      delete cleanEnv.PYTHONHOME;
      delete cleanEnv.PYTHONPATH;
      delete cleanEnv.NUITKA_PYTHONPATH;
      try {
        await execFileAsync("python3", [tmpPy, tmpIn, tmpOut], { timeout: 120000, env: cleanEnv });
        const outputBytes = await readFile(tmpOut);
        const originalName2 = (req.body.filename as string) || file.originalname || "document.pdf";
        const baseName = originalName2.replace(/\.pdf$/i, "");
        const mimeTypes: Record<string, string> = {
          docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        };
        res.setHeader("Content-Type", mimeTypes[format]);
        res.setHeader("Content-Disposition", `attachment; filename="${baseName}.${format}"`);
        res.send(outputBytes);
      } finally {
        unlink(tmpIn).catch(() => {});
        unlink(tmpOut).catch(() => {});
        unlink(tmpPy).catch(() => {});
      }
    } catch (err) {
      console.error("[Export] Error:", err);
      res.status(500).json({ error: "Failed to export PDF" });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${port}/`);
  });
}

startServer().catch(console.error);
