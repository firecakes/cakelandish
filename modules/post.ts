import { getPosts } from "./db.ts";
let postLocations = [];

export function getPostLocations() {
  return postLocations;
}

export async function generatePostFileStructure() {
  const posts = await getPosts();
  postLocations = posts.map((post) => {
    const postTime = new Date(post.published);
    return {
      month: postTime.getUTCMonth() + 1,
      year: postTime.getUTCFullYear(),
      title: post.title,
      time: postTime.getTime(),
      path: post.localUrl,
      ogpExtra: post.ogpExtra,
    };
  }).sort((a, b) => {
    return b.time - a.time;
  });
}
