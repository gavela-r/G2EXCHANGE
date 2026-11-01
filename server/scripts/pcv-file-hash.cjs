// Streaming hashes support recovery evidence larger than a single Node Buffer.
const fs=require('node:fs'),crypto=require('node:crypto');
async function sha256File(file){const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);return hash.digest('hex');}
module.exports={sha256File};
