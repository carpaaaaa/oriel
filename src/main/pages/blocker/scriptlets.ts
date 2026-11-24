// uBlock Origin's scriptlets as the engine gives them, made cheap where one
// costs far more than it does in uBlock Origin itself.
//
// edit-inbound-object copies every argument it sees before its JSONPath
// query looks at it. On YouTube nine of them wrap JSON.stringify, which the
// site calls all the time: every call made nine full copies of its object,
// and YouTube stalled for seconds with the blocker on (the user's report,
// 24 Nov 2026: 522 ms to stringify the page's data, 0.9 ms without). A query
// that starts with `[?.key.path]` can only edit an object that has that path
// at its top: an object without it is passed through untouched and uncopied.
// Same edits, same objects edited (checked on YouTube); a scriptlet whose code
// doesn't read as expected (another resources version) is left as it is.

const COPY = 'const s=t=>{let e;try{e=i.JSON_parse(i.JSON_stringify(t))}catch{}'
const GUARD = 'const s=t=>{if(!(function(t,q){const m=/^\\[\\?\\.([A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)*)\\]/.exec(q);if(!m)return true;'
  + 'if(t===null||typeof t!=="object")return false;let o=t;for(const k of m[1].split(".")){'
  + 'if(o===null||typeof o!=="object"||!Object.prototype.hasOwnProperty.call(o,k))return false;o=o[k]}return true})(t,n))return;'
  + 'let e;try{e=i.JSON_parse(i.JSON_stringify(t))}catch{}'

export function quickScriptlet(script: string): string {
  if (!script.includes('function editInboundObjectFn(') || !script.includes(COPY)) return script
  return script.replace(COPY, GUARD)
}
