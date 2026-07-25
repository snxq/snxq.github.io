export class ContentValidationError extends Error {
  constructor(entries) {
    const formattedEntries = entries.map(entry => [
      `Issue #${entry.issueNumber} "${entry.title}"`,
      `Field: ${entry.field}`,
      `Error: ${entry.reason}`,
      `URL: ${entry.url}`
    ].join('\n'));

    super(['Content validation failed', ...formattedEntries].join('\n\n'));
    this.name = 'ContentValidationError';
    this.entries = entries;
  }
}
