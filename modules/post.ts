let postLocations = [];

export function getPostLocations () {
  return postLocations;
}

export async function generatePostFileStructure () {
  try {
    const posts = await readDir("static/posts", []);
    // organize each post based on important information and sort by newest posts first
    postLocations = posts.map(post => post.split("static/")[1]).map(post => ({
      month: post.split("/")[1].split("-")[1],
      year: post.split("/")[1].split("-")[0],
      title: post.split("/")[2].split("-").slice(1).join("-"),
      time: post.split("/")[2].split("-")[0],
      path: post,
    })).sort((a, b) => {
      return b.time - a.time
    });
  } catch (err) {
    postLocations = []; // no posts yet
  }
}

async function readDir (directory, files) {
  for await (const file of Deno.readDir(directory)) {
    if (file.isFile && file.name === "index.html") { // only get the HTML files
      files.push(`${directory}/${file.name}`);
    }
    if (file.isDirectory) {
      files.push(await readDir(`${directory}/${file.name}`, []));
    }
  }
  return files.flat();
}
