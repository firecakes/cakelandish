const dataQueue = [];
let saveTimer;

export async function parseTrafficData(data) {
  if (!shouldReport(data)) {
    return;
  }
  dataQueue.push({
    ip: data.ip,
    path: data.path,
    date: Date.now(),
  });
  if (!saveTimer) {
    saveTimer = setInterval(async () => {
      const db = await readDb();
      while (dataQueue.length > 0) {
        db.push(dataQueue.shift());
      }
      await saveDb(db);
    }, 60 * 1000); // save data to disk every minute
  }
}

export async function clearTrafficData() {
  await Deno.remove("traffic.json");
}

async function readDb(): Object {
  try {
    const file = await Deno.readTextFile("traffic.json");
    return JSON.parse(file);
  } catch (err) {
    await saveDb([]);
    return [];
  }
}

async function saveDb(db) {
  return Deno.writeTextFile("traffic.json", formatJsonToString(db));
}

function formatJsonToString(json) {
  // makes it so each inner object in the array is printed on one line. useful for greping information
  return JSON.stringify(json.map(JSON.stringify), null, 2)
    .replace(new RegExp("\\\\", "g"), "")
    .split("\n")
    .map((objString, index) => objString.replace('"{', "{").replace('}"', "}"))
    .join("\n");
}

function shouldReport(data) {
  // HTML and ATOM files only, no file paths, no API paths
  return (data.path.endsWith(".html") || !data.path.includes(".") ||
    data.path.endsWith(".atom")) && !data.path.startsWith("/api/");
}
