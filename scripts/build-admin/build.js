const css=require('./css');const{html,PROVIDERS,TIER_LEVELS}=require('./html');const modals=require('./modals');
const fs=require('fs'),path=require('path');
const js=fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
const out=`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OrchidLLM Admin</title>${css}></head><body>${html}${modals}<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script><script>const PROVIDERS=${JSON.stringify(PROVIDERS)};const TIER_LEVELS=${JSON.stringify(TIER_LEVELS)};${js}</script></body></html>`;
fs.writeFileSync(path.join(__dirname,'../../admin.html'),out);
console.log('Built admin.html');
