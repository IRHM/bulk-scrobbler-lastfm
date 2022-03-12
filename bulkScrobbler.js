import LastFm from "lastfm-node-client";
import open from "open";
import readline from "readline";
import fs from "fs";
const cliArgs = process.argv.slice(2);

const configFP = "./config.json";
const config = fs.existsSync(configFP)
  ? JSON.parse(fs.readFileSync(configFP))
  : new Error(`Config file at "${configFP}" does not exist!`);

async function scrobble() {
  const importFile = getImportFile();

  const lastFm = new LastFm(config.apiKey, config.apiSecret);
  const sessionKey = getSessionKey();

  if (!sessionKey) {
    const token = (await lastFm.authGetToken()).token;
    console.log(token);

    open(`http://www.last.fm/api/auth/?api_key=${config.apiKey}&token=${token}`);

    await askUser(`Hit enter when done: http://www.last.fm/api/auth/?api_key=${config.apiKey}&token=${token}`);

    const session = await lastFm.authGetSession({ token: token });

    lastFm.sessionKey = session.session.key;

    saveSessionKey(session.session.key);
  } else {
    lastFm.sessionKey = sessionKey;
  }

  const tracks = await getTracksToScrobble(importFile);

  let i,
    j,
    v,
    chunk = 40;
  for (i = 0, j = tracks.length; i < j; i += chunk) {
    v = tracks.slice(i, i + chunk);

    console.log(`Processing chunk (${i} to ${i + chunk})`);

    await lastFm.trackScrobbleMany(v, (err, data) => {
      if (data.scrobbles["@attr"]) console.log("attr:", data.scrobbles["@attr"]);

      if (err) {
        console.log("ERR:", err);
        console.log("DATA:", data);
      }
    });

    await new Promise((r) => setTimeout(r, 2000));
  }
}

scrobble();

function getSessionKey() {
  if (fs.existsSync(configFP)) {
    if (config.sessionKey) {
      return config.sessionKey;
    } else {
      return null;
    }
  } else {
    console.error(`Config file (${configFP}) does not exist.`);
    process.exit(1);
  }
}

function saveSessionKey(key) {
  if (fs.existsSync(configFP)) {
    const config = JSON.parse(fs.readFileSync(configFP));
    config.sessionKey = key;
    fs.writeFileSync(configFP, JSON.stringify(config));
  } else {
    console.error(`Config file (${configFP}) does not exist.`);
    process.exit(1);
  }
}

async function getTracksToScrobble(file) {
  const tracks = JSON.parse(fs.readFileSync(file));

  console.log("Amount of tracks:", tracks.length);

  if (tracks.length > 2800) {
    const resp = await askUser(
      "There are more than 2800 songs in the import file, this may take you over your daily scrobble limit! Are you sure you want to continue? Y/N: "
    );

    if (resp.toLowerCase() !== "y") {
      console.log("Exiting since you did not answer: y");
      process.exit(0);
    }
  }

  let scrobbleTime = Math.floor(Date.now() / 1000 - tracks.length);
  console.log("Starting scrobble time:", new Date(scrobbleTime * 1000));

  tracks.map((v) => {
    if (!v.artistName || !v.albumName || !v.trackName) {
      console.log("Track does not have valid fields:", v);
    }

    // Rename keys to ones that will work with `lastFm`.
    v.artist = v.artistName;
    v.album = v.albumName;
    v.track = v.trackName;
    scrobbleTime = scrobbleTime + 1;
    v.timestamp = Math.floor(scrobbleTime);

    // Delete unneeded keys.
    delete v.artistName;
    delete v.albumName;
    delete v.trackName;
    v.time ? delete v.time : undefined;
  });

  console.log("Last scrobble time:", new Date(scrobbleTime * 1000));
  return tracks;
}

function getImportFile() {
  const file = cliArgs[0];

  if (fs.existsSync(file)) {
    return file;
  } else {
    console.error(`${file} is not a file path or does not exist.`);
    process.exit(1);
  }
}

async function askUser(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}
