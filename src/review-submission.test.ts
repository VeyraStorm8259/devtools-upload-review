import assert from "node:assert/strict";
import { decideCaption, submissionSchema } from "./review-submission.ts";

const accepted = submissionSchema.parse({
  file: "data:image/png;base64,AAAA",
  filename: "terminal.png",
  caption: "A clean screenshot of the Next.js route handler",
  submissionId: "upload-001"
});
assert.equal(decideCaption(accepted.caption), "publish");
assert.equal(decideCaption("A credential dump from a shell"), "hold");
console.log("review decision test passed");
