import mongoose from "mongoose";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { jwt } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";
import { config } from "../config/env.js";

export const auth = config.authEnabled ? betterAuth({
  appName: "IP Dokan",
  baseURL: config.authUrl,
  secret: config.betterAuthSecret,
  trustedOrigins: [config.frontendOrigin],
  ...(config.googleClientId && config.googleClientSecret ? {
    socialProviders: {
      google: {
        clientId: config.googleClientId,
        clientSecret: config.googleClientSecret,
      },
    },
  } : {}),
  database: mongodbAdapter(mongoose.connection.getClient().db(config.mongoDatabase), {
    client: mongoose.connection.getClient(),
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
  },
  user: {
    additionalFields: {
      phone: { type: "string", required: false, input: true },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    storeSessionInDatabase: true,
  },
  disabledPaths: ["/token"],
  plugins: [
    jwt({ disableSettingJwtHeader: true }),
    oauthProvider({
      loginPage: `${config.frontendOrigin}/sign-in`,
      consentPage: `${config.frontendOrigin}/consent`,
      resources: [config.apiResource],
      clientRegistrationDefaultResources: [config.apiResource],
      clientRegistrationDefaultScopes: ["openid", "profile", "email", "offline_access"],
      accessTokenExpiresIn: 15 * 60,
      refreshTokenExpiresIn: 60 * 60 * 24 * 30,
    }),
  ],
}) : null;
