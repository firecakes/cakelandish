import {
  copyDirectory,
  createReadStream,
  http,
  https,
  Koa,
  koaBody,
  Router,
  serve,
} from "../deps.ts";
import { cleaner } from "./ammonia.ts";
import { config } from "../config.ts";
import {
  addFeed,
  addFile,
  addOrEditPage,
  addPageFile,
  addPost,
  changeDomains,
  deleteFeed,
  deleteFile,
  deletePage,
  deletePost,
  editFeed,
  editPost,
  feedGetHelper,
  getFeeds,
  getFiles,
  getLastDateExported,
  getLayout,
  getPages,
  getPosts,
  getTags,
  reorderFeed,
  saveLayout,
  updateLastDateExported,
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
import { exportData, importData } from "./zip.ts";
import { getPostLocations } from "./post.ts";
import {
  EDITABLE_EXTENSIONS,
  isBlacklistedPath,
  isEditableExtension,
} from "./static.ts";

const defaultHTML = `
<!DOCTYPE html>
<html>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <head>
    <link rel="alternate" type="application/atom+xml" href="/feed.atom">
  </head>

  <body class="no-space">
  </body>

  <script type="module">
  </script>

  <style>
  </style>
</html>
`;

let remoteVersion = ""; // update this value periodically
async function getRemoteVersion() {
  try {
    const releaseData = await fetch(
      "https://api.github.com/repos/firecakes/cakelandish/releases",
    );
    remoteVersion = (await releaseData.json())[0].tag_name; // get the most recent release
  } catch (err) {
  }
}
setInterval(getRemoteVersion, 1000 * 60 * 5); // 5 minutes
getRemoteVersion();

export async function startServer() {
  // start the web server initialization
  const app = new Koa();
  const router = new Router();

  app.use(koaBody({
    parsedMethods: ["POST", "PUT", "PATCH", "DELETE"], // add DELETE as parsed method
    multipart: true, // parse multipart form data
    formidable: { // modify where the form data gets saved
      uploadDir: "static/tmp",
      keepExtensions: true,
      maxFileSize: 10 * 1024 * 1024 * 1024, // allow uploads of up to 10 GB. only the site owner can call this anyway. 10 GB seems very reasonable
    },
    jsonLimit: "10mb", // used for sending very large bodies sent to api/sanitize/bulk
  }));

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
    // access token invalid. unauthorized
    ctx.status = 401; // unauthorized
  };

  // quick auth check route
  router.get("/api/auth", jwtMiddleware, async (ctx, next) => {
    ctx.body = {};
  });

  // authorization route
  router.post("/api/auth", async (ctx, next) => {
    const input = ctx.request.body;
    let text;
    try {
      text = await Deno.readTextFile("code.txt");
    } catch (err) {
    }

    if (!text) {
      ctx.body = {
        success: false,
      };
      return;
    }

    // use this method to prevent timing-based attacks on authentication
    if (compareStrings(input.code, text)) { // valid code. authenticate
      deleteCode(); // auth code no longer needed
      const access = await generateJwtAccessToken();

      // store token in client as a cookie
      // secure means https only. will be true if env var HTTPS is set to true
      // httpOnly means JS cannot be used to retrieve the cookie
      // strictness means cookie will only be readable with this site specifically

      ctx.cookies.set("jwt-access", access.token, {
        secure: config.https,
        httpOnly: true,
        sameSite: "strict",
        maxAge: access.expiry,
      });

      ctx.body = {
        success: true,
      };
    } else {
      ctx.body = {
        success: false,
      };
    }
  });

  // sanitize HTML input
  router.post("/api/sanitize", jwtMiddleware, async (ctx, next) => {
    const input = ctx.request.body;
    ctx.body = cleaner.clean(input.html);
  });

  // sanitize HTML input
  router.post("/api/sanitize/bulk", jwtMiddleware, async (ctx, next) => {
    const input = ctx.request.body;
    const htmlHash = input.html;
    for (let i in htmlHash) {
      for (let j in htmlHash[i]) {
        htmlHash[i][j] = cleaner.clean(htmlHash[i][j]);
      }
    }
    ctx.body = input;
  });

  // upload files to the server
  router.post("/api/upload", jwtMiddleware, async (ctx, next) => {
    let folderName = await getTmpFolder();

    if (!Array.isArray(ctx.request.files.myFile)) {
      ctx.request.files.myFile = [ctx.request.files.myFile];
    }

    // rename the files to what they were originally and move them to the correct location
    for await (let file of ctx.request.files.myFile) {
      await Deno.rename(
        `static/tmp/${file.newFilename}`,
        `static/tmp/${folderName}/${file.originalFilename}`,
      );
    }

    // return where the files are
    ctx.body = {
      files: ctx.request.files.myFile.map((file) =>
        `/tmp/${folderName}/${file.originalFilename}`
      ),
      address: config.link,
    };
  });

  // get all posts in static folder. this is public, and does not read from the database to get the info
  router.get("/api/post/all", async (ctx, next) => {
    ctx.body = {
      postLocations: getPostLocations(),
    };
  });

  // get all posts the user made
  router.get("/api/post", jwtMiddleware, async (ctx, next) => {
    ctx.body = {
      posts: await getPosts(),
    };
  });

  // initialize a new post. if a tmp folder already exists then return that one's name instead
  router.post("/api/post/init", jwtMiddleware, async (ctx, next) => {
    const input = ctx.request.body;
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

    ctx.body = {
      name: folderName,
      post: post,
    };
  });

  // deletes temporary posts that exist
  router.delete("/api/post/discard", jwtMiddleware, async (ctx, next) => {
    let folderName = await deleteTmpFolders();
    ctx.body = {};
  });

  // creating a post
  router.post("/api/post", jwtMiddleware, async (ctx, next) => {
    const input = ctx.request.body;
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

    // find current saved feeds for the local feed and update specifically that one
    await updateLocalFeed();

    ctx.body = {};
  });

  // updating an existing post
  router.put("/api/post", jwtMiddleware, async (ctx, next) => {
    const input = ctx.request.body;
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

    // find current saved feeds for the local feed and update specifically that one
    await updateLocalFeed();

    ctx.body = {};
  });

  // delete an existing post
  router.delete("/api/post", jwtMiddleware, async (ctx, next) => {
    const input: Feed = ctx.request.body;

    // get the folder location of the post
    const postUrl = `static${input.post.localUrl}`;

    await deletePost(input.post);
    await Deno.remove(postUrl, { recursive: true });

    // generate and save the ATOM feed from the database contents
    await xml.saveJsonToAtom();

    // find current saved feeds for the local feed and update specifically that one
    await updateLocalFeed();

    ctx.body = {};
  });

  // return all feeds
  router.get("/api/feed", jwtMiddleware, async (ctx, next) => {
    // read from database
    ctx.body = {
      feeds: await getFeeds(),
    };
  });

  // add a new feed to watch
  router.post("/api/feed", jwtMiddleware, async (ctx, next) => {
    const input: Feed = ctx.request.body;
    if (typeof input.updateMinutes !== "number" || input.updateMinutes < 1) {
      input.updateMinutes = 5; // default
    }
    // add to database
    const success = await addFeed(input);
    if (!success) {
      ctx.status = 400;
    }
    ctx.body = {};
  });

  // update an existing feed
  router.put("/api/feed", jwtMiddleware, async (ctx, next) => {
    const input: Feed = ctx.request.body;
    if (typeof input.index !== "number" || input.index < 0) {
      ctx.status = 400;
    }
    if (typeof input.updateMinutes !== "number" || input.updateMinutes < 1) {
      input.updateMinutes = 5; // default
    }
    // update database
    const success = await editFeed(input);
    if (!success) {
      ctx.status = 400;
    }
    ctx.body = {};
  });

  // delete an existing feed
  router.delete("/api/feed", jwtMiddleware, async (ctx, next) => {
    const input: Feed = ctx.request.body;
    if (typeof input.index !== "number" || input.index < 0) {
      ctx.status = 400;
    }

    // delete from database
    await deleteFeed(input.index);

    ctx.body = {};
  });

  // swap the order of a feed item
  router.put("/api/feed/reorder", jwtMiddleware, async (ctx, next) => {
    const input = ctx.request.body;
    if (typeof input.from !== "number" || typeof input.to !== "number") {
      ctx.status = 400;
    }
    await reorderFeed(input.from, input.to);
    ctx.body = {};
  });

  // checks if the URL passed in matched a feed that is followed
  router.post("/api/query/feed", jwtMiddleware, async (ctx, next) => {
    const input = ctx.request.body;
    // check the local cache and return the xml that way. query URL as last resort
    let feed = (await getFeeds()).find((feed) => feed.url === input.url);
    if (!feed) {
      feed = await feedGetHelper({ url: input.url });
    }
    ctx.body = {
      feed: feed ? feed : null,
    };
  });

  // bundle user data in a zip and send it to the client
  router.get("/api/export", jwtMiddleware, async (ctx, next) => {
    // update the last date data was exported from the server, before putting it into a tar
    await updateLastDateExported();

    const zipName = await exportData();

    ctx.body = createReadStream(zipName);
  });

  // import a tar of the server's state
  router.post("/api/import", jwtMiddleware, async (ctx, next) => {
    // enforce its existence
    await Deno.mkdir(
      `static/files`,
      { recursive: true },
    );

    if (!ctx.request.files.exported) {
      ctx.status = 400;
      return;
    }

    await importData(`static/tmp/${ctx.request.files.exported.newFilename}`);

    ctx.body = {};
  });

  // retrieve the post layout
  router.get("/api/layout", jwtMiddleware, async (ctx, next) => {
    ctx.body = {
      layout: await getLayout(),
    };
  });

  // save the post layout
  router.post("/api/layout", jwtMiddleware, async (ctx, next) => {
    const input = ctx.request.body;
    await saveLayout(input.layout);
    ctx.body = {};
  });

  // retrieve all tags ever used
  router.get("/api/tag", jwtMiddleware, async (ctx, next) => {
    ctx.body = {
      tags: (await getTags()).sort(),
    };
  });

  // get the software's version and the remote software's version
  router.get("/api/version", jwtMiddleware, async (ctx, next) => {
    ctx.body = {
      currentVersion: config.version,
      remoteVersion: remoteVersion,
    };
  });

  // return all files
  router.get("/api/file", jwtMiddleware, async (ctx, next) => {
    // read from database
    ctx.body = {
      files: await getFiles(),
    };
  });

  // add a new file
  router.post("/api/file", jwtMiddleware, async (ctx, next) => {
    // enforce its existence
    await Deno.mkdir(
      `static/files`,
      { recursive: true },
    );

    if (!Array.isArray(ctx.request.files.myFile)) {
      ctx.request.files.myFile = [ctx.request.files.myFile];
    }

    // rename the files to what they were originally and move them to the correct location
    for await (let file of ctx.request.files.myFile) {
      await Deno.rename(
        `static/tmp/${file.newFilename}`,
        `static/files/${file.originalFilename}`,
      );
    }

    for (let i = 0; i < ctx.request.files.myFile.length; i++) {
      // add to database
      await addFile(`files/${ctx.request.files.myFile[i].originalFilename}`);
    }

    ctx.body = {
      files: ctx.request.files.myFile.map((file) =>
        `files/${file.originalFilename}`
      ),
    };
  });

  // delete an existing file
  router.delete("/api/file", jwtMiddleware, async (ctx, next) => {
    const input: Feed = ctx.request.body;

    // delete from database
    await Deno.remove(`static/${input.file}`);
    await deleteFile(input.file);

    ctx.body = {};
  });

  // performs a string replacement of all instances of the old domain passed in with the new one
  router.post("/api/domain", jwtMiddleware, async (ctx, next) => {
    const input = ctx.request.body;
    await changeDomains(input.oldDomain, input.newDomain);

    // generate and save the ATOM feed from the database contents
    await xml.saveJsonToAtom();

    // find current saved feeds for the local feed and update specifically that one
    await updateLocalFeed();

    ctx.body = {};
  });

  // return all custom pages
  router.get("/api/page", jwtMiddleware, async (ctx, next) => {
    // read from database
    ctx.body = {
      pages: await getPages(),
    };
  });

  // add a new page
  router.post("/api/page", jwtMiddleware, async (ctx, next) => {
    const input = ctx.request.body;
    if (!input.name || input.name === "") {
      ctx.status = 400;
      return;
    }
    input.name = input.name.trim();
    const extension = input.name.split(".").pop();
    const fullPath = `static/${input.name}`;
    if (isBlacklistedPath(fullPath)) {
      ctx.status = 400;
      ctx.body = {
        error: "This is a reserved location and cannot be written to.",
      };
      return;
    }
    if (!isEditableExtension(input.name)) {
      ctx.status = 400;
      ctx.body = {
        error:
          `Only the following file extensions are supported through pages: ${
            EDITABLE_EXTENSIONS.join(", ")
          }`,
      };
      return;
    }

    // avoid overwriting files
    const foundExistingFile = await addOrEditPage({
      url: input.name,
      content: extension === "html" ? defaultHTML : "",
      directory: false,
      isImportant: false,
      extension: extension,
      editable: isEditableExtension(input.name),
    }, false);

    if (foundExistingFile) {
      ctx.status = 400;
      ctx.body = {
        error: "A file with the same name already exists here.",
      };
      return;
    }

    ctx.body = {};
  });

  // edit an existing page
  router.put("/api/page", jwtMiddleware, async (ctx, next) => {
    const input = ctx.request.body.page ? ctx.request.body.page : {};
    if (!input.url || input.url === "") {
      ctx.status = 400;
      return;
    }
    input.url = input.url.trim();
    const extension = input.url.split(".").pop();
    const fullPath = `static/${input.url}`;
    if (isBlacklistedPath(fullPath)) {
      ctx.status = 400;
      ctx.body = {
        error: "This is a reserved location and cannot be written to.",
      };
      return;
    }
    if (!isEditableExtension(input.url)) {
      ctx.status = 400;
      ctx.body = {
        error:
          `Only the following file extensions are supported through pages: ${
            EDITABLE_EXTENSIONS.join(", ")
          }`,
      };
      return;
    }

    // allow overwriting files
    await addOrEditPage(input, true);

    ctx.body = {};
  });

  // delete an existing page
  router.delete("/api/page", jwtMiddleware, async (ctx, next) => {
    const input = ctx.request.body;
    if (!input.page.url || input.page.url === "") {
      ctx.status = 400;
      return;
    }

    // get the location of the page
    const pageUrl = `static/${input.page.url}`;

    await deletePage(input.page);
    await Deno.remove(
      pageUrl,
      { recursive: true },
    );

    ctx.body = {};
  });

  // add a file toe a page
  router.post("/api/page/file", jwtMiddleware, async (ctx, next) => {
    const input = ctx.request.body;
    if (!Array.isArray(ctx.request.files.myFile)) {
      ctx.request.files.myFile = [ctx.request.files.myFile];
    }
    if (!input.pageUrl) {
      input.pageUrl = ""; // empty string is fine. it means add file to static folder
    }
    input.pageUrl = input.pageUrl.trim();

    const fullPath = (input.pageUrl === "")
      ? "static"
      : `static/${input.pageUrl}`;
    if (isBlacklistedPath(fullPath)) {
      ctx.status = 400;
      ctx.body = {
        error: "This is a reserved location and cannot be written to.",
      };
      return;
    }

    // rename the files to what they were originally and move them to the correct location
    for await (let file of ctx.request.files.myFile) {
      await Deno.rename(
        `static/tmp/${file.newFilename}`,
        (input.pageUrl === "")
          ? `static/${file.originalFilename}`
          : `static/${input.pageUrl}/${file.originalFilename}`,
      );

      // add to database
      await addPageFile(
        input.pageUrl,
        (input.pageUrl === "")
          ? file.originalFilename
          : `${input.pageUrl}/${file.originalFilename}`,
      );
    }

    ctx.body = {
      files: ctx.request.files.myFile.map((file) => file.originalFilename),
    };
  });

  // get the last date data was exported from the server
  router.get("/api/export/date", jwtMiddleware, async (ctx, next) => {
    ctx.body = {
      exportDate: await getLastDateExported(),
    };
  });

  // get files under static folder, and resolve "/" to index.html
  app.use(serve("static"));

  app.use(router.routes());
  app.use(router.allowedMethods());

  // for enabling HTTPS connections
  if (config.sslCertificateLocation && config.sslKeyLocation) {
    const options = {
      key: await Deno.readTextFile(config.sslKeyLocation),
      cert: await Deno.readTextFile(config.sslCertificateLocation),
    };
    https.createServer(options, app.callback()).listen(443);
  } else { // for enabling HTTP connections
    http.createServer(app.callback()).listen(config.port ? config.port : 8000);
  }
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

// force updates the local feed's contents
async function updateLocalFeed() {
  // find current saved feeds for the local feed and update specifically that one
  const feeds = await getFeeds();
  const localFeed = feeds.find((feed) =>
    new URL(feed.url).origin === new URL(config.link).origin
  );
  if (localFeed) {
    // use editFeed function to force update and reset timer
    await editFeed(localFeed);
  }
}
