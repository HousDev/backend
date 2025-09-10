const csv = require("csv-parser");
const { Readable } = require("stream");

function parseCSV(csvString) {
  return new Promise((resolve, reject) => {
    const results = [];

    const stream = Readable.from(csvString);
    stream
      .pipe(csv())
      .on("data", (data) => results.push(data))
      .on("end", () => resolve(results))
      .on("error", (error) => reject(error));
  });
}

module.exports = { parseCSV };
