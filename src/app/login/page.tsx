import { submitPasscode } from "./actions";

export default async function LoginPage(props: {
  searchParams: Promise<{ from?: string; error?: string }>;
}) {
  const { from, error } = await props.searchParams;

  return (
    <div className="max-w-sm mx-auto mt-24 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Applied AI Prep</h1>
        <p className="text-sm text-zinc-500">Enter passcode to continue.</p>
      </div>

      <form action={submitPasscode} className="space-y-4">
        <input type="hidden" name="from" value={from ?? "/topics"} />
        <input
          type="password"
          name="passcode"
          autoComplete="current-password"
          autoFocus
          required
          className="w-full px-3 py-2 border border-zinc-300 rounded-md bg-white text-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
          placeholder="passcode"
        />
        {error && (
          <p className="text-xs text-red-600">Incorrect passcode. Try again.</p>
        )}
        <button
          type="submit"
          className="w-full px-3 py-2 rounded-md bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800"
        >
          Continue
        </button>
      </form>
    </div>
  );
}
