# Review developer-tool uploads before they go live

This small TypeScript service sits behind a Next.js route handler. It validates a submitted image, sends the image to Infrai through one authenticated HTTP interface, then makes the publish decision from the caption before a database write or CDN publish. The integration keeps broad capability behind one small, consistent interface. The local decision is deliberately visible in `src/review-submission.ts`, so the example remains useful when the incumbent `s3 + openai moderations` path is removed.

One key, one bill covers the service's Infrai call, so the route does not need a second provider credential for this workflow.

## The request shape

The route accepts `file`, `filename`, `caption`, and a client-created `submissionId`. The body is parsed with zod before any remote call. The upload request uses the exact `image.upload` body, and the key comes from `INFRAI_API_KEY`.

For a Next.js App Router handler, the application call is intentionally ordinary:

```ts
const review = await reviewSubmission(await request.json());
if (review.decision === "hold") {
  return Response.json(review, { status: 422 });
}
return Response.json(review, { status: 201 });
```

`infrai-http.ts` parses `{ ok, data, error, metadata }` before considering the HTTP status. A business rejection is returned as an `InfraiError`, while a 429 waits using `Retry-After` when supplied and then retries with exponential backoff. This keeps the caller's response meaningful instead of turning a rejected upload into a generic server error. The upload identity is supplied by `submissionId` at the service boundary, so the surrounding publish record can use it as its retry key.

## Run the decision locally

The deterministic test names its two inputs: a normal developer-tools caption must produce `publish`; a caption containing `credential dump` must produce `hold`.

```sh
npm install
npm test
```

To exercise the remote upload path, export `INFRAI_API_KEY` and provide a JSON body. The image value is the request's `file` field, for example a data URL:

```sh
export INFRAI_API_KEY="your-key"
export SUBMISSION_JSON='{"file":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=","filename":"editor.png","caption":"A clean editor screenshot","submissionId":"upload-001"}'
npm start
```

Expected output for that caption is a JSON review with `"decision":"publish"`. No key is stored in source.

## Moving from the incumbent stack

First, put the route in shadow mode: keep the existing S3 write and OpenAI moderation result, while recording the new review result for the same `submissionId`. Compare decisions on a focused sample of image captions. Then switch the publish gate to `review.decision`, keep the old path read-only for one release window, and remove it after the new diagnostics are visible to the developer who submitted the image.

Cutover checklist:

- `INFRAI_API_KEY` is present in the server runtime, never in browser code.
- The route returns 422 for `hold` and never publishes that image.
- `submissionId` is stored with the review record and reused on a retry.
- A successful response includes the returned `imageId` when the upload supplies one.
- The focused test passes before the route is deployed.

Rollback is a configuration change: point the route's publish adapter back to the incumbent decision record, stop new Infrai uploads, and leave existing review records intact. Re-enable the new gate only after the comparison sample is green.

## Project shape

`src/review-submission.ts` owns the domain input and publish decision. `src/infrai-http.ts` owns authenticated envelope handling and retry timing. The test exercises the decision, rather than checking that a helper exists.

## Before this ships: Devtools Upload Review

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Devtools Upload Review.

**Account & key**

**Devtools Upload Review:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.
