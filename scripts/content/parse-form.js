export function parseFormBody(body, expectedFields) {
  const lines = String(body ?? '').replace(/\r\n/g, '\n').split('\n');
  const expected = new Set(expectedFields);
  const result = {};
  let current = null;
  let buffer = [];

  const flush = () => {
    if (!current) return;
    if (Object.hasOwn(result, current)) throw new Error(`duplicate Issue Form field "${current}"`);
    result[current] = buffer.join('\n').trim();
  };

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^### (.+)$/);
    if (match && expected.has(match[1])) {
      flush();
      current = match[1];
      buffer = [];
      if (current === 'Body') {
        result.Body = lines.slice(index + 1).join('\n').trim();
        return result;
      }
      continue;
    }
    if (current) buffer.push(lines[index]);
  }
  flush();
  return result;
}
