/**
 * Pagination Utility for Cursor-based "Index Seek" pagination.
 * Encodes and decodes opaque cursor strings to keep implementation details hidden from clients.
 */

const encodeCursor = (timestamp, id, extra = {}) => {
  if (!timestamp || !id) return null;
  const cursorObj = { t: timestamp, i: id, ...extra };
  return Buffer.from(JSON.stringify(cursorObj)).toString('base64');
};

const decodeCursor = (cursorString) => {
  if (!cursorString) return null;
  try {
    const jsonStr = Buffer.from(cursorString, 'base64').toString('utf-8');
    const cursorObj = JSON.parse(jsonStr);
    
    // Validate required fields (using explicit null/undefined check to allow 0/empty values)
    if (cursorObj.t === undefined || cursorObj.i === undefined) return null;
    
    // Return all properties normalized for the repository
    return {
      timestamp: parseFloat(cursorObj.t),
      id: cursorObj.i,
      score: cursorObj.score,
      rank: cursorObj.rank
    };
  } catch (err) {
    return null;
  }
};

module.exports = {
  encodeCursor,
  decodeCursor
};
