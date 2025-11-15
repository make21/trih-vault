import ReviewClient from "./ReviewClient";

export default function ReviewPage() {
  const token = process.env.REVIEW_TOKEN;

  if (!token) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold">Review tooling disabled</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Set <code>REVIEW_TOKEN</code> in your environment to enable the local-only
          review console.
        </p>
      </main>
    );
  }

  return <ReviewClient token={token} />;
}
