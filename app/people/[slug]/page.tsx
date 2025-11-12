import type { Metadata } from "next";

import { PEOPLE_DEFINITIONS, type PersonDefinition, findPerson, findPersonById } from "@/config/people";
import { LayoutDetail } from "@/components/detail";

const resolvePerson = (slug: string): PersonDefinition | undefined =>
  findPersonById(slug) ?? findPerson(slug);

const formatLabelFromSlug = (value: string): string =>
  value
    .split(/[-_]/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export function generateStaticParams(): Array<{ slug: string }> {
  return PEOPLE_DEFINITIONS.map((person) => ({ slug: person.id }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const person = resolvePerson(params.slug);
  const label = person?.preferredName ?? formatLabelFromSlug(params.slug);

  return {
    title: `${label} — The Rest Is History`,
    description: person?.description ?? `We’re building a dedicated page for ${label}.`
  };
}

interface PersonPageProps {
  params: { slug: string };
}

export default function PersonPage({ params }: PersonPageProps): JSX.Element {
  const person = resolvePerson(params.slug);
  const label = person?.preferredName ?? formatLabelFromSlug(params.slug);
  const slug = person?.id ?? params.slug;
  const description = person?.description ?? "Destination page coming soon.";

  return (
    <LayoutDetail
      title={label}
      subtitle={description}
      breadcrumbs={[
        { label: "Timeline", href: "/" },
        { label, href: `/people/${slug}` }
      ]}
    >
      <p>
        We’re filling in a story-driven page for <strong>{label}</strong>. Check back soon for biography highlights,
        connected episodes, and recurring series callouts.
      </p>
      {person?.notes ? <p>{person.notes}</p> : null}
      {!person ? (
        <p>
          This person hasn’t been added to the canonical registry yet, so the name is coming directly from the episode
          data.
        </p>
      ) : null}
    </LayoutDetail>
  );
}
