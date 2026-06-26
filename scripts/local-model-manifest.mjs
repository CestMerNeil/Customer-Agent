#!/usr/bin/env node
import { localModelProfiles, validateLocalModelProfiles } from "../packages/core/dist/index.js";

const result = validateLocalModelProfiles(localModelProfiles);
if (!result.ok) {
  for (const error of result.errors) {
    console.error(error);
  }
  process.exit(1);
}

console.log(`Local model manifest is valid (${localModelProfiles.length} profiles).`);
