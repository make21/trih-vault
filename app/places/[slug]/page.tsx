import type { Metadata } from "next";

import { PLACE_DEFINITIONS, type PlaceDefinition, findPlace, findPlaceById } from "@/config/places";
import { LayoutDetail } from "@/components/detail";

const resolvePlace = (slug: string): PlaceDefinition | undefined =>
  findPlaceById(slug) ?? findPlace(slug);

const formatLabelFromSlug = (value: string): string =>
  value
    .split(/[-_]/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export function generateStaticParams(): Array<{ slug: string }> {
  return PLACE_DEFINITIONS.map((place) => ({ slug: place.id }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const place = resolvePlace(params.slug);
  const label = place?.preferredName ?? formatLabelFromSlug(params.slug);

  return {
    title: `${label} — The Rest Is History`,
    description: place?.description ?? `We’re building a destination page for ${label}.`
  };
}

interface PlacePageProps {
  params: { slug: string };
}

export default function PlacePage({ params }: PlacePageProps): JSX.Element {
  const place = resolvePlace(params.slug);
  const label = place?.preferredName ?? formatLabelFromSlug(params.slug);
  const slug = place?.id ?? params.slug;
  const description = place?.description ?? "Destination page coming soon.";

  return (
    <LayoutDetail
      title={label}
      subtitle={description}
      breadcrumbs={[
        { label: "Timeline", href: "/" },
        { label, href: `/places/${slug}` }
      ]}
    >
      <p>
        We’re preparing a full page for <strong>{label}</strong> with featured episodes and historical context. Sit
        tight—we’ll light it up soon.
      </p>
      {place?.notes ? <p>{place.notes}</p> : null}
      {!place ? (
        <p>
          This place hasn’t been added to the canonical registry yet, so the name is coming directly from the episode
          data.
        </p>
      ) : null}
    </LayoutDetail>
  );
}
