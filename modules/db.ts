import { config } from "../config.ts";
import { generatePostFileStructure } from "./post.ts";
import { logger } from "./log.ts";

let memory = {
  feeds: [], // store xml and js parsed data in memory to avoid read/write collisions
  timers: [], // keeps track of refreshing feed data
};

// database functions

// ONLY CALL ONCE. sets up the database and feeds/timers
export async function init() {
  let db: FeedDatabase;
  try {
    db = await readDb();
  } catch {
    logger.info(
      "No database.json found in root directory. Initializing new file.",
    );
    await saveDb({
      feeds: [],
    });
    // add local feed by default
    await addFeed({
      name: "Local Feed",
      url: `${config.link}/feed.atom`,
      updateMinutes: 60,
      index: 0,
    });
    db = await readDb();
  }
  // sync up information from the .env file to the FeedDatabase JSON
  Object.assign(db, config);

  try {
    await initializeFeeds(db);
  } catch (err) {
    logger.warn(err); // don't hard fail here
  }

  // initialize globalIndex
  if (db.globalIndex === undefined) {
    db.globalIndex = 0;
  }

  // initialize layout
  if (db.layout === undefined) {
    db.layout = await Deno.readTextFile("layout-default.html");
  }

  // initialize pages
  if (db.pages === undefined) {
    db.pages = [];
  }

  // initialize last date exported
  if (db.lastDateExported === undefined) {
    db.lastDateExported = Date.now();
  }

  // initialize drafts
  if (db.drafts === undefined) {
    db.drafts = [];
  }

  // initialize ipBans
  if (db.ipBans === undefined) {
    db.ipBans = [];
  }

  // initialize hidden + blacklisted tags
  if (db.hiddenTags === undefined) {
    db.hiddenTags = [];
  }
  if (db.blacklistedTags === undefined) {
    db.blacklistedTags = [];
  }

  await saveDb(db);
  await generatePostFileStructure();
  return db;
}

export async function readDb(): Object {
  const file = await Deno.readTextFile("database.json");
  return JSON.parse(file);
}

export async function saveDb(db) {
  return Deno.writeTextFile("database.json", JSON.stringify(db, null, 2));
}

// post functions
export async function getPosts(): Object {
  const file = await readDb();
  return file.entries;
}

export async function addPost(post: Entry) {
  const db = await readDb();
  if (!Array.isArray(db.entries)) {
    db.entries = [];
  }
  // assign post index value
  post.postIndex = db.globalIndex;
  db.globalIndex = db.globalIndex + 1;
  db.entries.push(post);
  await saveDb(db);

  // apply layout
  await applyLayoutToPost(db.layout, post);
  await generatePostFileStructure();
}

export async function editPost(post: Entry) {
  const db = await readDb();
  if (!Array.isArray(db.entries)) {
    db.entries = [];
  }
  const foundPostIndex = db.entries.findIndex((target) =>
    target.localUrl === post.localUrl
  );
  if (foundPostIndex === -1) {
    return;
  }
  // preseve postIndex variable
  const postIndex = db.entries[foundPostIndex].postIndex;
  db.entries[foundPostIndex] = post;
  db.entries[foundPostIndex].postIndex = postIndex;
  await saveDb(db);

  // apply layout
  await applyLayoutToPost(db.layout, post);
  await generatePostFileStructure();
}

export async function deletePost(post: Entry) {
  let db = await readDb();
  db.entries = db.entries.filter((target) => target.localUrl !== post.localUrl);
  await saveDb(db);
  await generatePostFileStructure();
}

// draft functions
export async function getDrafts(): Object {
  const file = await readDb();
  return file.drafts ? file.drafts : [];
}

export async function addDraft(post: Entry) {
  const db = await readDb();
  if (!Array.isArray(db.drafts)) {
    db.drafts = [];
  }
  db.drafts.push(post);
  await saveDb(db);
}

export async function editDraft(post: Entry) {
  const db = await readDb();
  if (!Array.isArray(db.drafts)) {
    db.drafts = [];
  }
  const foundPostIndex = db.drafts.findIndex((target) =>
    target.localUrl === post.localUrl
  );
  if (foundPostIndex === -1) {
    return;
  }
  db.drafts[foundPostIndex] = post;
  await saveDb(db);
}

export async function deleteDraft(post: Entry) {
  let db = await readDb();
  db.drafts = db.drafts.filter((target) => target.localUrl !== post.localUrl);
  await saveDb(db);
}

// ip ban functions
export async function getIpBans(): Object {
  const file = await readDb();
  return file.ipBans ? file.ipBans : [];
}

export async function addIpBan(ip) {
  const db = await readDb();

  const foundIndex = db.ipBans.findIndex((target) => target === ip);
  if (foundIndex !== -1) {
    return false;
  }

  if (!Array.isArray(db.ipBans)) {
    db.ipBans = [];
  }
  db.ipBans.push(ip);
  await saveDb(db);
}

export async function deleteIpBan(ip) {
  let db = await readDb();
  db.ipBans = db.ipBans.filter((target) => target !== ip);
  await saveDb(db);
}

// feed functions

// only url matters for checking equality
function areFeedsEqual(feed1, feed2) {
  return feed1.url === feed2.url;
}

export async function getFeeds() {
  return memory.feeds;
}

// returns whether the incoming feed is unique
export async function addFeed(feed: Feed) {
  const db = await readDb();
  // check for duplicates
  const foundIndex = db.feeds.findIndex((target) =>
    areFeedsEqual(target, feed)
  );
  if (foundIndex !== -1) {
    return false;
  }
  feed.index = db.feeds.length;
  db.feeds.push(feed);
  await saveDb(db);

  memory.feeds.push(await feedGetHelper(feed));
  memory.timers.push(createFeedInterval(feed));
  return true;
}

// returns whether the incoming feed is unique
export async function editFeed(feed: Feed) {
  const db = await readDb();
  // check for duplicates, except for at the index where the feed originated
  const foundIndex = db.feeds.findIndex((target) =>
    areFeedsEqual(target, feed)
  );
  if (foundIndex !== -1 && feed.index !== foundIndex) {
    return false;
  }
  db.feeds[feed.index] = {
    name: feed.name,
    url: feed.url,
    updateMinutes: feed.updateMinutes,
    index: feed.index,
  };
  await saveDb(db);

  // reset the timer according to the new updateMinutes property
  clearInterval(memory.timers[feed.index]);
  memory.feeds[feed.index] = feed;
  await updateFeed(feed); // force update the feed
  memory.timers[feed.index] = createFeedInterval(feed);
  return true;
}

export async function deleteFeed(index: number) {
  const db = await readDb();
  db.feeds.splice(index, 1);
  db.feeds.forEach((feed, index) => feed.index = index);
  await saveDb(db);

  clearInterval(memory.timers[index]);
  memory.feeds.splice(index, 1);
  memory.feeds.forEach((feed, index) => feed.index = index);
  memory.timers.splice(index, 1);
}

export async function reorderFeed(from: number, to: number) {
  const db = await readDb();

  const feed = db.feeds.splice(from, 1)[0];
  db.feeds.splice(from >= to ? to : to - 1, 0, feed);
  db.feeds.forEach((feed, index) => feed.index = index);
  await saveDb(db);

  const memoryFeed = memory.feeds.splice(from, 1)[0];
  memory.feeds.splice(from >= to ? to : to - 1, 0, memoryFeed);
  memory.feeds.forEach((feed, index) => feed.index = index);

  const memoryTimer = memory.timers.splice(from, 1)[0];
  memory.timers.splice(from >= to ? to : to - 1, 0, memoryTimer);
}

export async function refreshFeedIntervals() {
  const db = await readDb();
  for (let i = 0; i < memory.timers.length; i++) {
    clearInterval(memory.timers[i]);
  }
  memory.timers = [];
  await initializeFeeds(db);
}

// feed tag functions
export async function getFeedTags(): Object {
  const file = await readDb();
  return {
    hiddenTags: file.hiddenTags ? file.hiddenTags : [],
    blacklistedTags: file.blacklistedTags ? file.blacklistedTags : [],
  };
}

export async function addFeedHiddenTag(tag) {
  const db = await readDb();

  const foundIndex = db.hiddenTags.findIndex((target) => target === tag);
  if (foundIndex !== -1) {
    return false;
  }

  if (!Array.isArray(db.hiddenTags)) {
    db.hiddenTags = [];
  }
  db.hiddenTags.push(tag);
  await saveDb(db);
  return true;
}

export async function addFeedBlacklistedTag(tag) {
  const db = await readDb();

  const foundIndex = db.blacklistedTags.findIndex((target) => target === tag);
  if (foundIndex !== -1) {
    return false;
  }

  if (!Array.isArray(db.blacklistedTags)) {
    db.blacklistedTags = [];
  }
  db.blacklistedTags.push(tag);
  await saveDb(db);
  return true;
}

export async function deleteFeedHiddenTag(tag) {
  let db = await readDb();
  db.hiddenTags = db.hiddenTags.filter((target) => target !== tag);
  await saveDb(db);
}

export async function deleteFeedBlacklistedTag(tag) {
  let db = await readDb();
  db.blacklistedTags = db.blacklistedTags.filter((target) => target !== tag);
  await saveDb(db);
}

// helper functions

async function initializeFeeds(db) {
  if (!Array.isArray(db.feeds)) {
    db.feeds = [];
  }
  // put data from file into memory. don't let them share the same reference!
  memory.feeds = JSON.parse(JSON.stringify(db.feeds));
  // setup timers and query URLs
  // run all updateFeeds at once and then await the result after the loop
  let updateFeedPromises = [];
  for (let i = 0; i < memory.feeds.length; i++) {
    const feed = memory.feeds[i];
    updateFeedPromises.push(updateFeed(feed));
    memory.timers.push(createFeedInterval(feed));
  }
  await Promise.all(updateFeedPromises);
}

function createFeedInterval(feed) {
  return setInterval(() => {
    updateFeed(feed);
  }, feed.updateMinutes * 60 * 1000);
}

async function updateFeed(feed) {
  memory.feeds[feed.index] = await feedGetHelper(feed);
}

// fetch the url content for the client because CORS is dumb
export async function feedGetHelper(feed) {
  return new Promise((resolve, reject) => {
    fetch(feed.url, { method: "GET" })
      .then((result) => {
        return result.text();
      })
      .then((result) => {
        resolve(Object.assign(feed, { xml: result }));
      })
      .catch((err) => {
        logger.error(err);
        resolve(Object.assign(feed, { xml: null }));
      });
  });
}
export async function getLayout() {
  const db = await readDb();
  return db.layout;
}

export async function saveLayout(layout) {
  const db = await readDb();
  db.layout = layout;
  // now apply this layout to every post ever made
  const entryChanges = db.entries.map(async (entry) => {
    await applyLayoutToPost(layout, entry);
  });
  await Promise.all(entryChanges);
  await saveDb(db);
}

export async function applyLayoutToPost(layout, post) {
  // perform replacements for various metadata in the post object
  let modifiedContent = layout.replace(
    new RegExp("%%%content%%%", "g"),
    post.originalContent,
  );
  modifiedContent = modifiedContent.replace(
    new RegExp("%%%published%%%", "g"),
    post.published,
  );
  modifiedContent = modifiedContent.replace(
    new RegExp("%%%updated%%%", "g"),
    post.updated,
  );
  modifiedContent = modifiedContent.replace(
    new RegExp("%%%categories%%%", "g"),
    post.categories,
  );
  modifiedContent = modifiedContent.replace(
    new RegExp("%%%title%%%", "g"),
    post.title,
  );
  modifiedContent = modifiedContent.replace(
    new RegExp("%%%localUrl%%%", "g"),
    post.localUrl,
  );
  modifiedContent = modifiedContent.replace(
    new RegExp("%%%replyFeedUrl%%%", "g"),
    post.replyFeedUrl,
  );
  modifiedContent = modifiedContent.replace(
    new RegExp("%%%replyPostIdUrl%%%", "g"),
    post.replyPostIdUrl,
  );
  modifiedContent = modifiedContent.replace(
    new RegExp("%%%link%%%", "g"),
    post.link,
  );

  // TODO: unify this data with the frontend util.js file
  let imageTypes = [
    "apng",
    "avif",
    "gif",
    "jpeg",
    "jpg",
    "png",
    "svg",
    "webp",
    "bmp",
  ];
  let audioTypes = ["wav", "ogg", "mp3"];
  let videoTypes = ["webm", "mp4"];

  modifiedContent = modifiedContent.replace(
    new RegExp("%%%media%%%", "g"),
    (post.ogpExtra && post.ogpExtra.mediaData)
      ? post.ogpExtra.mediaData.sort((a, b) => a.order - b.order).map((m) => {
        const extension = m.absoluteUrl.split(".").reverse()[0].toLowerCase();
        let output = "";
        if (m.absoluteUrl) {
          if (imageTypes.includes(extension)) {
            output += `<meta property="og:image" content="${m.absoluteUrl}" />`;
            if (m.description) {
              output +=
                `<meta property="og:image:alt" content="${m.description}" />`;
            }
          } else if (audioTypes.includes(extension)) {
            output += `<meta property="og:audio" content="${m.absoluteUrl}" />`;
            if (m.description) {
              output +=
                `<meta property="og:audio:alt" content="${m.description}" />`;
            }
          } else if (videoTypes.includes(extension)) {
            output += `<meta property="og:video" content="${m.absoluteUrl}" />`;
            if (m.description) {
              output +=
                `<meta property="og:video:alt" content="${m.description}" />`;
            }
          }
        }
        return output;
      }).filter((m) => m !== "").join("\n")
      : "",
  );

  modifiedContent = modifiedContent.replace(
    new RegExp("%%%description%%%", "g"),
    (post.ogpExtra && post.ogpExtra.description)
      ? post.ogpExtra.description
      : "",
  );

  // save the post contents
  await Deno.writeTextFile(
    `static${post.localUrl}/index.html`,
    modifiedContent,
  );
}

export async function getTags() {
  const db = await readDb();
  let tags = new Set();
  db.entries.forEach((entry) =>
    entry.categories.forEach((cat) => tags.add(cat))
  );
  return Array.from(tags);
}

export async function changeDomains(oldDomain, newDomain) {
  const db = await readDb();

  db.entries = db.entries.map((entry) => {
    entry.content = entry.content.replace(
      new RegExp(oldDomain, "g"),
      newDomain,
    );
    entry.link = entry.link.replace(
      new RegExp(oldDomain, "g"),
      newDomain,
    );
    if (entry.ogpExtra && entry.ogpExtra.mediaData) {
      for (let i = 0; i < entry.ogpExtra.mediaData.length; i++) {
        const absoluteUrl = entry.ogpExtra.mediaData[i].absoluteUrl;
        entry.ogpExtra.mediaData[i].absoluteUrl = absoluteUrl.replace(
          new RegExp(oldDomain, "g"),
          newDomain,
        );
      }
    }
    return entry;
  });

  await saveDb(db);
}

// page functions

export async function getPages() {
  const db = await readDb();
  return db.pages;
}

export async function setPages(pages) {
  const db = await readDb();
  db.pages = pages;
  await saveDb(db);
}

export async function addOrEditPage(page: Page, overwrite = false) {
  const db = await readDb();

  const directoryChain = page.url.split("/").slice(0, -1);
  let currentPathArray = [];
  let currentPage = db.pages;
  // find the location of the page to add or edit in the database
  for (let directory of directoryChain) {
    currentPathArray.push(directory);
    let foundPage = currentPage.find((element) =>
      element.url === currentPathArray.join("/")
    );
    if (!foundPage) {
      foundPage = {
        url: currentPathArray.join("/"),
        content: null,
        directory: [],
        isImportant: false,
        extension: null,
        editable: true,
      };
      currentPage.push(foundPage);
    }
    currentPage = foundPage.directory;

    await Deno.mkdir(
      `static/${currentPathArray.join("/")}`,
      { recursive: true },
    );
  }

  // add the page itself
  let fileAlreadyExists = false;
  let foundPage = currentPage.find((element) => element.url === page.url);
  if (!foundPage) {
    foundPage = page;
    currentPage.push(foundPage);

    await Deno.writeTextFile(
      `static/${page.url}`,
      page.content,
    );
  } else {
    fileAlreadyExists = true;
  }

  if (overwrite) { // allow overwriting of the file
    const pageIndex = currentPage.findIndex((element) =>
      element.url === page.url
    );
    currentPage[pageIndex] = page;
    await Deno.writeTextFile(
      `static/${page.url}`,
      page.content,
    );
  }

  await saveDb(db);
  return fileAlreadyExists;
}

export async function deletePage(page: Page) {
  let db = await readDb();

  const directoryChain = page.url.split("/").slice(0, -1);
  let currentPathArray = [];
  let currentPage = db.pages;
  // find the location of the page to delete in the database
  for (let directory of directoryChain) {
    currentPathArray.push(directory);
    let foundPage = currentPage.find((element) =>
      element.url === currentPathArray.join("/")
    );
    if (!foundPage) {
      return;
    }
    currentPage = foundPage.directory;
  }
  const foundIndex = currentPage.findIndex((target) => target.url === page.url);
  if (foundIndex >= 0) {
    currentPage.splice(foundIndex, 1);
  }
  await saveDb(db);
}

export async function addPageFile(pageUrl, file) {
  const db = await readDb();

  // pageUrl is a directory in this case
  const directoryChain = (pageUrl === "") ? [] : pageUrl.split("/");
  let currentPathArray = [];
  let currentPage = db.pages;
  // find the location of the page to add or edit in the database
  for (let directory of directoryChain) {
    currentPathArray.push(directory);
    let foundPage = currentPage.find((element) =>
      element.url === currentPathArray.join("/")
    );
    if (!foundPage) {
      foundPage = {
        url: currentPathArray.join("/"),
        content: null,
        directory: [],
        isImportant: false,
        extension: null,
        editable: true,
      };
      currentPage.push(foundPage);
    }
    currentPage = foundPage.directory;

    await Deno.mkdir(
      `static/${currentPathArray.join("/")}`,
      { recursive: true },
    );
  }

  // add the page to the database
  let fileAlreadyExists = false;
  let foundPage = currentPage.find((element) => element.url === file);
  if (!foundPage) {
    foundPage = {
      url: file,
      content: null,
      directory: null,
      isImportant: false,
      extension: file.split(".").pop(),
      editable: false,
    };
    currentPage.push(foundPage);
    // file is already written
  } else {
    fileAlreadyExists = true;
  }

  await saveDb(db);
}

export async function getLastDateExported() {
  let db = await readDb();
  return db.lastDateExported;
}

export async function updateLastDateExported() {
  let db = await readDb();
  db.lastDateExported = Date.now();
  await saveDb(db);
}

// interfaces

export interface FeedDatabase {
  title: string;
  subtitle?: string;
  author: string;
  contributors: string[];
  link: URL;
  categories: string[];
  updated: Date;
  entries: Entry[];
  feeds: Feed[];
  globalIndex: number;
  layout: String; // stringified HTML
  files: URL[];
  pages: Page[];
}

export interface Entry {
  title: string;
  author: string;
  contributors: string[];
  link: URL;
  localUrl: URL;
  categories: string[];
  published: Date;
  updated: Date;
  content: string;
  originalContent: string;
  sources: URL[];
  replyFeedUrl: URL;
  replyPostIdUrl: URL;
  ogpExtra?: OgpExtra;
  postIndex: number;
}

export interface Feed {
  name: string;
  url: URL;
  updateMinutes: number;
  index: number;
}

export interface StaticFile {
  url: URL;
  content: string;
  extension: string;
  directory: StaticFile[];
  isImportant: boolean;
  editable: boolean;
}

export interface OgpExtra {
  description?: string;
  mediaData: MediaData[];
}

export interface MediaData {
  order: number;
  absoluteUrl: URL;
  description?: string;
}
