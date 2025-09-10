// utils/dateUtils.js
function toMySQLDateTime(jsDate) {
  const date = new Date(jsDate);
  if (isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function combineDateTime(date, time) {
  if (!date) return null;
  if (!time) return toMySQLDateTime(date);
  const fullDateTime = `${date} ${time}`;
  return toMySQLDateTime(fullDateTime);
}

module.exports = { toMySQLDateTime, combineDateTime };
