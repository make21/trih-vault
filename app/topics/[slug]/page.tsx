import type { Metadata } from "next";

import {
  TOPIC_DEFINITIONS,
  type TopicDefinition,
  findTopic,
  findTopicBySlug
} from "@/config/topics";
import { LayoutDetail } from "@/components/detail";

const resolveTopic = (slug: string): TopicDefinition | undefined =>
  TOPIC_DEFINITIONS.find((topic) => topic.slug === slug) ?? findTopicBySlug(slug) ?? findTopic(slug);

const formatLabelFromSlug = (value: string): string =>
  value
    .split(/[-_]/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export function generateStaticParams(): Array<{ slug: string }> {
  return TOPIC_DEFINITIONS.map((topic) => ({ slug: topic.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const topic = resolveTopic(params.slug);
  const label = topic?.label ?? formatLabelFromSlug(params.slug);

  return {
    title: `${label} — The Rest Is History`,
    description: topic?.description ?? `We’re building a destination page for ${label}.`
  };
}

interface TopicPageProps {
  params: { slug: string };
}

export default function TopicPage({ params }: TopicPageProps): JSX.Element {
  const topic = resolveTopic(params.slug);
  const label = topic?.label ?? formatLabelFromSlug(params.slug);
  const slug = topic?.slug ?? params.slug;
  const description = topic?.description ?? "Destination page coming soon.";

  return (
    <LayoutDetail
      title={label}
      subtitle={description}
      breadcrumbs={[
        { label: "Timeline", href: "/" },
        { label, href: `/topics/${slug}` }
      ]}
    >
      <p>
        We’re stitching together a full topic page for <strong>{label}</strong>. Expect curated background, linked
        episodes, and connected people/places in an upcoming release.
      </p>
      {topic?.notes ? <p>{topic.notes}</p> : null}
      {!topic ? (
        <p>
          This topic hasn’t been curated in the registry yet, so the label and slug come from the original episode
          proposal.
        </p>
      ) : null}
    </LayoutDetail>
  );
}
