import mongoose from "mongoose";
import { randomBytes } from "node:crypto";
import { config } from "../config/env.js";
import { connectDatabase } from "../config/database.js";

async function seedDemoAdmin() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed a demo admin in production.");
  if (!config.authEnabled) throw new Error("Enable auth with AUTH_ENABLED=true before creating the demo admin.");
  if (!config.demoAdminEnabled) throw new Error("Set DEMO_ADMIN_ENABLED=true and provide the demo email and password in .env.");

  await connectDatabase();
  const existing = await mongoose.connection.collection("user").findOne({ email: config.demoAdminEmail });
  if (existing) {
    console.log(`Demo admin account already exists: ${config.demoAdminEmail}`);
    console.log("Use the password from DEMO_ADMIN_PASSWORD if the account was created with it.");
    return;
  }

  const generatedPassword = config.demoAdminPassword || randomBytes(18).toString("base64url");
  const { auth } = await import("../lib/auth.js");
  const result = await auth.api.signUpEmail({
    body: {
      name: config.demoAdminName,
      email: config.demoAdminEmail,
      password: generatedPassword,
    },
  });
  if (!result?.user) throw new Error("Better Auth did not return a new user.");
  console.log(`Demo admin created: ${config.demoAdminEmail}`);
  if (!config.demoAdminPassword) console.log(`Generated demo admin password (save it now): ${generatedPassword}`);
  else console.log("Sign in with the password set in DEMO_ADMIN_PASSWORD, then open /admin.");
}

seedDemoAdmin()
  .catch((error) => {
    console.error("Could not create demo admin:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
