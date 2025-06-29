export async function parseFeeds(feeds) {
  if (!Array.isArray(feeds)) {
    feeds = [feeds];
  }
  // batch up all the HTML content that needs to be sanitized into one call to increase performance
  const sanitizeHash = await quickSanitize(feeds);
  return Promise.all(feeds.map((feed, index) => {
    return new Promise((resolve, reject) => {
      resolve(parseFeed(feed, sanitizeHash[index]));
    });
  }));
}

async function quickSanitize (feeds) {
  // only worry about running sanitization of HTML content
  const sanitizeHash = {};
  for (let i = 0; i < feeds.length; i++) {
    const feed = feeds[i];
    if (!feed.xml) {
      continue;
    }
    const parsedFeed = new DOMParser().parseFromString(feed.xml, "text/xml");
    if (xmlGetOne(parsedFeed, ["parsererror"]) !== null) {
      continue;
    }
    if (!sanitizeHash[i]) {
      sanitizeHash[i] = {};
    }

    if (xmlGetOne(parsedFeed, ["rss"]) !== null) { // RSS
      const feed = xmlGetOne(parsedFeed, ["rss", "channel"]);
      xmlGetMany(feed, ["item"]).map((entry, j) => {
        if (!sanitizeHash[i][j]) {
          sanitizeHash[i][j] = {};
        }
        const entryPost = xmlGetOne(entry, ["content:encoded"]) ? xmlGetOne(entry, ["content:encoded"]) : xmlGetOne(entry, ["description"]);
        if (entryPost) {
          sanitizeHash[i][j] = entryPost.textContent;
        }
      });
    } else if (xmlGetOne(parsedFeed, ["feed"]) !== null) { // ATOM
      const feed = xmlGetOne(parsedFeed, ["feed"]);
      xmlGetMany(feed, ["entry"]).map((entry, j) => {
        if (!sanitizeHash[i][j]) {
          sanitizeHash[i][j] = {};
        }
        const entryPost = xmlGetOne(entry, ["content"]);
        if (entryPost) {
          sanitizeHash[i][j] = entryPost.textContent;
        }
      });
    }
  }
  // run a bulk sanitize on everything
  const result = await axios.post("api/sanitize/bulk", {
    html: sanitizeHash
  }).catch(err => {
    return {};
  });
  if (!result.data) {
    return;
  }
  // sanitization can return non-strings
  for (let i in result.data.html) {
    for (let j in result.data.html[i]) {
      result.data.html[i][j] = "" + result.data.html[i][j];
    }
  }
  return result.data.html;
}

async function parseFeed(feed, sanitizeHash) {
  let iconUrl;
  try {
    iconUrl = new URL(feed.url).origin + "/favicon.ico";
  } catch (err) {
    console.log(err);
    return Object.assign(feed, { success: false });
  }

  if (feed.xml === null) {
    return Object.assign(feed, { success: false });
  }
  try {
    const parsedFeed = new DOMParser().parseFromString(feed.xml, "text/xml");
    // check if there's parsing errors
    if (xmlGetOne(parsedFeed, ["parsererror"]) !== null) {
      return Object.assign(feed, { success: false });
    }
    // check whether it's RSS or ATOM
    if (xmlGetOne(parsedFeed, ["rss"]) !== null) {
      feed = Object.assign(feed, await parseRss(parsedFeed, sanitizeHash), {
        iconUrl: iconUrl,
      });
    } else if (xmlGetOne(parsedFeed, ["feed"]) !== null) {
      feed = Object.assign(feed, await parseAtom(parsedFeed, sanitizeHash), {
        iconUrl: iconUrl,
      });
    } else {
      return Object.assign(feed, { success: false });
    }
    return Object.assign(feed, { success: true });
  } catch (err) {
    console.log(err);
    return Object.assign(feed, { success: false });
  }
}

export async function findTargetPost (feedToCheck, originalLink) {
  for (let i = 0; i < feedToCheck.feedArray.length; i++) {
    const post = feedToCheck.feedArray[i];
    if (decodeURIComponent(post.entry.id) === decodeURIComponent(originalLink)) {
      return post;
    }
  }
  if (feedToCheck.meta && feedToCheck.meta.prevArchive) {
    // not found yet, but there is a prevArchive to seek through
    // maybe don't do this. unsure.
    const result = await axios.post("/api/query/feed", {
      url: feedToCheck.meta.prevArchive,
    }).catch(err => {
      console.error(err)
    });
    if (!result || !result.data || !result.data.feed) {
      return null;
    }
    const maybeParsed = (await parseFeeds(result.data.feed))[0];
    if (maybeParsed.success) {
      return await findTargetPost(maybeParsed);
    } else {
      return null;
    }
  } else {
    return null;
  }
}

export function widthToScreenSize (num) {
  if (num <= 600) {
    return 'sm';
  }
  else if (num > 600 && num <= 1000) {
    return 'md';
  }
  else {
    return 'lg';
  }
};

export function imageTypes () {
  return ["apng", "avif", "gif", "jpeg", "jpg", "png", "svg", "webp", "bmp"];
}

export function audioTypes () {
  return ["wav", "ogg", "mp3"];
}

export function videoTypes () {
  return ["webm", "mp4"];
}

export async function extractFeedLinks (postEntry) {
  let parsedFeed = null;
  let originalLink = null;

  // assume if what was parsed isn't a feed, or if the feed was already found, then the other link is a source link
  for (let i = 0; i < postEntry.links.length; i++) {
    const link = postEntry.links[i];

    // don't parse anymore links if we already found a feed
    if (parsedFeed !== null) {
      originalLink = link;
      continue;
    }

    const result = await axios.post("/api/query/feed", {
      url: link,
    });

    if (result.data.feed === null) { // not a feed the server's aware of
      originalLink = link;
      continue;
    }

    const maybeParsed = (await parseFeeds(result.data.feed))[0];
    // successful parse indicates it's a proper feed link
    if (maybeParsed.success) {
      parsedFeed = maybeParsed;
    } else {
      originalLink = link;
    }
  }
  return {
    parsedFeed: parsedFeed,
    originalLink: originalLink,
  }
}

async function parseRss (xml, sanitizeHash) {
  // try rss -> channel. rss tag may not exist, so try parsing as if channel is the top level
  const feed = xmlGetOne(xml, ["rss", "channel"]) ? xmlGetOne(xml, ["rss", "channel"]) : xmlGetOne(xml, ["channel"]);

  // find the RSS location from the feed to have for all posts
  const rssLinks = xmlGetMany(feed, ["atom:link"])
    .filter((element) =>
      element.attributes &&
      element.attributes.getNamedItem("rel") &&
      element.attributes.getNamedItem("rel").value === "self"
    ).map((element) => element.attributes.getNamedItem("href").value);

  const meta = {
    title: xmlGetOne(feed, ["title"], true),
    subtitle: xmlGetOne(feed, ["description"], true),
    id: xmlGetOne(feed, ["id"], true),
    categories: xmlGetMany(feed, ["category"], true),
    feedLink: rssLinks.length > 0 ? rssLinks[0] : null,
    prevArchive: null,
  };
  let prevArchive = xmlGetMany(feed, ["link"])
    .filter((element) =>
      element.attributes &&
      element.attributes.getNamedItem("rel") &&
      element.attributes.getNamedItem("rel").value === "prev-archive"
    )
    .map((element) => element.attributes.getNamedItem("href").value);
  if (prevArchive.length > 0) {
    meta.prevArchive = prevArchive[0];
  }

  const entries = xmlGetMany(feed, ["item"]).map((entry, index) => ({
    title: xmlGetOne(entry, ["title"], true) ? xmlGetOne(entry, ["title"], true) : xmlGetOne(feed, ["title"], true),
    author: xmlGetOne(entry, ["author"], true),
    categories: xmlGetMany(entry, ["category"], true),
    id: xmlGetOne(entry, ["link"], true) ? xmlGetOne(entry, ["link"], true) : extractAttribute("href")(xmlGetOne(entry, ["link"])),
    // get only links who have a "related" attribute value for "rel"
    links: xmlGetMany(entry, ["link"])
      .filter((element) =>
        element.attributes &&
        element.attributes.getNamedItem("rel") &&
        element.attributes.getNamedItem("rel").value === "related"
      )
      .map((element) => element.attributes.getNamedItem("href").value),
    date: xmlGetOne(entry, ["pubDate"], true).replace("\n", "").trim(),
    content: sanitizeHash && sanitizeHash[index] ? sanitizeHash[index] : null
  }));
  return {
    feedArray: entries.map((entry) => ({
      meta: meta,
      entry: entry,
    })),
    meta: meta,
  };
}

async function parseAtom (xml, sanitizeHash) {
  const feed = xmlGetOne(xml, ["feed"]);

  // find the RSS location from the feed to have for all posts
  const rssLinks = xmlGetMany(feed, ["link"])
    .filter((element) =>
      element.attributes &&
      element.attributes.getNamedItem("rel") &&
      element.attributes.getNamedItem("rel").value === "self"
    ).map((element) => element.attributes.getNamedItem("href").value);

  const meta = {
    title: xmlGetOne(feed, ["title"], true),
    subtitle: xmlGetOne(feed, ["subtitle"], true),
    author: xmlGetOne(feed, ["author", "name"], true),
    id: xmlGetOne(feed, ["id"], true),
    categories: xmlGetMany(feed, ["category"]).map(extractAttribute("term")).map(decodeURIComponent),
    feedLink: rssLinks.length > 0 ? rssLinks[0] : null,
    prevArchive: null,
  };
  let prevArchive = xmlGetMany(feed, ["link"])
    .filter((element) =>
      element.attributes &&
      element.attributes.getNamedItem("rel") &&
      element.attributes.getNamedItem("rel").value === "prev-archive"
    )
    .map((element) => element.attributes.getNamedItem("href").value);
  if (prevArchive.length > 0) {
    meta.prevArchive = prevArchive[0];
  }

  const entries = xmlGetMany(feed, ["entry"]).map((entry, index) => ({
    title: xmlGetOne(entry, ["title"], true) ? xmlGetOne(entry, ["title"], true) : xmlGetOne(feed, ["title"], true),
    author: xmlGetOne(entry, ["author", "name"], true),
    categories: xmlGetMany(entry, ["category"]).map(extractAttribute("term")).map(decodeURIComponent),
    id: xmlGetOne(entry, ["link"], true) ? xmlGetOne(entry, ["link"], true) : extractAttribute("href")(xmlGetOne(entry, ["link"])),
    // get only links who have a "related" attribute value for "rel"
    links: xmlGetMany(entry, ["link"])
      .filter((element) =>
        element.attributes &&
        element.attributes.getNamedItem("rel") &&
        element.attributes.getNamedItem("rel").value === "related"
      )
      .map((element) => element.attributes.getNamedItem("href").value),
    date: xmlGetOne(entry, ["updated"], true).replace("\n", "").trim() // prefer the updated post date versus the original post date
      ? xmlGetOne(entry, ["updated"], true).replace("\n", "").trim()
      : xmlGetOne(entry, ["published"], true).replace("\n", "").trim(),
    content: sanitizeHash && sanitizeHash[index] ? sanitizeHash[index] : null,
    summary: xmlGetOne(entry, ["summary"], true),
  }));

  return {
    feedArray: entries.map((entry) => ({
      meta: meta,
      entry: entry,
    })),
    meta: meta,
  };
}

function xmlGetMany(xml, tagNames = [], getValue = false) {
  if (tagNames.length === 0) {
    if (getValue) {
      return (xml !== null && xml.textContent !== undefined)
        ? xml.textContent
        : null;
    }
    return xml;
  }
  const tagName = tagNames.shift();
  let results = [];
  for (let i = 0; i < xml.children.length; i++) {
    if (xml.children[i].tagName === tagName) {
      results.push(xml.children[i]);
    }
  }
  return results.map((result) => xmlGetMany(result, tagNames, getValue));
}

function xmlGetOne(xml, tagNames = [], getValue = false) {
  if (tagNames.length === 0) {
    if (getValue) {
      return (xml !== null && xml.textContent !== undefined)
        ? xml.textContent
        : null;
    }
    return xml;
  }
  const tagName = tagNames.shift();
  for (let i = 0; i < xml.children.length; i++) {
    if (xml.children[i].tagName === tagName) {
      return xmlGetOne(xml.children[i], tagNames, getValue);
    }
  }
  return null;
}

async function renderHtml(element) {
  if (!element) {
    return null;
  }
  const result = await axios.post(
    "api/sanitize",
    {
      html: element.textContent,
    },
  );
  return "" + result.data; // sanitization can return non-strings
}

function extractAttribute(attributeName) {
  return function (element) {
    if (!element || !element.attributes) {
      return false;
    }
    for (let i = 0; i < element.attributes.length; i++) {
      let attribute = element.attributes[i];
      if (attribute.nodeName === attributeName) {
        return attribute.nodeValue;
      }
    }
    return null;
  };
}
