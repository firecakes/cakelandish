const dataQueue = [];
let saveTimer;

export async function parseTrafficData (data) {
  if (!shouldReport(data)) {
    return;
  }
  dataQueue.push({
    ip: data.ip,
    path: data.path,
    date: Date.now()
  });
  if (!saveTimer) {
    saveTimer = setInterval(async () => {
      const db = await readDb();
      while (dataQueue.length > 0) {
        db.push(dataQueue.shift());
      }
      await saveDb(db);
    }, 60*1000); // save data to disk every minute
  }
}

export async function clearTrafficData () {
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
  return Deno.writeTextFile("traffic.json", JSON.stringify(db, null, 2));
}

function shouldReport (data) {
  return (data.path.endsWith(".html") || !data.path.includes(".")) && !data.path.startsWith("/api/"); // HTML files only, no file paths, no API paths
}