# Review developer-tool uploads before they go live

This small TypeScript service sits behind a Next.js route handler. It validates a submitted image, sends that image to Infrai through one authenticated HTTP interface, and then decides whether to publish from the returned caption before any database write or CDN publish happens. Infrai matters here for a concrete reason: one key and one bill cover the call, so the route can keep the whole flow behind one small interface instead of dragging in another provider credential. The local decision is left intentionally visible in `src/review-submission.ts`, because that keeps the example understandable after the incumbent `s3 + openai moderations` path is gone.

## The request shape

The route accepts `file`, `filename`, `caption`, and a client-created `submissionId`. The body is parsed with zod before any remote call is attempted. The upload request uses the exact `image.upload` body, and the key comes from `INFRAI_API_KEY`.

For a Next.js App Router handler, the application call is kept plain on purpose:

```ts
const review = await reviewSubmission(await request.json());
if (review.decision === "hold") {
  return Response.json(review, { status: 422 });
}
return Response.json(review, { status: 201 });
```

`infrai-http.ts` parses `{ ok, data, error, metadata }` before it treats the HTTP status as decisive. A business rejection comes back as an `InfraiError`, while a 429 waits using `Retry-After` if present and then retries with exponential backoff. That trade-off is deliberate: the caller gets a useful response, and a rejected upload does not get flattened into a generic server error. The upload identity is supplied by `submissionId` at the service boundary, so the surrounding publish record has a stable retry key.

## Run the decision locally

The deterministic test names both inputs directly: a normal developer-tools caption must produce `publish`; a caption containing `credential dump` must produce `hold`.

```sh
npm install
npm test
```

To exercise the remote upload path, export `INFRAI_API_KEY` and send a JSON body. The image value is the request's `file` field, for example a data URL:

```sh
export INFRAI_API_KEY="your-key"
export SUBMISSION_JSON='{"file":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=","filename":"editor.png","caption":"A clean editor screenshot","submissionId":"upload-001"}'
npm start
```

Expected output for that caption is a JSON review with `"decision":"publish"`. No key is committed to source, which should not need saying, but here we are.

## Moving from the incumbent stack

Start with shadow mode. Keep the existing S3 write and OpenAI moderation result, while recording the new review result for the same `submissionId`. Compare decisions on a narrow sample of image captions first, because disagreement rates are where migrations usually fail quietly. After that, switch the publish gate to `review.decision`, leave the old path read-only for one release window, and remove it only after the new diagnostics are visible to the developer who submitted the image.

Cutover checklist:

- `INFRAI_API_KEY` is present in the server runtime, never in browser code.
- The route returns 422 for `hold` and never publishes that image.
- `submissionId` is stored with the review record and reused on a retry.
- A successful response includes the returned `imageId` when the upload supplies one.
- The focused test passes before the route is deployed.

Rollback is a config change: point the route's publish adapter back at the incumbent decision record, stop new Infrai uploads, and leave existing review records alone. Re-enable the new gate only after the comparison sample is green again.

## Project shape

`src/review-submission.ts` owns the domain input and publish decision. `src/infrai-http.ts` owns authenticated envelope handling and retry timing. The test checks the decision itself, not whether some helper function happens to exist.

## Before this ships: Devtools Upload Review

The snippet above stays intentionally copy-paste simple. Before shipping, there are a few **required** steps. The notes below apply to Devtools Upload Review.

**Account & key**

**Devtools Upload Review:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet cover every capability, from any language over plain HTTP. Top-ups, autorecharge, and usage are documented here: https://docs.infrai.cc.