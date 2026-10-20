/**
 * The inline script an app carries, written by hand and kept small: it runs on every page load of the app. Without a handoff code in
 * the fragment or an unexpired attempt for this server in `localStorage` it stops, with no request and no change to the page. With
 * one, it takes the code out of the address and loads `ui-tests.js` from the address in its own `data-ui-tests`, and only from there:
 * nothing in a link can name another server.
 */
export const TAG_SCRIPT = String.raw`(function(){try{var d=document,u=d.currentScript&&d.currentScript.getAttribute('data-ui-tests')||'';if(!/^https?:\/\/[^/]+\/?$/i.test(u))return;u=u.replace(/\/$/,'');var l=location,m=/(^#|&)ui-tests=([^&]*)/.exec(l.hash);if(m){var h=l.hash.replace(m[0],m[1]=='#'?'#':'').replace('#&','#');history.replaceState(history.state,'',l.href.split('#')[0]+(h=='#'?'':h))}else{var j=JSON.parse(localStorage.getItem('ui-tests-attempt'));if(!j||j.server!==u||!(j.expiresAt>Date.now()))return}var s=d.createElement('script');s.type='module';s.src=u+'/ui-tests.js'+(m?'#'+m[2]:'');d.head.appendChild(s)}catch(e){}})()`

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ENTITIES[c]!)

/** The whole tag for a server's address, ready to paste into a page's `<head>`. */
export function tagFor(server: string): string {
  return `<script data-ui-tests="${escape(server)}">${TAG_SCRIPT}</script>`
}
