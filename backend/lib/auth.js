import mongoose from "mongoose";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { emailOTP, jwt } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";
import { config } from "../config/env.js";
import { authStorage } from "./redis.js";
import { queueOtpEmail } from "./queue.js";

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
  // Redis: sessions (MongoDB keeps a copy, so nobody is signed out if Redis restarts), OTP codes and
  // rate limits, shared by every API process.
  ...(authStorage ? { secondaryStorage: authStorage } : {}),
  rateLimit: {
    enabled: process.env.NODE_ENV === "production",
    storage: authStorage ? "secondary-storage" : "memory",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 5 },
      "/email-otp/send-verification-otp": { window: 60, max: 3 },
      "/email-otp/verify-email": { window: 60, max: 10 },
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    // With email configured, a new email account must enter the 6-digit code before it can sign in.
    requireEmailVerification: config.mailEnabled,
  },
  ...(config.mailEnabled ? {
    emailVerification: { sendOnSignUp: true, sendOnSignIn: true, autoSignInAfterVerification: true },
  } : {}),
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
    // Sign-up OTP: a 6-digit code, stored hashed in Redis for 5 minutes, 5 tries, emailed by the worker.
    ...(config.mailEnabled ? [emailOTP({
      overrideDefaultEmailVerification: true,
      otpLength: 6,
      expiresIn: 300,
      allowedAttempts: 5,
      storeOTP: "hashed",
      sendVerificationOTP: (data) => queueOtpEmail(data),
    })] : []),
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
