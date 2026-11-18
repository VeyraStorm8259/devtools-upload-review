import { z } from "zod";
import { infraiRequest } from "./infrai-http.ts";

// The domain call represented here is infrai.image.upload.

export const submissionSchema = z.object({
  file: z.string().min(1),
  filename: z.string().min(1),
  caption: z.string().min(1).max(240),
  submissionId: z.string().min(1)
});

export type Submission = z.infer<typeof submissionSchema>;
export type Review = { decision: "publish" | "hold"; reason: string; imageId?: string };

const blockedCaptionWords = ["exploit", "credential dump", "malware"];

export function decideCaption(caption: string): Review["decision"] {
  const normalized = caption.toLowerCase();
  return blockedCaptionWords.some((word) => normalized.includes(word)) ? "hold" : "publish";
}

export async function reviewSubmission(input: unknown): Promise<Review> {
  const submission = submissionSchema.parse(input);
  const image = await infraiRequest<{ id?: string }>("/v1/image/upload", {
    file: submission.file,
    filename: submission.filename,
    idempotency_key: submission.submissionId
  });
  const decision = decideCaption(submission.caption);
  return {
    decision,
    reason: decision === "publish" ? "caption accepted" : "caption needs review",
    imageId: image.id
  };
}

if (process.argv[1]?.endsWith("review-submission.ts")) {
  const input = process.env.SUBMISSION_JSON;
  if (!input) {
    console.error("Set SUBMISSION_JSON to a JSON submission before running this script.");
    process.exit(1);
  }
  reviewSubmission(JSON.parse(input))
    .then((review) => console.log(JSON.stringify(review)))
    .catch((error: Error) => { console.error(error.message); process.exit(1); });
}
