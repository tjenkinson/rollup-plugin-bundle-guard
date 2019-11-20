[![npm version](https://badge.fury.io/js/rollup-plugin-bundle-guard.svg)](https://badge.fury.io/js/rollup-plugin-bundle-guard)

# rollup-plugin-bundle-guard

A rollup plugin that makes sure you don't accidentally import something statically, which could have an effect on your bundle size.

## How?

Tag files you want to be in the same group by adding a comment with the group name.

```js
// rollup-plugin-bundle-guard: group=entry
```

If you attempt to statically import a file that is not in the same group, your build will fail with something like:

```
"entry.js" statically imports "load-me-dynamically.js" which is not allowed because it is not in the same group. Should it be in "entry"?
```

That's it!

## Installation

```
npm install --save-dev rollup-plugin-bundle-guard
```

## Usage

rollup.config.js

```js
import rollupPluginBundleGuard from 'rollup-plugin-bundle-guard';

export default {
  input: 'main.js',
  plugins: [
    rollupPluginBundleGuard({
      // defaults to `false`. If enabled, all imported modules must be assigned a group. Otherwise anything without a group can always be imported.
      strictMode: true,
      groups: {
        entry: [
          // the 'react' module will be part of the 'entry' group
          'react'
        ],
        someGroup: [
          // anything that contains the string 'somegroup' will be part of the 'someGroup' group
          /somegroup/
        ]
      },
      // optional. The default (below) disables checking comments for anything in 'node_modules'
      comments: {
        pathPatterns: [ /node_modules/ ],
        isWhitelist: false
      }
    })
    // ...
  ],
  // ...
});
```

main.js

```js
// rollup-plugin-bundle-guard: group=entry

import 'react'; // allowed because assigned to `entry` in config
import './b.js'; // allowed because `./b.js` is also in `entry`

import('./c.js'); // allowed because it's a dynamic import
```

b.js

```js
// rollup-plugin-bundle-guard: group=entry

console.log('In module b.');
```

c.js

```js
// rollup-plugin-bundle-guard: group=group2

import './b.js'; // ERROR! b is in `entry`, not `group2`

console.log('In module c.');
```
