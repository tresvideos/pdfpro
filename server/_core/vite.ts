import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";
import { brandName, brandDomain } from "../brand";

const FAVICON_CLOUDPDF = `<link rel="icon" type="image/x-icon" href="/favicon.ico" />
    <link rel="icon" type="image/png" sizes="192x192" href="/favicon-192.png" />
    <link rel="icon" type="image/png" sizes="256x256" href="/favicon-256.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />`;

const faviconLinks = FAVICON_CLOUDPDF;

const trackingScripts = "";

const pageTitle = `Free Online PDF Editor – Edit, Sign & Convert PDF | ${brandName}`;
const pageDescription = "Edit PDF files online for free. Add text, signatures, images and annotations. Convert PDF to Word, JPG, Excel. No installation needed. Works on any device.";
const pageKeywords = "edit PDF online, free PDF editor, PDF to Word, sign PDF online, convert PDF, merge PDF, compress PDF";

function replaceBrandPlaceholders(html: string): string {
  let result = html
    .replaceAll("%%BRAND_NAME%%", brandName)
    .replaceAll("%%BRAND_DOMAIN%%", brandDomain)
    .replaceAll("%%FAVICON_LINKS%%", faviconLinks)
    .replaceAll("%%TRACKING_SCRIPTS%%", trackingScripts)
    .replaceAll("%%PAGE_TITLE%%", pageTitle)
    .replaceAll("%%PAGE_DESCRIPTION%%", pageDescription)
    .replaceAll("%%PAGE_KEYWORDS%%", pageKeywords);
  // Safety net: remove any remaining %%PLACEHOLDER%% that we missed
  result = result.replace(/%%[A-Z_]+%%/g, "");
  return result;
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(replaceBrandPlaceholders(page));
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  const indexPath = path.resolve(distPath, "index.html");
  // Cache the processed index.html so we don't read+replace on every request
  let processedIndex: string | null = null;
  function getProcessedIndex(): string {
    if (!processedIndex) {
      const raw = fs.readFileSync(indexPath, "utf-8");
      processedIndex = replaceBrandPlaceholders(raw);
    }
    return processedIndex;
  }

  // Serve static assets but SKIP index.html (we process it with brand placeholders)
  app.use(express.static(distPath, { index: false }));

  // All routes → processed index.html (SPA fallback)
  app.use("*", (_req, res) => {
    res.status(200).set({ "Content-Type": "text/html" }).end(getProcessedIndex());
  });
}
