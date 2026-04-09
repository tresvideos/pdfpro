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

const COLORS_EDITOR: BrandColors = {
  primary: "#E8590C",
  secondary: "#C2410C",
  primaryHover: "#C2410C",
  gradient: "linear-gradient(135deg, #E8590C, #C2410C)",
  light: "#EA580C",
  lightBg: "rgba(232, 89, 12, 0.08)",
};

const BRANDS: Record<string, { name: string; domain: string; logoParts: [string, string]; brandKey: string; colors: BrandColors }> = {
  CloudPDF: { name: "CloudPDF", domain: "cloud-pdf.net", logoParts: ["Cloud", "PDF"], brandKey: "CloudPDF", colors: COLORS_CLOUD },
  EditorPDF: { name: "EditorPDF", domain: "editorpdf.net", logoParts: ["Editor", "PDF"], brandKey: "EditorPDF", colors: COLORS_EDITOR },
};

const key = import.meta.env.VITE_BRAND_NAME || "EditorPDF";
const brand = BRANDS[key] ?? BRANDS.EditorPDF;

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
