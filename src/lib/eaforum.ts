// Fetches posts from EA Forum GraphQL API
// Only includes posts where the user is the primary author (not co-author)
// Excludes events

export interface EAForumPost {
  title: string;
  slug: string;
  date: Date;
  url: string;
  postId: string;
  isEvent: boolean;
  source: 'eaforum';
}

interface GraphQLPost {
  _id: string;
  title: string;
  slug: string;
  postedAt: string;
  isEvent: boolean;
}

const USER_ID = 'bhod9XuEeXYvaRF8w'; // andy-masley's EA Forum user ID
const GRAPHQL_ENDPOINT = 'https://forum-bots.effectivealtruism.org/graphql';

export async function fetchEAForumPosts(): Promise<EAForumPost[]> {
  // Inline the user ID directly in the query (simpler, avoids variable issues)
  const query = `{
    posts(input: {
      terms: {
        userId: "${USER_ID}",
        view: "userPosts",
        limit: 50
      }
    }) {
      results {
        _id
        title
        slug
        postedAt
        isEvent
      }
    }
  }`;

  try {
    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query })
    });

    if (!response.ok) {
      console.error(`EA Forum API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const posts: GraphQLPost[] = data?.data?.posts?.results || [];

    // Filter out events and return posts
    return posts
      .filter(post => !post.isEvent)
      .map(post => ({
        title: post.title,
        slug: post.slug,
        date: new Date(post.postedAt),
        url: `https://forum.effectivealtruism.org/posts/${post._id}/${post.slug}`,
        postId: post._id,
        isEvent: post.isEvent,
        source: 'eaforum' as const,
      }));
  } catch (error) {
    console.error('Failed to fetch EA Forum posts:', error);
    return [];
  }
}

// Fetch full HTML content for an EA Forum post
export async function fetchEAForumPostContent(postId: string): Promise<string> {
  const query = `{
    post(input: { selector: { _id: "${postId}" } }) {
      result {
        htmlBody
      }
    }
  }`;

  try {
    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query })
    });

    if (!response.ok) {
      console.error(`EA Forum API error: ${response.status}`);
      return '';
    }

    const data = await response.json();
    return data?.data?.post?.result?.htmlBody || '';
  } catch (error) {
    console.error('Failed to fetch EA Forum post content:', error);
    return '';
  }
}

// Process EA Forum HTML content for display
export function processEAForumContent(html: string): string {
  // EA Forum content is generally cleaner, but we might want to do some processing
  // For now, just return as-is
  return html;
}
