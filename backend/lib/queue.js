// BullMQ queues in Redis. The API only adds jobs; backend/worker.js runs them.
//   "email"  one job per email (OTP codes), retried with back-off if Gmail refuses
//   "tasks"  scheduled jobs: expire unpaid orders, fetch supplier proxies, sync supplier plans
// Without Redis, emails are sent straight away and the scheduled jobs run inside the API (server.js).
import { Queue } from "bullmq";
import { createQueueConnection, redisEnabled } from "./redis.js";
import { otpEmail, sendMail } from "./mailer.js";

export const EMAIL_QUEUE = "email";
export const TASK_QUEUE = "tasks";

let emailQueue = null;
function getEmailQueue() {
  emailQueue ??= new Queue(EMAIL_QUEUE, {
    connection: createQueueConnection(),
    defaultJobOptions: { attempts: 4, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: 1000, removeOnFail: 5000 },
  });
  return emailQueue;
}

export async function queueOtpEmail({ email, otp, type }) {
  const message = otpEmail({ email, otp, type });
  if (!redisEnabled) return sendMail(message);
  // The job holds the code, so it is deleted once sent (failed ones after an hour; the code expires in 5 minutes anyway).
  await getEmailQueue().add("otp", message, { removeOnComplete: true, removeOnFail: { age: 3600 } });
}
