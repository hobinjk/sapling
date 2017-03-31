import a from 'a.js';
import b from 'b.js';
import {cForTest} from 'c.js';

// The final output should have cForA, cForB, and cForTest present in scope[c.js]
a();
b();
cForTest();
