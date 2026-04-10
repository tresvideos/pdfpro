const BRANDS: Record<string, { name: string; domain: string }> = {
  CloudPDF: { name: "CloudPDF", domain: "cloud-pdf.net" },
  EditorPDF: { name: "EditorPDF", domain: "" },
};

const key = process.env.BRAND_NAME || "EditorPDF";
const brand = BRANDS[key] ?? BRANDS.EditorPDF;

export const brandName = brand.name;
export const brandDomain = brand.domain;
