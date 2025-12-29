// Fetches posts from EA Forum GraphQL API
// Only includes posts where the user is the primary author (not co-author)

export interface EAForumPost {
  title: string;
  slug: string;
  date: Date;
  url: string;
}

interface GraphQLPost {
  _id: string;
  title: string;
  slug: string;
  postedAt: string;
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

    // All posts returned by this query are ones where the user is the author
    return posts.map(post => ({
      title: post.title,
      slug: post.slug,
      date: new Date(post.postedAt),
      url: `https://forum.effectivealtruism.org/posts/${post._id}/${post.slug}`
    }));
  } catch (error) {
    console.error('Failed to fetch EA Forum posts:', error);
    return [];
  }
}
