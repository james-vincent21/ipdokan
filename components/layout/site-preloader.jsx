// Loading screen shown before the site appears (once per browser session): the IP DOKAN logo animates in,
// a percentage counts up, and data travels from a cell tower through a proxy server to a home router.
// The markup is server-rendered so it shows instantly; PRELOADER_SCRIPT (inline, before React starts)
// drives the percentage and adds "pl-done" to <html> once the page is ready (DOMContentLoaded: the
// content is there; images further down keep loading behind it). PRELOADER_HEAD_SCRIPT
// adds "pl-skip" when it was already shown in this session, so it never flashes.
const SEEN_KEY = "ipdokan-preloaded";
const MIN_MS = 1500;
const MAX_MS = 5000;

export const PRELOADER_HEAD_SCRIPT = `(function(){try{if(sessionStorage.getItem("${SEEN_KEY}"))document.documentElement.classList.add("pl-skip")}catch(e){}})()`;

const PRELOADER_SCRIPT = `(function(){try{
var h=document.documentElement;if(h.classList.contains("pl-skip"))return;
var root=document.getElementById("site-preloader");if(!root)return;
var pct=root.querySelector(".pl-pct"),bar=root.querySelector(".pl-bar i"),start=Date.now(),shown=0,done=false,ended=false;
function finish(){if(ended)return;ended=true;h.classList.add("pl-done");try{sessionStorage.setItem("${SEEN_KEY}","1")}catch(e){}}
function tick(){var t=(Date.now()-start)/1000;var cap=done?100:Math.min(94,100*(1-Math.exp(-t/0.9)));shown+=(cap-shown)*0.12;if(done&&100-shown<0.8)shown=100;var v=Math.floor(shown);pct.textContent=v+"%";bar.style.width=v+"%";if(v>=100){setTimeout(finish,180);return}requestAnimationFrame(tick)}
function ready(){setTimeout(function(){done=true},Math.max(0,${MIN_MS}-(Date.now()-start)))}
if(document.readyState!=="loading")ready();else document.addEventListener("DOMContentLoaded",ready);
setTimeout(function(){done=true},${MAX_MS});
requestAnimationFrame(tick);
}catch(e){document.documentElement.classList.add("pl-done")}})()`;

export function SitePreloader() {
  return <>
    <div id="site-preloader" aria-hidden="true">
      <div className="pl-inner">
        <span className="pl-logo-wrap"><img className="pl-logo" src="/ip-dokan-logo.svg" alt="" /></span>
        <svg className="pl-scene" viewBox="0 0 640 210" role="presentation">
          {/* Links with moving data packets. The packets use CSS animation (keyframes follow points on
              these curves) because SVG's own animations only start after the page has loaded.
              Negative delays put every packet on its line from the first frame. */}
          <path className="pl-link" d="M122 66 C 180 30, 222 128, 266 108" />
          <path className="pl-link" d="M374 108 C 420 88, 470 152, 520 142" />
          {[0, 0.45, 0.9].map((delay) => <circle key={`a${delay}`} className="pl-packet pl-packet-1" r="4.5" style={{ animationDelay: `-${delay}s` }} />)}
          {[0.2, 0.65, 1.1].map((delay) => <circle key={`b${delay}`} className="pl-packet pl-packet-2" r="4.5" style={{ animationDelay: `-${delay}s` }} />)}

          {/* cell tower with radio waves */}
          <g className="pl-tower">
            <path d="M92 44 L66 172 M92 44 L118 172 M74 132 L110 132 M79 104 L105 104 M84 78 L100 78 M74 132 L105 104 M110 132 L79 104 M79 104 L100 78 M105 104 L84 78" />
            <circle cx="92" cy="40" r="6" className="pl-tower-top" />
            <path className="pl-wave pl-wave-1" d="M108 26 a22 22 0 0 1 0 28" /><path className="pl-wave pl-wave-2" d="M116 16 a36 36 0 0 1 0 48" />
            <path className="pl-wave pl-wave-1" d="M76 26 a22 22 0 0 0 0 28" /><path className="pl-wave pl-wave-2" d="M68 16 a36 36 0 0 0 0 48" />
          </g>

          {/* proxy server rack */}
          <g className="pl-server">
            <rect x="266" y="58" width="108" height="100" rx="12" className="pl-box" />
            {[72, 101, 130].map((y, i) => <g key={y}><rect x="280" y={y} width="80" height="18" rx="5" className="pl-unit" /><circle cx="347" cy={y + 9} r="3.2" className={`pl-led pl-led-${i}`} /><rect x="290" y={y + 7} width="34" height="4" rx="2" className="pl-slot" /></g>)}
          </g>

          {/* home with a router */}
          <g className="pl-home">
            <path className="pl-roof" d="M494 102 L556 52 L618 102" />
            <rect x="506" y="100" width="100" height="72" rx="6" className="pl-box" />
            <rect x="528" y="134" width="56" height="20" rx="6" className="pl-router" />
            <path className="pl-antenna" d="M538 134 L532 116 M574 134 L580 116" />
            <circle cx="545" cy="144" r="2.6" className="pl-led pl-led-1" /><circle cx="556" cy="144" r="2.6" className="pl-led pl-led-2" /><circle cx="567" cy="144" r="2.6" className="pl-led pl-led-0" />
          </g>

          <text x="92" y="198" className="pl-label">TOWER</text>
          <text x="320" y="198" className="pl-label">PROXY SERVER</text>
          <text x="556" y="198" className="pl-label">YOUR ROUTER</text>
        </svg>
        <div className="pl-progress">
          <span className="pl-bar"><i suppressHydrationWarning /></span>
          <span className="pl-pct" suppressHydrationWarning>0%</span>
        </div>
      </div>
    </div>
    <script dangerouslySetInnerHTML={{ __html: PRELOADER_SCRIPT }} />
  </>;
}
