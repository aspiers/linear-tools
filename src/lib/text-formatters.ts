// The most 1337 c0d3rZ all copy and paste from stackoverflow
// https://stackoverflow.com/questions/14484787/wrap-text-in-javascript
const WRAP_WIDTH = 25
const WRAP_REGEXP = new RegExp(
  `(?![^\n]{1,${WRAP_WIDTH}}$)([^\n]{1,${WRAP_WIDTH}})\\s`,
  'g',
)
export const wrap = (s: string) => s.replace(WRAP_REGEXP, '$1\n')

// For some reason entities like &apos; are not decoded, so roll our
// own here instead of using the html-entities package.
export function encode(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}
