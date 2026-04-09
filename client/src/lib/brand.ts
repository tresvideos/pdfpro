interface BrandColors {
  primary: string;
  secondary: string;
  primaryHover: string;
  gradient: string;
  light: string;
  lightBg: string;
}

const COLORS_CLOUD: BrandColors = {
  primary: "oklch(0.47 0.24 264)",
  secondary: "oklch(0.42 0.26 290)",
  primaryHover: "oklch(0.41 0.24 264)",
  gradient: "linear-gradient(135deg, oklch(0.47 0.24 264), oklch(0.42 0.26 290))",
  light: "oklch(0.55 0.22 260)",
  lightBg: "oklch(0.55 0.22 260 / 0.08)",
};

const BRANDS: Record<string, { name: string; domain: string; logoParts: [string, string]; brandKey: string; colors: BrandColors }> = {
  CloudPDF: { name: "CloudPDF", domain: "cloud-pdf.net", logoParts: ["Cloud", "PDF"], brandKey: "CloudPDF", colors: COLORS_CLOUD },
  editorPDF: { name: "editorPDF", domain: "editorpdf.net", logoParts: ["editor", "PDF"], brandKey: "editorPDF", colors: COLORS_CLOUD },
};

const key = import.meta.env.VITE_BRAND_NAME || "CloudPDF";
const brand = BRANDS[key] ?? BRANDS.CloudPDF;

export const brandName = brand.name;
export const brandDomain = brand.domain;
export const logoParts = brand.logoParts;
export const brandKey = brand.brandKey;
export const colors = brand.colors;
export const isFastDoc = false;

// Set data-brand attribute on <html> so CSS can target it
if (typeof document !== "undefined") {
  document.documentElement.setAttribute("data-brand", brand.brandKey);
}
