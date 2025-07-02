import { getPosts } from "./db.ts";
let postLocations = [];

export function getPostLocations() {
  return postLocations;
}

export async function generatePostFileStructure() {
  const posts = await getPosts();
  if (!posts) {
    return;
  }
  postLocations = posts.map((post) => {
    const postTime = new Date(post.published);
    return {
      title: post.title,
      time: postTime.getTime(),
      path: post.localUrl,
      ogpExtra: post.ogpExtra,
      categories: post.categories,
    };
  }).sort((a, b) => {
    return b.time - a.time;
  });
}
