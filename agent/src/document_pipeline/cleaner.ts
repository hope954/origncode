const NOISE_PATTERNS = [/^更新时间[:：]/, /^最后编辑[:：]/, /^https?:\/\//];

export function contentCleaner(content: string): string {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !NOISE_PATTERNS.some((pattern) => pattern.test(line)))
    .join("\n");
}
