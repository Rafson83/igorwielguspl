export interface PostFrontmatter {
  title: string;
  description: string;
  date: string;
  category: 'moje-prace' | 'motoryzacja' | 'warsztat' | 'hobby';
  tags: string[];
  readingTime: string;
  featured?: boolean;
  seoTitle?: string;
  seoDescription?: string;
  focusKeyword?: string;
  canonicalUrl?: string;
  ogImage?: string;
  robots?: string;
}

export interface BlogPost {
  slug: string;
  frontmatter: PostFrontmatter;
  Content: any;
}

export function getAllPosts(): BlogPost[] {
  const modules = import.meta.glob('../content/blog/*.{md,mdx}', { eager: true }) as Record<string, any>;

  const posts: BlogPost[] = Object.entries(modules).map(([filepath, mod]) => {
    const filename = filepath.split('/').pop() || '';
    const slug = filename.replace(/\.(md|mdx)$/, '');
    return {
      slug,
      frontmatter: mod.frontmatter as PostFrontmatter,
      Content: mod.default,
    };
  });

  return posts.sort(
    (a, b) => new Date(b.frontmatter.date).getTime() - new Date(a.frontmatter.date).getTime()
  );
}
