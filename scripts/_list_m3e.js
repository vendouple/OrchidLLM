const fs = require('fs');
const t = fs.readFileSync('m3e-package/all.js', 'utf8');

// Find actual component registrations - look for class definitions with M3e prefix
const classRe = /class\s+(M3e[A-Z]\w+Element)\s+extends/g;
const classes = new Set();
let match;
while ((match = classRe.exec(t)) !== null) {
  classes.add(match[1]);
}

// Also find customElement decorators
const ceRe = /customElement\("(m3e-[^"]+)"\)/g;
const ceTags = new Set();
while ((match = ceRe.exec(t)) !== null) {
  ceTags.add(match[1]);
}

// Find tagName static properties
const tagRe = /static\s+tagName\s*=\s*["']([^"']+)["']/g;
const tagNames = new Set();
while ((match = tagRe.exec(t)) !== null) {
  tagNames.add(match[1]);
}

console.log("=== customElement() tags ===");
[...ceTags].sort().forEach(x => console.log(x));

console.log("\n=== static tagName ===");
[...tagNames].sort().forEach(x => console.log(x));

console.log("\n=== M3e*Element classes (count) ===");
console.log(classes.size);

// Look for the actual component tag names used in HTML
// Search for createElement or querySelector with m3e-
const htmlRe = /["']m3e-([a-z]+(?:-[a-z]+)*)["']/g;
const htmlTags = new Set();
while ((match = htmlRe.exec(t)) !== null) {
  // Filter out CSS property-like names (contain uppercase after hyphen patterns)
  const name = match[1];
  if (!name.includes('Color') && !name.includes('Size') && !name.includes('Font') && 
      !name.includes('Height') && !name.includes('Width') && !name.includes('Padding') &&
      !name.includes('Margin') && !name.includes('Shape') && !name.includes('Elevation') &&
      !name.includes('Opacity') && !name.includes('Space') && !name.includes('Thickness') &&
      !name.includes('Weight') && !name.includes('Line') && !name.includes('Tracking') &&
      !name.includes('Radius') && !name.includes('Offset') && !name.includes('Max') &&
      !name.includes('Min') && !name.includes('Container') && !name.includes('Label') &&
      !name.includes('Icon') && !name.includes('State') && !name.includes('Selected') &&
      !name.includes('Disabled') && !name.includes('Focus') && !name.includes('Hover') &&
      !name.includes('Pressed') && !name.includes('Leading') && !name.includes('Trailing') &&
      !name.includes('Supporting') && !name.includes('Active') && !name.includes('Indicator') &&
      !name.includes('Handle') && !name.includes('Scrim') && !name.includes('Top') &&
      !name.includes('Bottom') && !name.includes('Compact') && !name.includes('Full') &&
      !name.includes('Modal') && !name.includes('Peek') && !name.includes('Rounded') &&
      !name.includes('Square') && !name.includes('Standard') && !name.includes('Vibrant') &&
      !name.includes('Large') && !name.includes('Medium') && !name.includes('Small') &&
      !name.includes('Extra') && !name.includes('Outlined') && !name.includes('Filled') &&
      !name.includes('Tonal') && !name.includes('Elevated') && !name.includes('Text') &&
      !name.includes('Unselected') && !name.includes('Ripple') && !name.includes('Overline') &&
      !name.includes('Title') && !name.includes('Subtitle') && !name.includes('Heading') &&
      !name.includes('Content') && !name.includes('Header') && !name.includes('Toolbar') &&
      !name.includes('Vertical') && !name.includes('Horizontal') && !name.includes('Scroll')) {
    htmlTags.add('m3e-' + name);
  }
}

console.log("\n=== Likely component tags ===");
[...htmlTags].sort().forEach(x => console.log(x));
