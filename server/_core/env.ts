export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  mollieApiKey: process.env.MOLLIE_API_KEY ?? "",
  mollieProfileId: process.env.MOLLIE_PROFILE_ID ?? "",
  mollieRedirectBase: process.env.MOLLIE_REDIRECT_BASE ?? "https://cloud-pdf.net",
  // Cloudflare R2 storage
  r2AccountId: process.env.CF_R2_ACCOUNT_ID ?? process.env.R2_ACCOUNT_ID ?? "",
  r2AccessKeyId: process.env.CF_R2_ACCESS_KEY_ID ?? process.env.R2_ACCESS_KEY_ID ?? "",
  r2SecretAccessKey: process.env.CF_R2_SECRET_ACCESS_KEY ?? process.env.R2_SECRET_ACCESS_KEY ?? "",
  r2BucketName: process.env.CF_R2_BUCKET_NAME ?? process.env.R2_BUCKET_NAME ?? "",
  r2PublicUrl: process.env.CF_R2_PUBLIC_URL ?? process.env.R2_PUBLIC_URL ?? "",
};
