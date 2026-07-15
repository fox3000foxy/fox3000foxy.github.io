const SITE_URL = "https://fox3000foxy.com";
const SITE_NAME = "Fox's Blog";
const AUTHOR_NAME = "Fox3000foxy";
const AUTHOR_URL = "https://github.com/fox3000foxy";

const LOCALE_MAP: Record<string, string> = {
  en: "en_US", fr: "fr_FR", de: "de_DE", es: "es_ES", pt: "pt_BR",
  it: "it_IT", ru: "ru_RU", ja: "ja_JP", ko: "ko_KR", zh: "zh_CN",
  ar: "ar_SA", hi: "hi_IN", id: "id_ID", th: "th_TH", tr: "tr_TR", vi: "vi_VN",
};

export function ogLocale(lang: string): string {
  return LOCALE_MAP[lang] || "en_US";
}

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export function breadcrumbJsonLd(items: BreadcrumbItem[]): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.url}`,
    })),
  });
}

export function webSiteJsonLd(): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    description: "Fox3000foxy's blog about web development, automation, and open-source",
    author: {
      "@type": "Person",
      name: AUTHOR_NAME,
      url: AUTHOR_URL,
    },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/blog?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  });
}

export function personJsonLd(): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Person",
    name: AUTHOR_NAME,
    url: AUTHOR_URL,
    image: "https://github.com/fox3000foxy.png",
    sameAs: [
      "https://github.com/fox3000foxy",
    ],
    jobTitle: "Web Developer",
    worksFor: {
      "@type": "Organization",
      name: "Independent",
    },
  });
}

export function siteNavigationJsonLd(): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SiteNavigationElement",
    name: "Main Navigation",
    url: SITE_URL,
    hasPart: [
      { "@type": "SiteNavigationElement", name: "Blog", url: `${SITE_URL}/blog` },
      { "@type": "SiteNavigationElement", name: "Projects", url: `${SITE_URL}/projects` },
      { "@type": "SiteNavigationElement", name: "Tags", url: `${SITE_URL}/tags` },
      { "@type": "SiteNavigationElement", name: "Archive", url: `${SITE_URL}/archive` },
      { "@type": "SiteNavigationElement", name: "Portfolio", url: `${SITE_URL}/legacy` },
      { "@type": "SiteNavigationElement", name: "Contact", url: `${SITE_URL}/contact` },
      { "@type": "SiteNavigationElement", name: "Uses", url: `${SITE_URL}/uses` },
    ],
  });
}

export interface ArticleSchemaOpts {
  slug: string;
  title: string;
  description: string;
  datePublished: string;
  dateModified?: string;
  authors?: string[];
  tags?: string[];
  image?: string;
  inLanguage?: string;
  wordCount?: number;
}

export function articleJsonLd(opts: ArticleSchemaOpts): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: opts.title,
    description: opts.description,
    datePublished: opts.datePublished,
    dateModified: opts.dateModified || opts.datePublished,
    author: (opts.authors || [AUTHOR_NAME]).map((a) => ({
      "@type": "Person",
      name: a,
      url: `https://github.com/${a}`,
    })),
    publisher: {
      "@type": "Person",
      name: AUTHOR_NAME,
      url: AUTHOR_URL,
      image: "https://github.com/fox3000foxy.png",
    },
    url: `${SITE_URL}/blog/${opts.slug}`,
    image: opts.image || undefined,
    inLanguage: opts.inLanguage || "en",
    isAccessibleForFree: true,
    wordCount: opts.wordCount || undefined,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${SITE_URL}/blog/${opts.slug}`,
    },
  });
}

export function collectionPageJsonLd(description: string): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: SITE_NAME,
    url: SITE_URL,
    description,
    isPartOf: {
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_URL,
    },
  });
}
