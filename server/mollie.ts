import createMollieClient from "@mollie/api-client";

export function getMollie() {
  return createMollieClient({ apiKey: process.env.MOLLIE_API_KEY! });
}
