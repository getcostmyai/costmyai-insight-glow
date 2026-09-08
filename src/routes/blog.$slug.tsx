import { createFileRoute, notFound } from "@tanstack/react-router";

import { BlogArticle } from "@/components/marketing/BlogArticle";
import { postBySlug } from "@/lib/blog/posts";

export const Route = createFileRoute("/blog/$slug")({
  loader: ({ params }) => {
    const post = postBySlug(params.slug);
    if (!post) throw notFound();
    return { post };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Unavailable — CostMyAI" }, { name: "robots", content: "noindex" }] };
    }
    const { post } = loaderData;
    const title = `${post.title} | CostMyAI`;
    const url = `https://www.costmyai.com/blog/${post.slug}`;
    return {
      meta: [
        { title },
        { name: "description", content: post.description },
        { name: "keywords", content: post.keyword },
        { property: "og:title", content: post.title },
        { property: "og:description", content: post.description },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [{
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: post.title,
          description: post.description,
          author: { "@type": "Organization", name: "CostMyAI" },
          publisher: { "@type": "Organization", name: "CostMyAI" },
          datePublished: post.published,
          url,
          mainEntityOfPage: { "@type": "WebPage", "@id": url },
        }),
      }],
    };
  },
  notFoundComponent: PostNotFound,
  component: PostPage,
});

function PostPage() {
  const { post } = Route.useLoaderData();
  return <BlogArticle post={post} />;
}

function PostNotFound() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-32 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">That article does not exist.</h1>
      <p className="mt-5 text-muted-foreground">Everything we have published is on the blog index.</p>
    </section>
  );
}
