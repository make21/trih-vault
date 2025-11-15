"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { slugify } from "@/lib/slug/slugify";

type ProposalItem = {
  label: string;
  id?: string;
  notes?: string | null;
};

type ProposalGroup = {
  type: "person" | "place" | "topic";
  items: ProposalItem[];
};

type EpisodeProposal = {
  itemId: string;
  title: string;
  stage: string;
  when: string;
  proposals: ProposalGroup[];
};

type RegistryEntry = {
  id: string;
  preferredName: string;
};

type ProposalsResponse = {
  proposals: EpisodeProposal[];
  registries: {
    people: RegistryEntry[];
    places: RegistryEntry[];
    topics: RegistryEntry[];
  };
};

type ActionPayload = Parameters<typeof fetch>[1] & {
  body: string;
};

type ReviewClientProps = {
  token: string;
};

export default function ReviewClient({ token }: ReviewClientProps) {
  const [data, setData] = useState<ProposalsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const authHeaders = useMemo(() => ({ "x-review-token": token }), [token]);

  const loadData = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/review/proposals", {
        headers: authHeaders,
      });
      if (!res.ok) throw new Error("Failed to load proposals");
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAction = useCallback(
    async (payload: ActionPayload["body"]) => {
      try {
        setPending(true);
        setError(null);
        const res = await fetch("/api/review/action", {
          method: "POST",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: payload,
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          throw new Error(json.error ?? "Action failed");
        }
        await loadData();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setPending(false);
      }
    },
    [authHeaders, loadData],
  );

  if (!data && pending) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <p>Loading proposals…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Review proposals</h1>
        <p className="text-sm text-neutral-500">
          Local-only moderation console. Accept, reject, or map proposals without
          editing JSON by hand.
        </p>
        {error ? (
          <p className="text-sm text-red-600">Error: {error}</p>
        ) : null}
        <button
          onClick={loadData}
          disabled={pending}
          className="inline-flex w-fit items-center rounded border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50 disabled:opacity-50"
        >
          Refresh
        </button>
      </header>

      {data && data.proposals.length === 0 ? (
        <p>No pending proposals. 🎉</p>
      ) : null}

      {data?.proposals.map((episode) => (
        <section
          key={episode.itemId}
          className="rounded border border-neutral-200 p-4 shadow-sm"
        >
          <div className="mb-4 space-y-1">
            <h2 className="text-lg font-medium">{episode.title}</h2>
            <p className="text-xs text-neutral-500">
              Item ID: {episode.itemId} · Stage: {episode.stage} · {episode.when}
            </p>
          </div>
          <div className="space-y-4">
            {episode.proposals.map((group) => (
              <ProposalGroupView
                key={`${episode.itemId}-${group.type}`}
                episode={episode}
                group={group}
                registries={data.registries}
                onAction={handleAction}
                disabled={pending}
              />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}

type ProposalGroupViewProps = {
  episode: EpisodeProposal;
  group: ProposalGroup;
  registries: ProposalsResponse["registries"];
  onAction: (payload: string) => Promise<void>;
  disabled: boolean;
};

function ProposalGroupView({
  episode,
  group,
  registries,
  onAction,
  disabled,
}: ProposalGroupViewProps) {
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
        {group.type}s
      </h3>
      <div className="mt-2 space-y-3">
        {group.items.map((item) => (
          <ProposalRow
            key={`${episode.itemId}-${group.type}-${item.label}`}
            episode={episode}
            entityType={group.type}
            proposal={item}
            registries={registries}
            onAction={onAction}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}

type ProposalRowProps = {
  episode: EpisodeProposal;
  entityType: "person" | "place" | "topic";
  proposal: ProposalItem;
  registries: ProposalsResponse["registries"];
  onAction: (payload: string) => Promise<void>;
  disabled: boolean;
};

type Mode = "idle" | "accept" | "reject" | "map";

type AcceptFormState = {
  id: string;
  preferredName: string;
  aliases: string;
  type: string;
  label?: string;
  slug?: string;
  description?: string;
  reason?: string;
  targetId?: string;
};

function ProposalRow({
  episode,
  entityType,
  proposal,
  registries,
  onAction,
  disabled,
}: ProposalRowProps) {
  const [mode, setMode] = useState<Mode>("idle");
  const [form, setForm] = useState<AcceptFormState>(() =>
    initialForm(entityType, proposal),
  );

  useEffect(() => {
    setForm(initialForm(entityType, proposal));
  }, [entityType, proposal]);

  const registryOptions = useMemo(() => {
    if (entityType === "person") return registries.people;
    if (entityType === "place") return registries.places;
    return registries.topics;
  }, [entityType, registries]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "accept") {
      await onAction(
        JSON.stringify({
          action: "accept",
          entityType,
          proposal,
          data: normalizeAcceptData(entityType, form),
        }),
      );
    } else if (mode === "reject") {
      await onAction(
        JSON.stringify({
          action: "reject",
          entityType,
          proposal,
          data: { reason: form.reason ?? "" },
        }),
      );
    } else if (mode === "map") {
      await onAction(
        JSON.stringify({
          action: "map",
          entityType,
          proposal,
          data: { targetId: form.targetId },
        }),
      );
    }
    setMode("idle");
  };

  const showForm = mode !== "idle";

  return (
    <div className="rounded border border-neutral-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{proposal.label}</p>
          {proposal.notes ? (
            <p className="text-xs text-neutral-500">{proposal.notes}</p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <button
            className="rounded border border-green-600 px-2 py-1 text-sm text-green-700 hover:bg-green-50"
            onClick={() => setMode(mode === "accept" ? "idle" : "accept")}
            disabled={disabled}
          >
            Accept
          </button>
          <button
            className="rounded border border-blue-600 px-2 py-1 text-sm text-blue-700 hover:bg-blue-50"
            onClick={() => setMode(mode === "map" ? "idle" : "map")}
            disabled={disabled}
          >
            Map
          </button>
          <button
            className="rounded border border-red-600 px-2 py-1 text-sm text-red-700 hover:bg-red-50"
            onClick={() => setMode(mode === "reject" ? "idle" : "reject")}
            disabled={disabled}
          >
            Reject
          </button>
        </div>
      </div>

      {showForm ? (
        <form className="mt-3 space-y-2 text-sm" onSubmit={handleSubmit}>
          {mode === "accept" ? (
            <AcceptFields
              entityType={entityType}
              form={form}
              setForm={setForm}
            />
          ) : null}
          {mode === "reject" ? (
            <label className="block">
              <span className="text-xs uppercase text-neutral-500">
                Reason (optional)
              </span>
              <input
                type="text"
                value={form.reason ?? ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, reason: e.target.value }))
                }
                className="mt-1 w-full rounded border border-neutral-300 px-2 py-1"
              />
            </label>
          ) : null}
          {mode === "map" ? (
            <label className="block">
              <span className="text-xs uppercase text-neutral-500">
                Map to existing
              </span>
              <select
                value={form.targetId ?? ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, targetId: e.target.value }))
                }
                className="mt-1 w-full rounded border border-neutral-300 px-2 py-1"
                required
              >
                <option value="">Select target…</option>
                {registryOptions.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.preferredName} ({entry.id})
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded bg-neutral-900 px-3 py-1 text-white"
              disabled={disabled}
            >
              {mode === "accept"
                ? "Save"
                : mode === "map"
                ? "Map"
                : "Reject"}
            </button>
            <button
              type="button"
              className="rounded border border-neutral-300 px-3 py-1"
              onClick={() => setMode("idle")}
              disabled={disabled}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function initialForm(
  entityType: "person" | "place" | "topic",
  proposal: ProposalItem,
): AcceptFormState {
  const baseId = proposal.id ?? slugify(proposal.label);
  if (entityType === "topic") {
    return {
      id: baseId,
      preferredName: proposal.label,
      label: proposal.label,
      slug: baseId,
      type: "theme",
      description: proposal.notes ?? "",
      aliases: "",
    };
  }
  return {
    id: baseId,
    preferredName: proposal.label,
    aliases: "",
    type: entityType === "person" ? "person:historical" : "place",
  };
}

type AcceptFieldsProps = {
  entityType: "person" | "place" | "topic";
  form: AcceptFormState;
  setForm: React.Dispatch<React.SetStateAction<AcceptFormState>>;
};

function AcceptFields({ entityType, form, setForm }: AcceptFieldsProps) {
  const update = (key: string, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <>
      <label className="block">
        <span className="text-xs uppercase text-neutral-500">ID</span>
        <input
          type="text"
          value={form.id ?? ""}
          onChange={(e) => update("id", e.target.value)}
          className="mt-1 w-full rounded border border-neutral-300 px-2 py-1"
          required
        />
      </label>
      <label className="block">
        <span className="text-xs uppercase text-neutral-500">
          Preferred name
        </span>
        <input
          type="text"
          value={form.preferredName ?? ""}
          onChange={(e) => update("preferredName", e.target.value)}
          className="mt-1 w-full rounded border border-neutral-300 px-2 py-1"
          required
        />
      </label>
      {entityType === "topic" ? (
        <>
          <label className="block">
            <span className="text-xs uppercase text-neutral-500">Label</span>
            <input
              type="text"
              value={form.label ?? ""}
              onChange={(e) => update("label", e.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 px-2 py-1"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase text-neutral-500">Slug</span>
            <input
              type="text"
              value={form.slug ?? ""}
              onChange={(e) => update("slug", e.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 px-2 py-1"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase text-neutral-500">Type</span>
            <input
              type="text"
              value={form.type ?? ""}
              onChange={(e) => update("type", e.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 px-2 py-1"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase text-neutral-500">
              Description
            </span>
            <textarea
              value={form.description ?? ""}
              onChange={(e) => update("description", e.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 px-2 py-1"
              rows={2}
            />
          </label>
        </>
      ) : (
        <label className="block">
          <span className="text-xs uppercase text-neutral-500">Type</span>
          <input
            type="text"
            value={form.type ?? ""}
            onChange={(e) => update("type", e.target.value)}
            className="mt-1 w-full rounded border border-neutral-300 px-2 py-1"
          />
        </label>
      )}
      <label className="block">
        <span className="text-xs uppercase text-neutral-500">Aliases</span>
        <input
          type="text"
          value={form.aliases ?? ""}
          onChange={(e) => update("aliases", e.target.value)}
          className="mt-1 w-full rounded border border-neutral-300 px-2 py-1"
          placeholder="Comma separated"
        />
      </label>
    </>
  );
}

function normalizeAcceptData(
  entityType: "person" | "place" | "topic",
  form: AcceptFormState,
) {
  const aliases =
    form.aliases
      ?.split(",")
      .map((alias) => alias.trim())
      .filter(Boolean) ?? [];

  if (entityType === "topic") {
    return {
      id: form.id,
      preferredName: form.preferredName,
      label: form.label,
      slug: form.slug,
      type: form.type,
      description: form.description,
      aliases,
    };
  }

  return {
    id: form.id,
    preferredName: form.preferredName,
    type: form.type,
    aliases,
  };
}
