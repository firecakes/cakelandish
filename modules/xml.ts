import { jsonToXml } from "../deps.ts";
import { readDb, saveDb } from "./db.ts";

// ONLY CHANGE THIS VALUE BEFORE YOU RUN YOUR SERVER FOR THE FIRST TIME
const MAX_ENTRIES_PER_FEED_FILE = 50;
const MAIN_FEED = "feed.atom";
const ARCHIVE_PREFIX = "archive";

// converts the database contents into a valid ATOM feed
export async function saveJsonToAtom() {
  const database = await readDb();

  // clear out archive then regenerate it
  try {
    await Deno.remove("static/archive/", { recursive: true });
  } catch (err) {
    // didn't exist in the first place. fine
  }

  await Deno.mkdir("static/archive/", { recursive: true });

  if (!Array.isArray(database.entries)) {
    database.entries = [];
  }

  // section up the posts into blocks of length <MAX_ENTRIES_PER_FEED_FILE>
  // each block will go into its own feed file, linked to each other by metadata

  // the newest entries will always go to the main feed.atom file. This feed will take priority in filling up.
  const entriesCopy = JSON.parse(JSON.stringify(database.entries));
  const newestEntries = entriesCopy.reverse().splice(
    0,
    MAX_ENTRIES_PER_FEED_FILE,
  );

  // all remaining entries will be sectioned into archived feeds with a certain max size. start with oldest entries
  const entryChunks = splitArrayIntoChunks(
    entriesCopy.reverse(),
    MAX_ENTRIES_PER_FEED_FILE,
  );

  if (entryChunks.length === 0) {
    await contentsToAtomFile(database, newestEntries, MAIN_FEED);
  } else {
    await contentsToAtomFile(
      database,
      newestEntries,
      MAIN_FEED,
      `${ARCHIVE_PREFIX}/feed-${entryChunks.length}.atom`,
      null,
    );
    for (let i = 0; i < entryChunks.length; i++) {
      if (i === 0) { // first entry chunk
        await contentsToAtomFile(
          database,
          entryChunks[i],
          `${ARCHIVE_PREFIX}/feed-${i + 1}.atom`,
          null,
          `${ARCHIVE_PREFIX}/feed-${i + 2}.atom`,
        );
      } else if (i === entryChunks.length - 1) { // last entry chunk
        await contentsToAtomFile(
          database,
          entryChunks[i],
          `${ARCHIVE_PREFIX}/feed-${i + 1}.atom`,
          `${ARCHIVE_PREFIX}/feed-${i + 0}.atom`,
          MAIN_FEED,
        );
      } else {
        await contentsToAtomFile(
          database,
          entryChunks[i],
          `${ARCHIVE_PREFIX}/feed-${i + 1}.atom`,
          `${ARCHIVE_PREFIX}/feed-${i + 0}.atom`,
          `${ARCHIVE_PREFIX}/feed-${i + 2}.atom`,
        );
      }
    }
  }
}

// given an array of items with a postIndex property, split up into chunks where each entry is in chunk (postIndex / size)
// put empty arrays where no items exist for a chunk index
function splitArrayIntoChunks(entries, size) {
  let chunks = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const chunk = Math.floor(entry.postIndex / size);
    while (!chunks[chunk]) {
      chunks.push([]); // yes, this is necessary. there must not be a gap between chunk indeces
    }
    chunks[chunk].push(entry);
  }
  return chunks;
}

// converts the database contents into a valid ATOM feed
async function contentsToAtomFile(
  database,
  entries,
  feedUrl,
  nextFeedUrl = null,
  prevFeedUrl = null,
) {
  const output = {
    xml: {
      "@version": "1.0",
      "@encoding": "utf-8",
    },
    feed: {
      "@xmlns": "http://www.w3.org/2005/Atom",
      title: database.title,
      author: {
        name: database.author,
      },
      contributors: database.contributors,
      id: database.link + "/",
      link: [{
        "@href": database.link + "/",
      }, {
        "@rel": "self",
        "@href": database.link + "/" + feedUrl,
      }, {
        "@rel": "current",
        "@href": database.link + "/" + MAIN_FEED,
      }],
      category: database.categories.map((category) => ({
        "@term": category,
      })),
    },
  };

  if (nextFeedUrl !== null) {
    output.feed.link.push({
      "@rel": "next-archive",
      "@href": database.link + "/" + nextFeedUrl,
    });
  }

  if (prevFeedUrl !== null) {
    output.feed.link.push({
      "@rel": "prev-archive",
      "@href": database.link + "/" + prevFeedUrl,
    });
  }

  if (database.subtitle) {
    output.feed.subtitle = database.subtitle;
  }
  if (!database.updated) { // no updated date. make one now
    database.updated = new Date().toISOString();
  }
  output.feed.updated = database.updated;

  output.feed.entry = entries.map((entry) => ({
    title: entry.title,
    author: {
      name: entry.author,
    },
    id: new URL(entry.link).href + "/",
    link: entry.replyFeedUrl && entry.replyPostIdUrl // include reply feed url and post id url so that it can be found
      ? [{
        "@href": new URL(entry.link).href + "/",
        "@rel": "via",
      }, {
        "@href": new URL(entry.replyFeedUrl).href,
        "@rel": "related",
      }, {
        "@href": new URL(entry.replyPostIdUrl).href,
        "@rel": "related",
      }]
      : {
        "@href": new URL(entry.link).href + "/",
        "@rel": "via",
      },
    category: entry.categories.map((category) => ({
      "@term": category,
    })),
    content: {
      "@type": "html",
      "#text": entry.content,
    },
    published: entry.published,
    updated: entry.updated,
    source: entry.sources.map((source) => ({
      id: source,
    })),
  }));

  // save any changes we made to the database here
  await saveDb(database);

  // save the generated ATOM file to the server!
  return Deno.writeTextFile(`static/${feedUrl}`, jsonToXml(output));
}
