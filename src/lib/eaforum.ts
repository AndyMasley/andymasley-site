// Fetches posts from EA Forum GraphQL API
// Only includes posts where the user is the primary author (not co-author)
// Excludes events

export interface EAForumPost {
  title: string;
  slug: string;
  date: Date;
  url: string;
  isEvent: boolean;
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
        isEvent: post.isEvent
      }));
  } catch (error) {
    console.error('Failed to fetch EA Forum posts:', error);
    return [];
  }
}
