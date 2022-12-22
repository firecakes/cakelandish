import { copyDirectory, oak } from "../deps.ts";
import { cleaner } from "./ammonia.ts";
import { config } from "../config.ts";
import {
  addFeed,
  addPost,
  deleteFeed,
  deletePost,
  editFeed,
  editPost,
  feedGetHelper,
  getFeeds,
  getLayout,
  getPosts,
  saveLayout,
} from "./db.ts";
import * as xml from "./xml.ts";
import {
  compareStrings,
  deleteCode,
  generateJwtAccessToken,
  generateJwtRefreshToken,
  verifyJwtAccessToken,
  verifyJwtRefreshToken,
} from "./auth.ts";
import { exportData } from "./zip.ts";

export function startServer() {
  // start the web server initialization
  const app = new oak.Application();
  const router = new oak.Router();

  // JWT middleware function
  const jwtMiddleware = async (ctx, next) => {
    // check if JWT is enabled. check the access token specifically
    if (!config.jwt) { // JWT is disabled
      await next();
      return;
    }
    let success = false;
    // access token validation check
    try {
      const accessToken = await ctx.cookies.get("jwt-access");
      await verifyJwtAccessToken(accessToken);
      // no exceptions thrown. continue
      await next();
      success = true;
    } catch (err) {
    }
    if (success) {
      return;
    }
    // access token invalid. verify the refresh token and generate a new access token if valid
    try {
      const refreshToken = await ctx.cookies.get("jwt-refresh");
      await verifyJwtRefreshToken(refreshToken);
      // no exceptions thrown. generate a new access token and continue;
      const accessToken = await generateJwtAccessToken();
      await ctx.cookies.set("jwt-access", accessToken, {
        secure: config.https,
        httpOnly: true,
        sameSite: "strict",
      });
      await next();
      success = true;
    } catch (err) {
    }
    if (success) {
      return;
    }
    // refresh token invalid. unauthorized
    ctx.response.status = 401; // unauthorized
  };

  // quick auth check route
  router.get("/api/auth", jwtMiddleware, async (ctx, next) => {
    ctx.response.body = {};
  });

  // authorization route
  router.post("/api/auth", async (ctx, next) => {
    const input = await ctx.request.body({ type: "json" }).value;
    let text;
    try {
      text = await Deno.readTextFile("code.txt");
    } catch (err) {
    }

    if (!text) {
      ctx.response.body = {
        success: false,
      };
      return;
    }

    // use this method to prevent timing-based attacks on authentication
    if (compareStrings(input.code, text)) { // valid code. authenticate
      deleteCode(); // auth code no longer needed
      const accessToken = await generateJwtAccessToken();
      const refreshToken = await generateJwtRefreshToken();
      // store tokens in client as a cookie
      // secure means https only. will be true if env var HTTPS is set to true
      // httpOnly means JS cannot be used to retrieve the cookie
      // strictness means cookie will only be readable with this site specifically
      await ctx.cookies.set("jwt-access", accessToken, {
        secure: config.https,
        httpOnly: true,
        sameSite: "strict",
      });
      await ctx.cookies.set("jwt-refresh", refreshToken, {
        secure: config.https,
        httpOnly: true,
        sameSite: "strict",
      });
      ctx.response.body = {
        success: true,
      };
    } else {
      ctx.response.body = {
        success: false,
      };
    }
  });

  // sanitize HTML input
  router.post("/api/sanitize", jwtMiddleware, async (ctx, next) => {
    const input = await ctx.request.body({ type: "json" }).value;
    ctx.response.body = cleaner.clean(input.html);
  });

  // upload files to the server
  router.post("/api/upload", jwtMiddleware, async (ctx, next) => {
    let folderName = await getTmpFolder();
    const results = await ctx.request.body({ type: "form-data" }).value.read({
      maxFileSize: 10 * 1000 * 1000 * 1000, // allow uploads of up to 10 GB. only the site owner can call this anyway. 10 GB seems very reasonable
      outPath: `static/tmp/${folderName}`,
    });
    // rename the files to what they were originally
    for await (let file of results.files) {
      await Deno.rename(
        file.filename,
        `static/tmp/${folderName}/${file.originalName}`,
      );
    }

    // return where the files are
    ctx.response.body = {
      files: results.files.map((file) =>
        `/tmp/${folderName}/${file.originalName}`
      ),
      address: config.link,
    };
  });

  // get all posts the user made
  router.get("/api/post", jwtMiddleware, async (ctx, next) => {
    ctx.response.body = {
      posts: await getPosts(),
    };
  });

  // initialize a new post. if a tmp folder already exists then return that one's name instead
  router.post("/api/post/init", jwtMiddleware, async (ctx, next) => {
    const input = await ctx.request.body({ type: "json" }).value;
    let folderName;
    let post;

    // if localUrl is defined then move contents from an existing post over to tmp
    if (input.localUrl) {
      await deleteTmpFolders(); // start with no tmp folders
      folderName = crypto.randomUUID();

      const foundPost = (await getPosts()).find((post) =>
        post.localUrl === input.localUrl
      );
      if (foundPost) {
        post = foundPost;
        // get the folder location of the post
        // copy all post contents to the target folder
        await copyDirectory(
          `static/${input.localUrl}/`,
          `static/tmp/${folderName}/`,
        );
      } else { // no post found. fallback
        folderName = await getTmpFolder();
      }
    } else {
      folderName = await getTmpFolder();
    }

    ctx.response.body = {
      name: folderName,
      post: post,
    };
  });

  // deletes temporary posts that exist
  router.delete("/api/post/discard", jwtMiddleware, async (ctx, next) => {
    let folderName = await deleteTmpFolders();
    ctx.response.body = {};
  });

  // creating a post
  router.post("/api/post", jwtMiddleware, async (ctx, next) => {
    const input = await ctx.request.body({ type: "json" }).value;
    const regex = new RegExp(`/tmp/${input.tmpTitle}`, "g");

    const folderName = await generatePostFolderName(input.title);
    // replace all links with the absolute urls for RSS and relative for the HTML post
    input.htmlContent = input.htmlContent.replace(
      regex,
      `/posts/${folderName}`,
    );
    input.rssContent = input.rssContent.replace(
      regex,
      `${config.link}/posts/${folderName}`,
    );

    // save the post contents in an index.html file
    await Deno.writeTextFile(
      `static/tmp/${input.tmpTitle}/index.html`,
      input.htmlContent,
    );

    // move post to a permanent location
    await Deno.rename(
      `static/tmp/${input.tmpTitle}`,
      `static/posts/${folderName}`,
    );

    // save the post in the database.json
    const entry = {
      title: input.title,
      author: config.author,
      link: `${config.link}/posts/${folderName}`,
      categories: input.tags,
      published: new Date().toISOString(),
      updated: new Date().toISOString(),
      content: input.rssContent, // rss sanitized input
      originalContent: input.htmlContent, // raw input
      localUrl: `/posts/${folderName}`,
      sources: [],
      replyFeedUrl: input.replyFeedUrl,
      replyPostIdUrl: input.replyPostIdUrl,
    };

    await addPost(entry);

    // generate and save the ATOM feed from the database contents
    await xml.saveJsonToAtom();

    ctx.response.body = {};
  });

  // updating an existing post
  router.put("/api/post", jwtMiddleware, async (ctx, next) => {
    const input = await ctx.request.body({ type: "json" }).value;
    const regex = new RegExp(`/tmp/${input.tmpTitle}`, "g");

    const folderName = input.localUrl.split("/posts/")[1]; // get the existing folder name
    // replace all links with the absolute urls for RSS and relative for the HTML post
    input.htmlContent = input.htmlContent.replace(
      regex,
      `/posts/${folderName}`,
    );
    input.rssContent = input.rssContent.replace(
      regex,
      `${config.link}/posts/${folderName}`,
    );

    // save the post contents in an index.html file
    await Deno.writeTextFile(
      `static/tmp/${input.tmpTitle}/index.html`,
      input.htmlContent,
    );

    // "move" post to the original post's location
    const originalPostUrl = `static/${input.localUrl}`;

    await Deno.remove(originalPostUrl, { recursive: true });
    await Deno.rename(
      `static/tmp/${input.tmpTitle}`,
      originalPostUrl,
    );
    // edit the existing post in the database.json
    const entry = {
      title: input.title,
      author: config.author,
      link: `${config.link}/posts/${folderName}`,
      categories: input.tags,
      // preserve the original published date if it exists
      published: input.published !== ""
        ? input.published
        : new Date().toISOString(),
      updated: new Date().toISOString(),
      content: input.rssContent, // rss sanitized input
      originalContent: input.htmlContent, // raw input
      localUrl: `/posts/${folderName}`,
      sources: [],
      replyFeedUrl: input.replyFeedUrl,
      replyPostIdUrl: input.replyPostIdUrl,
    };

    await editPost(entry);
    // generate and save the ATOM feed from the database contents
    await xml.saveJsonToAtom();

    ctx.response.body = {};
  });

  // delete an existing post
  router.delete("/api/post", jwtMiddleware, async (ctx, next) => {
    const input: Feed = await ctx.request.body({ type: "json" }).value;

    // get the folder location of the post
    const postUrl = `static${input.post.localUrl}`;

    await deletePost(input.post);
    await Deno.remove(postUrl, { recursive: true });

    // generate and save the ATOM feed from the database contents
    await xml.saveJsonToAtom();

    ctx.response.body = {};
  });

  // return all feeds
  router.get("/api/feed", jwtMiddleware, async (ctx, next) => {
    // read from database
    ctx.response.body = {
      feeds: await getFeeds(),
    };
  });

  // add a new feed to watch
  router.post("/api/feed", jwtMiddleware, async (ctx, next) => {
    const input: Feed = await ctx.request.body({ type: "json" }).value;
    if (typeof input.updateMinutes !== "number" || input.updateMinutes < 0) {
      input.updateMinutes = 5; // default
    }
    // add to database
    await addFeed(input);
    ctx.response.body = {};
  });

  // update an existing feed
  router.put("/api/feed", jwtMiddleware, async (ctx, next) => {
    const input: Feed = await ctx.request.body({ type: "json" }).value;
    if (typeof input.index !== "number" || input.index < 0) {
      ctx.response.status = 400;
    }
    if (typeof input.updateMinutes !== "number" || input.updateMinutes < 0) {
      input.updateMinutes = 5; // default
    }
    // add to database
    await editFeed(input);

    ctx.response.body = {};
  });

  // delete an existing feed
  router.delete("/api/feed", jwtMiddleware, async (ctx, next) => {
    const input: Feed = await ctx.request.body({ type: "json" }).value;
    if (typeof input.index !== "number" || input.index < 0) {
      ctx.response.status = 400;
    }

    // delete from database
    await deleteFeed(input.index);

    ctx.response.body = {};
  });

  // checks if the URL passed in matched a feed that is followed
  router.post("/api/query/feed", jwtMiddleware, async (ctx, next) => {
    const input = await ctx.request.body({ type: "json" }).value;
    // check the local cache and return the xml that way. query URL as last resort
    let feed = (await getFeeds()).find((feed) => feed.url === input.url);
    if (!feed) {
      feed = await feedGetHelper({ url: input.url });
    }
    ctx.response.body = {
      feed: feed ? feed : null,
    };
  });

  // bundle user data in a zip and send it to the client
  router.get("/api/export", jwtMiddleware, async (ctx, next) => {
    const zipName = await exportData();
    const file = await Deno.open(zipName, { read: true });
    const readableStream = file.readable;
    ctx.response.body = readableStream;
  });

  // retrieve the post layout
  router.get("/api/layout", jwtMiddleware, async (ctx, next) => {
    ctx.response.body = {
      layout: await getLayout(),
    };
  });

  // save the post layout
  router.post("/api/layout", jwtMiddleware, async (ctx, next) => {
    const input = await ctx.request.body({ type: "json" }).value;
    await saveLayout(input.layout);
    ctx.response.body = {};
  });

  // get files under static folder, and resolve "/" to index.html
  app.use(async (ctx, next) => {
    try {
      await ctx.send({
        root: "static",
        index: "index.html",
      });
    } catch {
      await next();
    }
  });

  // catch-all route (error)
  router.get("/:path", async (ctx, next) => {
    ctx.response.body = "Not Found";
    ctx.response.status = 404;
  });

  app.use(router.routes());
  app.use(router.allowedMethods());

  const oakConfig = {
    port: config.port ? config.port : 8000,
  };
  // for enabling HTTPS connections
  if (config.sslCertificateLocation && config.sslKeyLocation) {
    oakConfig.secure = true;
    oakConfig.certFile = config.sslCertificateLocation;
    oakConfig.keyFile = config.sslKeyLocation;
  }
  app.listen(oakConfig);
}

// smartly creates a name for the folder to put your post in. also makes it if it doesn't exist already
async function generatePostFolderName(postName) {
  const date = new Date();
  const parentFolderName = `${date.getFullYear()}-${date.getMonth() + 1}`;
  const postFolderName = `${Math.floor(Date.now() / 1000)}-${postName}`;
  const fullName = `${parentFolderName}/${postFolderName}`;
  await Deno.mkdir(
    `static/posts/${fullName}`,
    { recursive: true },
  );
  return fullName;
}

// only reads inside static folder
async function readFile(path) {
  return Deno.open(`static/${path}`, { read: true });
}

async function deleteTmpFolders() {
  try {
    const files = await Deno.readDir("static/tmp");
    for await (let file of files) {
      if (file.isDirectory) { // delete tmp directories
        await Deno.remove(
          `static/tmp/${file.name}`,
          { recursive: true },
        );
      }
    }
  } catch {
    console.error("Error deleting temporary posts");
  }
}

// creates a new post inside /static/tmp if one does not exist already and returns its folder name
async function getTmpFolder() {
  let folderName;
  try {
    const files = await Deno.readDir("static/tmp");
    for await (let file of files) {
      if (file.isDirectory) {
        folderName = file.name;
        break;
      }
    }
    if (!folderName) {
      // no folders found. make a new one
      throw new Error("No folders found.");
    }
  } catch {
    folderName = crypto.randomUUID();
    await Deno.mkdir(
      `static/tmp/${folderName}`,
      { recursive: true },
    );
  }
  return folderName;
}
