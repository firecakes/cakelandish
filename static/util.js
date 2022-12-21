export async function parseFeeds(feeds) {
  return Promise.all(feeds.map((feed) => {
    return new Promise((resolve, reject) => {
      resolve(parseFeed(feed));
    });
  }));
}

export async function parseFeed(feed) {
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
      feed = Object.assign(feed, await parseRss(parsedFeed), {
        iconUrl: iconUrl,
      });
    } else if (xmlGetOne(parsedFeed, ["feed"]) !== null) {
      feed = Object.assign(feed, await parseAtom(parsedFeed), {
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

async function parseRss(xml) {
  const feed = xmlGetOne(xml, ["rss", "channel"]);
  const meta = {
    title: xmlGetOne(feed, ["title"], true),
    subtitle: xmlGetOne(feed, ["description"], true),
    id: xmlGetOne(feed, ["id"], true),
    categories: xmlGetMany(feed, ["category"], true),
    nextArchive: null,
  };
  let nextArchive = xmlGetMany(feed, ["link"])
    .filter((element) =>
      element.attributes &&
      element.attributes.getNamedItem("rel") &&
      element.attributes.getNamedItem("rel").value === "next-archive"
    )
    .map((element) => element.attributes.getNamedItem("href").value);
  if (nextArchive.length > 0) {
    meta.nextArchive = nextArchive[0];
  }

  const entries = await Promise.all(
    xmlGetMany(feed, ["item"]).map(async (entry) => ({
      title: xmlGetOne(feed, ["title"], true),
      author: xmlGetOne(entry, ["author"], true),
      categories: xmlGetMany(entry, ["category"], true),
      id: xmlGetOne(entry, ["guid"], true),
      // get only links who have a "related" attribute value for "rel"
      links: xmlGetMany(entry, ["link"])
        .filter((element) =>
          element.attributes &&
          element.attributes.getNamedItem("rel") &&
          element.attributes.getNamedItem("rel").value === "related"
        )
        .map((element) => element.attributes.getNamedItem("href").value),
      date: xmlGetOne(entry, ["pubDate"], true),
      content: await checkAndRenderHtml(
        xmlGetOne(entry, ["description"]),
        true,
      ),
    })),
  );
  return {
    feedArray: entries.map((entry) => ({
      meta: meta,
      entry: entry,
    })),
    meta: meta,
  };
}

async function parseAtom(xml) {
  const feed = xmlGetOne(xml, ["feed"]);
  const meta = {
    title: await checkAndRenderHtml(xmlGetOne(feed, ["title"]), true),
    subtitle: await checkAndRenderHtml(xmlGetOne(feed, ["subtitle"]), true),
    author: xmlGetOne(feed, ["author", "name"], true),
    id: xmlGetOne(feed, ["id"], true),
    categories: xmlGetMany(feed, ["category"]).map(extractAttribute("term")),
    nextArchive: null,
  };
  let nextArchive = xmlGetMany(feed, ["link"])
    .filter((element) =>
      element.attributes &&
      element.attributes.getNamedItem("rel") &&
      element.attributes.getNamedItem("rel").value === "next-archive"
    )
    .map((element) => element.attributes.getNamedItem("href").value);
  if (nextArchive.length > 0) {
    meta.nextArchive = nextArchive[0];
  }

  const entries = await Promise.all(
    xmlGetMany(feed, ["entry"]).map(async (entry) => ({
      title: await checkAndRenderHtml(xmlGetOne(entry, ["title"]), true),
      author: xmlGetOne(entry, ["author", "name"], true),
      categories: xmlGetMany(entry, ["category"]).map(extractAttribute("term")),
      id: xmlGetOne(entry, ["id"], true),
      // get only links who have a "related" attribute value for "rel"
      links: xmlGetMany(entry, ["link"])
        .filter((element) =>
          element.attributes &&
          element.attributes.getNamedItem("rel") &&
          element.attributes.getNamedItem("rel").value === "related"
        )
        .map((element) => element.attributes.getNamedItem("href").value),
      date: xmlGetOne(entry, ["updated"], true) // prefer the updated post date versus the original post date
        ? xmlGetOne(entry, ["updated"], true)
        : xmlGetOne(entry, ["published"], true),
      content: await checkAndRenderHtml(xmlGetOne(entry, ["content"])),
      summary: await checkAndRenderHtml(xmlGetOne(entry, ["summary"])),
    })),
  );

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

async function checkAndRenderHtml(element, forceHtml) {
  if (!element) {
    return null;
  }
  if (renderAsHtml(element) || forceHtml) {
    const result = await axios.post(
      "api/sanitize",
      {
        html: element.textContent,
      },
    );
    return "" + result.data; // sanitization can return non-strings
  } else {
    return element.textContent;
  }
}

function renderAsHtml(element) {
  if (!element || !element.attributes) {
    return false;
  }
  let isHtml = false;
  for (let i = 0; i < element.attributes.length; i++) {
    let attribute = element.attributes[i];
    if (
      attribute.nodeName === "type" && attribute.nodeValue.includes("html")
    ) {
      isHtml = true;
    }
  }

  return isHtml;
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
