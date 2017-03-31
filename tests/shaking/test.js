import {foo} from './a.js';
import b from './b.js';

// foo from 'a.js' should import successfully
foo();
// Everything from 'b.js' should import
b.foo();
b.bar();
// scope['a.js']['bar'] should be undefined
