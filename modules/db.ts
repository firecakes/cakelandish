import { config } from "../config.ts";
import { generatePostFileStructure } from "./post.ts";

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
    console.log(
      "No database.json found in root directory. Initializing new file.",
    );
    await saveDb({
      feeds: [],
    });
    // add local feed by default
    await addFeed({
      name: "Local Feed",
      url: `${config.link}/feed.atom`,
      updateMinutes: 5,
      index: 0,
    });
    db = await readDb();
  }
  // sync up information from the .env file to the FeedDatabase JSON
  Object.assign(db, config);

  try {
    await initializeFeeds(db);
  } catch (err) {
    console.log(err); // don't hard fail here
  }

  // initialize globalIndex
  if (db.globalIndex === undefined) {
    db.globalIndex = 0;
  }

  // initialize layout
  if (db.layout === undefined) {
    db.layout = await Deno.readTextFile("layout-default.html");
  }

  // initialize files
  if (db.files === undefined) {
    db.files = [];
  }

  // initialize pages
  if (db.pages === undefined) {
    db.pages = [];
  }

  // initialize last date exported
  if (db.lastDateExported === undefined) {
    db.lastDateExported = Date.now();
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
  const file = await Deno.readTextFile("database.json");
  return JSON.parse(file).entries;
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
  db.feeds[feed.index] = feed;
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

// helper functions

async function initializeFeeds(db) {
  if (!Array.isArray(db.feeds)) {
    db.feeds = [];
  }
  memory.feeds = db.feeds; // put data from file into memory
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
        console.log(err);
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

export async function getFiles() {
  const db = await readDb();
  return db.files;
}

export async function addFile(file) {
  const db = await readDb();
  db.files.push(file);

  // files can be overwritten. don't allow duplicates in the list
  let fileSet = new Set();
  db.files.forEach((file) => {
    fileSet.add(file);
  });
  db.files = Array.from(fileSet);

  await saveDb(db);
}

export async function deleteFile(file) {
  let db = await readDb();
  db.files = db.files.filter((target) => target !== file);
  await saveDb(db);
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
    return entry;
  });

  await saveDb(db);
}

// page functions

export async function getPages() {
  const db = await readDb();
  return db.pages;
}

export async function addOrEditPage(page: Page) {
  const db = await readDb();

  // pages can be overwritten
  const existingPageIndex = db.pages.findIndex((other) =>
    other.name === page.name
  );

  if (existingPageIndex !== -1) {
    db.pages[existingPageIndex] = page;
  } else {
    db.pages.push(page);
  }

  await saveDb(db);
}

export async function deletePage(page: Page) {
  let db = await readDb();
  db.pages = db.pages.filter((target) => target.url !== page.url);
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
  postIndex: number;
}

export interface Feed {
  name: string;
  url: URL;
  updateMinutes: number;
  index: number;
}

export interface Page {
  name: string;
  url: URL;
  content: string;
}
