[![npm version](https://badge.fury.io/js/rollup-plugin-bundle-guard.svg)](https://badge.fury.io/js/rollup-plugin-bundle-guard) [![Greenkeeper badge](https://badges.greenkeeper.io/tjenkinson/rollup-plugin-bundle-guard.svg)](https://greenkeeper.io/)

# rollup-plugin-bundle-guard

A rollup plugin that makes sure you don't accidentally import something statically, which could have an effect on your bundle size.

## How?

Tag files you want to be in the same group by adding a comment with the group name.

```js
// rollup-plugin-bundle-guard: group=entry
```

If you attempt to statically import a file that is not in the same group, your build will fail with something like:

```
"entry.js" statically imports "load-me-dynamically.js" which is not allowed. Should it be in "entry"?
```

That's it!

### More Detail

With strict mode disabled anything that is not assigned a group will default to the group named `default`, and anything is allowed to import something assigned to the `default` group.

Each module can only be assigned to a single group. You can however include additional groups that are allowed to import the module with the following comment:

```js
// rollup-plugin-bundle-guard: allowedImportFrom=<group 1 name> <group 2 name> ...
```

This makes it possible for separate bundles to statically import shared dependencies.

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
    // default config
    // rollupPluginBundleGuard(),

    // all the options
    rollupPluginBundleGuard({
      // Defaults to `false`. If enabled, all imported modules must be assigned a group.
      // Otherwise anything without a group is assigned a group named `default`
      strictMode: false,
      modules: [
        // 'react' can be imported from both the `entry` and `default` group
        { allowedImportFrom: ['entry', 'default'], module: 'react' },
        // anything that contains the string 'somegroup' will be part of the 'someGroup' group
        { group: 'someGroup', module: /somegroup/ },
      ],
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

import 'react'; // allowed because `entry` is allowed to import `react`
import './a.js'; // allowed because `./a.js` is also in `entry`
import './b.js'; // ERROR! not allowed because `./b.js` is not in `entry`

import('./b.js'); // allowed because it's a dynamic import
```

a.js

```js
// rollup-plugin-bundle-guard: group=entry

console.log('In module a.');
```

b.js

```js
// rollup-plugin-bundle-guard: group=group2

import './c.js'; // ERROR! c is in `default`, not `group2`

console.log('In module b.');
```

c.js

```js
// in the default group
import './d.js';

console.log('In module c.');
```

d.js

```js
// in the `default` group
import 'react'; // allowed because `default` is allowed to import `react`

import './a.js'; // allowed because in non strict mode `a.js` is allowing imports from `default`

console.log('In module d.');
```
