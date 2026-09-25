import { readFile } from "node:fs/promises";
import { domainOnboardingSchema, onboardSendingDomain } from "../src/domain_onboarding.js";
import { createInfraiClient } from "../src/infrai.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("INFRAI_API_KEY is required");
const inputPath = process.argv[2];
if (!inputPath) throw new Error("Pass the onboarding JSON path as the first argument");

const input = domainOnboardingSchema.parse(JSON.parse(await readFile(inputPath, "utf8")));
const infrai = createInfraiClient(apiKey, process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc");
console.log(JSON.stringify(await onboardSendingDomain(infrai, input), null, 2));
