const BRANDS: Record<string, { name: string; domain: string }> = {
  CloudPDF: { name: "CloudPDF", domain: "cloud-pdf.net" },
};

const key = process.env.BRAND_NAME || "CloudPDF";
const brand = BRANDS[key] ?? BRANDS.CloudPDF;

export const brandName = brand.name;
export const brandDomain = brand.domain;
